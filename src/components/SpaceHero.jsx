import { bannerStyle } from '../lib/util';
import { ServerIcon, SpaceBanner } from './ui';

// Bannière d'espace avec son logo incrusté : fond (bannière ou dégradé argent), voile sombre pour la lisibilité,
// icône en médaillon et nom posés en bas. « children » : badges sous le nom ; « actions » : boutons à droite.
export default function SpaceHero({ server, className = '', children, actions, onContextMenu }) {
  return (
    <header className={`relative overflow-hidden rounded-[2rem] text-left shadow-soft ${className}`}>
      <div className="absolute inset-0">
        {server.banner ? (
          <SpaceBanner value={server.banner} className="h-full w-full" />
        ) : (
          <div className="h-full w-full" style={bannerStyle({ banner: { type: 'gradient', index: 6 } })} />
        )}
      </div>
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-black/10" aria-hidden="true" />
      <div className="relative z-10 flex h-full items-end gap-3 p-4 max-lg:items-center max-lg:p-2.5" onContextMenu={onContextMenu}>
        <span className="flex shrink-0 rounded-full shadow-lg ring-4 ring-white/90 max-lg:ring-2">
          <ServerIcon server={server} className="h-16 w-16 max-lg:h-11 max-lg:w-11" />
        </span>
        <div className="min-w-0 flex-1 pb-0.5">
          <p className="truncate text-xl font-extrabold text-white drop-shadow-md max-lg:text-base">{server.name}</p>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">{children}</div>
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2 pb-0.5">{actions}</div>}
      </div>
    </header>
  );
}
