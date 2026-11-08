import { Icon } from './ui';

// Bandeau de page : même hauteur et même mise en forme sur toutes les pages (comme les bannières d'espace).
export default function PageBanner({ icon, title, subtitle, children }) {
  return (
    <section className="relative flex h-32 items-center overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-900 via-brand-800 to-[#0f0f12] px-6 text-white shadow-panel md:px-8">
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-400/25 blur-3xl" />
      <div className="relative flex w-full min-w-0 items-center gap-4">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20">
          <Icon name={icon} className="h-6 w-6" />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold tracking-tight md:text-3xl">{title}</h1>
          {subtitle && <p className="truncate text-sm text-white/75">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
