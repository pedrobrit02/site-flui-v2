# Site do FLUI

## Como rodar localmente

1. Abra o terminal **dentro desta pasta** (a que contém o `package.json`,
   `index.html`, `uso.html` etc.):
   ```
   cd caminho/para/Flui-main
   ```
   Todos os comandos abaixo precisam ser rodados de dentro dela.

2. Instale as dependências (só precisa fazer isso uma vez, ou de novo se
   apagar a pasta `node_modules`):
   ```
   npm install
   ```

3. Rode o servidor de desenvolvimento:
   ```
   npm run dev
   ```
   O terminal vai mostrar um endereço, normalmente `http://localhost:5173/`.

4. **Abra exatamente esse endereço no navegador — só a raiz, sem acrescentar
   o nome da pasta do projeto na URL** (ex: não abra
   `http://localhost:5173/Flui/` nem `http://localhost:5173/Flui-main/`).
   Se acrescentar algo depois da porta, o Vite mostra a página sem nenhum
   estilo (CSS quebrado), porque tenta carregar os arquivos a partir desse
   caminho que não existe.

5. A partir da página inicial, os links "Uso" e "Empréstimo" no menu
   funcionam normalmente.

## Como gerar o site para publicar (GitHub Pages)

```
npm run build
```

Isso atualiza a pasta `docs/`, que é a publicada. Depois é só commitar e
enviar (`git add`, `git commit`, `git push`) para o repositório.

## Sobre a pasta `node_modules`

Ela é recriada automaticamente pelo `npm install` sempre que precisar. Pode
apagá-la com segurança quando não estiver usando o projeto — ela não deve
ser enviada ao Git (já está no `.gitignore`) nem incluída em backups manuais
ou ao compartilhar a pasta com outras pessoas.

## Migração para Cloudflare D1

Veja `MIGRATION.md` para o passo a passo de trocar a fonte de dados do site
(equipe, serviços, projetos) do Supabase para um banco Cloudflare D1.
