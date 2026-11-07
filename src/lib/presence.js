// Présence : un battement de cœur envoyé depuis un Worker. Les Workers ne sont pas ralentis
// quand la fenêtre est réduite : on reste « en ligne » tant que la page est ouverte.
let worker = null;

export function startPresence(token) {
  stopPresence();
  if (!token || typeof Worker === 'undefined') return;
  const code = `
    let cfg = null;
    onmessage = (e) => { cfg = e.data; };
    setInterval(() => {
      if (!cfg) return;
      fetch(cfg.url, { method: 'POST', headers: { Authorization: 'Bearer ' + cfg.token }, keepalive: true }).catch(() => {});
    }, 10000);
  `;
  try {
    worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
    worker.postMessage({ token, url: `${location.origin}/api/presence/ping` });
  } catch {
    worker = null;
  }
}

export function stopPresence() {
  if (worker) worker.terminate();
  worker = null;
}
