-- Esquema adicional do painel administrativo: contas de admin, respostas dos
-- formulários (Uso e Empréstimo) e contagem de acessos às páginas.
-- Aplicar depois de schema.sql, no mesmo banco D1 (flui-db).

CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,  -- PBKDF2-SHA256, formato: iterações$salt_hex$hash_hex
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS uso_solicitacoes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  matricula_id TEXT,
  email TEXT NOT NULL,
  telefone TEXT,
  setor TEXT,
  equipamentos TEXT NOT NULL DEFAULT '[]',  -- JSON array de strings
  inicio TEXT,
  fim TEXT,
  finalidade TEXT,
  observacoes TEXT,
  termo_r2_key TEXT,             -- chave do PDF assinado no bucket privado
  termo_file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'deferido', 'indeferido')),
  decided_by TEXT REFERENCES admins(id),
  decided_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emprestimo_solicitacoes (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  matricula_id TEXT,
  email TEXT NOT NULL,
  telefone TEXT,
  setor TEXT,
  materiais TEXT NOT NULL DEFAULT '[]',  -- JSON array de {nome, quantidade}
  data_retirada TEXT,
  data_devolucao TEXT,
  finalidade TEXT,
  observacoes TEXT,
  termo_r2_key TEXT,
  termo_file_name TEXT,
  status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'deferido', 'indeferido')),
  decided_by TEXT REFERENCES admins(id),
  decided_at TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS page_views (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  path TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_uso_status ON uso_solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_uso_created ON uso_solicitacoes(created_at);
CREATE INDEX IF NOT EXISTS idx_emprestimo_status ON emprestimo_solicitacoes(status);
CREATE INDEX IF NOT EXISTS idx_emprestimo_created ON emprestimo_solicitacoes(created_at);
CREATE INDEX IF NOT EXISTS idx_pageviews_path_date ON page_views(path, created_at);
