import { LOGO_URL } from './brand';
// Constantes et helpers purs partagés par l'interface.

export const OWNER_COLOR = '#d97706';
export const ONLINE_WINDOW_MS = 15_000;

export const ROLE_COLORS = [
  '#a16207', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#a1a1aa', '#71717a', '#52525b',
  '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
  '#f43f5e', '#94a3b8', '#f8fafc',
];

// Bannières par défaut (index 0 = vert de la page Paramètres).
export const BANNER_GRADIENTS = [
  'linear-gradient(120deg,#2a2a30 0%,#18181b 45%,#0f0f12 100%)',
  'linear-gradient(135deg,#bae6fd 0%,#c7d2fe 100%)',
  'linear-gradient(135deg,#6366f1 0%,#a855f7 100%)',
  'linear-gradient(135deg,#f97316 0%,#ec4899 100%)',
  'linear-gradient(135deg,#14b8a6 0%,#84cc16 100%)',
  'linear-gradient(135deg,#334155 0%,#0f172a 100%)',
];

// Connecté = heartbeat récent. Le statut choisi par le membre s'y ajoute.
export function connected(user) {
  return !!user && Date.now() - (user.last_activity || 0) < ONLINE_WINDOW_MS;
}

// 'online' | 'game' | 'away' | 'offline' : ce que tout le monde voit.
export function statusKey(user) {
  if (!connected(user) || user.status === 'offline') return 'offline';
  if (user.status === 'game') return 'game';
  if (user.status === 'away') return 'away';
  return 'online';
}

export const isOnline = (user) => statusKey(user) !== 'offline';

export const STATUS_LABEL = { online: 'En ligne', game: 'En game', away: 'Absent', offline: 'Hors ligne' };
export const STATUS_DOT = { online: 'bg-brand-500', game: 'bg-violet-500', away: 'bg-amber-400', offline: 'bg-slate-300' };
export const statusLabel = (user) => STATUS_LABEL[statusKey(user)];
// Couleur du texte de statut (lisible sur fond sombre).
export const STATUS_TEXT = { online: '#e4e4e7', game: '#7c3aed', away: '#b45309', offline: '#64748b' };
export const statusColor = (user) => STATUS_TEXT[statusKey(user)];

export function fullName(user) {
  return user ? `${user.pseudo}#${user.tag}` : '';
}

// Bannières préréglées réservées aux membres PLUS : dégradés animés, créés pour Feathery.
export const PLUS_BANNER_PRESETS = {
  aurora: { label: 'Aurore', css: 'linear-gradient(120deg,#0f0f12,#0e7490,#7c3aed,#0f0f12)' },
  ember: { label: 'Braise', css: 'linear-gradient(120deg,#7c2d12,#f97316,#fde68a,#7c2d12)' },
  tide: { label: 'Marée', css: 'linear-gradient(120deg,#0c4a6e,#38bdf8,#e0f2fe,#0c4a6e)' },
  nocturne: { label: 'Nocturne', css: 'linear-gradient(120deg,#0f172a,#312e81,#be185d,#0f172a)' },
  meadow: { label: 'Prairie', css: 'linear-gradient(120deg,#1f1f23,#65a30d,#fef08a,#1f1f23)' },
  // Réservée aux administrateurs : dégradé animé avec le logo de l'application.
  feathery: { label: 'Feathery (admin)', admin: true, logo: true, css: 'linear-gradient(120deg,#09090b,#52525b,#e4e4e7,#09090b)' },
};

// Bannières « logo » : dégradés avec le logo de l'appli. Classiques (fixes) pour tous, animées pour les PLUS.
export const LOGO_CLASSIC = [
  { label: 'Émeraude', css: 'linear-gradient(120deg,#0f0f12,#2a2a30,#18181b)' },
  { label: 'Aurore', css: 'linear-gradient(120deg,#0f0f12,#0e7490,#7c3aed,#0f0f12)' },
  { label: 'Braise', css: 'linear-gradient(120deg,#7c2d12,#f97316,#fde68a,#7c2d12)' },
  { label: 'Marée', css: 'linear-gradient(120deg,#0c4a6e,#38bdf8,#e0f2fe,#0c4a6e)' },
  { label: 'Nocturne', css: 'linear-gradient(120deg,#0f172a,#312e81,#be185d,#0f172a)' },
  { label: 'Prairie', css: 'linear-gradient(120deg,#1f1f23,#65a30d,#fef08a,#1f1f23)' },
];
const presetBackground = (css, animated) => ({
  backgroundImage: css,
  backgroundSize: animated ? '300% 300%' : 'cover',
  ...(animated ? { animation: 'banner-drift 14s ease-in-out infinite' } : {}),
});
// Calque du logo : même couleur que la bannière, plus claire pour rester visible.
export function bannerLogoLayer(user) {
  const b = user?.banner || {};
  if (b.type === 'image' || b.type === 'url') return null;
  const preset = b.type === 'preset' && PLUS_BANNER_PRESETS[b.key];
  const css = preset ? preset.css : LOGO_CLASSIC[(b.index ?? 0) % LOGO_CLASSIC.length].css;
  const animated = !!preset && !!(user?.is_plus || user?.is_admin);
  const mask = `url("${LOGO_URL}")`;
  return {
    ...presetBackground(css, animated),
    filter: 'brightness(1.9) saturate(1.2)',
    WebkitMaskImage: mask, maskImage: mask,
    WebkitMaskSize: 'auto 60%', maskSize: 'auto 60%',
    WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat',
    WebkitMaskPosition: 'center', maskPosition: 'center',
  };
}
export function logoBackground(css, animated) {
  return {
    backgroundImage: `url("${LOGO_URL}"), ${css}`,
    backgroundRepeat: 'no-repeat, repeat',
    backgroundPosition: 'center, 0% 50%',
    backgroundSize: 'auto 72%, 300% 300%',
    ...(animated ? { animation: 'banner-drift-logo 12s ease-in-out infinite' } : {}),
  };
}

export function bannerStyle(user) {
  const b = user?.banner || {};
  if (b.type === 'preset' && PLUS_BANNER_PRESETS[b.key]) {
    // Les versions animées sont réservées aux PLUS (et à l'administration).
    return presetBackground(PLUS_BANNER_PRESETS[b.key].css, !!(user?.is_plus || user?.is_admin));
  }
  if (b.type !== 'image' && b.type !== 'url') {
    return presetBackground(LOGO_CLASSIC[(b.index ?? 0) % LOGO_CLASSIC.length].css, false);
  }
  if ((b.type === 'image' || b.type === 'url') && b.value) {
    const safe = String(b.value).replace(/["\\()]/g, '');
    return { backgroundImage: `url("${safe}")`, backgroundSize: 'cover', backgroundPosition: 'center' };
  }
  return { background: BANNER_GRADIENTS[b.index ?? 0] ?? BANNER_GRADIENTS[0] };
}

// Dégradés saturés pour les avatars sans photo (la lettre doit rester lisible en blanc).
const AVATAR_GRADIENTS = [
  'linear-gradient(135deg,#2a2a30,#18181b)',
  'linear-gradient(135deg,#6366f1,#a855f7)',
  'linear-gradient(135deg,#0ea5e9,#2563eb)',
  'linear-gradient(135deg,#f97316,#ec4899)',
  'linear-gradient(135deg,#14b8a6,#65a30d)',
  'linear-gradient(135deg,#475569,#0f172a)',
];

export function avatarGradient(seed = '') {
  let h = 0;
  for (const c of String(seed)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return AVATAR_GRADIENTS[h % AVATAR_GRADIENTS.length];
}

export function formatTime(ts) {
  return new Date(ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

// Horodatage affiché dans les messages : 2026-11-04 11:47:48
export function formatStamp(ts) {
  const d = new Date(ts);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Couleurs de pseudo : simples pour tous, davantage pour les PLUS (même liste que le serveur).
export const NAME_COLORS_BASIC = ['#111827', '#64748b', '#2563eb', '#d97706', '#9333ea', '#ea580c'];
export const NAME_COLORS_PLUS = [...NAME_COLORS_BASIC, '#0891b2', '#db2777', '#4f46e5', '#ca8a04', '#b45309', '#6d28d9', '#7c3aed', '#4338ca', '#1d4ed8', '#0369a1', '#c026d3', '#854d0e', 'rainbow', 'sunset', 'ocean', 'aurora', 'candy', 'neon', 'lagoon', 'ruby', 'lime', 'violet'];

// Couleurs « arc-en-ciel » prêtes à l'emploi pour les membres PLUS (dégradé animé sur le pseudo).
const RAINBOW_COLS = {
  rainbow: ['#fb923c', '#f59e0b', '#eab308', '#22c55e', '#06b6d4', '#3b82f6', '#a855f7', '#ec4899'],
  sunset: ['#f97316', '#fbbf24', '#ec4899'],
  ocean: ['#0ea5e9', '#2563eb', '#22d3ee'],
  aurora: ['#10b981', '#3b82f6', '#a855f7'],
  candy: ['#f472b6', '#c084fc', '#60a5fa'],
  neon: ['#22d3ee', '#a3e635', '#f0abfc'],
  lagoon: ['#06b6d4', '#14b8a6', '#818cf8'],
  ruby: ['#db2777', '#c026d3', '#f472b6'],
  lime: ['#84cc16', '#22c55e', '#eab308'],
  violet: ['#7c3aed', '#c084fc', '#f0abfc'],
};
export const RAINBOW_LABELS = { rainbow: 'Arc-en-ciel', sunset: 'Coucher de soleil', ocean: 'Océan', aurora: 'Aurore', candy: 'Bonbon', neon: 'Néon', lagoon: 'Lagon', ruby: 'Fuchsia', lime: 'Citron vert', violet: 'Violet' };
// Le dégradé est doublé et se termine par sa première couleur : l'animation boucle sans couture.
const gradientOf = (cols) => {
  const seq = [...cols, cols[0]].join(', ');
  return `linear-gradient(90deg, ${seq}, ${seq})`;
};
export const RAINBOW_GRADIENTS = Object.fromEntries(Object.entries(RAINBOW_COLS).map(([k, cols]) => [k, gradientOf(cols)]));

// Style du pseudo : couleur simple, ou dégradé animé pour les couleurs arc-en-ciel.
export function nameStyle(user) {
  const c = user?.name_color;
  if (!c) return {};
  if (RAINBOW_GRADIENTS[c]) {
    return {
      backgroundImage: RAINBOW_GRADIENTS[c],
      backgroundSize: '200% 100%',
      WebkitBackgroundClip: 'text',
      backgroundClip: 'text',
      color: 'transparent',
      animation: 'name-shift 6s linear infinite',
    };
  }
  return { color: c };
}

// Bannière d'espace : 'preset:gN' (bannière de base), 'preset:<clé>' (PLUS), ou une image.
export function espaceBannerUser(value) {
  const v = String(value || '');
  if (!v.startsWith('preset:')) return null;
  const key = v.slice(7);
  if (/^g[0-5]$/.test(key)) return { banner: { type: 'gradient', index: Number(key.slice(1)) } };
  return { banner: { type: 'preset', key } };
}
