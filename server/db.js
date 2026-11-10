// Base SQLite (module intégré node:sqlite, Node >= 22.13). Fichier : data/hevenly.sqlite
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const DB_PATH = process.env.DB_PATH || resolve(root, 'data', 'hevenly.sqlite');
mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  pseudo TEXT NOT NULL,
  tag TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  avatar TEXT NOT NULL DEFAULT '',
  bio TEXT NOT NULL DEFAULT '',
  is_plus INTEGER NOT NULL DEFAULT 0,
  banner_type TEXT NOT NULL DEFAULT 'gradient',
  banner_value TEXT NOT NULL DEFAULT '0',
  last_activity INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (pseudo COLLATE NOCASE, tag)
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS servers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 1,
  owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS memberships (
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  PRIMARY KEY (server_id, user_id)
);
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  color TEXT NOT NULL,
  can_manage_channels INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS member_roles (
  server_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role_id TEXT NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (server_id, user_id, role_id),
  FOREIGN KEY (server_id, user_id) REFERENCES memberships(server_id, user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS channels (
  id TEXT PRIMARY KEY,
  server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('text', 'voice')),
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages (channel_id, created_at);
CREATE TABLE IF NOT EXISTS friendships (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
  created_at INTEGER NOT NULL,
  UNIQUE (from_id, to_id)
);
CREATE TABLE IF NOT EXISTS dms (
  id TEXT PRIMARY KEY,
  from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_dms_pair ON dms (from_id, to_id, created_at);
CREATE TABLE IF NOT EXISTS voice_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL REFERENCES channels(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS call_connections (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  room TEXT NOT NULL,
  muted INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS reports (
  id TEXT PRIMARY KEY,
  reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
`);

// Migrations légères pour les bases créées avant cette version.
function addColumn(table, column, definition) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
}
addColumn('users', 'is_admin', 'INTEGER NOT NULL DEFAULT 0');
addColumn('reports', 'server_id', 'TEXT');
addColumn('roles', 'position', 'INTEGER NOT NULL DEFAULT 0');
// Messages privés : 'ok' = conversation acceptée, 'request' = demande de message en attente.
addColumn('dms', 'status', "TEXT NOT NULL DEFAULT 'ok'");
addColumn('users', 'country', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'status', "TEXT NOT NULL DEFAULT 'online'");
addColumn('voice_connections', 'muted', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'custom_status', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'name_color', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'chat_bg', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'theme', "TEXT NOT NULL DEFAULT 'light'");
addColumn('users', 'dm_open', 'INTEGER NOT NULL DEFAULT 0');
addColumn('users', 'accept_friend_requests', 'INTEGER NOT NULL DEFAULT 1');
addColumn('users', 'email', "TEXT NOT NULL DEFAULT ''");
addColumn('users', 'email_verified', 'INTEGER NOT NULL DEFAULT 1');
addColumn('users', 'device', "TEXT NOT NULL DEFAULT ''");
addColumn('channels', 'readonly', 'INTEGER NOT NULL DEFAULT 0');
addColumn('servers', 'banner', "TEXT NOT NULL DEFAULT ''");
// Blocages : un membre bloqué disparaît de la vie de l'autre (messages, privés, amis, vocal, liste des membres).
db.exec(`CREATE TABLE IF NOT EXISTS blocks (blocker_id TEXT NOT NULL, blocked_id TEXT NOT NULL, created_at INTEGER NOT NULL, PRIMARY KEY (blocker_id, blocked_id))`);
// Pièce jointe d'un message (photo ou GIF) : adresse /api/img/… de l'image stockée.
addColumn('messages', 'image', "TEXT NOT NULL DEFAULT ''");
// Dernière activité de saisie (souris, clavier, toucher) : au-delà de 15 minutes, le membre passe absent.
addColumn('users', 'last_input', 'INTEGER NOT NULL DEFAULT 0');
addColumn('dms', 'image', "TEXT NOT NULL DEFAULT ''");
// Type d'entrée : '' = message, 'call' = trace d'appel (durée ou appel manqué).
addColumn('dms', 'kind', "TEXT NOT NULL DEFAULT ''");
// Liens cliquables dans les messages (réglage du compte).
addColumn('users', 'links_on', 'INTEGER NOT NULL DEFAULT 1');
// Couleur du badge PLUS (vide = couleur par défaut ; jamais le rouge, réservé à l'administration).
addColumn('users', 'badge_color', "TEXT NOT NULL DEFAULT ''");
// Plateforme du jeu (Steam, Epic, PlayStation…).
addColumn('user_games', 'platform', "TEXT NOT NULL DEFAULT ''");
// Suivi d'un appel en cours : qui l'a lancé, quand, et quand il a été décroché (0 = pas décroché).
db.exec(`CREATE TABLE IF NOT EXISTS call_states (room TEXT PRIMARY KEY, caller_id TEXT NOT NULL, started_at INTEGER NOT NULL, answered_at INTEGER NOT NULL DEFAULT 0)`);
// Statistiques de jeux affichées dans le profil (3 maximum par membre).
db.exec(`
CREATE TABLE IF NOT EXISTS user_games (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  game TEXT NOT NULL,
  rank TEXT NOT NULL DEFAULT '',
  hours INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, position)
);
`);
db.exec(`
CREATE TABLE IF NOT EXISTS dm_reads (user_id TEXT NOT NULL, peer_id TEXT NOT NULL, read_at INTEGER NOT NULL, PRIMARY KEY (user_id, peer_id));
CREATE TABLE IF NOT EXISTS channel_reads (user_id TEXT NOT NULL, channel_id TEXT NOT NULL, read_at INTEGER NOT NULL, PRIMARY KEY (user_id, channel_id));
`);
// Anciens rôles sans position : ordre de création.
db.exec('UPDATE roles SET position = rowid WHERE position = 0');
db.exec(`
CREATE TABLE IF NOT EXISTS voice_signals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_id TEXT NOT NULL,
  from_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  payload TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_voice_signals_to ON voice_signals (to_id);
`);
