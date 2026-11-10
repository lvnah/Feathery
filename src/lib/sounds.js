// Sons de l'application, générés avec Web Audio (aucun fichier à charger).
// Le contexte audio n'est créé qu'après une action de l'utilisateur (règle des navigateurs).
let ctx = null;

function audio() {
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

// Une note douce : montée rapide puis extinction.
function tone(freq, start, dur, type = 'sine', peak = 0.12) {
  const c = audio();
  if (!c) return;
  const t0 = c.currentTime + start;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// Arrivée dans un vocal (ou un membre qui arrive) : deux notes qui montent.
export const playJoin = () => { tone(523, 0, 0.16); tone(784, 0.12, 0.26); };
// Départ d'un vocal (ou un membre qui part) : deux notes qui descendent.
export const playLeave = () => { tone(784, 0, 0.16); tone(392, 0.12, 0.28); };
// Sonnerie d'appel : « bip bip » répété. Renvoie la fonction qui l'arrête.
export function startRing() {
  const beep = () => {
    tone(880, 0, 0.14, 'square', 0.05);
    tone(880, 0.22, 0.14, 'square', 0.05);
  };
  beep();
  const id = setInterval(beep, 2400);
  return () => clearInterval(id);
}
// Micro coupé : petit clic grave, pour soi uniquement.
export const playMute = () => { tone(660, 0, 0.09, 'triangle', 0.09); };
// Micro rétabli : clic aigu, pour soi uniquement.
export const playUnmute = () => { tone(880, 0, 0.09, 'triangle', 0.09); tone(1100, 0.07, 0.09, 'triangle', 0.07); };
