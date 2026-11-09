// Recherche et import de GIF (Giphy). La clé reste sur le serveur (variable GIPHY_API_KEY).
// Le GIF choisi est téléchargé ici, uniquement depuis les hôtes Giphy, avec une taille limitée et une signature vérifiée,
// puis stocké comme une image du chat : le navigateur ne charge jamais une adresse choisie par le membre.
import { HttpError } from './actions.js';
import { storeImage } from './images.js';

const MAX_GIF = 2_000_000; // octets
const HOST = /^(media\d*|i)\.giphy\.com$/;
const cache = new Map(); // requête -> résultats (10 minutes)

// Adresse Giphy valide : https, hôte Giphy connu, image GIF (ou WebP pour les aperçus), sans identifiants ni port.
const giphyUrl = (value, { gifOnly = false } = {}) => {
  try {
    const u = new URL(String(value ?? ''));
    if (u.protocol !== 'https:' || !HOST.test(u.hostname) || u.username || u.password || u.port) return null;
    const path = u.pathname.toLowerCase();
    if (gifOnly ? !path.endsWith('.gif') : !/\.(gif|webp)$/.test(path)) return null;
    return u.href;
  } catch {
    return null;
  }
};

export async function searchGifs(query) {
  const key = process.env.GIPHY_API_KEY || '';
  if (!key) throw new HttpError(503, 'Recherche de GIF non configurée sur le serveur (variable GIPHY_API_KEY).');
  const q = String(query ?? '').trim().slice(0, 40);
  if (q.length < 2) return [];
  const cached = cache.get(q.toLowerCase());
  if (cached && Date.now() - cached.at < 600_000) return cached.results;
  const url = new URL('https://api.giphy.com/v1/gifs/search');
  url.search = new URLSearchParams({ api_key: key, q, limit: '24', rating: 'pg-13', lang: 'fr' }).toString();
  let res;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(6000), redirect: 'error' });
  } catch {
    throw new HttpError(502, 'Recherche de GIF indisponible.');
  }
  if (!res.ok) throw new HttpError(502, 'Recherche de GIF indisponible.');
  const json = await res.json().catch(() => ({}));
  const results = (Array.isArray(json.data) ? json.data : [])
    .map((g) => ({
      id: String(g.id ?? '').slice(0, 40),
      preview: giphyUrl(g.images?.fixed_width_small?.url) ?? '',
      url: giphyUrl(g.images?.fixed_width?.url, { gifOnly: true }) ?? '',
    }))
    .filter((g) => g.preview && g.url)
    .slice(0, 24);
  if (cache.size > 200) cache.clear();
  cache.set(q.toLowerCase(), { at: Date.now(), results });
  return results;
}

// Télécharge un GIF Giphy choisi et le range parmi les images du chat. Renvoie son adresse /api/img/….
export async function importGif(value) {
  const href = giphyUrl(value, { gifOnly: true });
  if (!href) throw new HttpError(400, 'Ce GIF ne peut pas être importé.');
  let res;
  try {
    res = await fetch(href, { signal: AbortSignal.timeout(10_000), redirect: 'error' });
  } catch {
    throw new HttpError(502, 'GIF indisponible.');
  }
  if (!res.ok) throw new HttpError(502, 'GIF indisponible.');
  if (Number(res.headers.get('content-length') || 0) > MAX_GIF) throw new HttpError(413, 'GIF trop lourd (2 Mo maximum).');
  const chunks = [];
  let size = 0;
  for await (const chunk of res.body) {
    size += chunk.length;
    if (size > MAX_GIF) throw new HttpError(413, 'GIF trop lourd (2 Mo maximum).');
    chunks.push(chunk);
  }
  const buf = Buffer.concat(chunks);
  const sig = buf.subarray(0, 6).toString('latin1');
  if (sig !== 'GIF87a' && sig !== 'GIF89a') throw new HttpError(415, 'Fichier non reconnu comme GIF.');
  const url = storeImage(`data:image/gif;base64,${buf.toString('base64')}`);
  if (!url) throw new HttpError(415, 'GIF illisible.');
  return url;
}
