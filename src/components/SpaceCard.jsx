import { CountBadge, ServerIcon } from './ui';

// Carte d'espace, sur le modèle de la carte de profil : bannière en haut, icône de l'espace qui la chevauche, nom et détails.
export default function SpaceCard({ server, meta, unread = 0, badge = null, active = false, onClick, onContextMenu }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`panel flex flex-col overflow-hidden p-0 text-left transition hover:ring-2 hover:ring-brand-200 ${active ? 'ring-2 ring-brand-300' : ''}`}
    >
      <div className="relative h-24 w-full overflow-hidden bg-gradient-to-br from-brand-700 via-brand-600 to-brand-400">
        {server.banner && (
          <img src={server.banner} alt="" draggable={false} className="absolute inset-0 h-full w-full object-cover object-center" />
        )}
        {unread > 0 && <span className="absolute right-3 top-3"><CountBadge n={unread} /></span>}
        {badge && <span className="absolute left-3 top-3">{badge}</span>}
      </div>
      <div className="relative z-10 -mt-9 flex items-end gap-3 px-5 pb-5">
        <span className="shrink-0 rounded-2xl bg-surface p-1 shadow-soft ring-2 ring-surface">
          <ServerIcon server={server} className="h-16 w-16" />
        </span>
        <span className="min-w-0 flex-1 pb-1">
          <span className="block truncate text-lg font-extrabold text-slate-900">{server.name}</span>
          <span className="block truncate text-xs font-semibold text-slate-500">{meta}</span>
        </span>
      </div>
    </button>
  );
}
