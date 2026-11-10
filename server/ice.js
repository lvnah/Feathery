// Serveurs de relais pour le vocal (WebRTC). STUN est toujours proposé ; TURN s'ajoute si le serveur est configuré :
//  - TURN_URLS : adresses du relais (ex. "turn:turn.exemple.fr:3478?transport=udp,turns:turn.exemple.fr:5349")
//  - soit TURN_SECRET (secret partagé avec coturn, option use-auth-secret) : identifiants temporaires par membre ;
//  - soit TURN_USERNAME et TURN_PASSWORD (identifiants fournis par un service TURN géré).
import { createHmac } from 'node:crypto';

const STUN = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }];
const TTL_SECONDS = 12 * 3600;

export function iceServersFor(userId) {
  const urls = (process.env.TURN_URLS || '').split(',').map((u) => u.trim()).filter(Boolean);
  if (!urls.length) return STUN;
  const secret = process.env.TURN_SECRET || '';
  if (secret) {
    const username = `${Math.floor(Date.now() / 1000) + TTL_SECONDS}:${userId}`;
    const credential = createHmac('sha1', secret).update(username).digest('base64');
    return [...STUN, { urls, username, credential }];
  }
  const username = process.env.TURN_USERNAME || '';
  const password = process.env.TURN_PASSWORD || '';
  if (username && password) return [...STUN, { urls, username, credential: password }];
  return STUN;
}
