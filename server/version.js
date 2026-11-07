// Version globale des données : incrémentée à chaque action réussie et, plus lentement,
// pour refléter les changements de présence. Le client ne re-télécharge l'état que si elle a changé.
let version = 1;
const listeners = new Set(); // clients connectés au flux d'événements (voir /api/events)
export const getVersion = () => version;
export const onVersion = (fn) => listeners.add(fn);
export const offVersion = (fn) => listeners.delete(fn);
export const bumpVersion = () => {
  version += 1;
  for (const fn of listeners) fn(version);
};
setInterval(bumpVersion, 15_000).unref();
