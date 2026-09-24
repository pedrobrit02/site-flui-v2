-- Adiciona as colunas usadas pelo login via Google/Microsoft/GitHub (OAuth2)
-- na tabela `usuarios`. Contas criadas por esses provedores não têm senha
-- própria (login é sempre pelo provedor). Aplicar uma vez, no mesmo banco D1
-- (flui-db):
--   npx wrangler@3 d1 execute flui-db --remote --file=./migration_oauth.sql

ALTER TABLE usuarios ADD COLUMN oauth_provider TEXT;
ALTER TABLE usuarios ADD COLUMN oauth_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_usuarios_oauth ON usuarios(oauth_provider, oauth_id);
