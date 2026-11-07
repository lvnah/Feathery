import { createContext, useContext, useEffect, useState, useSyncExternalStore } from 'react';
import { subscribe, getState } from '../lib/store';
import { avatarGradient, bannerStyle, ROLE_COLORS, statusKey, STATUS_DOT, statusLabel, statusColor } from '../lib/util';
import Logo from './Logo';

export const UIContext = createContext(null);
export const useUI = () => useContext(UIContext);

export function useStore() {
  return useSyncExternalStore(subscribe, getState, getState);
}

const ICONS = {
  home: 'M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z',
  message: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-4-1L3 21l2-5a8.4 8.4 0 0 1-2-5.5 8.5 8.5 0 0 1 17 0z',
  users: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  bolt: 'M13 2 3 14h9l-1 8 10-12h-9l1-8z',
  chat: 'M21 11.5a8.4 8.4 0 0 1-9 8.4 8.5 8.5 0 0 1-4-1L3 21l2-5a8.4 8.4 0 0 1-2-5.5 8.5 8.5 0 0 1 17 0z',
  search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM21 21l-4.3-4.3',
  send: 'M22 2 11 13M22 2l-7 20-4-9-9-4z',
  hash: 'M4 9h16M4 15h16M10 3 8 21M16 3l-2 18',
  speaker: 'M11 5 6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7',
  link: 'M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1 1M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1-1',
  x: 'M18 6 6 18M6 6l12 12',
  plus: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
  trash: 'M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6',
  flag: 'M4 22V4M4 4h12l-2 4 2 4H4',
  logout: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9',
  arrow: 'M5 12h14M12 5l7 7-7 7',
  user: 'M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  check: 'M20 6 9 17l-5-5',
  camera: 'M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2zM12 17a4 4 0 1 0 0-8 4 4 0 0 0 0 8z',
  pencil: 'M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z',
  mic: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3zM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8',
  micOff: 'M1 1l22 22M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6M19 10v2a7 7 0 0 1-.11 1.23M5 10v2a7 7 0 0 0 12 5M12 19v4M8 23h8',
};

export function Icon({ name, className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={ICONS[name]} />
    </svg>
  );
}

export function Avatar({ user, size = 'md', showStatus = false, className = '' }) {
  const [broken, setBroken] = useState(false);
  const dims = {
    xs: 'h-6 w-6',
    sm: 'h-9 w-9',
    md: 'h-11 w-11',
    lg: 'h-20 w-20',
    xl: 'h-28 w-28',
  }[size];
  const key = statusKey(user);
  // Pastille sur le bord du cercle, à 45° (bas droite), à la même place sur toutes les tailles.
  const DOT_PX = { xs: 8, sm: 10, md: 12, lg: 16, xl: 20 };
  const dot = { xs: 'h-2 w-2', sm: 'h-2.5 w-2.5', md: 'h-3 w-3', lg: 'h-4 w-4', xl: 'h-5 w-5' }[size];
  const hasPhoto = !!user?.avatar && !broken;
  return (
    <div className={`relative shrink-0 rounded-full ${dims} ${className}`}>
      {hasPhoto ? (
        <img src={user.avatar} alt="" onError={() => setBroken(true)} className="h-full w-full rounded-full object-cover" />
      ) : (
        <span className="flex h-full w-full items-center justify-center rounded-full bg-slate-100">
          <Logo className="h-[62%] w-[62%] object-contain" />
        </span>
      )}
      {showStatus && (
        <span
          style={{ right: `calc(14.6% - ${DOT_PX[size] / 2}px)`, bottom: `calc(14.6% - ${DOT_PX[size] / 2}px)` }}
          className={`absolute ${dot} rounded-full border-2 border-surface ${STATUS_DOT[key]}`}
          title=<span style={{ color: statusColor(user) }}>{statusLabel(user)}</span>
        />
      )}
    </div>
  );
}

// Icône d'espace : image importée, sinon le logo de base sur une couleur propre à l'espace.
export function ServerIcon({ server, icon, className = 'h-10 w-10' }) {
  const src = icon !== undefined ? icon : server?.icon;
  if (src) return <img src={src} alt="" className={`${className} shrink-0 rounded-full object-cover`} />;
  return (
    <span className={`${className} flex shrink-0 items-center justify-center rounded-full bg-slate-100`}>
      <Logo className="h-[62%] w-[62%] object-contain" />
    </span>
  );
}

// Compteur de notifications : 1 à 9, puis 9+.
export function CountBadge({ n, className = '' }) {
  if (!n || n <= 0) return null;
  return (
    <span className={`inline-flex min-w-[20px] items-center justify-center rounded-full bg-brand-500 px-1.5 py-0.5 text-[10px] font-extrabold leading-none text-white ${className}`}>
      {n > 9 ? '9+' : n}
    </span>
  );
}

export function Banner({ user, className = '' }) {
  return <div className={`h-32 w-full ${className}`} style={bannerStyle(user)} />;
}

export function Modal({ open, title, onClose, children, width = 'max-w-md' }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose?.();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4">
      <div className="mobile-overlay absolute inset-0 bg-ink/30 backdrop-blur-sm" onClick={onClose} />
      <div role="dialog" aria-modal="true" className={`panel relative max-h-[92dvh] w-full ${width} overflow-y-auto thin-scroll rounded-b-none p-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:rounded-b-[2.5rem] sm:pb-6`}>
        <button onClick={onClose} className="absolute right-5 top-5 z-10 rounded-full bg-surface/90 p-2 text-slate-500 shadow-soft hover:text-slate-900" aria-label="Fermer">
          <Icon name="x" className="h-4 w-4" />
        </button>
        {title && <h2 className="mb-5 pr-10 text-lg font-bold text-slate-900">{title}</h2>}
        {children}
      </div>
    </div>
  );
}

export function ContextMenu({ x, y, items, onClose }) {
  useEffect(() => {
    const close = () => onClose();
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('contextmenu', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);
  const left = Math.min(x, window.innerWidth - 230);
  const top = Math.min(y, window.innerHeight - items.length * 40 - 16);
  return (
    <div role="menu" style={{ left, top }} onClick={(e) => e.stopPropagation()} className="panel fixed z-[60] w-56 rounded-3xl p-1.5">
      {items.map((it, i) =>
        it.header ? (
          <p key={i} className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-widest text-slate-400">{it.header}</p>
        ) : it.separator ? (
          <div key={i} className="my-1 border-t border-slate-100" />
        ) : (
          <button
            key={i}
            role="menuitem"
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick?.();
            }}
            className={`flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm transition disabled:opacity-40 ${
              it.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-300'
            }`}
          >
            {it.checked !== undefined && (
              <span className="flex w-4 justify-center text-brand-600">{it.checked && <Icon name="check" className="h-4 w-4" />}</span>
            )}
            <span className="truncate">{it.label}</span>
          </button>
        ),
      )}
    </div>
  );
}

export function ColorDiamonds({ value, onChange }) {
  return (
    <div className="flex flex-wrap gap-4 px-1">
      {ROLE_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onChange(c)}
          aria-label={`Couleur ${c}`}
          className={`h-7 w-7 rotate-45 rounded-md transition ${value === c ? 'scale-110 ring-2 ring-slate-900 ring-offset-2' : 'opacity-70 hover:opacity-100'}`}
          style={{ background: c }}
        />
      ))}
    </div>
  );
}

export function EmptyState({ icon = 'bolt', title, children }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-10 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-brand-50 text-amber-400">
        <Icon name={icon} className="h-9 w-9" />
      </div>
      <h3 className="text-lg font-bold text-slate-900">{title}</h3>
      {children && <div className="max-w-sm text-sm text-slate-500">{children}</div>}
    </div>
  );
}

export function ErrorLine({ children }) {
  if (!children) return null;
  return <p className="mt-2 rounded-2xl bg-red-50 px-4 py-2.5 text-sm text-red-600">{children}</p>;
}
