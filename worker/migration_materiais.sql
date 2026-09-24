-- Adiciona o registro de consumo de materiais (filamento e MDF) às
-- solicitações de Uso e Empréstimo. Aplicar uma vez, depois de schema.sql
-- e admin_schema.sql, no mesmo banco D1 (flui-db):
--   npx wrangler@3 d1 execute flui-db --remote --file=./migration_materiais.sql

ALTER TABLE uso_solicitacoes ADD COLUMN filamento_kg REAL;
ALTER TABLE uso_solicitacoes ADD COLUMN mdf_metros REAL;

ALTER TABLE emprestimo_solicitacoes ADD COLUMN filamento_kg REAL;
ALTER TABLE emprestimo_solicitacoes ADD COLUMN mdf_metros REAL;
