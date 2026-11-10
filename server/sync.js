// Construit l'instantané de données visibles par un utilisateur (appelé par GET /api/sync).
import { db } from './db.js';

// Fenêtre de présence : un membre est « en ligne » si son heartbeat est plus récent que ce délai.
// Un onglet réduit est ralenti par le navigateur : on reste « en ligne » tant qu'on n'est pas vraiment parti.
export const ONLINE_WINDOW_MS = 60_000;
// Absent après 15 minutes sans saisie (le statut « en game » ou « hors ligne » reste tel quel).
export const AWAY_AFTER_MS = 15 * 60_000;
export function effectiveStatus(u) {
  const raw = u.status ?? 'online';
  return raw === 'online' && Date.now() - (u.last_input || 0) > AWAY_AFTER_MS ? 'away' : raw;
}

const all = (sql, ...p) => db.prepare(sql).all(...p);
const marks = (ids) => ids.map(() => '?').join(',') || 'NULL';
// Adresses /api/img/… qui désignent un GIF animé (pour afficher le repère GIF dans le chat).
const gifUrls = (urls) => {
  const ids = [...new Set(urls.filter((u) => u && u.startsWith('/api/img/')).map((u) => u.slice(9)))];
  if (!ids.length) return new Set();
  return new Set(all(`SELECT id FROM images WHERE mime = 'image/gif' AND id IN (${marks(ids)})`, ...ids).map((r) => `/api/img/${r.id}`));
};

export function publicUser(u) {
  return {
    id: u.id,
    pseudo: u.pseudo,
    tag: u.tag,
    avatar: u.avatar,
    bio: u.bio,
    is_plus: u.is_plus,
    is_admin: u.is_admin ?? 0,
    country: u.country ?? '',
    name_color: u.name_color ?? '',
    custom_status: u.custom_status ?? '',
    status: effectiveStatus(u),
    banner:
      u.banner_type === 'preset'
        ? { type: 'preset', key: u.banner_value }
        : u.banner_type === 'image' || u.banner_type === 'url'
        ? { type: 'image', value: u.banner_value }
        : { type: 'gradient', index: Number(u.banner_value) || 0 },
    last_activity: u.last_activity,
    device: u.device || '',
  };
}

export function buildSnapshot(me) {
  // Réglages propres au membre connecté (thème, messages, demandes d'amis).
  const mySettings = { theme: 'dark', dmOpen: !!me.dm_open, acceptFriendRequests: me.accept_friend_requests !== 0, email: me.email || '', emailVerified: me.email_verified !== 0 };
  const servers = all(
    `SELECT s.* FROM servers s JOIN memberships m ON m.server_id = s.id
     WHERE m.user_id = ? ORDER BY s.created_at`,
    me.id,
  );
  const sIds = servers.map((s) => s.id);
  const memberships = sIds.length
    ? all(`SELECT * FROM memberships WHERE server_id IN (${marks(sIds)})`, ...sIds)
    : [];
  const memberRoles = sIds.length
    ? all(`SELECT * FROM member_roles WHERE server_id IN (${marks(sIds)})`, ...sIds)
    : [];
  const roles = sIds.length
    ? all(`SELECT * FROM roles WHERE server_id IN (${marks(sIds)}) ORDER BY position, created_at, id`, ...sIds)
    : [];
  const channels = sIds.length
    ? all(`SELECT * FROM channels WHERE server_id IN (${marks(sIds)}) ORDER BY created_at, id`, ...sIds)
    : [];
  const cIds = channels.map((c) => c.id);
  // 100 derniers messages par salon.
  const messages = cIds.length
    ? all(
        `SELECT id, channel_id, user_id, content, image, created_at FROM (
           SELECT *, ROW_NUMBER() OVER (PARTITION BY channel_id ORDER BY created_at DESC) AS rn
           FROM messages WHERE channel_id IN (${marks(cIds)})
         ) WHERE rn <= 100 ORDER BY created_at`,
        ...cIds,
      )
    : [];
  const friendships = all('SELECT * FROM friendships WHERE from_id = ? OR to_id = ?', me.id, me.id);
  const allDms = all(
    'SELECT * FROM dms WHERE from_id = ? OR to_id = ? ORDER BY created_at DESC LIMIT 2000',
    me.id,
    me.id,
  ).reverse();
  // Conversations masquées par ce membre : seuls les messages postérieurs au masquage restent visibles.
  const hiddenSince = new Map(all('SELECT peer_id, since FROM dm_hidden WHERE user_id = ?', me.id).map((r) => [r.peer_id, r.since]));
  const dms = allDms.filter((d) => {
    const peer = d.from_id === me.id ? d.to_id : d.from_id;
    const since = hiddenSince.get(peer);
    return since === undefined || d.created_at > since;
  });
  const voice = cIds.length
    ? all(`SELECT * FROM voice_connections WHERE channel_id IN (${marks(cIds)})`, ...cIds)
    : [];
  // Appels privés : je vois les participants de mon appel en cours (ou d'un appel qui me sonne).
  // Un appel me concerne si mon identifiant est l'un des deux de son salon « call:a|b » (même si je n'ai pas encore rejoint).
  const calls = all(
    "SELECT user_id, room AS channel_id, muted FROM call_connections WHERE room LIKE ? OR room LIKE ?",
    `call:${me.id}|%`, `call:%|${me.id}`,
  );
  voice.push(...calls);

  // Utilisateurs visibles : moi + membres de mes espaces + relations (amis, DM, vocal).
  const ids = new Set([me.id]);
  memberships.forEach((m) => ids.add(m.user_id));
  friendships.forEach((f) => ids.add(f.from_id).add(f.to_id));
  dms.forEach((d) => ids.add(d.from_id).add(d.to_id));
  voice.forEach((v) => ids.add(v.user_id));
  const uIds = [...ids];
  const users = all(`SELECT * FROM users WHERE id IN (${marks(uIds)})`, ...uIds);
  // Espaces d'un membre visibles par ce viewer : seulement les espaces publics ou ceux où je suis aussi.
  const spaceRows = all(
    `SELECT m.user_id, s.id, s.name, s.icon FROM memberships m JOIN servers s ON s.id = m.server_id
     WHERE m.user_id IN (${marks(uIds)}) AND (s.is_public = 1 OR s.id IN (SELECT server_id FROM memberships WHERE user_id = ?))
     ORDER BY s.created_at`,
    ...uIds, me.id,
  );
  const gameRows = all(`SELECT * FROM user_games WHERE user_id IN (${marks(uIds)}) ORDER BY position`, ...uIds);

  // Totaux globaux (agrégés, sans données personnelles) : membres inscrits et connectés.
  const counts = db
    .prepare("SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN last_activity > ? AND status <> 'offline' THEN 1 ELSE 0 END), 0) AS online FROM users")
    .get(Date.now() - ONLINE_WINDOW_MS);

  const communities = all(
    `SELECT s.id, s.name, s.icon, s.banner, s.created_at, u.pseudo AS owner_pseudo, u.tag AS owner_tag,
       (SELECT COUNT(*) FROM memberships m WHERE m.server_id = s.id) AS members
     FROM servers s JOIN users u ON u.id = s.owner_id WHERE s.is_public = 1 ORDER BY s.created_at DESC LIMIT 200`,
  );
  const ids_member = new Set(servers.map((s) => s.id));

  // Compteurs de non-lus : par conversation privée, par salon, et demandes en attente.
  const dmUnread = all(
    `SELECT d.from_id AS peer, COUNT(*) AS n FROM dms d
     LEFT JOIN dm_reads r ON r.user_id = ? AND r.peer_id = d.from_id
     WHERE d.to_id = ? AND d.status = 'ok' AND d.created_at > COALESCE(r.read_at, 0)
     GROUP BY d.from_id`,
    me.id, me.id,
  );
  const requests = all(
    "SELECT DISTINCT from_id AS peer FROM dms WHERE to_id = ? AND status = 'request'",
    me.id,
  ).map((r) => r.peer);
  const channelUnread = all(
    `SELECT m.channel_id AS channel, COUNT(*) AS n FROM messages m
     JOIN channels c ON c.id = m.channel_id
     JOIN memberships ms ON ms.server_id = c.server_id AND ms.user_id = ?
     LEFT JOIN channel_reads cr ON cr.user_id = ? AND cr.channel_id = m.channel_id
     WHERE m.user_id <> ? AND m.created_at > COALESCE(cr.read_at, 0)
     GROUP BY m.channel_id`,
    me.id, me.id, me.id,
  );

  return {
    unread: {
      dms: Object.fromEntries(dmUnread.map((r) => [r.peer, r.n])),
      requests,
      friendRequests: friendships.filter((f) => f.status === 'pending' && f.to_id === me.id).length,
      channels: Object.fromEntries(channelUnread.map((r) => [r.channel, r.n])),
    },
    stats: { total: counts.total, online: counts.online },
    me: { ...publicUser(me), settings: mySettings },
    users: users.map((u) => ({ ...publicUser(u), ...(u.id === me.id ? { settings: mySettings } : {}), games: gameRows.filter((g) => g.user_id === u.id).map((g) => ({ game: g.game, rank: g.rank })), spaces: spaceRows.filter((x) => x.user_id === u.id).map((x) => ({ id: x.id, name: x.name, icon: x.icon })) })),
    servers: servers.map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.icon,
      banner: s.banner || '',
      is_public: s.is_public,
      owner_id: s.owner_id,
      invite_code: s.invite_code,
    })),
    memberships: memberships.map((m) => ({
      server_id: m.server_id,
      user_id: m.user_id,
      role_ids: memberRoles
        .filter((r) => r.server_id === m.server_id && r.user_id === m.user_id)
        .map((r) => r.role_id),
    })),
    roles: roles.map((r) => ({ ...r, can_manage_channels: r.can_manage_channels })),
    channels: channels.map((c) => ({ id: c.id, server_id: c.server_id, name: c.name, type: c.type, readonly: !!c.readonly })),
    messages: (() => { const gifs = gifUrls(messages.map((m) => m.image)); return messages.map((m) => ({ ...m, gif: gifs.has(m.image) })); })(),
    friendships: friendships.map((f) => ({ id: f.id, from: f.from_id, to: f.to_id, status: f.status })),
    hiddenDmPeers: [...hiddenSince.keys()],
    dms: (() => { const gifs = gifUrls(dms.map((d) => d.image)); return dms.map((d) => ({ id: d.id, from: d.from_id, to: d.to_id, content: d.content, image: d.image || '', gif: gifs.has(d.image), created_at: d.created_at, status: d.status })); })(),
    // Espaces publics (liste « Communauté ») : sans code d'invitation.
    communities: communities.map((c) => ({ ...c, is_member: ids_member.has(c.id) })),
    voice: voice.map((v) => ({ user_id: v.user_id, channel_id: v.channel_id, muted: !!v.muted })),
  };
}
