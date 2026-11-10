// Store client : état issu de GET /api/sync (rafraîchi toutes les 2 s), actions = POST /api/actions/:name.
// Le serveur reste l'autorité : les règles sont appliquées côté API (server/actions.js).
import { api, getToken, setToken } from './api';

let state = null;
let lastJson = null;
let version = 0; // dernière version reçue du serveur : rien n'est re-téléchargé si elle n'a pas changé
let actionGen = 0; // incrémenté à chaque action (locale ou serveur) : invalide les synchronisations en cours
const listeners = new Set();

export function getState() {
  return state;
}

export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(next, json) {
  state = next;
  lastJson = json;
  if (!next) version = 0;
  listeners.forEach((l) => l());
}

// Relit l'état depuis l'API ; ne notifie que si quelque chose a changé.
export async function refresh() {
  if (!getToken()) {
    if (state) emit(null, null);
    return;
  }
  const gen = actionGen; // une réponse qui part avant une action ne doit pas écraser l'état de cette action
  try {
    const snap = await api(`/api/sync?v=${version}`);
    if (gen !== actionGen) return;
    if (snap.unchanged) return;
    version = snap.v;
    emit({ ...snap, session: { user_id: snap.me.id } }, null);
  } catch (err) {
    if (err.status === 401) {
      setToken(null);
      emit(null, null);
    }
  }
}

// Action serveur. La réponse n'attend pas la resynchronisation : l'interface se met à jour
// dès que le serveur a répondu, et la synchronisation se fait en arrière-plan.
async function act(name, payload = {}) {
  let res;
  try {
    res = await api(`/api/actions/${name}`, { method: 'POST', body: payload });
  } catch (err) {
    actionGen++;
    refresh(); // en cas d'échec, on remet l'état réel à jour (annule les mises à jour optimistes)
    throw err;
  }
  actionGen++;
  refresh();
  return res.result;
}
// Mise à jour locale immédiate (optimiste) ; la prochaine synchronisation la remplace par l'état serveur.
const patchLocal = (fn) => {
  actionGen++;
  if (state) emit(fn(state), null);
};
// Espace vocal du membre connecté : { serverId, channelName, muted } ou null.
export const myVoice = (s) => {
  const me = s && getMe(s);
  const v = me && s.voice.find((x) => x.user_id === me.id);
  if (!v) return null;
  const c = s.channels.find((x) => x.id === v.channel_id);
  return c ? { serverId: c.server_id, channelName: c.name, muted: !!v.muted } : null;
};
export const searchUsers = (q) => api(`/api/users/search?q=${encodeURIComponent(q)}`).then((r) => r.users);

// ---------- Authentification ----------

// Inscription : sans confirmation par mail, on est connecté tout de suite ; sinon le compte attend la confirmation.
export async function register(pseudo, password, tag = '', email = '') {
  const res = await api('/api/auth/register', { method: 'POST', body: { pseudo, password, tag, email }, auth: false });
  if (res.token) {
    setToken(res.token);
    await refresh();
  }
  return res;
}

export async function login(fullName, password) {
  const res = await api('/api/auth/login', { method: 'POST', body: { fullName, password }, auth: false });
  setToken(res.token);
  await refresh();
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* session déjà expirée */
  }
  setToken(null);
  emit(null, null);
}

// ---------- Sélecteurs purs ----------

export const getMe = (s) => s.users.find((u) => u.id === s.session.user_id) || null;
export const getUser = (s, id) => s.users.find((u) => u.id === id) || null;
export const membership = (s, serverId, userId) =>
  s.memberships.find((m) => m.server_id === serverId && m.user_id === userId) || null;
export const isMember = (s, serverId, userId) => !!membership(s, serverId, userId);
export const serversOf = (s, userId) => s.servers.filter((srv) => isMember(s, srv.id, userId));
export const membersOf = (s, serverId) =>
  s.memberships.filter((m) => m.server_id === serverId).map((m) => getUser(s, m.user_id)).filter(Boolean);
export const rolesOf = (s, serverId) => s.roles.filter((r) => r.server_id === serverId);

export function friendshipBetween(s, a, b) {
  return s.friendships.find((f) => (f.from === a && f.to === b) || (f.from === b && f.to === a)) || null;
}
export const isFriend = (s, a, b) => friendshipBetween(s, a, b)?.status === 'accepted';
export const friendsOf = (s, userId) =>
  s.friendships
    .filter((f) => f.status === 'accepted' && (f.from === userId || f.to === userId))
    .map((f) => getUser(s, f.from === userId ? f.to : f.from))
    .filter(Boolean);
export const pendingReceived = (s, userId) => s.friendships.filter((f) => f.status === 'pending' && f.to === userId);
export const pendingSent = (s, userId) => s.friendships.filter((f) => f.status === 'pending' && f.from === userId);

export function canManageChannels(s, serverId, userId) {
  const srv = s.servers.find((x) => x.id === serverId);
  if (!srv) return false;
  if (srv.owner_id === userId) return true;
  const m = membership(s, serverId, userId);
  if (!m) return false;
  return s.roles.some((r) => r.server_id === serverId && m.role_ids.includes(r.id) && r.can_manage_channels);
}

// Couleur et nom viennent uniquement des rôles créés : le propriétaire n'a pas de rôle par défaut.
export function roleColorOf(s, serverId, userId) {
  const m = membership(s, serverId, userId);
  if (!m) return null;
  return rolesOf(s, serverId).find((r) => m.role_ids.includes(r.id))?.color ?? null;
}

export function roleOf(s, serverId, userId) {
  const m = membership(s, serverId, userId);
  return rolesOf(s, serverId).find((r) => m?.role_ids.includes(r.id)) || null;
}

export function roleNameOf(s, serverId, userId) {
  return roleOf(s, serverId, userId)?.name ?? null;
}

export function roleRank(s, serverId, userId) {
  const m = membership(s, serverId, userId);
  const idx = rolesOf(s, serverId).findIndex((r) => m?.role_ids.includes(r.id));
  return idx === -1 ? Number.MAX_SAFE_INTEGER : idx;
}

export function hasDmHistory(s, a, b) {
  return s.dms.some((d) => (d.from === a && d.to === b) || (d.from === b && d.to === a));
}

// ---------- Actions (aliases vers l'API) ----------

export const updateProfile = (patch) => act('updateProfile', patch);
export const sendFriendRequest = (targetId) => act('sendFriendRequest', { targetId });
export const sendFriendRequestByTag = (query) => act('sendFriendRequest', { query });
export const respondFriendRequest = (id, accept) => act('respondFriendRequest', { id, accept });
export const removeFriend = (userId) => act('removeFriend', { userId });
export const sendDM = (toId, content, image = '') => act('sendDM', { toId, content, image });
export const acceptDM = (peerId) => act('acceptDM', { peerId });
export const refuseDM = (peerId) => act('refuseDM', { peerId });
export const markDmRead = (peerId) => act('markDmRead', { peerId });
export const markChannelRead = (channelId) => act('markChannelRead', { channelId });

// Compteurs de non-lus (renvoyés par le serveur).
export const unreadCount = (s) => s.unread ?? { dms: {}, requests: [], friendRequests: 0, channels: {} };
export const serverUnread = (s, serverId) =>
  s.channels.filter((c) => c.server_id === serverId).reduce((sum, c) => sum + (unreadCount(s).channels[c.id] || 0), 0);
export const messagesBadge = (s) => {
  const u = unreadCount(s);
  return Object.values(u.dms).reduce((a, b) => a + b, 0) + u.requests.length;
};
export const createServer = (payload) => act('createServer', payload);
export const setStatus = (status) => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, users: s.users.map((u) => (u.id === me.id ? { ...u, status } : u)) }));
  return act('setStatus', { status });
};
export const deleteDM = (messageId) => {
  const msg = state?.dms.find((d) => d.id === messageId);
  patchLocal((s) => ({
    ...s,
    dms: s.dms.filter((d) => d.id !== messageId && !(msg && msg.status === 'request' && d.status === 'request' && d.from === msg.from && d.to === msg.to)),
  }));
  return act('deleteDM', { messageId });
};
export const hideConversation = (peerId) => {
  patchLocal((s) => ({
    ...s,
    dms: s.dms.filter((d) => d.from !== peerId && d.to !== peerId),
    hiddenDmPeers: [...new Set([...(s.hiddenDmPeers || []), peerId])],
  }));
  return act('hideConversation', { peerId });
};
export const setVoiceMutedRemote = (muted) => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, voice: s.voice.map((v) => (v.user_id === me.id ? { ...v, muted } : v)) }));
  return act('setVoiceMuted', { muted });
};
export const leaveServer = (serverId) => act('leaveServer', { serverId });
export const joinPublicServer = (serverId) => act('joinPublicServer', { serverId });
export const joinServer = (code) => act('joinServer', { code });
export const regenerateInvite = (serverId) => act('regenerateInvite', { serverId });
export const createChannel = (serverId, name, type) => act('createChannel', { serverId, name, type });
export const deleteChannel = (channelId) => act('deleteChannel', { channelId });
export const sendMessage = (channelId, content, image = '') => {
  const me = state && getMe(state);
  const tmpId = `tmp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  if (me) {
    patchLocal((s) => ({
      ...s,
      messages: [...s.messages, { id: tmpId, channel_id: channelId, user_id: me.id, content, image, created_at: Date.now(), pending: true }],
    }));
  }
  return act('sendMessage', { channelId, content, image }).catch((err) => {
    patchLocal((s) => ({ ...s, messages: s.messages.filter((m) => m.id !== tmpId) }));
    throw err;
  });
};
export const joinVoice = (channelId) => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, voice: [...s.voice.filter((v) => v.user_id !== me.id), { user_id: me.id, channel_id: channelId, muted: false }] }));
  return act('joinVoice', { channelId });
};
export const leaveVoice = () => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, voice: s.voice.filter((v) => v.user_id !== me.id) }));
  return act('leaveVoice');
};
// Appel privé : même salon « call:… » que sur le serveur (identifiants triés).
export const callRoom = (a, b) => `call:${[a, b].sort().join('|')}`;
export const joinCall = (peerId) => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, voice: [...s.voice.filter((v) => v.user_id !== me.id), { user_id: me.id, channel_id: callRoom(me.id, peerId), muted: false }] }));
  return act('joinCall', { peerId });
};
export const leaveCall = () => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, voice: s.voice.filter((v) => !(v.user_id === me.id || v.channel_id.startsWith('call:') && v.channel_id.split('|').includes(me.id))) }));
  return act('leaveCall');
};
export const declineCall = (peerId) => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, voice: s.voice.filter((v) => v.channel_id !== callRoom(me.id, peerId)) }));
  return act('declineCall', { peerId });
};
// Appel privé en cours ou entrant : { room, partnerId, state: 'outgoing' | 'incoming' | 'active' } ou null.
export const callOf = (s) => {
  const me = s && getMe(s);
  if (!me) return null;
  const mine = s.voice.find((v) => v.user_id === me.id);
  if (mine?.channel_id?.startsWith('call:')) {
    const partnerId = mine.channel_id.slice(5).split('|').find((id) => id !== me.id);
    const partnerIn = s.voice.some((v) => v.channel_id === mine.channel_id && v.user_id === partnerId);
    return { room: mine.channel_id, partnerId, state: partnerIn ? 'active' : 'outgoing' };
  }
  // Un appel qui me sonne : le salon « call:a|b » contient mon identifiant et je n'y suis pas encore.
  const ringing = s.voice.find((v) => v.channel_id.startsWith('call:') && v.channel_id.slice(5).split('|').includes(me.id) && v.user_id !== me.id);
  return ringing ? { room: ringing.channel_id, partnerId: ringing.user_id, state: 'incoming' } : null;
};
export const createRole = (serverId, role) => act('createRole', { serverId, ...role });
export const kickMember = (serverId, userId) => act('kickMember', { serverId, userId });
// ----- Salons rapides : petit salon privé (vocal et chat), 5 personnes maximum, supprimé quand il est vide. -----
export const quickRoomOf = (s, roomId) => (s?.quickRooms ?? []).find((r) => r.id === roomId) ?? null;
export const createQuickRoom = (name) => act('createQuickRoom', { name });
export const joinQuickRoom = (code) => act('joinQuickRoom', { code });
export const leaveQuickRoom = (roomId) => act('leaveQuickRoom', { roomId });
export const setQuickRoomLock = (roomId, locked) => act('setQuickRoomLock', { roomId, locked });
export const kickQuickMember = (roomId, userId) => act('kickQuickMember', { roomId, userId });
export const sendQuickMessage = (roomId, content) => act('sendQuickMessage', { roomId, content });
export const joinQuickVoice = (roomId) => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, voice: [...s.voice.filter((v) => v.user_id !== me.id), { user_id: me.id, channel_id: `quick:${roomId}`, muted: false }] }));
  return act('joinQuickVoice', { roomId });
};
export const leaveQuickVoice = () => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, voice: s.voice.filter((v) => v.user_id !== me.id) }));
  return act('leaveQuickVoice');
};
export const blockUser = (targetId) => act('blockUser', { targetId });
export const unblockUser = (targetId) => act('unblockUser', { targetId });
export const reportUser = (targetId, reason, serverId = null) => act('reportUser', { targetId, reason, serverId });
export const assignRole = (serverId, userId, roleId) => act('assignRole', { serverId, userId, roleId });
export const updateRole = (serverId, roleId, role) => act('updateRole', { serverId, roleId, ...role });
export const moveRole = (serverId, roleId, direction) => act('moveRole', { serverId, roleId, direction });
export const reorderRoles = (serverId, order) => act('reorderRoles', { serverId, order });
export const updateChannel = (channelId, name) => act('updateChannel', { channelId, name });
export const setChannelReadonly = (channelId, readonly) => act('setChannelReadonly', { channelId, readonly });
export const setServerBanner = (serverId, value) => act('setServerBanner', { serverId, value });
// Réglages : appliqués tout de suite côté interface, puis enregistrés sur le serveur.
export const updateSettings = (patch) => {
  const me = state && getMe(state);
  if (me) patchLocal((s) => ({ ...s, users: s.users.map((u) => (u.id === me.id ? { ...u, settings: { ...(u.settings || {}), ...patch } } : u)) }));
  return act('updateSettings', patch);
};
export const changePassword = (oldPassword, newPassword) => act('changePassword', { oldPassword, newPassword });
export const changeEmail = (password, email) => act('changeEmail', { password, email });
export const deleteRole = (serverId, roleId) => act('deleteRole', { serverId, roleId });
export const deleteMessage = (messageId) => act('deleteMessage', { messageId });
export const updateServerName = (serverId, name) => act('updateServerName', { serverId, name });
export const updateServerIcon = (serverId, icon) => act('updateServerIcon', { serverId, icon });
export const deleteServer = (serverId) => act('deleteServer', { serverId });
export const updateInvite = (serverId, code) => act('updateInvite', { serverId, code });

// Administration
export const adminListUsers = () => act('adminListUsers');
export const adminSetPlus = (userId, value) => act('adminSetPlus', { userId, value });
export const adminDeleteUser = (userId) => act('adminDeleteUser', { userId });
export const adminListServers = () => act('adminListServers');
export const adminDeleteServer = (serverId) => act('adminDeleteServer', { serverId });
export const adminListReports = () => act('adminListReports');
export const adminStats = () => act('adminStats');
export const adminSetAdmin = (userId, value) => act('adminSetAdmin', { userId, value });
export const adminSetServerVisibility = (serverId, isPublic) => act('adminSetServerVisibility', { serverId, isPublic });
export const setServerVisibility = (serverId, isPublic) => act('setServerVisibility', { serverId, isPublic });
export const adminDismissReport = (reportId) => act('adminDismissReport', { reportId });

export const setGames = (games) => act('setGames', { games });
