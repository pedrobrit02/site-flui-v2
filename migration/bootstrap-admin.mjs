#!/usr/bin/env node
// Gera o comando SQL para criar a PRIMEIRA conta de admin do painel.
// (As contas seguintes podem ser criadas dentro do próprio painel, já
// logado — este script só resolve o problema do "ovo e da galinha" da
// primeira conta.)
//
// Uso (de dentro da pasta migration/):
//   node bootstrap-admin.mjs "Seu Nome" "seu@email.com" "sua-senha-aqui"
//
// Isso imprime um comando "npx wrangler@3 d1 execute ..." pronto pra rodar.

// Node 18 não expõe "crypto" como global automaticamente (só a partir do
// Node 19+). Isso garante que o script funcione em qualquer versão do Node.
import { webcrypto, randomUUID as nodeRandomUUID } from "node:crypto";
if (!globalThis.crypto) globalThis.crypto = webcrypto;

import { hashPassword } from "../worker/src/auth.js";

const [, , name, email, password] = process.argv;

if (!name || !email || !password) {
  console.error("Uso: node bootstrap-admin.mjs \"Nome\" \"email@exemplo.com\" \"senha\"");
  process.exit(1);
}

if (password.length < 8) {
  console.error("A senha precisa ter pelo menos 8 caracteres.");
  process.exit(1);
}

const id = (globalThis.crypto && globalThis.crypto.randomUUID) ? globalThis.crypto.randomUUID() : nodeRandomUUID();
const hash = await hashPassword(password);
const emailLower = email.toLowerCase().replace(/'/g, "''");
const nameEscaped = name.replace(/'/g, "''");

const sql = `INSERT INTO admins (id, name, email, password_hash) VALUES ('${id}', '${nameEscaped}', '${emailLower}', '${hash}')`;

// O hash da senha usa "$" como separador (ex: 100000$salt$hash). Se colarmos
// esse comando dentro de aspas duplas no bash/zsh sem escapar, o shell tenta
// interpretar "$salt"/"$hash" como variáveis inexistentes e apaga esse
// pedaço silenciosamente — corrompendo o hash sem nenhum erro visível.
// Escapamos aqui os caracteres especiais de dentro de aspas duplas
// (\, $, `, ") para que o comando impresso seja seguro de colar como está.
function escapeForDoubleQuotedShell(str) {
  return str.replace(/\\/g, "\\\\").replace(/\$/g, "\\$").replace(/`/g, "\\`").replace(/"/g, '\\"');
}

console.log("\nRode este comando (de qualquer pasta do projeto, com o wrangler configurado) pra criar sua conta de admin:\n");
console.log(`npx wrangler@3 d1 execute flui-db --remote --command="${escapeForDoubleQuotedShell(sql)}"`);
console.log("\nDepois disso, entre em admin-login.html com este e-mail e senha.\n");
