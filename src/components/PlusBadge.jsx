import { LOGO_URL } from '../lib/brand';

// Badge PLUS sobre : une fine bague dégradée autour du logo. Pas de halo, pas de texte.
export default function PlusBadge({ className = '' }) {
  return (
    <span
      title="Membre PLUS"
      aria-label="Membre PLUS"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-300 via-brand-500 to-brand-700 p-[2px] ${className}`}
    >
      <span className="flex h-full w-full items-center justify-center rounded-full bg-surface">
        <img src={LOGO_URL} alt="" className="h-2.5 w-2.5 object-contain" />
      </span>
    </span>
  );
}
