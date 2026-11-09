import { useState } from 'react';
import { getMe, serversOf, logout, messagesBadge, serverUnread, unreadCount, leaveServer, setStatus, myVoice } from '../lib/store';
import { STATUS_LABEL, STATUS_DOT, statusKey, statusLabel, statusColor, nameStyle } from '../lib/util';
import { run } from '../views/ServerView';
import { useStore, useUI, Avatar, CountBadge, Icon, ServerIcon } from './ui';
import InstallButton from './InstallButton';
import Logo from './Logo';

const NAV = [
  { key: 'home', label: 'Accueil', icon: 'home', view: { name: 'home' } },
  { key: 'messages', label: 'Message', icon: 'message', view: { name: 'messages' } },
  { key: 'community', label: 'Communauté', icon: 'search', view: { name: 'community' } },
  { key: 'friends', label: 'Ami(s)', icon: 'users', view: { name: 'friends' } },
  { key: 'plus', label: 'PLUS', icon: 'bolt', view: { name: 'plus' } },
  { key: 'settings', label: 'Paramètres', icon: 'settings', view: { name: 'settings' } },
];

// Sidebar flottante (desktop) ou tiroir coulissant (mobile) + zone de contenu.
export default function Layout({ view, children }) {
  const s = useStore();
  const { go, openModal, openMenu, toast } = useUI();
  const me = getMe(s);
  const [drawer, setDrawer] = useState(false);
  const servers = serversOf(s, me.id);
  const nav = NAV;

  const navigate = (v) => {
    go(v);
    setDrawer(false);
  };
  // Clic droit sur un espace : quitter (sauf si l'on en est le propriétaire).
  const leaveMenu = (e, srv) => {
    if (srv.owner_id === me.id) {
      e.preventDefault();
      return;
    }
    openMenu(e, [{
      label: 'Quitter l’espace',
      danger: true,
      onClick: () => {
        if (window.confirm(`Quitter « ${srv.name} » ?`)) run(toast, () => leaveServer(srv.id)).then((ok) => ok && goHome());
      },
    }]);
  };
  const goHome = () => navigate({ name: 'home' });
  const statusMenuItems = ['online', 'game', 'away', 'offline'].map((k) => ({
    label: STATUS_LABEL[k],
    checked: me.status === k,
    onClick: () => run(toast, () => setStatus(k)),
  }));
  const isActive = (item) =>
    view.name === item.key;

  return (
    <div className="flex h-dvh gap-4 p-3 sm:p-4">
      <aside
        className={`panel sidebar-drawer fixed inset-y-4 left-4 z-40 flex w-72 flex-col gap-4 overflow-y-auto p-5 lg:static lg:gap-5 lg:z-auto lg:flex lg:w-64 lg:shrink-0 ${
          drawer ? 'translate-x-0' : '-translate-x-[120%] lg:translate-x-0'
        }`}
      >
        <div className="hidden shrink-0 items-center gap-3 px-2 pt-1 lg:flex">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-surface shadow-soft">
            <LeafLogo />
          </span>
          <span className="text-xl font-extrabold tracking-tight text-slate-900">Feathery</span>
          <span className="h-2 w-2 rounded-full bg-brand-500" />
        </div>

        <p className="px-4 text-[11px] font-bold uppercase tracking-widest text-slate-500">Navigation</p>
        <nav className="flex shrink-0 flex-col gap-1">
          {nav.map((item) => (
            <button
              key={item.key}
              onClick={() => navigate(item.view)}
              className={`flex items-center gap-3 rounded-2xl px-4 py-2.5 text-left text-[15px] font-semibold transition lg:py-3 ${
                isActive(item) ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <Icon name={item.icon} className="h-5 w-5" />
              <span className="flex-1">{item.label}</span>
              <CountBadge n={item.key === 'messages' ? messagesBadge(s) : item.key === 'friends' ? unreadCount(s).friendRequests : 0} />
            </button>
          ))}
        </nav>

        <div className="flex min-h-[10rem] flex-1 flex-col gap-3">
          <div className="flex shrink-0 flex-col gap-2">
            <button onClick={() => { setDrawer(false); openModal('join'); }} className="btn-ghost !py-2.5">
              Rejoindre un espace
            </button>
          </div>
          <div className="thin-scroll flex min-h-0 flex-col gap-1 overflow-y-auto">
            {servers.map((srv) => (
              <button
                key={srv.id}
                onClick={() => navigate({ name: 'server', serverId: srv.id })}
                onContextMenu={(e) => leaveMenu(e, srv)}
                className={`flex items-center gap-3 rounded-2xl border px-2.5 py-2.5 text-left shadow-soft transition ${
                  view.name === 'server' && view.serverId === srv.id ? 'border-brand-300 bg-brand-50' : 'border-slate-100 bg-surface hover:border-brand-200'
                }`}
              >
                <ServerIcon server={srv} className="h-11 w-11 shrink-0" />
                <span className="min-w-0 flex-1 truncate text-[15px] font-bold text-slate-900">{srv.name}</span>
                {myVoice(s)?.serverId === srv.id && (
                  <span title="Vous êtes en vocal ici" className="ml-auto flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-500 text-white">
                    <Icon name={myVoice(s).muted ? 'micOff' : 'mic'} className="h-3.5 w-3.5" />
                  </span>
                )}
                <span className="ml-auto"><CountBadge n={serverUnread(s, srv.id)} /></span>
              </button>
            ))}
            {servers.length === 0 && <p className="px-2 text-xs text-slate-400">Aucun espace pour le moment.</p>}
          </div>
        </div>

        <InstallButton className="mb-3 shrink-0" />
        <div className="flex shrink-0 items-center gap-3 border-t border-slate-100 pt-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {/* Photo : choisir son statut. Nom et statut : ouvrir son profil. */}
            <button type="button" aria-label="Changer mon statut" onClick={(e) => openMenu(e, statusMenuItems)} className="shrink-0 rounded-full">
              <Avatar user={me} size="md" showStatus />
            </button>
            <button type="button" onClick={() => navigate({ name: 'profile', userId: me.id })} className="min-w-0 text-left">
              <span className="block truncate text-sm font-bold text-slate-900" style={nameStyle(me)}>{me.pseudo}</span>
              <span className="block truncate text-xs font-semibold" style={{ color: statusColor(me) }}>{statusLabel(me)}</span>
            </button>
          </div>
          <button
            title="Se déconnecter"
            aria-label="Se déconnecter"
            onClick={async () => {
              await logout();
            }}
            className="rounded-xl p-2 text-slate-400 hover:bg-slate-300 hover:text-slate-700"
          >
            <Icon name="logout" className="h-5 w-5" />
          </button>
        </div>
      </aside>

      {drawer && <div className="mobile-overlay fixed inset-0 z-30 bg-ink/20 lg:hidden" onClick={() => setDrawer(false)} />}

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex items-center gap-3 lg:hidden">
          <button onClick={() => setDrawer(true)} aria-label="Ouvrir le menu" className="panel rounded-2xl px-4 py-3">
            <Icon name="home" className="h-5 w-5" />
          </button>
          <span className="font-bold text-slate-900">Feathery</span>
        </div>
        <main className="flex min-h-0 flex-1 gap-4 overflow-hidden">{children}</main>
      </div>

    </div>
  );
}

export function LeafLogo({ className = 'h-7 w-7' }) {
  return <Logo className={className} />;
}
