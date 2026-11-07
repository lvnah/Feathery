import { Icon } from './ui';

// Bandeau de page (même style que l'accueil) : icône, titre, sous-titre et actions optionnelles.
export default function PageBanner({ icon, title, subtitle, children, compact = false }) {
  return (
    <section className={`relative overflow-hidden rounded-[2.5rem] bg-gradient-to-br from-brand-900 via-brand-800 to-[#052e16] text-white shadow-panel ${compact ? 'p-4 md:p-5' : 'p-6 md:p-8'}`}>
      <div aria-hidden="true" className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand-400/25 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-4">
        <span className={`flex shrink-0 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/20 ${compact ? 'h-10 w-10' : 'h-12 w-12'}`}>
          <Icon name={icon} className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className={`font-extrabold tracking-tight ${compact ? 'text-lg' : 'text-2xl md:text-3xl'}`}>{title}</h1>
          {subtitle && <p className="text-sm text-white/75">{subtitle}</p>}
        </div>
        {children}
      </div>
    </section>
  );
}
