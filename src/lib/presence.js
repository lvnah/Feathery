// Présence : un battement de cœur envoyé depuis un Worker. Les Workers ne sont pas ralentis
// quand la fenêtre est réduite : on reste « en ligne » tant que la page est ouverte.
// Le battement indique aussi le temps depuis la dernière saisie : au-delà de 15 minutes, le membre passe absent.
let worker = null;
let inputTimer = 0;

const onInput = () => {
  // Au plus une mise à jour par seconde : le Worker garde l'heure de la dernière saisie.
  if (!worker || inputTimer) return;
  inputTimer = setTimeout(() => {
    inputTimer = 0;
  }, 1000);
  worker.postMessage({ lastInput: Date.now() });
};
const INPUT_EVENTS = ['pointerdown', 'keydown', 'touchstart', 'wheel'];

export function startPresence(token, device = 'desktop') {
  stopPresence();
  if (!token || typeof Worker === 'undefined') return;
  const code = `
    let cfg = null;
    onmessage = (e) => {
      if (e.data.lastInput) { if (cfg) cfg.lastInput = e.data.lastInput; return; }
      cfg = { ...e.data, lastInput: Date.now() };
    };
    setInterval(() => {
      if (!cfg) return;
      const idle = Date.now() - cfg.lastInput;
      fetch(cfg.url, { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.token, 'Content-Type': 'application/json' }, body: JSON.stringify({ device: cfg.device, idle }), keepalive: true }).catch(() => {});
    }, 10000);
  `;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    worker.postMessage({ token, device, url: `${location.origin}/api/presence/ping` });
    INPUT_EVENTS.forEach((ev) => window.addEventListener(ev, onInput, { passive: true, capture: true }));
  } catch {
    worker = null;
  }
}

export function stopPresence() {
  INPUT_EVENTS.forEach((ev) => window.removeEventListener(ev, onInput, { capture: true }));
  if (worker) worker.terminate();
  worker = null;
}
