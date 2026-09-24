-- Adiciona as colunas usadas pelo login via SUAP (OAuth2) na tabela
-- `usuarios`. Contas criadas/vinculadas pelo SUAP não têm senha própria
-- (login é sempre pelo SUAP) e ficam marcadas com via_suap = 1. Aplicar uma
-- vez, no mesmo banco D1 (flui-db):
--   npx wrangler@3 d1 execute flui-db --remote --file=./migration_suap.sql

ALTER TABLE usuarios ADD COLUMN suap_id TEXT;
ALTER TABLE usuarios ADD COLUMN via_suap INTEGER DEFAULT 0;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_suap_id ON usuarios(suap_id);
