import type Database from 'better-sqlite3';

export const SCHEMA_SQL = `
-- 1. Tabela Principal de Demandas (Pinos de Zeladoria)
CREATE TABLE IF NOT EXISTS issues (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  severity INTEGER NOT NULL CHECK(severity BETWEEN 1 AND 5),

  auxiliary_data TEXT,

  raw_latitude REAL,
  raw_longitude REAL,
  latitude REAL NOT NULL,
  longitude REAL NOT NULL,
  street_name TEXT NOT NULL,
  street_group_key TEXT NOT NULL,
  neighborhood TEXT NOT NULL,
  reference_point TEXT,
  location_source TEXT NOT NULL,
  gps_accuracy_meters REAL,

  photo_url TEXT,
  exif_captured_at TEXT,
  exif_latitude REAL,
  exif_longitude REAL,
  exif_distance_meters REAL,
  exif_verified_local INTEGER DEFAULT 0,

  author_name TEXT,
  device_hash TEXT NOT NULL,
  trust_score INTEGER NOT NULL DEFAULT 70,
  moderation_status TEXT NOT NULL DEFAULT 'auto_approved',
  is_shadowbanned INTEGER NOT NULL DEFAULT 0,

  resolution_status TEXT NOT NULL DEFAULT 'open',
  official_status TEXT NOT NULL DEFAULT 'received',
  official_protocol_number TEXT,

  upvotes_count INTEGER NOT NULL DEFAULT 1,
  consensus_score REAL NOT NULL DEFAULT 0.0,
  reopened_count INTEGER NOT NULL DEFAULT 0,

  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_issues_street_group ON issues(street_group_key);
CREATE INDEX IF NOT EXISTS idx_issues_coords ON issues(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_issues_device ON issues(device_hash);
CREATE INDEX IF NOT EXISTS idx_issues_status ON issues(resolution_status, moderation_status);

-- 2. Tabela de Votos e Validações Comunitárias Waze
CREATE TABLE IF NOT EXISTS issue_votes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  vote_type TEXT NOT NULL,
  voter_latitude REAL,
  voter_longitude REAL,
  distance_to_issue_meters REAL,
  is_presential_gps INTEGER NOT NULL DEFAULT 0,
  has_proof_photo INTEGER NOT NULL DEFAULT 0,
  proof_photo_url TEXT,
  vote_weight REAL NOT NULL,
  note TEXT,
  is_shadowbanned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_votes_issue ON issue_votes(issue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_votes_device ON issue_votes(device_hash);

-- 3. Tabela de Contribuições Agrupadas (Fusão de Raio Curto <= 40m)
CREATE TABLE IF NOT EXISTS issue_contributions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  device_hash TEXT NOT NULL,
  author_name TEXT,
  note TEXT,
  photo_url TEXT,
  exif_captured_at TEXT,
  exif_verified_local INTEGER DEFAULT 0,
  is_shadowbanned INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_contributions_issue ON issue_contributions(issue_id, created_at);
CREATE INDEX IF NOT EXISTS idx_contributions_device ON issue_contributions(device_hash);

-- 4. Linha do Tempo Auditável do Chamado
CREATE TABLE IF NOT EXISTS issue_timeline (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  issue_id TEXT NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_timeline_issue ON issue_timeline(issue_id, created_at);

-- 5. Dispositivos Bloqueados e Shadowban (Defesa Anti-Troll)
CREATE TABLE IF NOT EXISTS blocked_devices (
  device_hash TEXT PRIMARY KEY,
  reason TEXT,
  shadowban INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
`;

export function initSchema(db: Database.Database): void {
  db.exec(SCHEMA_SQL);
}
