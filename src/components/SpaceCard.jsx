import { CountBadge, ServerIcon, SpaceBanner } from './ui';

// Carte d'espace : bannière en haut, icône ronde avec un petit contour blanc qui la chevauche, puis le nom sous la bannière.
export default function SpaceCard({ server, meta, unread = 0, badge = null, active = false, onClick, onContextMenu }) {
  return (
    <button
      type="button"
      onClick={onClick}
      onContextMenu={onContextMenu}
      className={`panel flex flex-col overflow-hidden p-0 text-left transition hover:ring-2 hover:ring-brand-200 ${active ? 'ring-2 ring-brand-300' : ''}`}
    >
      <SpaceBanner value={server.banner} className="h-32 w-full shrink-0" />
      <div className="relative z-10 -mt-9 px-5">
        <span className="inline-block rounded-full ring-4 ring-white shadow-soft">
          <ServerIcon server={server} className="h-16 w-16" />
        </span>
      </div>
      <div className="min-w-0 px-5 pb-5 pt-2">
        <span className="block truncate text-lg font-extrabold text-slate-900">{server.name}</span>
        <span className="block truncate text-xs font-semibold text-slate-500">{meta}</span>
      </div>
    </button>
  );
}
