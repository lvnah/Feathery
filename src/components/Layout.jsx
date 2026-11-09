import { useState } from 'react';
import { getMe, logout, messagesBadge, unreadCount, setStatus } from '../lib/store';
import { STATUS_LABEL, statusLabel, statusColor, nameStyle } from '../lib/util';
import { run } from '../views/ServerView';
import { useStore, useUI, Avatar, CountBadge, Icon } from './ui';
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
  const { go, openMenu, toast } = useUI();
  const me = getMe(s);
  const [drawer, setDrawer] = useState(false);
  const nav = NAV;

  const navigate = (v) => {
    go(v);
    setDrawer(false);
  };
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

        <div className="flex-1" />

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
