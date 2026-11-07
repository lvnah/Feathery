// Serveur HTTP : API JSON (/api/*) + fichiers statiques du build (dist/) en production.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { userFromToken } from './auth.js';
import { buildSnapshot } from './sync.js';
import { HttpError, login, logout, register, runAction } from './actions.js';
import { publicUser } from './sync.js';
import { db } from './db.js';
import { getVersion, bumpVersion, onVersion, offVersion } from './version.js';
import { ensureAdmin } from './seed.js';
import { getImage, migrateInlineImages } from './images.js';

ensureAdmin();
// Une place de vocal se libère quand le membre ne donne plus signe de vie (onglet fermé, téléphone en veille).
setInterval(() => {
  db.prepare('DELETE FROM voice_connections WHERE user_id IN (SELECT id FROM users WHERE last_activity < ?)').run(Date.now() - 60_000);
}, 15_000).unref();
const migrated = migrateInlineImages();
if (migrated) console.log(`${migrated} image(s) déplacée(s) hors de la synchronisation.`);

const PORT = Number(process.env.PORT || 3001);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist');
const MAX_BODY = 20 * 1024 * 1024; // GIF animés jusqu'à ~12 Mo
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
};

function send(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// Passe l'utilisateur hors ligne tout de suite (au lieu d'attendre 45 s), et prévient les autres clients.
function setOffline(token) {
  const user = userFromToken(token || null);
  if (!user) return;
  db.prepare('UPDATE users SET last_activity = 0 WHERE id = ?').run(user.id);
  db.prepare('DELETE FROM voice_connections WHERE user_id = ?').run(user.id); // fermer la page = on quitte le vocal
  bumpVersion();
}

function readJson(req) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolveBody({});
      try {
        resolveBody(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;

function requireUser(req) {
  const user = userFromToken(bearer(req));
  if (!user) throw new HttpError(401, 'Session expirée, reconnectez-vous.');
  return user;
}

async function handleApi(req, res, path) {
  if (req.method === 'POST' && path === '/api/auth/register') {
    const result = register(await readJson(req));
    bumpVersion(); // nouveau compte : les totaux changent
    return send(res, 201, result);
  }
  if (req.method === 'POST' && path === '/api/auth/login') {
    const result = login(await readJson(req));
    bumpVersion(); // présence : le compte est désormais en ligne
    return send(res, 200, result);
  }
  if (req.method === 'POST' && path === '/api/auth/logout') {
    const leaving = userFromToken(bearer(req));
    if (leaving) db.prepare('DELETE FROM voice_connections WHERE user_id = ?').run(leaving.id); // déconnexion = on quitte le vocal
    setOffline(bearer(req));
    logout(bearer(req));
    return send(res, 200, { ok: true });
  }
  // Fermeture de la page (sendBeacon ne peut pas envoyer d'en-tête : le jeton est dans le corps).
  if (req.method === 'POST' && path === '/api/presence/leave') {
    const body = await readJson(req);
    setOffline(String(body.token ?? ''));
    return send(res, 200, { ok: true });
  }
  // Images servies par URL : le navigateur les garde en cache.
  const imgMatch = path.match(/^\/api\/img\/([a-f0-9]+)$/);
  if (req.method === 'GET' && imgMatch) {
    const row = getImage(imgMatch[1]);
    if (!row) return send(res, 404, { error: 'Image introuvable.' });
    res.writeHead(200, { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
    return res.end(row.data);
  }
  // Flux d'événements : le serveur prévient le client dès que les données changent (pas d'attente d'interrogation).
  if (req.method === 'GET' && path === '/api/events') {
    requireUser(req);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const push = (v) => res.write(`data: ${v}\n\n`);
    res.write(`data: ${getVersion()}\n\n`);
    onVersion(push);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => { clearInterval(ping); offVersion(push); });
    return undefined;
  }
  // Battement de cœur de présence (léger, sans synchronisation complète).
  if (req.method === 'POST' && path === '/api/presence/ping') {
    const me = requireUser(req);
    db.prepare('UPDATE users SET last_activity = ? WHERE id = ?').run(Date.now(), me.id);
    return send(res, 200, { ok: true });
  }
  // Recherche d'un membre (pseudo et tag) : sur tous les comptes, pas seulement ceux déjà connus.
  if (req.method === 'GET' && path === '/api/users/search') {
    const me = requireUser(req);
    const raw = String(new URL(req.url, 'http://x').searchParams.get('q') ?? '').trim().slice(0, 40);
    const [namePart = '', tagPart = ''] = raw.split('#').map((x) => x.trim().replace(/[%_]/g, ''));
    if (namePart.length < 2) return send(res, 200, { users: [] });
    const rows = db
      .prepare('SELECT * FROM users WHERE id <> ? AND pseudo LIKE ? AND tag LIKE ? ORDER BY pseudo LIMIT 12')
      .all(me.id, `%${namePart}%`, `%${tagPart}%`);
    return send(res, 200, { users: rows.map(publicUser) });
  }
  if (req.method === 'GET' && path === '/api/sync') {
    const me = requireUser(req);
    // Heartbeat de présence (très léger) à chaque synchronisation.
    db.prepare('UPDATE users SET last_activity = ? WHERE id = ?').run(Date.now(), me.id);
    const current = getVersion();
    const since = Number(new URL(req.url, 'http://x').searchParams.get('v'));
    // Rien n'a changé depuis la dernière synchronisation : réponse minimale, pas de données.
    if (since === current) return send(res, 200, { unchanged: true, v: current });
    const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id);
    return send(res, 200, { ...buildSnapshot(fresh), v: current });
  }
  // Signalisation WebRTC (vocal) : uniquement entre membres connectés au même salon vocal.
  if (req.method === 'POST' && path === '/api/voice/signal') {
    const me = requireUser(req);
    const body = await readJson(req);
    const mine = db.prepare('SELECT channel_id FROM voice_connections WHERE user_id = ?').get(me.id);
    const theirs = db.prepare('SELECT channel_id FROM voice_connections WHERE user_id = ?').get(String(body.toId ?? ''));
    if (!mine || !theirs || mine.channel_id !== theirs.channel_id) throw new HttpError(403, 'Pas dans le même salon vocal.');
    if (!['offer', 'answer', 'ice'].includes(body.kind)) throw new HttpError(400, 'Signal inconnu.');
    const payload = JSON.stringify(body.payload ?? null);
    if (payload.length > 20000) throw new HttpError(413, 'Signal trop volumineux.');
    const now = Date.now();
    db.prepare('DELETE FROM voice_signals WHERE created_at < ?').run(now - 60_000);
    db.prepare('INSERT INTO voice_signals (to_id, from_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)').run(theirs && String(body.toId), me.id, body.kind, payload, now);
    return send(res, 200, { ok: true });
  }
  if (req.method === 'GET' && path === '/api/voice/signals') {
    const me = requireUser(req);
    const rows = db.prepare('SELECT id, from_id, kind, payload FROM voice_signals WHERE to_id = ? ORDER BY id').all(me.id);
    if (rows.length) db.prepare(`DELETE FROM voice_signals WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map((r) => r.id));
    return send(res, 200, { signals: rows.map((r) => ({ from: r.from_id, kind: r.kind, payload: JSON.parse(r.payload) })) });
  }
  const match = path.match(/^\/api\/actions\/([A-Za-z]+)$/);
  if (req.method === 'POST' && match) {
    const me = requireUser(req);
    const result = runAction(match[1], me, await readJson(req));
    bumpVersion();
    return send(res, 200, { ok: true, result: result ?? null });
  }
  throw new HttpError(404, 'Route inconnue.');
}

async function serveStatic(res, path) {
  if (!(await stat(DIST).catch(() => null))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Build absent : lancez `npm run build` ou utilisez le serveur de dev Vite.');
  }
  const safe = normalize(decodeURIComponent(path)).replace(/^(\.\.[/\\])+/, '');
  let file = join(DIST, safe === '/' || safe === '.' ? 'index.html' : safe);
  if (!file.startsWith(DIST)) return send(res, 403, { error: 'Accès refusé.' });
  if (!(await stat(file).catch(() => null))?.isFile()) file = join(DIST, 'index.html'); // routes SPA
  const body = await readFile(file);
  // Fichiers versionnés par le build : cache long ; index.html : toujours revalidé.
  const cache = file.includes(`${join(DIST, 'assets')}`) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
  res.end(body);
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url.pathname);
    } else {
      await serveStatic(res, url.pathname);
    }
  } catch (err) {
    if (err instanceof HttpError) {
      if (!res.headersSent) send(res, err.status, { error: err.message });
    } else {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'Erreur interne du serveur.' });
    }
  }
}).listen(PORT, () => console.log(`Feathery API sur http://localhost:${PORT}`));
