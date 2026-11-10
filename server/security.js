// Protections transverses : en-têtes de sécurité, limitation de débit, adresse du client.
const buckets = new Map();

// Compte les tentatives par clé (IP, compte, membre…) dans une fenêtre de temps. Renvoie false une fois la limite dépassée.
export function hit(key, limit, windowMs) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset <= now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  b.count += 1;
  return b.count <= limit;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.reset <= now) buckets.delete(k);
}, 60_000).unref();

// Adresse du client : le premier saut de X-Forwarded-For (le proxy de l'hébergeur), sinon la connexion directe.
export function clientIp(req) {
  const fwd = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
  return (fwd || req.socket.remoteAddress || 'inconnu').slice(0, 64);
}

// Pas de script ou de style venu d'ailleurs : seuls le site lui-même et les polices Google (déjà utilisées) sont autorisés.
// Les images peuvent venir des GIF Giphy (aperçus dans le sélecteur de GIF).
const APP_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https://*.giphy.com https://flagcdn.com",
  "media-src 'self' blob: data:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export function securityHeaders(res, kind = 'api') {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=(), microphone=(self)');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  // La politique de contenu ne s'applique qu'aux pages HTML : l'appliquer aux données, scripts ou images bloquerait l'application.
  if (kind === 'app') res.setHeader('Content-Security-Policy', APP_CSP);
  else if (kind === 'verify') res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'");
}
