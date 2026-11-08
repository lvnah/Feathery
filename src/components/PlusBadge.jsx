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

// Badge administrateur : le même badge que PLUS, en rouge, avec le logo rouge.
export function AdminBadge({ className = '' }) {
  const mask = { WebkitMaskImage: `url(${LOGO_URL})`, maskImage: `url(${LOGO_URL})`, WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' };
  return (
    <span
      title="Administrateur"
      aria-label="Administrateur"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-red-300 via-red-500 to-red-700 p-[2px] ${className}`}
    >
      <span className="flex h-full w-full items-center justify-center rounded-full bg-surface">
        <span aria-hidden="true" className="h-2.5 w-2.5 bg-red-600" style={mask} />
      </span>
    </span>
  );
}

// Affiche les badges qui s'appliquent : administrateur et PLUS peuvent être affichés ensemble.
export function RoleBadge({ user, className = '' }) {
  if (!user?.is_admin && !user?.is_plus) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      {!!user.is_admin && <AdminBadge className={className} />}
      {!!user.is_plus && <PlusBadge className={className} />}
    </span>
  );
}
