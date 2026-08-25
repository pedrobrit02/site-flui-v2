# Migração do FLUI: Supabase → Cloudflare

Isso resolve o problema relatado: o projeto gratuito do Supabase fica
inativo ("pausado") de tempos em tempos por falta de uso, o que derrubava as
seções de equipe, serviços, projetos **e as fotos** do site. O Cloudflare
(D1 + Workers + R2) não tem essa pausa automática por inatividade.

Os formulários de Uso e Empréstimo **não são afetados** por esta migração —
eles enviam dados para o Google Apps Script, não para o Supabase.

## Status

- ✅ **Banco de dados (D1):** feito. O site já lê `site_meta`, `services`,
  `projects`, `people` e `team_members` do Cloudflare Worker
  (`https://flui-api.pedro-brito-flui.workers.dev`), não mais do Supabase.
- ⏳ **Imagens (R2):** falta rodar o passo a passo abaixo. Até lá, as fotos
  (equipe, projetos) continuam vindo do Supabase Storage — se o Supabase
  pausar, elas somem, mesmo com o banco já migrado (a pausa do projeto
  Supabase afeta banco e storage juntos).

## O que já está pronto para as imagens

- `worker/src/index.js` — já tem uma rota nova, `/assets/*`, que serve
  arquivos de um bucket R2 (testei localmente com Miniflare: acerto, erro
  404 e as rotas antigas de API continuam funcionando normalmente).
- `worker/wrangler.toml` — já tem o binding do bucket R2 configurado
  (`ASSETS_BUCKET` → bucket `flui-assets`).
- `cloudflare-api.js` — `getImageUrl` já aponta para
  `https://flui-api.pedro-brito-flui.workers.dev/assets/<arquivo>` em vez do
  Supabase Storage.
- `migration/migrate-images-to-r2.sh` — script que cria o bucket e sobe as
  16 imagens usadas no site (5 dos serviços, 2 de projetos, 9 de
  equipe/bolsistas). Ele usa as cópias que já existem em `./assets` quando
  existem (5 imagens) e baixa do Supabase Storage as que só existem lá (11
  fotos de pessoas e as demais). Testei a lógica do script (detecção de
  arquivo local vs. download, e os comandos de upload) simulando os
  comandos — só não pude rodar contra o Cloudflare/Supabase de verdade
  porque este ambiente sandbox não tem acesso à internet aberta.

## Passo a passo — imagens (R2)

1. **Publique o Worker atualizado** (já tem a rota `/assets/*`):
   ```
   cd worker
   npx wrangler@3 deploy
   ```

2. **Rode o script de migração das imagens**, na raiz do projeto (onde tem a
   pasta `assets/`):
   ```
   cd ..
   chmod +x migration/migrate-images-to-r2.sh
   ./migration/migrate-images-to-r2.sh
   ```
   Isso cria o bucket `flui-assets` e sobe as 16 imagens (local quando
   existe, ou baixando do Supabase quando só existe lá).

3. **Teste uma imagem direto no navegador**, por exemplo:
   ```
   https://flui-api.pedro-brito-flui.workers.dev/assets/logo-flui.png
   ```
   Se aparecer a imagem, está funcionando.

4. **Gere o site atualizado e publique:**
   ```
   npm run build
   git add .
   git commit -m "Migra imagens para Cloudflare R2"
   git push
   ```

Depois disso, o site FLUI não depende mais do Supabase em nenhum ponto
(banco de dados nem imagens) — só o Google Apps Script continua recebendo os
formulários de Uso e Empréstimo, como sempre.

## O que eu não posso fazer por você

Os comandos acima exigem estar logado na sua conta Cloudflare (o mesmo login
que você já fez para o D1) — isso só pode ser feito por você, na sua
máquina. Preparei tudo para que sejam poucos passos; me cole aqui o
resultado de cada comando que eu confirmo e sigo para o próximo.

## Sobre a pasta `node_modules`

Ela já está no `.gitignore` e pode ser apagada com segurança a qualquer
momento — é recriada automaticamente rodando `npm install` sempre que você
precisar trabalhar no projeto ou compilar (`npm run build`) de novo. Ela não
precisa ir para o Git nem para nenhum backup manual.

## Referência: migração do banco de dados (D1) — já concluída

- `worker/schema.sql` — cria as tabelas no D1.
- `worker/seed.sql` — os dados reais do banco, já importados.
- `migration/export-supabase-to-d1.mjs` — script opcional, só necessário se
  você adicionar mais gente/projetos no Supabase antes de finalizar a troca
  e quiser gerar um `seed.sql` atualizado no futuro.
