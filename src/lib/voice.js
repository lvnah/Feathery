// Vocal : WebRTC en maillage (chaque membre du salon est relié à chaque autre).
// Les messages de signalisation (offre, réponse, candidats ICE) passent par l'API.
// Un seul salon (espace ou appel privé) à la fois. Le micro n'est capté que pendant que l'on est dans le salon.
import { useSyncExternalStore } from 'react';
import { api } from './api';

const FALLBACK_ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }];
const SIGNAL_INTERVAL_MS = 500;
const RESTART_DELAY_MS = 1500;
const DISCONNECT_GRACE_MS = 5000;

// Serveurs de relais (STUN, et TURN si le serveur en fournit) : indispensables sur les réseaux mobiles.
let iceCache = null;
let iceAt = 0;
async function iceConfig() {
  if (iceCache && Date.now() - iceAt < 10 * 60_000) return iceCache;
  try {
    const { iceServers } = await api('/api/voice/ice');
    if (Array.isArray(iceServers) && iceServers.length) {
      iceCache = iceServers;
      iceAt = Date.now();
      return iceCache;
    }
  } catch {
    /* hors ligne : on garde STUN seul */
  }
  return FALLBACK_ICE;
}

let session = null; // { channelId, myId, stream, rtc, peers: Map<userId, entry>, timer, polling }
let starting = null; // démarrage du micro en cours (évite les doubles appels)
let muted = false;
let onError = () => {};

export const setVoiceErrorHandler = (fn) => {
  onError = fn;
};
export const isVoiceMuted = () => muted;
export const setVoiceMuted = (value) => {
  muted = value;
  session?.stream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
};

async function send(toId, kind, payload) {
  try {
    await api('/api/voice/signal', { method: 'POST', body: { toId, kind, payload } });
  } catch {
    /* le pair réessaiera à la prochaine négociation */
  }
}

// Contexte audio débloqué par un geste de l'utilisateur (clic ou toucher) : Safari iOS exige ce geste.
let audioCtx = null;
function audioContext() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  return audioCtx;
}
export function unlockAudio() {
  try {
    const ctx = audioContext();
    if (ctx.state !== 'running') ctx.resume();
  } catch {
    /* navigateur sans Web Audio */
  }
}

// Les navigateurs mobiles refusent de lancer un son sans geste : on réessaie au prochain toucher.
const pendingAudio = new Set();
function playRemote(el) {
  const p = el.play?.();
  if (p && p.catch) p.then(() => pendingAudio.delete(el)).catch(() => pendingAudio.add(el));
}
['click', 'touchend', 'keydown'].forEach((evt) =>
  document.addEventListener(evt, () => {
    unlockAudio();
    for (const el of [...pendingAudio]) playRemote(el);
  }, true),
);

// ----- Qui parle : niveau sonore de chaque flux (le sien et celui des autres), publié pour l'affichage. -----
const watchers = new Map(); // membre -> { source, analyser, buf, hold }
let speaking = new Set();
const speakListeners = new Set();
function watchSpeaking(id, stream) {
  unwatchSpeaking(id);
  try {
    const ctx = audioContext();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    watchers.set(id, { source, analyser, buf: new Uint8Array(analyser.fftSize), hold: 0 });
  } catch {
    /* pas d'analyse possible : pas d'anneau pour ce membre */
  }
}
function unwatchSpeaking(id) {
  const w = watchers.get(id);
  if (!w) return;
  try { w.source.disconnect(); } catch { /* déjà déconnecté */ }
  watchers.delete(id);
}
setInterval(() => {
  const next = new Set();
  for (const [id, w] of watchers) {
    w.analyser.getByteTimeDomainData(w.buf);
    let sum = 0;
    for (const v of w.buf) {
      const x = (v - 128) / 128;
      sum += x * x;
    }
    const level = Math.sqrt(sum / w.buf.length);
    w.hold = level > 0.03 ? 4 : Math.max(0, w.hold - 1); // reste « qui parle » quelques instants après la voix
    if (w.hold > 0) next.add(id);
  }
  const changed = next.size !== speaking.size || [...next].some((id) => !speaking.has(id));
  if (changed) {
    speaking = next;
    speakListeners.forEach((fn) => fn());
  }
}, 120);
const subscribeSpeaking = (fn) => {
  speakListeners.add(fn);
  return () => speakListeners.delete(fn);
};
// Ensemble des membres qui parlent en ce moment (se met à jour seul).
export const useSpeaking = () => useSyncExternalStore(subscribeSpeaking, () => speaking);

// Préférences d'appareils (micro, haut-parleur), gardées sur cet appareil.
const PREFS_KEY = 'hevenly:audio';
export const getAudioPrefs = () => {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
};
// Le choix du haut-parleur n'existe que sur certains navigateurs (pas Safari iPhone).
export const canChooseOutput = () => typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;

function applyOutput(el) {
  const { output } = getAudioPrefs();
  if (output && el.setSinkId) el.setSinkId(output).catch(() => {});
}

// Le son distant passe par un lecteur audio (fonctionne partout) ; relancé au premier toucher si le navigateur le bloque.
function attachRemoteAudio(peerId, stream) {
  const entry = session.peers.get(peerId);
  let audio = entry?.audio;
  if (!audio) {
    audio = document.createElement('audio');
    audio.autoplay = true;
    audio.playsInline = true;
    audio.dataset.peer = peerId;
    document.body.appendChild(audio);
  }
  audio.srcObject = stream;
  applyOutput(audio);
  playRemote(audio);
  return audio;
}

function closeEntry(peerId) {
  const entry = session?.peers.get(peerId);
  if (!entry) return;
  clearTimeout(entry.retry);
  entry.pc.close();
  entry.audio?.remove();
  if (entry.audio) pendingAudio.delete(entry.audio);
  session.peers.delete(peerId);
  unwatchSpeaking(peerId);
}

// Relance une connexion tombée : on la recrée, l'initiateur renvoie une offre.
function restartPeer(peerId) {
  if (!session) return;
  const { myId } = session;
  closeEntry(peerId);
  createPeer(peerId, myId < peerId);
}

function scheduleRestart(peerId, delay) {
  const entry = session?.peers.get(peerId);
  if (!entry || entry.retry) return;
  entry.retry = setTimeout(() => {
    if (session && session.peers.get(peerId) === entry) restartPeer(peerId);
  }, delay);
}

async function makeOffer(peerId, entry) {
  try {
    const offer = await entry.pc.createOffer();
    await entry.pc.setLocalDescription(offer);
    await send(peerId, 'offer', entry.pc.localDescription.toJSON());
  } catch {
    scheduleRestart(peerId, RESTART_DELAY_MS);
  }
}

function createPeer(peerId, initiator) {
  const pc = new RTCPeerConnection(session.rtc);
  const entry = { pc, audio: null, pending: [], retry: null };
  session.peers.set(peerId, entry);
  session.stream.getTracks().forEach((track) => pc.addTrack(track, session.stream));
  pc.onicecandidate = (e) => {
    if (e.candidate) send(peerId, 'ice', e.candidate.toJSON());
  };
  pc.ontrack = (e) => {
    // Certains navigateurs ne joignent pas de flux au son distant : on en crée un.
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    entry.audio = attachRemoteAudio(peerId, stream);
    watchSpeaking(peerId, stream);
  };
  pc.onconnectionstatechange = () => {
    if (!session || session.peers.get(peerId) !== entry) return;
    if (pc.connectionState === 'failed') scheduleRestart(peerId, RESTART_DELAY_MS);
    // Coupure brève (réseau qui change) : on laisse le temps de revenir avant de recommencer.
    else if (pc.connectionState === 'disconnected') scheduleRestart(peerId, DISCONNECT_GRACE_MS);
  };
  if (initiator) makeOffer(peerId, entry);
  return entry;
}

// Les candidats ICE peuvent arriver avant la description distante : on les garde jusqu'à son arrivée.
async function flushIce(entry) {
  const list = entry.pending.splice(0);
  for (const candidate of list) await entry.pc.addIceCandidate(candidate).catch(() => {});
}

async function handleSignal({ from, kind, payload }) {
  if (!session) return;
  let entry = session.peers.get(from);
  if (!entry) {
    if (kind !== 'offer' && kind !== 'ice') return;
    entry = createPeer(from, false);
  }
  const pc = entry.pc;
  try {
    if (kind === 'offer') {
      // Offres croisées : on abandonne la sienne et on accepte celle de l'autre.
      if (pc.signalingState === 'have-local-offer') await pc.setLocalDescription({ type: 'rollback' });
      await pc.setRemoteDescription(payload);
      await flushIce(entry);
      await pc.setLocalDescription(await pc.createAnswer());
      await send(from, 'answer', pc.localDescription.toJSON());
    } else if (kind === 'answer') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(payload);
        await flushIce(entry);
      }
    } else if (kind === 'ice') {
      if (pc.remoteDescription) await pc.addIceCandidate(payload);
      else entry.pending.push(payload);
    }
  } catch {
    /* signal obsolète ou invalide : ignoré, la négociation se refera */
  }
}

async function pollSignals() {
  if (!session || session.polling) return;
  session.polling = true;
  try {
    const { signals } = await api('/api/voice/signals');
    for (const sig of signals) await handleSignal(sig);
  } catch {
    /* réseau instable : nouvelle tentative au prochain cycle */
  } finally {
    if (session) session.polling = false;
  }
}

function micConstraints(input) {
  return { audio: { deviceId: input ? { ideal: input } : undefined, echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false };
}

// Micro demandé : si le micro choisi n'existe plus (débranché, identifiant périmé), on prend le micro par défaut.
export async function getMicStream(input) {
  try {
    return await navigator.mediaDevices.getUserMedia(micConstraints(input));
  } catch (err) {
    if (!input || !['NotFoundError', 'OverconstrainedError', 'NotReadableError'].includes(err?.name)) throw err;
    localStorage.setItem(PREFS_KEY, JSON.stringify({ ...getAudioPrefs(), input: '' }));
    return navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  }
}

// Préviens quand un micro est branché ou débranché (la liste se met à jour toute seule).
export function subscribeAudioDevices(fn) {
  const md = navigator.mediaDevices;
  if (!md?.addEventListener) return () => {};
  md.addEventListener('devicechange', fn);
  return () => md.removeEventListener('devicechange', fn);
}

async function start(channelId, myId) {
  let stream;
  try {
    stream = await getMicStream(getAudioPrefs().input);
  } catch (err) {
    onError(micErrorMessage(err));
    return false;
  }
  const rtc = { iceServers: await iceConfig() };
  session = { channelId, myId, stream, rtc, peers: new Map(), timer: null, polling: false };
  stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  watchSpeaking(myId, stream);
  session.timer = setInterval(pollSignals, SIGNAL_INTERVAL_MS);
  return true;
}

export function stopVoice() {
  if (!session) return;
  clearInterval(session.timer);
  [...session.peers.keys()].forEach(closeEntry);
  session.stream.getTracks().forEach((t) => t.stop());
  unwatchSpeaking(session.myId);
  session = null;
}

// Appelé à chaque changement de l'état : participants = identifiants des membres du salon courant.
export async function syncVoice(channelId, myId, participantIds) {
  if (!channelId) return stopVoice();
  if (session && session.channelId !== channelId) stopVoice();
  if (!session) {
    if (!starting) starting = start(channelId, myId).finally(() => (starting = null));
    if (!(await starting)) return;
  }
  if (!session || session.channelId !== channelId) return;
  // Le membre au plus petit identifiant initie la connexion : pas de double offre.
  for (const id of participantIds) {
    if (id !== myId && !session.peers.has(id)) createPeer(id, myId < id);
  }
  for (const id of [...session.peers.keys()]) {
    if (!participantIds.includes(id)) closeEntry(id);
  }
}

// Message clair selon la cause réelle du refus du micro.
function micErrorMessage(err) {
  if (!window.isSecureContext || !navigator.mediaDevices) {
    return 'Micro bloqué : la page doit être ouverte en HTTPS (https://…) pour utiliser le micro.';
  }
  switch (err?.name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'Micro refusé : autorisez le micro pour ce site dans la barre d’adresse du navigateur, puis réessayez.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'Aucun micro détecté sur cet appareil.';
    case 'NotReadableError':
      return 'Le micro est utilisé par une autre application. Fermez-la puis réessayez.';
    default:
      return `Accès au micro impossible (${err?.name || 'erreur inconnue'}).`;
  }
}

// Changer de micro pendant l'appel : on remplace la piste envoyée à chaque correspondant.
async function switchInput(input) {
  if (!session) return;
  const fresh = await getMicStream(input).catch(() => null);
  if (!fresh) return;
  const track = fresh.getAudioTracks()[0];
  track.enabled = !muted;
  session.stream.getAudioTracks().forEach((t) => t.stop());
  session.stream = new MediaStream([track]);
  watchSpeaking(session.myId, session.stream);
  for (const entry of session.peers.values()) {
    const sender = entry.pc.getSenders().find((x) => x.track?.kind === 'audio');
    if (sender) await sender.replaceTrack(track).catch(() => {});
  }
}

export function setAudioPrefs(patch) {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ ...getAudioPrefs(), ...patch }));
  if ('output' in patch) document.querySelectorAll('audio[data-peer]').forEach(applyOutput);
  if ('input' in patch) switchInput(patch.input);
}

// Micros et haut-parleurs présents maintenant. Les noms n'apparaissent qu'après l'autorisation du micro.
export async function listAudioDevices() {
  const list = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: list.filter((d) => d.kind === 'audioinput'),
    outputs: list.filter((d) => d.kind === 'audiooutput'),
    named: list.some((d) => d.label), // vrai une fois l'accès au micro accordé
  };
}

// Demande l'accès au micro (pour voir les noms des appareils), puis le coupe aussitôt.
export async function grantMicAccess() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch((err) => {
    throw new Error(micErrorMessage(err));
  });
  stream.getTracks().forEach((t) => t.stop());
}
