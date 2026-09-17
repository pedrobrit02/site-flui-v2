-- Contas de usuário/patrono (cadastro da Biblioteca FLUI) — separado da
-- tabela `admins` (que é só pra equipe do FabLab). Aplicar uma vez, depois
-- de schema.sql e admin_schema.sql, no mesmo banco D1 (flui-db):
--   npx wrangler@3 d1 execute flui-db --remote --file=./schema_usuarios.sql

CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,  -- PBKDF2-SHA256, formato: iterações$salt_hex$hash_hex
  matricula TEXT,
  curso_setor TEXT,
  vinculo TEXT,                  -- 'estudante' | 'docente' | 'servidor' | 'externo'
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);
