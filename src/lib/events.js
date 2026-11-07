// Flux d'événements du serveur (Server-Sent Events) : un message à chaque changement, lu avec fetch
// pour pouvoir envoyer le jeton. Se reconnecte tout seul avec un délai croissant.
import { getToken } from './api';

let ctrl = null;

export function startEvents(onChange) {
  stopEvents();
  const mine = new AbortController();
  ctrl = mine;
  (async () => {
    let delay = 1000;
    while (!mine.signal.aborted) {
      const token = getToken();
      if (!token) return;
      try {
        const res = await fetch('/api/events', { headers: { Authorization: `Bearer ${token}` }, signal: mine.signal, cache: 'no-store' });
        if (!res.ok || !res.body) throw new Error('events');
        delay = 1000;
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '';
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          let i;
          while ((i = buf.indexOf('\n\n')) >= 0) {
            const chunk = buf.slice(0, i);
            buf = buf.slice(i + 2);
            if (chunk.includes('data:')) onChange();
          }
        }
      } catch {
        if (mine.signal.aborted) return;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 15000);
    }
  })();
}

export function stopEvents() {
  if (ctrl) ctrl.abort();
  ctrl = null;
}
