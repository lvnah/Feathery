// Vocal : WebRTC en maillage (chaque membre du salon est relié à chaque autre).
// Les messages de signalisation (offre, réponse, candidats ICE) passent par l'API.
// Un seul salon vocal à la fois. Le micro n'est capté que pendant que l'on est dans le salon.
import { api } from './api';

const RTC_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
};
const SIGNAL_INTERVAL_MS = 500;

let session = null; // { channelId, myId, stream, peers: Map<userId, {pc, audio}>, timer }
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
export function unlockAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state !== 'running') audioCtx.resume();
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

function createPeer(peerId, initiator) {
  const pc = new RTCPeerConnection(RTC_CONFIG);
  const entry = { pc, audio: null };
  session.peers.set(peerId, entry);
  session.stream.getTracks().forEach((track) => pc.addTrack(track, session.stream));
  pc.onicecandidate = (e) => {
    if (e.candidate) send(peerId, 'ice', e.candidate.toJSON());
  };
  pc.ontrack = (e) => {
    // Certains navigateurs ne joignent pas de flux au son distant : on en crée un.
    const stream = e.streams[0] ?? new MediaStream([e.track]);
    entry.audio = attachRemoteAudio(peerId, stream);
  };
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'failed') closePeer(peerId);
  };
  if (initiator) {
    pc.createOffer()
      .then((offer) => pc.setLocalDescription(offer).then(() => send(peerId, 'offer', pc.localDescription.toJSON())))
      .catch(() => closePeer(peerId));
  }
  return entry;
}

function closePeer(peerId) {
  const entry = session?.peers.get(peerId);
  if (!entry) return;
  entry.pc.close();
  entry.audio?.remove();
  if (entry.audio) pendingAudio.delete(entry.audio);
  session.peers.delete(peerId);
}

async function handleSignal({ from, kind, payload }) {
  if (!session) return;
  const entry = session.peers.get(from) ?? (kind === 'offer' ? createPeer(from, false) : null);
  if (!entry) return;
  const pc = entry.pc;
  try {
    if (kind === 'offer') {
      await pc.setRemoteDescription(payload);
      await pc.setLocalDescription(await pc.createAnswer());
      send(from, 'answer', pc.localDescription.toJSON());
    } else if (kind === 'answer') {
      if (pc.signalingState === 'have-local-offer') await pc.setRemoteDescription(payload);
    } else if (kind === 'ice') {
      await pc.addIceCandidate(payload);
    }
  } catch {
    /* signal obsolète : ignoré */
  }
}

async function pollSignals() {
  if (!session) return;
  try {
    const { signals } = await api('/api/voice/signals');
    for (const sig of signals) await handleSignal(sig);
  } catch {
    /* réseau instable : nouvelle tentative au prochain cycle */
  }
}

async function start(channelId, myId) {
  let stream;
  try {
    const { input } = getAudioPrefs();
    stream = await navigator.mediaDevices.getUserMedia({ audio: { deviceId: input ? { ideal: input } : undefined, echoCancellation: true, noiseSuppression: true }, video: false });
  } catch (err) {
    onError(micErrorMessage(err));
    return false;
  }
  session = { channelId, myId, stream, peers: new Map(), timer: null };
  stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
  session.timer = setInterval(pollSignals, SIGNAL_INTERVAL_MS);
  return true;
}

export function stopVoice() {
  if (!session) return;
  clearInterval(session.timer);
  [...session.peers.keys()].forEach(closePeer);
  session.stream.getTracks().forEach((t) => t.stop());
  session = null;
}

// Appelé à chaque changement de l'état : participants = identifiants des membres du salon vocal courant.
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
    if (!participantIds.includes(id)) closePeer(id);
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
  const fresh = await navigator.mediaDevices
    .getUserMedia({ audio: { deviceId: input ? { ideal: input } : undefined, echoCancellation: true, noiseSuppression: true }, video: false })
    .catch(() => null);
  if (!fresh) return;
  const track = fresh.getAudioTracks()[0];
  track.enabled = !muted;
  session.stream.getAudioTracks().forEach((t) => t.stop());
  session.stream = new MediaStream([track]);
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

// Liste des micros et haut-parleurs (les noms n'apparaissent qu'après l'autorisation du micro).
export async function listAudioDevices() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true }).catch(() => null);
  stream?.getTracks().forEach((t) => t.stop());
  const list = await navigator.mediaDevices.enumerateDevices();
  return {
    inputs: list.filter((d) => d.kind === 'audioinput'),
    outputs: list.filter((d) => d.kind === 'audiooutput'),
  };
}
