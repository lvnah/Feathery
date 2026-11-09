import { useEffect, useState } from 'react';
import { adminCall, adminLogin, adminSessionOk, setAdminToken } from '../lib/admin';
import { Avatar, ErrorLine, Icon, ServerIcon, useUI } from '../components/ui';
import { RoleBadge } from '../components/PlusBadge';
import ConfirmDialog from '../components/ConfirmDialog';
import { run } from './ServerView';
import { isOnline } from '../lib/util';

const SECTIONS = [
  ['dashboard', 'Tableau de bord', 'home'],
  ['users', 'Membres', 'users'],
  ['servers', 'Espaces', 'hash'],
  ['reports', 'Signalements', 'flag'],
];

// Connexion au panneau : identifiant admin et mot de passe du serveur.
function AdminLogin({ onDone }) {
  const [login, setLogin] = useState('admin');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await adminLogin(login.trim(), password);
      onDone();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <form onSubmit={submit} className="panel flex w-full max-w-sm flex-col gap-4 p-8">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-slate-500">Feathery</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Administration</h1>
        </div>
        <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          Identifiant
          <input className="field normal-case tracking-normal" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
        </label>
        <label className="flex flex-col gap-2 text-xs font-bold uppercase tracking-widest text-slate-500">
          Mot de passe
          <input type="password" className="field normal-case tracking-normal" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        <button type="submit" className="btn-primary" disabled={busy || !password}>Se connecter</button>
        <ErrorLine>{error}</ErrorLine>
      </form>
    </div>
  );
}

// Panneau d'administration : une page à part, indépendante des comptes.
export default function AdminPanel({ onExit }) {
  const { toast } = useUI();
  const [authed, setAuthed] = useState(null);
  const [section, setSection] = useState('dashboard');
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ stats: null, users: [], servers: [], reports: [] });
  const [pending, setPending] = useState(null);
  const [pwd, setPwd] = useState({ id: null, value: '' });

  useEffect(() => { adminSessionOk().then(setAuthed); }, []);

  // Mise à jour sans vider les listes (pas de clignotement).
  const loadAll = async () => {
    try {
      const [stats, users, servers, reports] = await Promise.all([
        adminCall('adminStats'), adminCall('adminListUsers'), adminCall('adminListServers'), adminCall('adminListReports'),
      ]);
      setData({ stats, users, servers, reports });
    } catch (err) {
      if (err.message.includes('expirée')) setAuthed(false);
    }
  };
  useEffect(() => {
    if (!authed) return undefined;
    loadAll();
    const id = setInterval(loadAll, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  if (authed === null) return <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">Chargement…</div>;
  if (!authed) return <AdminLogin onDone={() => setAuthed(true)} />;

  const act = (fn, msg) => run(toast, fn, msg).then((ok) => { if (ok) loadAll(); return ok; });
  const q = query.trim().toLowerCase();
  const users = data.users.filter((u) => `${u.pseudo}#${u.tag} ${u.email || ''}`.toLowerCase().includes(q));
  const servers = data.servers.filter((x) => x.name.toLowerCase().includes(q));
  const reports = data.reports.filter((r) => `${r.reason} ${r.target_pseudo} ${r.reporter_pseudo}`.toLowerCase().includes(q));
  const st = data.stats || {};
  const stat = (label, value) => (
    <div className="flex flex-col gap-1 rounded-3xl border border-slate-100 bg-surface p-5 shadow-soft">
      <span className="text-3xl font-extrabold text-slate-900">{value ?? '—'}</span>
      <span className="text-xs font-bold uppercase tracking-widest text-slate-500">{label}</span>
    </div>
  );

  return (
    <div className="flex h-dvh min-h-0 min-w-0 gap-4 p-4">
      <aside className="panel flex w-64 shrink-0 flex-col gap-2 p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="text-lg font-extrabold text-slate-900">Administration</span>
          <span className="h-2 w-2 rounded-full bg-red-500" />
        </div>
        {SECTIONS.map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSection(key)}
            className={`flex min-h-[44px] items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-bold transition ${section === key ? 'bg-slate-200 text-slate-900' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Icon name={icon} className="h-5 w-5" />
            {label}
            {key === 'reports' && st.reports > 0 && <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-extrabold text-white">{st.reports}</span>}
          </button>
        ))}
        <div className="mt-auto flex flex-col gap-2">
          <button type="button" onClick={onExit} className="btn-ghost min-h-[44px]">Retour à l’appli</button>
          <button type="button" onClick={() => { setAdminToken(null); setAuthed(false); }} className="btn-ghost min-h-[44px]">Se déconnecter</button>
        </div>
      </aside>

      <main className="panel thin-scroll flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{SECTIONS.find((x) => x[0] === section)[1]}</h1>
            <p className="text-sm text-slate-500">Gérez l’ensemble de Feathery.</p>
          </div>
          {section !== 'dashboard' && <input className="field max-w-xs" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />}
        </div>

        {section === 'dashboard' && (
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            {stat('Membres inscrits', st.users)}
            {stat('En ligne', st.online)}
            {stat('Membres PLUS', st.plus)}
            {stat('Administrateurs', st.admins)}
            {stat('Espaces', st.servers)}
            {stat('Espaces publics', st.publicServers)}
            {stat('Messages de salon', st.messages)}
            {stat('Messages privés', st.privateMessages)}
            {stat('Signalements', st.reports)}
            {stat('Dans un vocal', st.inVoice)}
          </div>
        )}

        {section === 'users' && (
          <div className="flex flex-col gap-3">
            {users.map((u) => (
              <div key={u.id} className="flex flex-col gap-3 rounded-2xl border border-slate-100 bg-surface p-4">
                <div className="flex flex-wrap items-center gap-3">
                  <Avatar user={u} size="md" showStatus />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-2 font-bold text-slate-900">
                      <span className="truncate">{u.pseudo}</span>
                      <span className="text-sm font-semibold text-slate-400">#{u.tag}</span>
                      <RoleBadge user={u} />
                    </p>
                    <p className="truncate text-xs text-slate-500">{u.email || 'Pas d’adresse e-mail'} · {isOnline(u) ? 'en ligne' : 'hors ligne'}</p>
                  </div>
                  <button type="button" className="btn-ghost !py-2" onClick={() => act(() => adminCall('adminSetPlus', { userId: u.id, value: !u.is_plus }), u.is_plus ? 'PLUS retiré' : 'PLUS accordé')}>
                    {u.is_plus ? 'Retirer PLUS' : 'Donner PLUS'}
                  </button>
                  <button type="button" className="btn-ghost !py-2" onClick={() => act(() => adminCall('adminSetAdmin', { userId: u.id, value: !u.is_admin }), u.is_admin ? 'Droits retirés' : 'Administrateur ajouté')}>
                    {u.is_admin ? 'Retirer admin' : 'Rendre admin'}
                  </button>
                  <button type="button" className="btn-ghost !py-2" onClick={() => setPwd({ id: pwd.id === u.id ? null : u.id, value: '' })}>Mot de passe</button>
                  <button type="button" className="btn-danger !py-2" onClick={() => setPending({ title: `Supprimer ${u.pseudo} ?`, message: 'Le compte et ses données seront supprimés définitivement.', label: 'Supprimer le compte', action: () => adminCall('adminDeleteUser', { userId: u.id }) })}>
                    Supprimer
                  </button>
                </div>
                {pwd.id === u.id && (
                  <form
                    className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-3"
                    onSubmit={(e) => { e.preventDefault(); act(() => adminCall('adminSetPassword', { userId: u.id, newPassword: pwd.value }), 'Mot de passe modifié').then((ok) => ok && setPwd({ id: null, value: '' })); }}
                  >
                    <input type="password" className="field max-w-xs" placeholder="Nouveau mot de passe (8 caractères minimum)" value={pwd.value} onChange={(e) => setPwd({ id: u.id, value: e.target.value })} autoComplete="new-password" />
                    <button type="submit" className="btn-primary !py-2" disabled={pwd.value.length < 8}>Enregistrer</button>
                  </form>
                )}
              </div>
            ))}
            {users.length === 0 && <p className="text-sm text-slate-500">Aucun membre ne correspond.</p>}
          </div>
        )}

        {section === 'servers' && (
          <div className="flex flex-col gap-3">
            {servers.map((srv) => (
              <div key={srv.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-surface p-4">
                <ServerIcon server={srv} className="h-12 w-12 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold text-slate-900">{srv.name}</p>
                  <p className="truncate text-xs text-slate-500">par {srv.owner_pseudo}#{srv.owner_tag} · {srv.members} membre(s)</p>
                </div>
                <button type="button" className="btn-ghost !py-2" onClick={() => act(() => adminCall('adminSetServerVisibility', { serverId: srv.id, isPublic: !srv.is_public }), srv.is_public ? 'Espace rendu privé' : 'Espace rendu public')}>
                  {srv.is_public ? 'Rendre privé' : 'Rendre public'}
                </button>
                <button type="button" className="btn-danger !py-2" onClick={() => setPending({ title: `Supprimer « ${srv.name} » ?`, message: 'Salons, messages et rôles seront supprimés définitivement.', label: 'Supprimer l’espace', action: () => adminCall('adminDeleteServer', { serverId: srv.id }) })}>
                  Supprimer
                </button>
              </div>
            ))}
            {servers.length === 0 && <p className="text-sm text-slate-500">Aucun espace ne correspond.</p>}
          </div>
        )}

        {section === 'reports' && (
          <div className="flex flex-col gap-3">
            {reports.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-surface p-4">
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-slate-900">{r.target_pseudo ? `${r.target_pseudo}#${r.target_tag}` : 'Compte supprimé'}</p>
                  <p className="text-sm text-slate-600">{r.reason}</p>
                  <p className="text-xs text-slate-500">Signalé par {r.reporter_pseudo || 'un compte supprimé'}{r.server_name ? ` · espace ${r.server_name}` : ''}</p>
                </div>
                <button type="button" className="btn-ghost !py-2" onClick={() => act(() => adminCall('adminDismissReport', { reportId: r.id }), 'Signalement traité')}>Classer</button>
              </div>
            ))}
            {reports.length === 0 && <p className="text-sm text-slate-500">Aucun signalement en attente.</p>}
          </div>
        )}
      </main>

      <ConfirmDialog pending={pending} onClose={() => setPending(null)} toast={toast} />
    </div>
  );
}
