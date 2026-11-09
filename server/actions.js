// Actions métier : toutes les règles sont appliquées côté serveur.
// Chaque action reçoit (me, payload) et lève HttpError(status, message) en cas d'échec.
import { randomBytes } from 'node:crypto';
import { db } from './db.js';
import { hashPassword, verifyPassword, createSession, deleteSession } from './auth.js';
import { publicUser } from './sync.js';
import { storeImage } from './images.js';
import { CONFIRM_EMAIL, consumeToken, mailConfigured, sendVerification } from './mail.js';
import { COUNTRY_CODES } from './countries.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const fail = (message, status = 400) => {
  throw new HttpError(status, message);
};
const one = (sql, ...p) => db.prepare(sql).get(...p);
const all = (sql, ...p) => db.prepare(sql).all(...p);
const run = (sql, ...p) => db.prepare(sql).run(...p);
const newId = (prefix) => `${prefix}_${randomBytes(8).toString('hex')}`;
const now = () => Date.now();
// Vrai si une image (data URL ou /api/img/<id>) est un GIF animé.
const isGifRef = (value) => {
  const v = String(value || '');
  if (v.startsWith('data:image/gif')) return true;
  const m = v.match(/^\/api\/img\/([\w-]+)$/);
  if (!m) return false;
  const row = one('SELECT mime FROM images WHERE id = ?', m[1]);
  return row?.mime === 'image/gif';
};
const text = (value, min, max, message) => {
  const t = String(value ?? '').trim();
  if (t.length < min || t.length > max) fail(message);
  return t;
};
const transaction = (fn) => {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
};

const requireAdmin = (me) => {
  if (!me.is_admin) fail('Accès réservé aux administrateurs.', 403);
};
const getServer = (id) => one('SELECT * FROM servers WHERE id = ?', id);
const isMember = (serverId, userId) =>
  !!one('SELECT 1 FROM memberships WHERE server_id = ? AND user_id = ?', serverId, userId);
const requireOwner = (serverId, me) => {
  const srv = getServer(serverId);
  if (!srv) fail('Espace introuvable.', 404);
  if (srv.owner_id !== me.id) fail('Action réservée au propriétaire.', 403);
  return srv;
};
export const canManageChannels = (serverId, userId) => {
  const srv = getServer(serverId);
  if (!srv) return false;
  if (srv.owner_id === userId) return true;
  return !!one(
    `SELECT 1 FROM member_roles mr JOIN roles r ON r.id = mr.role_id
     WHERE mr.server_id = ? AND mr.user_id = ? AND r.can_manage_channels = 1`,
    serverId,
    userId,
  );
};
const randomCode = () => {
  let code;
  do {
    code = randomBytes(5).toString('hex').toUpperCase();
  } while (one('SELECT 1 FROM servers WHERE invite_code = ?', code));
  return code;
};
// Images envoyées depuis le navigateur (data URL redimensionnée côté client).
// Limites de taille : ce sont des miniatures, elles sont renvoyées à chaque synchronisation.
// Images fixes : tout le monde. GIF animés : PLUS seulement, et plus légers (poids limité).
const IMAGE_LIMITS = { avatar: 60_000, banner: 160_000, icon: 60_000, espace: 1_600_000 };
// GIF animés (PLUS) : limites en caractères de la data URL (≈ 9 Mo et 12 Mo de fichier).
const GIF_LIMITS = { avatar: 12_000_000, banner: 17_000_000, espace: 17_000_000 };
// Couleurs de pseudo : simples pour tous, davantage pour les PLUS.
const NAME_COLORS_BASIC = ['#111827', '#0d9488', '#2563eb', '#16a34a', '#9333ea', '#ea580c'];
const NAME_COLORS_PLUS = [...NAME_COLORS_BASIC, '#0891b2', '#db2777', '#4f46e5', '#65a30d', '#b45309', '#0f766e', '#7c3aed', '#4338ca', '#1d4ed8', '#047857', '#c026d3', '#854d0e', 'rainbow', 'sunset', 'ocean', 'aurora', 'candy', 'neon', 'lagoon', 'ruby', 'lime', 'violet'];
const imageData = (value, kind, isPlus = false) => {
  // Renvoie l'URL de l'image enregistrée (les données ne sont plus gardées dans la ligne).
  const v = String(value ?? '').trim();
  if (!v) return '';
  // Image déjà enregistrée (adresse /api/img/…) : on la garde telle quelle.
  if (/^\/api\/img\/[a-f0-9]+$/.test(v)) return v;
  if (!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) {
    fail('Format non pris en charge : PNG, JPEG, WebP ou GIF.');
  }
  const isGif = v.startsWith('data:image/gif');
  if (isGif && !isPlus) fail('Les GIF animés sont réservés aux membres PLUS.', 403);
  const limit = isGif && GIF_LIMITS[kind] ? GIF_LIMITS[kind] : IMAGE_LIMITS[kind];
  if (v.length > limit) fail('Image trop lourde. Choisissez une image plus légère.');
  return storeImage(v) ?? fail('Image illisible.');
};

// Conversations masquées par membre : seul celui qui masque ne voit plus l'historique antérieur.
db.exec(`CREATE TABLE IF NOT EXISTS dm_hidden (user_id TEXT NOT NULL, peer_id TEXT NOT NULL, since INTEGER NOT NULL, PRIMARY KEY (user_id, peer_id))`);

// Bannières préréglées, réservées aux membres PLUS (dégradés animés faits pour Feathery).
const PLUS_PRESETS = ['aurora', 'ember', 'tide', 'nocturne', 'meadow', 'silver'];
// Bannière d'espace par défaut (création sans bannière) : l'argent fixe.
const DEFAULT_ESPACE_BANNER = 'preset:g6';

// Bannière d'espace : image téléchargée, ou bannière de base 'preset:gN' (N de 0 à 6) pour tout le monde,
// ou une bannière préréglée PLUS ('preset:aurora' …) ; 'preset:feathery' est réservée aux administrateurs.
const ESPACE_PRESET = /^preset:(g[0-6]|aurora|ember|tide|nocturne|meadow|silver|feathery)$/;
const espaceBannerValue = (value, me) => {
  const v = String(value ?? '').trim();
  if (!v) return '';
  const m = ESPACE_PRESET.exec(v);
  if (!m) return imageData(v, 'espace', !!me.is_plus);
  const key = m[1];
  if (key === 'feathery' && !me.is_admin) fail('Cette bannière est réservée aux administrateurs.', 403);
  if (key[0] !== 'g' && key !== 'feathery' && !me.is_plus && !me.is_admin) fail('Ces bannières sont réservées aux membres PLUS.', 403);
  return v;
};

// Retire les GIF animés d'un membre qui n'est pas PLUS : photo, bannière de profil, bannières d'espace.
function purgeGifs(userId) {
  const user = one('SELECT id, avatar, banner_type, banner_value FROM users WHERE id = ?', userId);
  if (!user) return;
  if (isGifRef(user.avatar)) run("UPDATE users SET avatar = '' WHERE id = ?", userId);
  if (user.banner_type === 'image' && isGifRef(user.banner_value)) {
    run("UPDATE users SET banner_type = 'gradient', banner_value = '0' WHERE id = ?", userId);
  }
  for (const s of all('SELECT id, banner FROM servers WHERE owner_id = ?', userId)) {
    if (isGifRef(s.banner)) run("UPDATE servers SET banner = '' WHERE id = ?", s.id);
  }
}

// Contrôle de tous les membres sans PLUS : appelé au démarrage du serveur.
export function purgeNonPlusGifs() {
  for (const u of all('SELECT id FROM users WHERE is_plus = 0')) purgeGifs(u.id);
}

const handlers = {
  changePassword: (me, p) => changePassword(me, p),
  changeEmail: (me, p) => changeEmail(me, p),
  // Statistiques de jeux (3 maximum) : rang et heures, affichées dans le profil.
  setGames(me, p) {
    const list = Array.isArray(p.games) ? p.games.slice(0, 3) : [];
    const rows = list.map((g) => {
      const game = String(g.game ?? '').trim();
      if (!game || game.length > 24) fail('Nom de jeu : 1 à 24 caractères.');
      const rank = String(g.rank ?? '').trim();
      if (rank.length > 24) fail('Rang : 24 caractères maximum.');
      return { game, rank, hours: 0 }; // seul le nom du jeu et le niveau sont affichés
    });
    transaction(() => {
      run('DELETE FROM user_games WHERE user_id = ?', me.id);
      rows.forEach((r, i) => run('INSERT INTO user_games (user_id, position, game, rank, hours) VALUES (?, ?, ?, ?, ?)', me.id, i, r.game, r.rank, r.hours));
    });
  },

  // Supprimer un message privé que l'on a envoyé.
  deleteDM(me, p) {
    const msg = one('SELECT * FROM dms WHERE id = ? AND from_id = ?', String(p.messageId ?? ''), me.id);
    if (!msg) return;
    // Une demande de message supprimée entraîne la suppression de toute la demande.
    if (msg.status === 'request') run("DELETE FROM dms WHERE status = 'request' AND from_id = ? AND to_id = ?", me.id, msg.to_id);
    else run('DELETE FROM dms WHERE id = ?', msg.id);
  },

  // Masquer une conversation pour soi (l'autre membre garde la sienne).
  hideConversation(me, p) {
    run('INSERT OR REPLACE INTO dm_hidden (user_id, peer_id, since) VALUES (?, ?, ?)', me.id, String(p.peerId ?? ''), now());
  },

  setStatus(me, p) {
    if (!['online', 'game', 'away', 'offline'].includes(p.status)) fail('Statut inconnu.');
    run('UPDATE users SET status = ? WHERE id = ?', p.status, me.id);
  },

  // Micro coupé ou ouvert : visible par tous les membres du salon vocal.
  setVoiceMuted(me, p) {
    run('UPDATE voice_connections SET muted = ? WHERE user_id = ?', p.muted ? 1 : 0, me.id);
  },

  updateProfile(me, p) {
    if (p.country !== undefined && p.country !== '' && !COUNTRY_CODES.has(p.country)) fail('Pays non proposé.');
    if (p.country !== undefined) run('UPDATE users SET country = ? WHERE id = ?', p.country, me.id);
    if (p.nameColor !== undefined) {
      const allowed = me.is_plus ? NAME_COLORS_PLUS : NAME_COLORS_BASIC;
      if (p.nameColor !== '' && !allowed.includes(p.nameColor)) fail(me.is_plus ? 'Couleur inconnue.' : 'Cette couleur est réservée aux membres PLUS.', 403);
      run('UPDATE users SET name_color = ? WHERE id = ?', p.nameColor, me.id);
    }
    if (p.customStatus !== undefined) {
      const cs = String(p.customStatus).trim();
      if (cs.length > 16) fail('Le statut personnalisé fait 16 caractères maximum.');
      if (!/^[\p{L}\p{N} ]*$/u.test(cs)) fail("Le statut personnalisé n'accepte que des lettres et des chiffres.");
      run('UPDATE users SET custom_status = ? WHERE id = ?', cs, me.id);
    }
    const pseudo = p.pseudo !== undefined
      ? text(p.pseudo, 2, 24, 'Le pseudo doit faire entre 2 et 24 caractères.')
      : me.pseudo;
    let tag = me.tag;
    if (p.tag !== undefined && p.tag !== me.tag) {
      if (!me.is_plus) fail('Le tag personnalisé est réservé aux membres PLUS.', 403);
      if (!/^\d{4}$/.test(p.tag)) fail('Le tag doit contenir exactement 4 chiffres.');
      tag = p.tag;
    }
    if (one('SELECT 1 FROM users WHERE pseudo = ? COLLATE NOCASE AND tag = ? AND id <> ?', pseudo, tag, me.id)) {
      fail('Ce pseudo et ce tag sont déjà utilisés.', 409);
    }
    const avatar = p.avatar !== undefined ? imageData(p.avatar, 'avatar', !!me.is_plus) : me.avatar;
    const bio = p.bio !== undefined ? String(p.bio).slice(0, 190) : me.bio;
    let bannerType = me.banner_type;
    let bannerValue = me.banner_value;
    if (p.banner !== undefined) {
      if (p.banner.type === 'image') {
        bannerType = 'image';
        bannerValue = imageData(p.banner.value, 'banner', !!me.is_plus);
        if (!bannerValue) fail('Image de bannière manquante.');
      } else if (p.banner.type === 'preset') {
        if (p.banner.key === 'feathery') {
          if (!me.is_admin) fail('Cette bannière est réservée aux administrateurs.', 403);
        } else {
          if (!me.is_plus) fail('Les bannières préréglées sont réservées aux membres PLUS.', 403);
          if (!PLUS_PRESETS.includes(p.banner.key)) fail('Bannière inconnue.');
        }
        bannerType = 'preset';
        bannerValue = p.banner.key;
      } else {
        bannerType = 'gradient';
        bannerValue = String(Math.max(0, Math.min(6, Number(p.banner.index) || 0)));
      }
    }
    run(
      'UPDATE users SET pseudo = ?, tag = ?, avatar = ?, bio = ?, banner_type = ?, banner_value = ? WHERE id = ?',
      pseudo, tag, avatar, bio, bannerType, bannerValue, me.id,
    );
  },

  sendFriendRequest(me, p) {
    let target;
    if (p.targetId) {
      target = one('SELECT * FROM users WHERE id = ?', p.targetId);
    } else {
      const [pseudo = '', tag = ''] = String(p.query ?? '').split('#').map((x) => x.trim());
      target = one('SELECT * FROM users WHERE pseudo = ? COLLATE NOCASE AND tag = ?', pseudo, tag);
    }
    if (!target) fail('Utilisateur introuvable. Format attendu : Pseudo#1234', 404);
    if (target.id === me.id) fail('Vous ne pouvez pas vous ajouter vous-même.');
    if (target.accept_friend_requests === 0) fail('Ce membre n’accepte pas les demandes d’ami.', 403);
    const existing = one(
      'SELECT * FROM friendships WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)',
      me.id, target.id, target.id, me.id,
    );
    if (existing?.status === 'accepted') fail('Vous êtes déjà amis.', 409);
    if (existing) fail('Une demande est déjà en attente.', 409);
    run(
      'INSERT INTO friendships (id, from_id, to_id, status, created_at) VALUES (?, ?, ?, ?, ?)',
      newId('f'), me.id, target.id, 'pending', now(),
    );
  },

  respondFriendRequest(me, p) {
    const f = one('SELECT * FROM friendships WHERE id = ?', p.id);
    if (!f || (f.from_id !== me.id && f.to_id !== me.id)) fail('Demande introuvable.', 404);
    if (p.accept) {
      if (f.to_id !== me.id) fail('Seul le destinataire peut accepter.', 403);
      run("UPDATE friendships SET status = 'accepted' WHERE id = ?", f.id);
    } else {
      run('DELETE FROM friendships WHERE id = ?', f.id);
    }
  },

  removeFriend(me, p) {
    run(
      'DELETE FROM friendships WHERE (from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)',
      me.id, p.userId, p.userId, me.id,
    );
  },

  // Message privé. Sans amitié ni conversation acceptée, c'est une demande de message :
  // le destinataire doit l'accepter avant de voir la conversation. Répondre vaut acceptation.
  sendDM(me, p) {
    const content = text(p.content, 1, 1000, 'Message vide ou trop long (1000 caractères max).');
    if (p.toId === me.id) fail('Vous ne pouvez pas vous écrire à vous-même.');
    if (!one('SELECT 1 FROM users WHERE id = ?', p.toId)) fail('Utilisateur introuvable.', 404);
    const pair = (a, b) => one('SELECT 1 FROM dms WHERE status = ? AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?)) LIMIT 1', 'ok', a, b, b, a);
    const friend = one(
      "SELECT 1 FROM friendships WHERE status = 'accepted' AND ((from_id = ? AND to_id = ?) OR (from_id = ? AND to_id = ?))",
      me.id, p.toId, p.toId, me.id,
    );
    const accepted = friend || pair(me.id, p.toId);
    // Le destinataire m'a déjà écrit une demande : je réponds, donc j'accepte.
    const theirRequest = one("SELECT 1 FROM dms WHERE status = 'request' AND from_id = ? AND to_id = ? LIMIT 1", p.toId, me.id);
    if (theirRequest) run("UPDATE dms SET status = 'ok' WHERE status = 'request' AND from_id = ? AND to_id = ?", p.toId, me.id);
    // Si le destinataire autorise les messages directs, pas de demande à accepter.
    const openDm = !!one('SELECT dm_open FROM users WHERE id = ?', p.toId)?.dm_open;
    const status = accepted || theirRequest || openDm ? 'ok' : 'request';
    if (status === 'request') {
      const pending = one("SELECT COUNT(*) AS n FROM dms WHERE status = 'request' AND from_id = ? AND to_id = ?", me.id, p.toId).n;
      if (pending >= 3) fail('Demande envoyée. Attendez sa réponse avant d’écrire à nouveau.', 429);
    }
    run(
      'INSERT INTO dms (id, from_id, to_id, content, created_at, status) VALUES (?, ?, ?, ?, ?, ?)',
      newId('d'), me.id, p.toId, content, now(), status,
    );
  },

  // Réglages du compte : thème, messages privés directs, demandes d'amis.
  updateSettings(me, p) {
    const patch = [];
    const args = [];
    if (p.theme !== undefined) {
      if (!['light', 'dark'].includes(p.theme)) fail('Thème inconnu.');
      patch.push('theme = ?'); args.push(p.theme);
    }
    if (p.dmOpen !== undefined) { patch.push('dm_open = ?'); args.push(p.dmOpen ? 1 : 0); }
    if (p.acceptFriendRequests !== undefined) { patch.push('accept_friend_requests = ?'); args.push(p.acceptFriendRequests ? 1 : 0); }
    if (patch.length) run(`UPDATE users SET ${patch.join(', ')} WHERE id = ?`, ...args, me.id);
  },

  acceptDM(me, p) {
    run("UPDATE dms SET status = 'ok' WHERE status = 'request' AND from_id = ? AND to_id = ?", p.peerId, me.id);
  },

  // Refuser : les messages de la demande sont supprimés.
  refuseDM(me, p) {
    run("DELETE FROM dms WHERE status = 'request' AND from_id = ? AND to_id = ?", p.peerId, me.id);
  },

  markDmRead(me, p) {
    run('INSERT OR REPLACE INTO dm_reads (user_id, peer_id, read_at) VALUES (?, ?, ?)', me.id, p.peerId, now());
  },

  markChannelRead(me, p) {
    const ch = one('SELECT * FROM channels WHERE id = ?', p.channelId);
    if (!ch || !isMember(ch.server_id, me.id)) return;
    run('INSERT OR REPLACE INTO channel_reads (user_id, channel_id, read_at) VALUES (?, ?, ?)', me.id, ch.id, now());
  },

  createServer(me, p) {
    // Limite de création : 3 espaces pour un membre, 5 pour un membre PLUS (rejoindre reste illimité).
    const owned = one('SELECT COUNT(*) AS n FROM servers WHERE owner_id = ?', me.id).n;
    const limit = me.is_plus ? 5 : 3;
    if (owned >= limit) {
      fail(me.is_plus ? 'Limite atteinte : 5 espaces maximum pour un membre PLUS.' : 'Limite atteinte : 3 espaces maximum. Passez PLUS pour en créer 5.', 403);
    }
    const name = text(p.name, 1, 16, 'Le nom doit faire entre 1 et 16 caractères.');
    const icon = imageData(p.icon, 'icon', false);
    let code;
    if (String(p.customCode ?? '').trim()) {
      if (!me.is_plus) fail('Le code personnalisé est réservé aux membres PLUS.', 403);
      code = String(p.customCode).trim().toUpperCase();
      if (!/^[A-Z0-9-]{4,20}$/.test(code)) fail('Code : 4 à 20 caractères (lettres, chiffres, tirets).');
      if (one('SELECT 1 FROM servers WHERE invite_code = ?', code)) fail('Ce code est déjà utilisé.', 409);
    } else {
      code = randomCode();
    }
    const id = newId('s');
    return transaction(() => {
      run(
        'INSERT INTO servers (id, name, icon, is_public, owner_id, invite_code, created_at, banner) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        id, name, icon, p.isPublic === false ? 0 : 1, me.id, code, now(), espaceBannerValue(p.banner, me) || DEFAULT_ESPACE_BANNER,
      );
      run('INSERT INTO memberships (server_id, user_id, joined_at) VALUES (?, ?, ?)', id, me.id, now());
      run('INSERT INTO channels (id, server_id, name, type, created_at) VALUES (?, ?, ?, ?, ?)', newId('c'), id, 'général', 'text', now());
      run('INSERT INTO channels (id, server_id, name, type, created_at) VALUES (?, ?, ?, ?, ?)', newId('c'), id, 'vocal', 'voice', now() + 1);
      return { id };
    });
  },

  // Quitter un espace (membre seulement ; le propriétaire doit supprimer l'espace).
  leaveServer(me, p) {
    const srv = getServer(p.serverId);
    if (!srv || !isMember(p.serverId, me.id)) fail('Espace introuvable.', 404);
    if (srv.owner_id === me.id) fail('Le propriétaire ne peut pas quitter son espace : supprimez-le à la place.', 400);
    transaction(() => {
      run('DELETE FROM voice_connections WHERE user_id = ? AND channel_id IN (SELECT id FROM channels WHERE server_id = ?)', me.id, p.serverId);
      run('DELETE FROM memberships WHERE server_id = ? AND user_id = ?', p.serverId, me.id);
    });
  },

  // Rejoindre un espace public depuis la « Communauté » (sans code).
  joinPublicServer(me, p) {
    const srv = one('SELECT * FROM servers WHERE id = ? AND is_public = 1', p.serverId);
    if (!srv) fail('Espace public introuvable.', 404);
    if (isMember(srv.id, me.id)) fail('Vous êtes déjà membre de cet espace.', 409);
    run('INSERT INTO memberships (server_id, user_id, joined_at) VALUES (?, ?, ?)', srv.id, me.id, now());
    return { id: srv.id };
  },

  joinServer(me, p) {
    const srv = one('SELECT * FROM servers WHERE invite_code = ?', String(p.code ?? '').trim().toUpperCase());
    if (!srv) fail('Code d’invitation invalide.', 404);
    if (isMember(srv.id, me.id)) fail('Vous êtes déjà membre de cet espace.', 409);
    run('INSERT INTO memberships (server_id, user_id, joined_at) VALUES (?, ?, ?)', srv.id, me.id, now());
    return { id: srv.id };
  },

  regenerateInvite(me, p) {
    requireOwner(p.serverId, me);
    run('UPDATE servers SET invite_code = ? WHERE id = ?', randomCode(), p.serverId);
  },

  createChannel(me, p) {
    if (!canManageChannels(p.serverId, me.id)) fail('Permission insuffisante.', 403);
    const raw = String(p.name ?? '').trim();
    if (!/^[a-zA-Z0-9-]{1,16}$/.test(raw)) fail('Nom invalide (uniquement lettres, chiffres, tirets, max 16 caractères).');
    if (one('SELECT 1 FROM channels WHERE server_id = ? AND name = ?', p.serverId, raw.toLowerCase())) {
      fail('Un salon porte déjà ce nom dans cet espace.', 409);
    }
    run(
      'INSERT INTO channels (id, server_id, name, type, created_at) VALUES (?, ?, ?, ?, ?)',
      newId('c'), p.serverId, raw.toLowerCase(), p.type === 'voice' ? 'voice' : 'text', now(),
    );
  },

  deleteChannel(me, p) {
    const ch = one('SELECT * FROM channels WHERE id = ?', p.channelId);
    if (!ch) fail('Salon introuvable.', 404);
    if (!canManageChannels(ch.server_id, me.id)) fail('Permission insuffisante.', 403);
    const count = one('SELECT COUNT(*) AS n FROM channels WHERE server_id = ?', ch.server_id).n;
    if (count <= 1) fail('Impossible de supprimer le dernier salon.');
    run('DELETE FROM channels WHERE id = ?', ch.id);
  },

  sendMessage(me, p) {
    const ch = one('SELECT * FROM channels WHERE id = ?', p.channelId);
    if (!ch || ch.type !== 'text') fail('Salon texte introuvable.', 404);
    if (!isMember(ch.server_id, me.id)) fail('Vous n’êtes pas membre de cet espace.', 403);
    if (ch.readonly && !canManageChannels(ch.server_id, me.id)) fail('Ce salon est en lecture seule.', 403);
    const content = text(p.content, 1, 2000, 'Message vide ou trop long (2000 caractères max).');
    run('INSERT INTO messages (id, channel_id, user_id, content, created_at) VALUES (?, ?, ?, ?, ?)', newId('m'), ch.id, me.id, content, now());
  },

  // Bannière de l'espace (propriétaire) : image fixe pour tous ; GIF animé réservé aux membres PLUS.
  setServerBanner(me, p) {
    requireOwner(p.serverId, me);
    run('UPDATE servers SET banner = ? WHERE id = ?', espaceBannerValue(p.value, me), p.serverId);
  },

  // Autoriser ou non d'écrire dans un salon texte. Le propriétaire et les rôles qui gèrent les salons peuvent toujours écrire.
  setChannelReadonly(me, p) {
    const ch = one('SELECT * FROM channels WHERE id = ?', p.channelId);
    if (!ch || ch.type !== 'text') fail('Salon texte introuvable.', 404);
    if (!canManageChannels(ch.server_id, me.id)) fail('Permission insuffisante.', 403);
    run('UPDATE channels SET readonly = ? WHERE id = ?', p.readonly ? 1 : 0, ch.id);
  },

  // Renommer un salon : même règle de nom et unicité dans l'espace.
  updateChannel(me, p) {
    const ch = one('SELECT * FROM channels WHERE id = ?', p.channelId);
    if (!ch) fail('Salon introuvable.', 404);
    if (!canManageChannels(ch.server_id, me.id)) fail('Permission insuffisante.', 403);
    const raw = String(p.name ?? '').trim();
    if (!/^[a-zA-Z0-9-]{1,16}$/.test(raw)) fail('Nom invalide (uniquement lettres, chiffres, tirets, max 16 caractères).');
    if (one('SELECT 1 FROM channels WHERE server_id = ? AND name = ? AND id <> ?', ch.server_id, raw.toLowerCase(), ch.id)) {
      fail('Un salon porte déjà ce nom dans cet espace.', 409);
    }
    run('UPDATE channels SET name = ? WHERE id = ?', raw.toLowerCase(), ch.id);
  },

  joinVoice(me, p) {
    const ch = one('SELECT * FROM channels WHERE id = ?', p.channelId);
    if (!ch || ch.type !== 'voice') fail('Salon vocal introuvable.', 404);
    if (!isMember(ch.server_id, me.id)) fail('Vous n’êtes pas membre de cet espace.', 403);
    // 5 personnes maximum par vocal (hors soi-même si l'on y est déjà).
    const count = one('SELECT COUNT(*) AS n FROM voice_connections WHERE channel_id = ? AND user_id <> ?', ch.id, me.id).n;
    if (count >= 5) fail('Ce vocal est complet (5 personnes maximum).', 409);
    run('INSERT OR REPLACE INTO voice_connections (user_id, channel_id) VALUES (?, ?)', me.id, ch.id);
  },

  leaveVoice(me) {
    run('DELETE FROM voice_connections WHERE user_id = ?', me.id);
  },

  createRole(me, p) {
    requireOwner(p.serverId, me);
    const name = text(p.name, 1, 20, 'Le nom du rôle doit faire entre 1 et 20 caractères.');
    const color = /^#[0-9a-f]{6}$/i.test(p.color ?? '') ? p.color : '#38bdf8';
    const next = one('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM roles WHERE server_id = ?', p.serverId).n;
    run(
      'INSERT INTO roles (id, server_id, name, color, can_manage_channels, created_at, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      newId('r'), p.serverId, name, color, p.can_manage_channels ? 1 : 0, now(), next,
    );
  },

  // Déplacer un rôle vers le haut (-1) ou le bas (+1) : change l'ordre d'affichage des groupes.
  moveRole(me, p) {
    requireOwner(p.serverId, me);
    const role = one('SELECT * FROM roles WHERE id = ? AND server_id = ?', p.roleId, p.serverId);
    if (!role) fail('Rôle introuvable.', 404);
    const other = p.direction < 0
      ? one('SELECT * FROM roles WHERE server_id = ? AND position < ? ORDER BY position DESC LIMIT 1', p.serverId, role.position)
      : one('SELECT * FROM roles WHERE server_id = ? AND position > ? ORDER BY position ASC LIMIT 1', p.serverId, role.position);
    if (!other) return;
    transaction(() => {
      run('UPDATE roles SET position = ? WHERE id = ?', other.position, role.id);
      run('UPDATE roles SET position = ? WHERE id = ?', role.position, other.id);
    });
  },

  // Réordonner tous les rôles d'un coup (glisser-déposer) : order = liste des ids, du haut vers le bas.
  reorderRoles(me, p) {
    requireOwner(p.serverId, me);
    const order = Array.isArray(p.order) ? p.order : [];
    const roles = all('SELECT id FROM roles WHERE server_id = ?', p.serverId);
    const known = new Set(roles.map((r) => r.id));
    const unique = new Set(order);
    if (order.length !== roles.length || unique.size !== order.length || order.some((id) => !known.has(id))) {
      fail('Ordre des rôles invalide.', 400);
    }
    transaction(() => {
      order.forEach((id, index) => run('UPDATE roles SET position = ? WHERE id = ?', index + 1, id));
    });
  },

  // Bannière de l'espace (propriétaire) : image fixe pour tous ; GIF animé réservé aux membres PLUS.
  setServerBanner(me, p) {
    requireOwner(p.serverId, me);
    run('UPDATE servers SET banner = ? WHERE id = ?', espaceBannerValue(p.value, me), p.serverId);
  },

  // Autoriser ou non d'écrire dans un salon texte. Le propriétaire et les rôles qui gèrent les salons peuvent toujours écrire.
  setChannelReadonly(me, p) {
    const ch = one('SELECT * FROM channels WHERE id = ?', p.channelId);
    if (!ch || ch.type !== 'text') fail('Salon texte introuvable.', 404);
    if (!canManageChannels(ch.server_id, me.id)) fail('Permission insuffisante.', 403);
    run('UPDATE channels SET readonly = ? WHERE id = ?', p.readonly ? 1 : 0, ch.id);
  },

  // Renommer un salon : même règle de nom et unicité dans l'espace.
  updateChannel(me, p) {
    const ch = one('SELECT * FROM channels WHERE id = ?', p.channelId);
    if (!ch) fail('Salon introuvable.', 404);
    if (!canManageChannels(ch.server_id, me.id)) fail('Permission insuffisante.', 403);
    const raw = String(p.name ?? '').trim();
    if (!/^[a-zA-Z0-9-]{1,16}$/.test(raw)) fail('Nom invalide (uniquement lettres, chiffres, tirets, max 16 caractères).');
    if (one('SELECT 1 FROM channels WHERE server_id = ? AND name = ? AND id <> ?', ch.server_id, raw.toLowerCase(), ch.id)) {
      fail('Un salon porte déjà ce nom dans cet espace.', 409);
    }
    run('UPDATE channels SET name = ? WHERE id = ?', raw.toLowerCase(), ch.id);
  },

  joinVoice(me, p) {
    const ch = one('SELECT * FROM channels WHERE id = ?', p.channelId);
    if (!ch || ch.type !== 'voice') fail('Salon vocal introuvable.', 404);
    if (!isMember(ch.server_id, me.id)) fail('Vous n’êtes pas membre de cet espace.', 403);
    // 5 personnes maximum par vocal (hors soi-même si l'on y est déjà).
    const count = one('SELECT COUNT(*) AS n FROM voice_connections WHERE channel_id = ? AND user_id <> ?', ch.id, me.id).n;
    if (count >= 5) fail('Ce vocal est complet (5 personnes maximum).', 409);
    run('INSERT OR REPLACE INTO voice_connections (user_id, channel_id) VALUES (?, ?)', me.id, ch.id);
  },

  leaveVoice(me) {
    run('DELETE FROM voice_connections WHERE user_id = ?', me.id);
  },

  createRole(me, p) {
    requireOwner(p.serverId, me);
    const name = text(p.name, 1, 20, 'Le nom du rôle doit faire entre 1 et 20 caractères.');
    const color = /^#[0-9a-f]{6}$/i.test(p.color ?? '') ? p.color : '#38bdf8';
    const next = one('SELECT COALESCE(MAX(position), 0) + 1 AS n FROM roles WHERE server_id = ?', p.serverId).n;
    run(
      'INSERT INTO roles (id, server_id, name, color, can_manage_channels, created_at, position) VALUES (?, ?, ?, ?, ?, ?, ?)',
      newId('r'), p.serverId, name, color, p.can_manage_channels ? 1 : 0, now(), next,
    );
  },

  // Déplacer un rôle vers le haut (-1) ou le bas (+1) : change l'ordre d'affichage des groupes.
  moveRole(me, p) {
    requireOwner(p.serverId, me);
    const role = one('SELECT * FROM roles WHERE id = ? AND server_id = ?', p.roleId, p.serverId);
    if (!role) fail('Rôle introuvable.', 404);
    const other = p.direction < 0
      ? one('SELECT * FROM roles WHERE server_id = ? AND position < ? ORDER BY position DESC LIMIT 1', p.serverId, role.position)
      : one('SELECT * FROM roles WHERE server_id = ? AND position > ? ORDER BY position ASC LIMIT 1', p.serverId, role.position);
    if (!other) return;
    transaction(() => {
      run('UPDATE roles SET position = ? WHERE id = ?', other.position, role.id);
      run('UPDATE roles SET position = ? WHERE id = ?', role.position, other.id);
    });
  },

  // Réordonner tous les rôles d'un coup (glisser-déposer) : order = liste des ids, du haut vers le bas.
  reorderRoles(me, p) {
    requireOwner(p.serverId, me);
    const order = Array.isArray(p.order) ? p.order : [];
    const roles = all('SELECT id FROM roles WHERE server_id = ?', p.serverId);
    const known = new Set(roles.map((r) => r.id));
    const unique = new Set(order);
    if (order.length !== roles.length || unique.size !== order.length || order.some((id) => !known.has(id))) {
      fail('Ordre des rôles invalide.', 400);
    }
    transaction(() => {
      order.forEach((id, index) => run('UPDATE roles SET position = ? WHERE id = ?', index + 1, id));
    });
  },

  // Un seul rôle par membre (roleId vide = retirer les rôles), comme assign_role de server.php.
  assignRole(me, p) {
    requireOwner(p.serverId, me);
    if (!isMember(p.serverId, p.userId)) fail('Ce membre ne fait pas partie de l’espace.', 404);
    run('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?', p.serverId, p.userId);
    if (p.roleId) {
      const role = one('SELECT * FROM roles WHERE id = ? AND server_id = ?', p.roleId, p.serverId);
      if (!role) fail('Rôle introuvable.', 404);
      run('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)', p.serverId, p.userId, p.roleId);
    }
  },

  updateRole(me, p) {
    requireOwner(p.serverId, me);
    const role = one('SELECT * FROM roles WHERE id = ? AND server_id = ?', p.roleId, p.serverId);
    if (!role) fail('Rôle introuvable.', 404);
    const name = text(p.name ?? role.name, 1, 20, 'Le nom du rôle doit faire entre 1 et 20 caractères.');
    const color = /^#[0-9a-f]{6}$/i.test(p.color ?? '') ? p.color : role.color;
    run('UPDATE roles SET name = ?, color = ?, can_manage_channels = ? WHERE id = ?', name, color, p.can_manage_channels ? 1 : 0, role.id);
  },

  deleteRole(me, p) {
    requireOwner(p.serverId, me);
    run('DELETE FROM roles WHERE id = ? AND server_id = ?', p.roleId, p.serverId);
  },

  // Supprimer un message : l'auteur ou le propriétaire de l'espace.
  deleteMessage(me, p) {
    const msg = one(
      'SELECT m.id, m.user_id, c.server_id FROM messages m JOIN channels c ON c.id = m.channel_id WHERE m.id = ?',
      p.messageId,
    );
    if (!msg) fail('Message introuvable.', 404);
    const srv = getServer(msg.server_id);
    if (srv.owner_id !== me.id && msg.user_id !== me.id) fail('Action non autorisée.', 403);
    run('DELETE FROM messages WHERE id = ?', msg.id);
  },

  updateServerName(me, p) {
    requireOwner(p.serverId, me);
    const name = text(p.name, 1, 16, 'Le nom doit faire entre 1 et 16 caractères.');
    run('UPDATE servers SET name = ? WHERE id = ?', name, p.serverId);
  },

  updateServerIcon(me, p) {
    requireOwner(p.serverId, me);
    const icon = imageData(p.icon, 'icon', false);
    if (!icon) fail('Image manquante.');
    run('UPDATE servers SET icon = ? WHERE id = ?', icon, p.serverId);
  },

  deleteServer(me, p) {
    requireOwner(p.serverId, me);
    run('DELETE FROM servers WHERE id = ?', p.serverId);
  },

  // Code personnalisé : réservé au propriétaire PLUS.
  updateInvite(me, p) {
    requireOwner(p.serverId, me);
    if (!me.is_plus) fail('Le code personnalisé est réservé aux membres PLUS.', 403);
    const code = String(p.code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    if (code.length < 4 || code.length > 20) fail('Code : 4 à 20 caractères (lettres et chiffres).');
    if (one('SELECT 1 FROM servers WHERE invite_code = ? AND id <> ?', code, p.serverId)) {
      fail('Ce code est déjà utilisé par un autre espace.', 409);
    }
    run('UPDATE servers SET invite_code = ? WHERE id = ?', code, p.serverId);
  },

  kickMember(me, p) {
    requireOwner(p.serverId, me);
    if (p.userId === me.id) fail('Vous ne pouvez pas vous exclure vous-même.');
    transaction(() => {
      run(
        'DELETE FROM voice_connections WHERE user_id = ? AND channel_id IN (SELECT id FROM channels WHERE server_id = ?)',
        p.userId, p.serverId,
      );
      run('DELETE FROM memberships WHERE server_id = ? AND user_id = ?', p.serverId, p.userId);
    });
  },

  reportUser(me, p) {
    const reason = text(p.reason, 3, 300, 'Motif : entre 3 et 300 caractères.');
    if (p.targetId === me.id) fail('Vous ne pouvez pas vous signaler vous-même.');
    if (!one('SELECT 1 FROM users WHERE id = ?', p.targetId)) fail('Utilisateur introuvable.', 404);
    run(
      'INSERT INTO reports (id, reporter_id, target_user_id, reason, created_at, server_id) VALUES (?, ?, ?, ?, ?, ?)',
      newId('rp'), me.id, p.targetId, reason, now(), p.serverId ?? null,
    );
  },

  // ----- Administration (réservée à is_admin = 1) -----
  adminListUsers(me) {
    requireAdmin(me);
    return all('SELECT id, pseudo, tag, email, is_plus, is_admin, created_at, last_activity, status FROM users ORDER BY created_at DESC');
  },

  // Retirer PLUS : pseudo et bannière de profil remis en base, puis GIF (photo, bannières) retirés.
  adminSetPlus(me, p) {
    requireAdmin(me);
    if (p.value) {
      run('UPDATE users SET is_plus = 1 WHERE id = ?', p.userId);
      return;
    }
    run("UPDATE users SET is_plus = 0, banner_type = 'gradient', banner_value = '0', name_color = '' WHERE id = ?", p.userId);
    purgeGifs(p.userId);
  },

  adminDeleteUser(me, p) {
    requireAdmin(me);
    if (p.userId === me.id) fail('Vous ne pouvez pas supprimer votre propre compte ici.');
    run('DELETE FROM users WHERE id = ?', p.userId);
  },

  adminListServers(me) {
    requireAdmin(me);
    return all(
      `SELECT s.id, s.name, s.icon, s.is_public, s.invite_code, s.created_at, u.pseudo AS owner_pseudo, u.tag AS owner_tag,
         (SELECT COUNT(*) FROM memberships m WHERE m.server_id = s.id) AS members
       FROM servers s JOIN users u ON u.id = s.owner_id ORDER BY s.created_at DESC`,
    );
  },

  adminDeleteServer(me, p) {
    requireAdmin(me);
    run('DELETE FROM servers WHERE id = ?', p.serverId);
  },

  adminListReports(me) {
    requireAdmin(me);
    return all(
      `SELECT r.id, r.reason, r.created_at, r.server_id,
         ru.pseudo AS reporter_pseudo, ru.tag AS reporter_tag,
         tu.id AS target_id, tu.pseudo AS target_pseudo, tu.tag AS target_tag,
         s.name AS server_name
       FROM reports r
       LEFT JOIN users ru ON ru.id = r.reporter_id
       LEFT JOIN users tu ON tu.id = r.target_user_id
       LEFT JOIN servers s ON s.id = r.server_id
       ORDER BY r.created_at DESC LIMIT 200`,
    );
  },

  adminStats(me) {
    requireAdmin(me);
    const count = (sql, ...args) => one(sql, ...args).n;
    return {
      users: count('SELECT COUNT(*) AS n FROM users'),
      online: count("SELECT COUNT(*) AS n FROM users WHERE last_activity > ? AND status <> 'offline'", Date.now() - 60_000),
      plus: count('SELECT COUNT(*) AS n FROM users WHERE is_plus = 1'),
      admins: count('SELECT COUNT(*) AS n FROM users WHERE is_admin = 1'),
      servers: count('SELECT COUNT(*) AS n FROM servers'),
      publicServers: count('SELECT COUNT(*) AS n FROM servers WHERE is_public = 1'),
      messages: count('SELECT COUNT(*) AS n FROM messages'),
      privateMessages: count('SELECT COUNT(*) AS n FROM dms'),
      reports: count('SELECT COUNT(*) AS n FROM reports'),
      inVoice: count('SELECT COUNT(*) AS n FROM voice_connections'),
    };
  },

  adminSetAdmin(me, p) {
    requireAdmin(me);
    if (p.userId === me.id && !p.value) fail('Vous ne pouvez pas retirer vos propres droits ici.');
    run('UPDATE users SET is_admin = ? WHERE id = ?', p.value ? 1 : 0, String(p.userId ?? ''));
  },

  adminSetServerVisibility(me, p) {
    requireAdmin(me);
    run('UPDATE servers SET is_public = ? WHERE id = ?', p.isPublic ? 1 : 0, String(p.serverId ?? ''));
  },

  // Le propriétaire choisit si son espace est public (visible dans la Communauté) ou privé.
  setServerVisibility(me, p) {
    requireOwner(p.serverId, me);
    run('UPDATE servers SET is_public = ? WHERE id = ?', p.isPublic ? 1 : 0, String(p.serverId ?? ''));
  },

  // Changer le mot de passe d'un membre (administration uniquement).
  adminSetPassword(me, p) {
    requireAdmin(me);
    const next = String(p.newPassword ?? '');
    if (next.length < 8 || next.length > 200) fail('Le mot de passe doit faire entre 8 et 200 caractères.');
    const target = one('SELECT id FROM users WHERE id = ?', String(p.userId ?? ''));
    if (!target) fail('Membre introuvable.', 404);
    run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), target.id);
  },

  adminDismissReport(me, p) {
    requireAdmin(me);
    run('DELETE FROM reports WHERE id = ?', p.reportId);
  },
};

export function runAction(name, me, payload) {
  const handler = handlers[name];
  if (!handler) fail('Action inconnue.', 404);
  return handler(me, payload ?? {});
}

// Authentification (hors session).
// Tag choisi à la création (4 chiffres) : libre si aucun compte n'a déjà ce pseudo#tag. Sinon, tag aléatoire libre.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cleanEmail = (value) => {
  const e = String(value ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(e) || e.length > 120) fail('Adresse e-mail invalide.');
  return e;
};
const emailTaken = (email, exceptId = '') => one('SELECT 1 FROM users WHERE email = ? COLLATE NOCASE AND id <> ?', email, exceptId);

export async function register({ pseudo, password, tag: wanted, email: rawEmail }) {
  const name = text(pseudo, 2, 24, 'Le pseudo doit faire entre 2 et 24 caractères.');
  const email = cleanEmail(rawEmail);
  if (emailTaken(email)) fail('Cette adresse e-mail est déjà utilisée.', 409);
  if (typeof password !== 'string' || password.length < 8 || password.length > 200) {
    fail('Le mot de passe doit faire entre 8 et 200 caractères.');
  }
  const chosen = String(wanted ?? '').trim();
  if (chosen && !/^\d{4}$/.test(chosen)) fail('Le tag doit contenir exactement 4 chiffres.');
  const confirm = CONFIRM_EMAIL && mailConfigured();
  const id = transaction(() => {
    let tag = null;
    if (chosen) {
      if (one('SELECT 1 FROM users WHERE pseudo = ? COLLATE NOCASE AND tag = ?', name, chosen)) {
        fail(`${name}#${chosen} existe déjà. Choisissez un autre tag.`, 409);
      }
      tag = chosen;
    }
    for (let i = 0; i < 50 && !tag; i += 1) {
      const candidate = String(1000 + Math.floor(Math.random() * 9000));
      if (!one('SELECT 1 FROM users WHERE pseudo = ? COLLATE NOCASE AND tag = ?', name, candidate)) tag = candidate;
    }
    if (!tag) fail('Pseudo saturé, choisissez-en un autre.', 409);
    const newId_ = newId('u');
    run(
      'INSERT INTO users (id, pseudo, tag, password_hash, banner_type, banner_value, last_activity, created_at, email, email_verified) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      newId_, name, tag, hashPassword(password), 'gradient', '0', 0, now(), email, confirm ? 0 : 1,
    );
    return newId_;
  });
  if (confirm) {
    await sendVerification(id, email);
    return { pending: true };
  }
  return { token: createSession(id), user: publicUser(one('SELECT * FROM users WHERE id = ?', id)) };
}

export function login({ fullName, password }) {
  const raw = String(fullName ?? '').trim();
  let user;
  if (raw.includes('@')) {
    // Connexion par e-mail.
    user = one('SELECT * FROM users WHERE email = ? COLLATE NOCASE', raw.toLowerCase());
  } else {
    const [pseudo = '', tag = ''] = raw.split('#').map((x) => x.trim());
    // Le tag est obligatoire : Pseudo#1234.
    if (!tag) fail('Saisissez votre pseudo avec son tag (Pseudo#1234) ou votre adresse e-mail.', 400);
    user = one('SELECT * FROM users WHERE pseudo = ? COLLATE NOCASE AND tag = ?', pseudo, tag);
  }
  if (!user || typeof password !== 'string' || !verifyPassword(password, user.password_hash)) {
    fail('Identifiant ou mot de passe incorrect.', 401);
  }
  if (user.email_verified === 0) fail('Confirmez votre adresse e-mail avant de vous connecter (lien reçu par mail).', 403);
  return { token: createSession(user.id), user: publicUser(user) };
}

// Confirmation d'adresse par le lien reçu par e-mail.
export function verifyEmailToken(token) {
  const row = consumeToken(token, 'verify');
  if (!row) return false;
  run('UPDATE users SET email_verified = 1 WHERE id = ?', row.user_id);
  return true;
}

// Changer de mot de passe : l'ancien est exigé.
export function changePassword(me, p) {
  if (!verifyPassword(String(p.oldPassword ?? ''), me.password_hash)) fail('Ancien mot de passe incorrect.', 401);
  const next = String(p.newPassword ?? '');
  if (next.length < 8 || next.length > 200) fail('Le nouveau mot de passe doit faire entre 8 et 200 caractères.');
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(next), me.id);
}

// Changer d'adresse e-mail : mot de passe exigé, puis nouvelle confirmation.
export async function changeEmail(me, p) {
  if (!verifyPassword(String(p.password ?? ''), me.password_hash)) fail('Mot de passe incorrect.', 401);
  const email = cleanEmail(p.email);
  if (emailTaken(email, me.id)) fail('Cette adresse e-mail est déjà utilisée.', 409);
  const confirm = CONFIRM_EMAIL && mailConfigured();
  run('UPDATE users SET email = ?, email_verified = ? WHERE id = ?', email, confirm ? 0 : 1, me.id);
  if (confirm) await sendVerification(me.id, email);
}

export function logout(token) {
  deleteSession(token);
}
