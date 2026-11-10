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

// Étoile blanche qui scintille devant le pseudo d'un administrateur, centrée sur la ligne du nom.
export function AdminCrown({ user, className = '' }) {
  if (!user?.is_admin) return null;
  return (
    <span title="Administrateur" role="img" aria-label="Administrateur" className={`admin-star inline-flex shrink-0 items-center self-center ${className}`}>
      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" aria-hidden="true">
        <path fill="#ffffff" d="M12 1.5c.6 5.2 3.3 7.9 10.5 10.5-7.2 2.6-9.9 5.3-10.5 10.5-.6-5.2-3.3-7.9-10.5-10.5C8.7 9.4 11.4 6.7 12 1.5z" />
      </svg>
    </span>
  );
}

// Badge PLUS (après le pseudo). La couronne de l'administrateur se place avant le pseudo : voir AdminCrown.
export function RoleBadge({ user, className = '' }) {
  if (!user?.is_plus) return null;
  return <PlusBadge className={className} color={user.badge_color || ''} />;
}
