// Images (avatars, bannières, icônes) stockées une seule fois en base et servies par URL.
// La synchronisation ne transporte plus les données : seulement /api/img/<id>, mis en cache par le navigateur.
import { randomBytes } from 'node:crypto';
import { db } from './db.js';

db.exec(`CREATE TABLE IF NOT EXISTS images (
  id TEXT PRIMARY KEY,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  created_at INTEGER NOT NULL
)`);

const DATA_URL = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/;

// Enregistre une image encodée en data URL ; renvoie son URL, ou null si le format n'est pas reconnu.
export function storeImage(dataUrl) {
  const m = DATA_URL.exec(String(dataUrl ?? ''));
  if (!m) return null;
  const id = randomBytes(12).toString('hex');
  db.prepare('INSERT INTO images (id, mime, data, created_at) VALUES (?, ?, ?, ?)').run(id, m[1], Buffer.from(m[2], 'base64'), Date.now());
  return `/api/img/${id}`;
}

export function getImage(id) {
  return db.prepare('SELECT mime, data FROM images WHERE id = ?').get(id) ?? null;
}

// Convertit au démarrage les anciennes images encore présentes en data URL dans les lignes.
export function migrateInlineImages() {
  const targets = [
    ['users', 'id', 'avatar', null],
    ['users', 'id', 'banner_value', "banner_type = 'image'"],
    ['servers', 'id', 'icon', null],
    ['servers', 'id', 'banner', null],
  ];
  let converted = 0;
  for (const [table, key, col, extra] of targets) {
    const where = `${col} LIKE 'data:image/%'${extra ? ` AND ${extra}` : ''}`;
    for (const row of db.prepare(`SELECT ${key} AS k, ${col} AS v FROM ${table} WHERE ${where}`).all()) {
      const url = storeImage(row.v);
      if (!url) continue;
      db.prepare(`UPDATE ${table} SET ${col} = ? WHERE ${key} = ?`).run(url, row.k);
      converted++;
    }
  }
  return converted;
}
