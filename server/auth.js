// Mots de passe (scrypt) et sessions par jeton Bearer stockées en base.
import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

const SESSION_MS = 30 * 24 * 3600 * 1000;

export function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${scryptSync(password, salt, 64).toString('hex')}`;
}

export function verifyPassword(password, stored) {
  const [salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const expected = Buffer.from(hash, 'hex');
  const actual = scryptSync(password, salt, expected.length);
  return timingSafeEqual(actual, expected);
}

// Le jeton n'est jamais gardé en clair : seule son empreinte est stockée (une fuite de la base ne donne pas de session).
export const digestToken = (token) => createHash('sha256').update(String(token)).digest('hex');

export function createSession(userId) {
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(digestToken(token), userId, Date.now() + SESSION_MS);
  return token;
}

export function deleteSession(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(digestToken(token));
}

// Déconnecte les autres appareils d'un membre (après changement de mot de passe), en gardant éventuellement la session courante.
export function revokeSessions(userId, keepToken = null) {
  db.prepare('DELETE FROM sessions WHERE user_id = ? AND token <> ?').run(userId, keepToken ? digestToken(keepToken) : '');
}

export function userFromToken(token) {
  if (!token) return null;
  const row = db
    .prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token = ? AND s.expires_at > ?`,
    )
    .get(digestToken(token), Date.now());
  return row || null;
}
