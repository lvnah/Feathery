// Serveur HTTP : API JSON (/api/*) + fichiers statiques du build (dist/) en production.
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, dirname, relative, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { digestToken, revokeSessions, userFromToken } from './auth.js';
import { buildSnapshot } from './sync.js';
import { HttpError, login, logout, purgeNonPlusGifs, register, runAction, verifyEmailToken } from './actions.js';
import { publicUser } from './sync.js';
import { db } from './db.js';
import { getVersion, bumpVersion, onVersion, offVersion } from './version.js';
import { ensureAdmin } from './seed.js';
import { getImage, migrateInlineImages } from './images.js';
import { clientIp, hit, securityHeaders } from './security.js';
import { importGif, searchGifs } from './gifs.js';
import { iceServersFor } from './ice.js';

ensureAdmin();
// Une place de vocal se libère seulement quand le membre ne donne plus signe de vie depuis longtemps
// (téléphone verrouillé, réseau coupé) : une simple pause de l'onglet ne fait pas sortir du vocal.
const VOICE_GRACE_MS = 120_000;
setInterval(() => {
  const cutoff = Date.now() - VOICE_GRACE_MS;
  db.prepare('DELETE FROM voice_connections WHERE user_id IN (SELECT id FROM users WHERE last_activity < ?)').run(cutoff);
  db.prepare('DELETE FROM call_connections WHERE user_id IN (SELECT id FROM users WHERE last_activity < ?)').run(cutoff);
}, 15_000).unref();
db.prepare("UPDATE users SET name_color = '' WHERE is_admin = 0 AND name_color IN ('#dc2626', '#ef4444', '#be123c', 'rainbow-red')").run();
// Panneau d'administration : accès séparé des comptes. Login = ADMIN_LOGIN (admin par défaut), mot de passe = ADMIN_PASSWORD du serveur.
db.exec('CREATE TABLE IF NOT EXISTS admin_sessions (token TEXT PRIMARY KEY, created_at INTEGER NOT NULL)');
const ADMIN_ME = { id: '__admin_panel__', pseudo: 'admin', tag: '0000', is_admin: 1, is_plus: 1 };
const ADMIN_SESSION_MS = 8 * 3600 * 1000;
// Jeton administrateur : empreinte seule en base, expiration après 8 heures.
const requireAdminToken = (req) => {
  const token = String(req.headers['x-admin-token'] || '');
  const row = token ? db.prepare('SELECT created_at FROM admin_sessions WHERE token = ?').get(digestToken(token)) : null;
  if (!row || row.created_at < Date.now() - ADMIN_SESSION_MS) throw new HttpError(401, 'Session administrateur expirée, reconnectez-vous.');
};
const migrated = migrateInlineImages();
// Les membres qui ne sont plus PLUS ne gardent aucun GIF animé (photo, bannières).
purgeNonPlusGifs();
if (migrated) console.log(`${migrated} image(s) déplacée(s) hors de la synchronisation.`);

const PORT = Number(process.env.PORT || 3001);
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(root, 'dist');
const MAX_BODY = 20 * 1024 * 1024; // actions avec images (GIF animés jusqu'à ~12 Mo)
const SMALL_BODY = 64 * 1024; // connexion, présence, signalisation vocale, import de GIF : quelques octets seulement
const MIN = 60_000;
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
};
const sseOpen = new Map(); // membre -> nombre de flux d'événements ouverts

function send(res, status, data) {
  securityHeaders(res, 'api');
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

// Déconnexion volontaire : hors ligne tout de suite, on quitte le vocal et les appels.
function setOffline(token) {
  const user = userFromToken(token || null);
  if (!user) return;
  db.prepare('UPDATE users SET last_activity = 0 WHERE id = ?').run(user.id);
  db.prepare('DELETE FROM voice_connections WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM call_connections WHERE user_id = ?').run(user.id);
  bumpVersion();
}

// Corps JSON uniquement (un objet), de taille bornée selon la route.
function readJson(req, max = SMALL_BODY) {
  return new Promise((resolveBody, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > max) {
        reject(new HttpError(413, 'Requête trop volumineuse.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (!chunks.length) return resolveBody({});
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolveBody(value && typeof value === 'object' && !Array.isArray(value) ? value : {});
      } catch {
        reject(new HttpError(400, 'JSON invalide.'));
      }
    });
    req.on('error', reject);
  });
}

const bearer = (req) => (req.headers.authorization || '').replace(/^Bearer\s+/i, '') || null;
const tooMany = () => new HttpError(429, 'Trop de requêtes. Patientez un instant puis réessayez.');

function requireUser(req) {
  const user = userFromToken(bearer(req));
  if (!user) throw new HttpError(401, 'Session expirée, reconnectez-vous.');
  return user;
}

async function handleApi(req, res, path) {
  const ip = clientIp(req);
  if (req.method === 'POST' && path === '/api/auth/register') {
    if (!hit(`register-ip:${ip}`, 10, 60 * MIN)) throw tooMany();
    const result = await register(await readJson(req));
    bumpVersion(); // nouveau compte : les totaux changent
    return send(res, 201, result);
  }
  // Lien de confirmation reçu par e-mail.
  if (req.method === 'GET' && path === '/api/auth/verify') {
    const token = new URL(req.url, 'http://x').searchParams.get('token') ?? '';
    const ok = verifyEmailToken(token);
    bumpVersion();
    const msg = ok ? 'Votre adresse est confirmée. Vous pouvez maintenant vous connecter à Feathery.' : 'Lien invalide ou expiré. Reconnectez-vous pour recevoir un nouveau lien.';
    securityHeaders(res, 'verify');
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    return res.end(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Feathery</title></head><body style="font-family:system-ui,sans-serif;background:#f4fbf7;color:#0b1410;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0"><main style="max-width:420px;padding:32px;background:#fff;border-radius:24px;text-align:center"><h1 style="font-size:22px">Feathery</h1><p>${msg}</p><p><a href="/" style="color:#007454;font-weight:700">Retour à l’application</a></p></main></body></html>`);
  }
  if (req.method === 'POST' && path === '/api/auth/login') {
    const body = await readJson(req);
    // Freins contre le devinage de mot de passe : par adresse (large) et par compte (plus strict).
    const who = String(body.fullName ?? '').trim().toLowerCase().slice(0, 80);
    if (!hit(`login-ip:${ip}`, 40, 15 * MIN) || !hit(`login-who:${who}`, 12, 15 * MIN)) {
      throw new HttpError(429, 'Trop de tentatives de connexion. Réessayez dans quelques minutes.');
    }
    const result = login(body);
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
  // Fermeture de la page : ne change rien. Un onglet fermé ou mis en veille sur téléphone ne doit pas faire
  // sortir du vocal ; la présence retombe toute seule quand les battements s'arrêtent.
  if (req.method === 'POST' && path === '/api/presence/leave') {
    await readJson(req).catch(() => ({}));
    return send(res, 200, { ok: true });
  }
  // Aperçu d'un lien d'invitation (sans connexion) : nom, bannière, propriétaire, nombre de membres.
  const inviteMatch = path.match(/^\/api\/invite\/([A-Za-z0-9]+)$/);
  if (req.method === 'GET' && inviteMatch) {
    // Les codes sont devinables à force d'essais : limite par adresse.
    if (!hit(`invite-ip:${ip}`, 60, MIN)) throw tooMany();
    const srv = db
      .prepare(`SELECT s.id, s.name, s.icon, s.banner, s.created_at, u.pseudo AS owner_pseudo, u.tag AS owner_tag,
        (SELECT COUNT(*) FROM memberships m WHERE m.server_id = s.id) AS members
        FROM servers s JOIN users u ON u.id = s.owner_id WHERE s.invite_code = ?`)
      .get(inviteMatch[1].toUpperCase());
    if (!srv) return send(res, 404, { error: 'Lien d’invitation invalide ou expiré.' });
    return send(res, 200, { server: srv });
  }
  // Images servies par URL : le navigateur les garde en cache.
  const imgMatch = path.match(/^\/api\/img\/([a-f0-9]+)$/);
  if (req.method === 'GET' && imgMatch) {
    const row = getImage(imgMatch[1]);
    if (!row) return send(res, 404, { error: 'Image introuvable.' });
    securityHeaders(res, 'image');
    res.writeHead(200, { 'Content-Type': row.mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
    return res.end(row.data);
  }
  // Flux d'événements : le serveur prévient le client dès que les données changent (pas d'attente d'interrogation).
  if (req.method === 'GET' && path === '/api/events') {
    const me = requireUser(req);
    const open = sseOpen.get(me.id) || 0;
    if (open >= 4) throw new HttpError(429, 'Trop de connexions ouvertes.');
    sseOpen.set(me.id, open + 1);
    res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no', 'X-Content-Type-Options': 'nosniff' });
    const push = (v) => res.write(`data: ${v}\n\n`);
    res.write(`data: ${getVersion()}\n\n`);
    onVersion(push);
    const ping = setInterval(() => res.write(': ping\n\n'), 25_000);
    req.on('close', () => {
      clearInterval(ping);
      offVersion(push);
      const left = (sseOpen.get(me.id) || 1) - 1;
      if (left > 0) sseOpen.set(me.id, left);
      else sseOpen.delete(me.id);
    });
    return undefined;
  }
  // ----- Panneau d'administration (séparé des comptes) -----
  if (req.method === 'POST' && path === '/api/admin/login') {
    if (!hit(`admin-ip:${ip}`, 6, 15 * MIN)) throw tooMany();
    const body = await readJson(req);
    const expected = process.env.ADMIN_PASSWORD || '';
    if (!expected) throw new HttpError(503, 'Accès administrateur non configuré sur le serveur (variable ADMIN_PASSWORD).');
    const expectedLogin = process.env.ADMIN_LOGIN || 'admin';
    const login = String(body.login ?? '');
    const given = String(body.password ?? '');
    // Comparaisons à temps constant, sur des valeurs de même longueur (sinon on refuse directement).
    const same = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
    const pwdOk = same(given, expected);
    const loginOk = same(login, expectedLogin);
    if (!loginOk || !pwdOk) throw new HttpError(401, 'Identifiant ou mot de passe incorrect.');
    const token = randomBytes(32).toString('hex');
    db.prepare('DELETE FROM admin_sessions WHERE created_at < ?').run(Date.now() - ADMIN_SESSION_MS);
    db.prepare('INSERT INTO admin_sessions (token, created_at) VALUES (?, ?)').run(digestToken(token), Date.now());
    return send(res, 200, { token });
  }
  if (req.method === 'GET' && path === '/api/admin/session') {
    requireAdminToken(req);
    return send(res, 200, { ok: true });
  }
  const adminAct = path.match(/^\/api\/admin\/action\/([A-Za-z]+)$/);
  if (req.method === 'POST' && adminAct) {
    requireAdminToken(req);
    if (!adminAct[1].startsWith('admin')) throw new HttpError(404, 'Action inconnue.');
    const body = await readJson(req, MAX_BODY);
    const result = await runAction(adminAct[1], ADMIN_ME, body);
    // Mot de passe changé par l'administration : le membre doit se reconnecter partout.
    if (adminAct[1] === 'adminSetPassword') revokeSessions(String(body.userId ?? ''));
    bumpVersion();
    return send(res, 200, { ok: true, result: result ?? null });
  }

  // Battement de cœur de présence (léger, sans synchronisation complète).
  if (req.method === 'POST' && path === '/api/presence/ping') {
    const me = requireUser(req);
    const body = await readJson(req).catch(() => ({})); // corps vide : ordinateur par défaut
    const device = body.device === 'mobile' ? 'mobile' : 'desktop';
    db.prepare('UPDATE users SET last_activity = ?, device = ? WHERE id = ?').run(Date.now(), device, me.id);
    // Dernière saisie = maintenant moins le temps d'inactivité envoyé par le navigateur.
    const idle = Number(body.idle);
    if (Number.isFinite(idle) && idle >= 0) {
      db.prepare('UPDATE users SET last_input = ? WHERE id = ?').run(Date.now() - Math.min(idle, 86_400_000), me.id);
    }
    return send(res, 200, { ok: true });
  }
  // Recherche d'un membre (pseudo et tag) : sur tous les comptes, pas seulement ceux déjà connus.
  if (req.method === 'GET' && path === '/api/users/search') {
    const me = requireUser(req);
    if (!hit(`search:${me.id}`, 60, MIN)) throw tooMany();
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
    // Même salon (espace ou appel privé) : sinon refusé.
    const roomOf = (id) => db.prepare('SELECT channel_id AS room FROM voice_connections WHERE user_id = ?').get(id)?.room
      ?? db.prepare('SELECT room FROM call_connections WHERE user_id = ?').get(id)?.room ?? null;
    const mine = roomOf(me.id);
    const theirs = roomOf(String(body.toId ?? ''));
    if (!mine || mine !== theirs) throw new HttpError(403, 'Pas dans le même salon vocal.');
    if (!['offer', 'answer', 'ice'].includes(body.kind)) throw new HttpError(400, 'Signal inconnu.');
    const payload = JSON.stringify(body.payload ?? null);
    if (payload.length > 20000) throw new HttpError(413, 'Signal trop volumineux.');
    const now = Date.now();
    db.prepare('DELETE FROM voice_signals WHERE created_at < ?').run(now - 60_000);
    db.prepare('INSERT INTO voice_signals (to_id, from_id, kind, payload, created_at) VALUES (?, ?, ?, ?, ?)').run(String(body.toId), me.id, body.kind, payload, now);
    return send(res, 200, { ok: true });
  }
  // Serveurs de relais pour la connexion vocale (propres à ce membre, temporaires).
  if (req.method === 'GET' && path === '/api/voice/ice') {
    const me = requireUser(req);
    return send(res, 200, { iceServers: iceServersFor(me.id) });
  }
  if (req.method === 'GET' && path === '/api/voice/signals') {
    const me = requireUser(req);
    const rows = db.prepare('SELECT id, from_id, kind, payload FROM voice_signals WHERE to_id = ? ORDER BY id').all(me.id);
    if (rows.length) db.prepare(`DELETE FROM voice_signals WHERE id IN (${rows.map(() => '?').join(',')})`).run(...rows.map((r) => r.id));
    return send(res, 200, { signals: rows.map((r) => ({ from: r.from_id, kind: r.kind, payload: JSON.parse(r.payload) })) });
  }
  // GIF : recherche (clé gardée sur le serveur) et import du GIF choisi.
  if (req.method === 'GET' && path === '/api/gifs/search') {
    const me = requireUser(req);
    if (!hit(`gif-search:${me.id}`, 60, MIN)) throw tooMany();
    const q = new URL(req.url, 'http://x').searchParams.get('q') ?? '';
    return send(res, 200, { results: await searchGifs(q) });
  }
  if (req.method === 'POST' && path === '/api/gifs/import') {
    const me = requireUser(req);
    if (!hit(`gif-import:${me.id}`, 30, MIN)) throw tooMany();
    const body = await readJson(req);
    return send(res, 200, { url: await importGif(body.url) });
  }
  const match = path.match(/^\/api\/actions\/([A-Za-z]+)$/);
  if (req.method === 'POST' && match) {
    const me = requireUser(req);
    const name = match[1];
    if (!hit(`act:${me.id}`, 300, MIN)) throw tooMany();
    if ((name === 'sendMessage' || name === 'sendDM') && !hit(`msg:${me.id}`, 40, MIN)) {
      throw new HttpError(429, 'Vous envoyez trop de messages. Patientez un instant.');
    }
    if (name === 'joinServer' && !hit(`join:${me.id}`, 15, MIN)) throw tooMany();
    if (name === 'changePassword' && !hit(`pwd:${me.id}`, 6, 15 * MIN)) throw tooMany();
    const result = await runAction(name, me, await readJson(req, MAX_BODY));
    // Mot de passe changé : les autres appareils sont déconnectés, celui-ci reste connecté.
    if (name === 'changePassword') revokeSessions(me.id, bearer(req));
    bumpVersion();
    return send(res, 200, { ok: true, result: result ?? null });
  }
  throw new HttpError(404, 'Route inconnue.');
}

async function serveStatic(res, urlPath) {
  if (!(await stat(DIST).catch(() => null))) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('Build absent : lancez `npm run build` ou utilisez le serveur de dev Vite.');
  }
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return send(res, 400, { error: 'Requête invalide.' });
  }
  // Le fichier demandé doit rester à l'intérieur du dossier dist/.
  const wanted = resolve(DIST, `.${decoded}`);
  const rel = relative(DIST, wanted);
  if (rel.startsWith('..') || isAbsolute(rel)) return send(res, 403, { error: 'Accès refusé.' });
  let file = wanted;
  if (!(await stat(file).catch(() => null))?.isFile()) file = join(DIST, 'index.html'); // routes SPA
  const body = await readFile(file);
  securityHeaders(res, extname(file) === '.html' ? 'app' : 'static');
  // Fichiers versionnés par le build : cache long ; index.html : toujours revalidé.
  const cache = file.startsWith(join(DIST, 'assets')) ? 'public, max-age=31536000, immutable' : 'no-cache';
  res.writeHead(200, { 'Content-Type': MIME[extname(file)] || 'application/octet-stream', 'Cache-Control': cache });
  res.end(body);
}

const server = createServer(async (req, res) => {
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
});
// Délais : une connexion lente ne peut pas immobiliser le serveur indéfiniment.
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
server.listen(PORT, () => console.log(`Feathery API sur http://localhost:${PORT}`));
