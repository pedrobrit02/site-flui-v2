-- Adiciona o link do Currículo Lattes de cada docente dentro do campo JSON
-- `details` (chave "lattes_url"), usado pelo site pra abrir o Lattes direto
-- ao clicar no perfil, em vez do modal com a bio estática. Aplicar uma vez,
-- no mesmo banco D1 (flui-db):
--   npx wrangler@3 d1 execute flui-db --remote --file=./migration_lattes.sql
--
-- Os bolsistas ainda não têm link de Lattes definido — quando tiver, rodar
-- um UPDATE igual a esses pra cada um (troque nome e URL):
--   UPDATE people SET details = json_set(details, '$.lattes_url', 'URL_AQUI')
--   WHERE full_name = 'Nome Completo' AND type = 'bolsista';

UPDATE people
SET details = json_set(details, '$.lattes_url', 'http://lattes.cnpq.br/4034444219840272')
WHERE full_name = 'Carlos Dias da Silva Júnior' AND type = 'docente';

UPDATE people
SET details = json_set(details, '$.lattes_url', 'http://lattes.cnpq.br/5770909602565313')
WHERE full_name = 'Luciana Emirena dos Santos Carneiro' AND type = 'docente';

UPDATE people
SET details = json_set(details, '$.lattes_url', 'http://lattes.cnpq.br/1397003747649280')
WHERE full_name = 'Robert Luiz Gomes' AND type = 'docente';

UPDATE people
SET details = json_set(details, '$.lattes_url', 'http://lattes.cnpq.br/8427145295817052')
WHERE full_name = 'Mateus Andrade Ferreira' AND type = 'docente';

UPDATE people
SET details = json_set(details, '$.lattes_url', 'http://lattes.cnpq.br/1176141467543002')
WHERE full_name = 'Edson Antunes Quaresma Júnior' AND type = 'docente';
