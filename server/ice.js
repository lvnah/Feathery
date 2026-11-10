// Serveurs de relais pour le vocal (WebRTC). STUN est toujours proposé ; TURN s'ajoute si le serveur est configuré :
// TURN_URLS (ex. "turn:turn.exemple.fr:3478,turns:turn.exemple.fr:5349") et TURN_SECRET (secret partagé avec coturn,
// option use-auth-secret). Les identifiants sont temporaires et propres à chaque membre.
import { createHmac } from 'node:crypto';

const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const TTL_SECONDS = 12 * 3600;

export function iceServersFor(userId) {
  const urls = (process.env.TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  const secret = process.env.TURN_SECRET || '';
  if (!urls.length || !secret) return STUN;
  const username = `${Math.floor(Date.now() / 1000) + TTL_SECONDS}:${userId}`;
  const credential = createHmac('sha1', secret).update(username).digest('base64');
  return [...STUN, { urls, username, credential }];
}
