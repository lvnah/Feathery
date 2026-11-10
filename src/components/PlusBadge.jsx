import { LOGO_URL } from '../lib/brand';
import { badgeGradient } from '../lib/util';

// Badge PLUS sobre : une fine bague dégradée autour du logo. Pas de halo, pas de texte.
export default function PlusBadge({ className = '', color = '' }) {
  return (
    <span
      title="Membre PLUS"
      aria-label="Membre PLUS"
      className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full p-[2px] ${className}`}
      style={{ background: badgeGradient(color) }}
    >
      <span className="flex h-full w-full items-center justify-center rounded-full bg-surface">
        <img src={LOGO_URL} alt="" className="h-2.5 w-2.5 object-contain" />
      </span>
    </span>
  );
}

// Couronne blanche devant le pseudo d'un administrateur.
export function AdminCrown({ user, className = '' }) {
  if (!user?.is_admin) return null;
  return (
    <svg viewBox="0 0 24 24" aria-label="Administrateur" role="img" className={`inline-block h-3.5 w-3.5 shrink-0 ${className}`}>
      <title>Administrateur</title>
      <path fill="#ffffff" d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z" />
    </svg>
  );
}

// Badge PLUS (après le pseudo). La couronne de l'administrateur se place avant le pseudo : voir AdminCrown.
export function RoleBadge({ user, className = '' }) {
  if (!user?.is_plus) return null;
  return <PlusBadge className={className} color={user.badge_color || ''} />;
}
