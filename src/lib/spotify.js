// Spotify : connexion du compte (PKCE, sans secret dans le navigateur) et lecture dans l'appli
// via le Web Playback SDK. La lecture complète demande un compte Spotify Premium.
const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID || '';
const TOKEN_KEY = 'hevenly:spotify';
const VERIFIER_KEY = 'hevenly:spotify:verifier';
const SCOPES = ['streaming', 'user-read-email', 'user-read-private', 'user-read-playback-state', 'user-modify-playback-state'];

export const SPOTIFY_CONFIGURED = !!CLIENT_ID;
export const spotifyRedirect = () => `${location.origin}/spotify-callback`;

const stored = () => {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY));
  } catch {
    return null;
  }
};
export const isSpotifyConnected = () => !!stored()?.refresh;

// ---------- Connexion ----------
const randomString = (len) => {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-._~';
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
};
const base64url = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

export async function connectSpotify() {
  const verifier = randomString(64);
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = base64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  const q = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: spotifyRedirect(),
    scope: SCOPES.join(' '),
    code_challenge_method: 'S256',
    code_challenge: challenge,
  });
  location.href = `https://accounts.spotify.com/authorize?${q}`;
}

function saveTokens(t) {
  localStorage.setItem(TOKEN_KEY, JSON.stringify({
    access: t.access_token,
    refresh: t.refresh_token ?? stored()?.refresh,
    expires: Date.now() + t.expires_in * 1000 - 60_000,
  }));
}

// Retour de Spotify : échange du code contre les jetons.
export async function completeSpotifyLogin(code) {
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  if (!verifier) throw new Error('Connexion Spotify expirée, recommencez.');
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'authorization_code', code, redirect_uri: spotifyRedirect(), code_verifier: verifier }),
  });
  if (!res.ok) throw new Error('Spotify a refusé la connexion.');
  saveTokens(await res.json());
  sessionStorage.removeItem(VERIFIER_KEY);
}

export function disconnectSpotify() {
  localStorage.removeItem(TOKEN_KEY);
  stopSpotifyPlayer();
}

async function accessToken() {
  const s = stored();
  if (!s) throw new Error('Spotify non connecté.');
  if (s.access && Date.now() < s.expires) return s.access;
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: s.refresh }),
  });
  if (!res.ok) {
    disconnectSpotify();
    throw new Error('Session Spotify expirée, reconnectez-vous.');
  }
  const t = await res.json();
  saveTokens(t);
  return t.access_token;
}

async function api(path, { method = 'GET', body } = {}) {
  const token = await accessToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return null;
  if (!res.ok) throw new Error(`Spotify (${res.status})`);
  return res.json();
}

// ---------- Lecteur ----------
let player = null;
let deviceId = null;
let state = { status: 'idle', track: null, paused: true, position: 0, duration: 0, volume: 0.5, error: '' };
const subs = new Set();
const emit = () => subs.forEach((f) => f());
const setState = (patch) => {
  state = { ...state, ...patch };
  emit();
};
export const subscribeSpotify = (fn) => {
  subs.add(fn);
  return () => subs.delete(fn);
};
export const getSpotifyState = () => state;

function loadSdk() {
  if (window.Spotify) return Promise.resolve();
  return new Promise((resolve, reject) => {
    window.onSpotifyWebPlaybackSDKReady = resolve;
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    script.onerror = () => reject(new Error('Lecteur Spotify indisponible.'));
    document.body.appendChild(script);
  });
}

export async function startSpotifyPlayer() {
  if (player || !isSpotifyConnected()) return;
  setState({ status: 'loading', error: '' });
  try {
    await loadSdk();
    player = new window.Spotify.Player({
      name: 'Feathery',
      volume: state.volume,
      getOAuthToken: (cb) => accessToken().then(cb).catch(() => cb('')),
    });
    player.addListener('ready', ({ device_id }) => {
      deviceId = device_id;
      setState({ status: 'ready', error: '' });
    });
    player.addListener('not_ready', () => setState({ status: 'offline' }));
    player.addListener('player_state_changed', (s) => {
      if (!s) return;
      const t = s.track_window.current_track;
      setState({
        track: { name: t.name, artists: t.artists.map((a) => a.name).join(', '), image: t.album.images[0]?.url || '' },
        paused: s.paused,
        position: s.position,
        duration: s.duration,
        status: 'ready',
      });
    });
    ['initialization_error', 'authentication_error', 'account_error', 'playback_error'].forEach((ev) =>
      player.addListener(ev, ({ message }) => setState({ status: 'error', error: message })),
    );
    await player.connect();
  } catch (err) {
    setState({ status: 'error', error: err.message });
  }
}

export function stopSpotifyPlayer() {
  player?.disconnect();
  player = null;
  deviceId = null;
  setState({ status: 'idle', track: null, paused: true, position: 0, duration: 0 });
}

export const spotifyToggle = () => player?.togglePlay();
export const spotifyNext = () => player?.nextTrack();
export const spotifyPrev = () => player?.previousTrack();
export const spotifyVolume = (v) => {
  setState({ volume: v });
  player?.setVolume(v);
};

// Recherche un titre et le lance sur ce lecteur.
export async function playSpotifySearch(query) {
  if (!deviceId) throw new Error('Lecteur pas prêt : patientez ou vérifiez votre compte Premium.');
  const r = await api(`/search?type=track&limit=1&q=${encodeURIComponent(query)}`);
  const uri = r?.tracks?.items?.[0]?.uri;
  if (!uri) throw new Error('Aucun titre trouvé.');
  await api(`/me/player/play?device_id=${deviceId}`, { method: 'PUT', body: { uris: [uri] } });
}
