import { useEffect, useState } from 'react';
import {
  adminDeleteServer, adminDeleteUser, adminDismissReport, adminListReports, adminListServers, adminListUsers,
  adminSetAdmin, adminSetPlus, adminSetServerVisibility, adminStats, getMe,
} from '../lib/store';
import { Avatar, Icon, ServerIcon, useStore, useUI } from '../components/ui';
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

// Panneau d'administration : une page à part, réservée aux comptes administrateurs.
export default function AdminPanel({ onExit }) {
  const s = useStore();
  const { toast } = useUI();
  const me = getMe(s);
  const [section, setSection] = useState('dashboard');
  const [query, setQuery] = useState('');
  const [data, setData] = useState({ stats: null, users: [], servers: [], reports: [] });
  const [pending, setPending] = useState(null);

  // Mise à jour sans vider les listes (pas de clignotement) ; rechargement léger toutes les 10 s.
  const loadAll = async () => {
    try {
      const [stats, users, servers, reports] = await Promise.all([adminStats(), adminListUsers(), adminListServers(), adminListReports()]);
      setData({ stats, users, servers, reports });
    } catch {
      /* hors ligne : on garde les dernières données */
    }
  };
  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 10_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!me?.is_admin) {
    return <div className="flex min-h-dvh items-center justify-center text-sm text-slate-500">Cette page est réservée aux administrateurs.</div>;
  }

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
            className={`flex min-h-[44px] items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-sm font-bold transition ${section === key ? 'bg-brand-100 text-brand-800' : 'text-slate-600 hover:bg-slate-200'}`}
          >
            <Icon name={icon} className="h-5 w-5" />
            {label}
            {key === 'reports' && st.reports > 0 && <span className="ml-auto rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-extrabold text-white">{st.reports}</span>}
          </button>
        ))}
        <button type="button" onClick={onExit} className="btn-ghost mt-auto min-h-[44px]">Retour à l’appli</button>
      </aside>

      <main className="panel thin-scroll flex min-w-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900">{SECTIONS.find((x) => x[0] === section)[1]}</h1>
            <p className="text-sm text-slate-500">Gérez l’ensemble de Feathery.</p>
          </div>
          {section !== 'dashboard' && (
            <input className="field max-w-xs" placeholder="Rechercher…" value={query} onChange={(e) => setQuery(e.target.value)} />
          )}
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
              <div key={u.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-100 bg-surface p-4">
                <Avatar user={u} size="md" showStatus />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold text-slate-900">
                    <span className="truncate">{u.pseudo}</span>
                    <span className="text-sm font-semibold text-slate-400">#{u.tag}</span>
                    <RoleBadge user={u} />
                  </p>
                  <p className="truncate text-xs text-slate-500">{u.email || 'Pas d’adresse e-mail'} · {isOnline(u) ? 'en ligne' : 'hors ligne'}</p>
                </div>
                <button type="button" className="btn-ghost !py-2" onClick={() => act(adminSetPlus(u.id, !u.is_plus), u.is_plus ? 'PLUS retiré' : 'PLUS accordé')}>
                  {u.is_plus ? 'Retirer PLUS' : 'Donner PLUS'}
                </button>
                <button type="button" className="btn-ghost !py-2" disabled={u.id === me.id && u.is_admin} onClick={() => act(adminSetAdmin(u.id, !u.is_admin), u.is_admin ? 'Droits retirés' : 'Administrateur ajouté')}>
                  {u.is_admin ? 'Retirer admin' : 'Rendre admin'}
                </button>
                {u.id !== me.id && (
                  <button type="button" className="btn-danger !py-2" onClick={() => setPending({ title: `Supprimer ${u.pseudo} ?`, message: 'Le compte et ses données seront supprimés définitivement.', label: 'Supprimer le compte', action: () => adminDeleteUser(u.id) })}>
                    Supprimer
                  </button>
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
                <button type="button" className="btn-ghost !py-2" onClick={() => act(adminSetServerVisibility(srv.id, !srv.is_public), srv.is_public ? 'Espace rendu privé' : 'Espace rendu public')}>
                  {srv.is_public ? 'Rendre privé' : 'Rendre public'}
                </button>
                <button type="button" className="btn-danger !py-2" onClick={() => setPending({ title: `Supprimer « ${srv.name} » ?`, message: 'Salons, messages et rôles seront supprimés définitivement.', label: 'Supprimer l’espace', action: () => adminDeleteServer(srv.id) })}>
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
                <button type="button" className="btn-ghost !py-2" onClick={() => act(adminDismissReport(r.id), 'Signalement traité')}>Classer</button>
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
