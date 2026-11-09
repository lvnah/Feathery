// Horloge partagée : une seule minuterie pour tout l'affichage « il y a … » (rafraîchie toutes les 10 secondes).
import { useSyncExternalStore } from 'react';

let now = Date.now();
const listeners = new Set();
setInterval(() => {
  now = Date.now();
  listeners.forEach((fn) => fn());
}, 10_000);

const subscribe = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export const useNow = () => useSyncExternalStore(subscribe, () => now);

// « Il y a 10 secondes », « Il y a 1 minute », « Il y a 3 heures », « Il y a 2 jours », puis la date.
export function timeAgo(ts, current = Date.now()) {
  const sec = Math.max(0, Math.floor((current - ts) / 1000));
  if (sec < 5) return 'À l’instant';
  const plural = (n, word) => `Il y a ${n} ${word}${n > 1 ? 's' : ''}`;
  if (sec < 60) return plural(sec, 'seconde');
  const min = Math.floor(sec / 60);
  if (min < 60) return plural(min, 'minute');
  const hours = Math.floor(min / 60);
  if (hours < 24) return plural(hours, 'heure');
  const days = Math.floor(hours / 24);
  if (days < 7) return plural(days, 'jour');
  return new Date(ts).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}
