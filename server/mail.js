// E-mails transactionnels (confirmation d'adresse). Envoi via une API compatible Brevo.
// Sans configuration (MAIL_API_KEY et MAIL_FROM), la confirmation est désactivée : les comptes sont actifs tout de suite.
import { randomBytes } from 'node:crypto';
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS auth_tokens (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  expires_at INTEGER NOT NULL
)`);

// Confirmation par e-mail désactivée pour l'instant : les comptes sont actifs dès l'inscription.
// Mettre à true (et configurer l'envoi) pour la réactiver.
export const CONFIRM_EMAIL = false;
export const mailConfigured = () => !!(process.env.MAIL_API_KEY && process.env.MAIL_FROM);
export const publicBase = () => (process.env.PUBLIC_URL || 'http://localhost:3001').replace(/\/$/, '');

export async function sendMail(to, subject, text) {
  if (!mailConfigured()) {
    console.log(`[mail non configuré] à ${to} : ${subject}`);
    return false;
  }
  const url = process.env.MAIL_API_URL || 'https://api.brevo.com/v3/smtp/email';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'api-key': process.env.MAIL_API_KEY },
    body: JSON.stringify({ sender: { name: 'Feathery', email: process.env.MAIL_FROM }, to: [{ email: to }], subject, textContent: text }),
  });
  if (!res.ok) throw new Error('Envoi de l’e-mail impossible, réessayez plus tard.');
  return true;
}

export function createToken(userId, kind, ttlMs) {
  const token = randomBytes(24).toString('hex');
  db.prepare('INSERT INTO auth_tokens (token, user_id, kind, expires_at) VALUES (?, ?, ?, ?)').run(token, userId, kind, Date.now() + ttlMs);
  return token;
}

// Consomme un jeton à usage unique ; renvoie la ligne si valide et non expiré.
export function consumeToken(token, kind) {
  const row = db.prepare('SELECT * FROM auth_tokens WHERE token = ? AND kind = ?').get(String(token ?? ''), kind);
  if (!row) return null;
  db.prepare('DELETE FROM auth_tokens WHERE token = ?').run(row.token);
  return row.expires_at >= Date.now() ? row : null;
}

export async function sendVerification(userId, email) {
  const token = createToken(userId, 'verify', 48 * 3600 * 1000);
  const link = `${publicBase()}/api/auth/verify?token=${token}`;
  await sendMail(email, 'Confirmez votre adresse e-mail Feathery', `Bienvenue sur Feathery !\n\nConfirmez votre adresse en ouvrant ce lien (valable 48 h) :\n${link}\n`);
}
