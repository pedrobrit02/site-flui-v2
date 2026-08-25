# Painel Administrativo do FLUI — Guia de Configuração

Este guia mostra o passo a passo para colocar o painel de administração no ar.
Depois de seguir tudo aqui, você vai ter:

- Uma página de login separada (`admin-login.html`)
- Um painel (`admin.html`) com abas de Solicitações de Uso, Solicitações de
  Empréstimo, Relatórios (gráficos), Acessos e Administradores
- Exportação em CSV (abre certinho no Excel/Google Sheets)
- Deferir/Indeferir com envio automático de e-mail para quem preencheu o
  formulário

Todos os comandos abaixo são para você rodar no terminal, dentro da pasta
`Flui-main` (onde está o `wrangler.toml`, dentro de `worker/`).

## 1. Criar o bucket privado no R2

Os termos de responsabilidade assinados (PDFs) agora ficam guardados num
bucket **privado** — diferente do `flui-assets` que guarda as imagens do
site, que é público. Crie o novo bucket:

```
cd worker
npx wrangler@3 r2 bucket create flui-uploads
```

## 2. Aplicar o novo schema do banco (D1)

Isso cria as tabelas novas: `admins`, `uso_solicitacoes`,
`emprestimo_solicitacoes` e `page_views`. Não mexe nas tabelas que já
existem (produtos, serviços, equipe, etc.).

```
npx wrangler@3 d1 execute flui-db --remote --file=./admin_schema.sql
```

## 3. Configurar os "segredos" do Worker

São 3 valores sensíveis que **não** ficam no código, só na Cloudflare:

```
npx wrangler@3 secret put SESSION_SECRET
```
Quando pedir o valor, cole uma string aleatória grande (pode gerar uma
rodando `openssl rand -hex 32` no terminal, ou usar qualquer gerador de senha
forte online). Guarde isso em local seguro — se precisar trocar depois, todo
mundo é deslogado do painel.

```
npx wrangler@3 secret put RESEND_API_KEY
```
Veja o passo 4 abaixo pra pegar essa chave.

```
npx wrangler@3 secret put RESEND_FROM
```
Cole algo como `FLUI FabLab <onboarding@resend.dev>` (veja passo 4).

## 4. Criar conta no Resend (envio de e-mail)

O Resend é o serviço que vai mandar o e-mail avisando a pessoa quando a
solicitação dela for deferida ou indeferida. Isso eu não consigo fazer por
você — precisa ser numa conta sua:

1. Acesse https://resend.com e crie uma conta gratuita.
2. No painel do Resend, vá em **API Keys** e crie uma chave nova. Essa é a
   `RESEND_API_KEY` do passo 3.
3. Pra começar rápido, sem configurar domínio próprio, você pode usar o
   remetente de teste que o Resend já libera: `onboarding@resend.dev`. Nesse
   caso, `RESEND_FROM` pode ser `FLUI FabLab <onboarding@resend.dev>`.
   - Atenção: o remetente de teste só envia e-mail pro endereço da sua
     própria conta Resend, então é bom pra testar mas não funciona pra
     avisar qualquer aluno. Quando quiser que funcione de verdade pra
     qualquer pessoa, o Resend tem um passo de "verificar domínio" (você
     adiciona uns registros DNS no domínio do IFMG ou de um domínio seu) —
     as instruções ficam dentro do próprio painel do Resend, em **Domains**.
   - Se preferir usar um domínio próprio desde já, é só verificar o domínio
     lá no Resend e usar algo como `FLUI FabLab <no-reply@seudominio.com>`
     em `RESEND_FROM`.
4. Se, por enquanto, você não quiser mexer com Resend, pode pular esse passo
   — o painel funciona normalmente sem ele, só que o e-mail de aviso não é
   enviado (fica só registrado no navegador um aviso silencioso; a decisão
   em si é salva certinho no banco).

## 5. Criar o primeiro administrador

Rode o script abaixo trocando pelo seu nome, e-mail e uma senha (mínimo 8
caracteres):

```
cd ../migration
node bootstrap-admin.mjs "Seu Nome" "seuemail@exemplo.com" "sua-senha-aqui"
```

Isso vai imprimir um comando `npx wrangler@3 d1 execute ...` pronto — copie
e cole esse comando exatamente como ele aparecer, pra criar o seu usuário
admin no banco de produção. Você pode rodar esse script de novo, quantas
vezes quiser, pra criar outras contas (ou criar direto pelo painel, na aba
"Administradores", depois de logado).

## 6. Publicar o Worker

```
cd ../worker
npx wrangler@3 deploy
```

## 7. Subir o site (com as páginas novas do admin)

O login e o painel ficam em `admin-login.html` e `admin.html`, na raiz do
site — já estão dentro da pasta `docs/`, junto com `index.html`. É só
mandar tudo pro GitHub como de costume:

```
cd ..
git add .
git commit -m "Adiciona painel administrativo com login, relatorios e exportacao"
git push
```

Depois do deploy do GitHub Pages terminar (leva uns 1-2 minutos), o login
fica em:

```
https://pedrobrit02.github.io/site-flui-v2/admin-login.html
```

## Resumo do que cada coisa faz

- **`admin-login.html`** — tela de login. Sem conta cadastrada, ninguém
  entra.
- **`admin.html`** — o painel em si, só acessível logado.
- **Aba "Solicitações de Uso" / "Solicitações de Empréstimo"** — lista tudo
  que foi preenchido nos formulários do site, com filtro por status
  (pendente/deferido/indeferido), baixar o PDF do termo anexado, exportar
  pra CSV, e o botão de Deferir/Indeferir (que dispara o e-mail).
- **Aba "Relatórios"** — gráficos simples mostrando quais equipamentos são
  mais usados e quais materiais são mais emprestados.
- **Aba "Acessos"** — quantas visitas cada página do site recebeu, com
  filtro por período.
- **Aba "Administradores"** — criar novas contas de admin (sem precisar
  rodar o script pelo terminal depois da primeira vez).

## Perguntas frequentes

**E se eu esquecer a senha de admin?**
Rode o `bootstrap-admin.mjs` de novo com o mesmo e-mail e uma senha nova —
como o e-mail é único na tabela, você vai precisar primeiro apagar o
registro antigo. Me avise que te passo o comando exato quando precisar.

**As respostas antigas dos formulários (antes de hoje) aparecem no painel?**
Não — só entram no banco (e por consequência no painel) as respostas
enviadas a partir de agora, depois desse deploy. As planilhas do Google
continuam recebendo tudo normalmente, como sempre receberam, e não são
afetadas.

**Se o Cloudflare cair, para de funcionar o formulário do site?**
Não. O envio pro Google Sheets continua sendo o principal e não depende do
Cloudflare. O envio pro banco (D1) é uma segunda cópia, silenciosa: se
falhar por qualquer motivo, a pessoa nem percebe — só o painel administrativo
que fica sem aquela resposta até o Cloudflare voltar.
