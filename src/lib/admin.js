// Panneau d'administration : session séparée des comptes (jeton propre, stocké sur cet appareil).
const KEY = 'hevenly:admin';
export const getAdminToken = () => {
  try { return localStorage.getItem(KEY); } catch { return null; }
};
export const setAdminToken = (token) => {
  try {
    if (token) localStorage.setItem(KEY, token);
    else localStorage.removeItem(KEY);
  } catch { /* navigation privée */ }
};
export async function adminLogin(login, password) {
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ login, password }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Connexion refusée.');
  setAdminToken(data.token);
}
export async function adminSessionOk() {
  const token = getAdminToken();
  if (!token) return false;
  const res = await fetch('/api/admin/session', { headers: { 'X-Admin-Token': token } });
  if (!res.ok) setAdminToken(null);
  return res.ok;
}
export async function adminCall(name, payload = {}) {
  const res = await fetch(`/api/admin/action/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Admin-Token': getAdminToken() || '' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    setAdminToken(null);
    throw new Error('Session expirée, reconnectez-vous.');
  }
  if (!res.ok) throw new Error(data.error || 'Action impossible.');
  return data.result;
}
