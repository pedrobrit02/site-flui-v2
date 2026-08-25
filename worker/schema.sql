-- Esquema do banco de dados Cloudflare D1 para o site do FLUI.
-- Espelha a estrutura real que existia no Supabase (enviada pelo usuário),
-- adaptada para SQLite/D1: uuid -> TEXT, jsonb -> TEXT (JSON serializado),
-- text[] -> TEXT (JSON array serializado), timestamptz -> TEXT (ISO 8601).
-- Row Level Security não existe no D1: o controle de acesso é feito pelo
-- próprio Worker, que só expõe endpoints de leitura (GET).

CREATE TABLE IF NOT EXISTS site_meta (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL DEFAULT '{}',   -- JSON serializado
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS services (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  image_path TEXT,
  position INTEGER DEFAULT 0,
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subtitle TEXT,
  body TEXT NOT NULL DEFAULT '{}',     -- JSON serializado
  image_path TEXT,
  partners TEXT NOT NULL DEFAULT '[]', -- JSON array serializado
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  full_name TEXT NOT NULL,
  role TEXT,
  summary TEXT,
  details TEXT NOT NULL DEFAULT '{}',  -- JSON serializado
  image_path TEXT,
  type TEXT NOT NULL CHECK (type IN ('docente', 'bolsista')),
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS team_members (
  id TEXT PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id) ON DELETE CASCADE,
  visible INTEGER DEFAULT 1,
  order_index INTEGER DEFAULT 0,
  inserted_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_people_type ON people(type);
CREATE INDEX IF NOT EXISTS idx_team_members_visible ON team_members(visible, order_index);
