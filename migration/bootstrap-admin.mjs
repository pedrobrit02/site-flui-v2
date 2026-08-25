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

const id = crypto.randomUUID();
const hash = await hashPassword(password);
const emailLower = email.toLowerCase().replace(/'/g, "''");
const nameEscaped = name.replace(/'/g, "''");

const sql = `INSERT INTO admins (id, name, email, password_hash) VALUES ('${id}', '${nameEscaped}', '${emailLower}', '${hash}')`;

console.log("\nRode este comando (de dentro da pasta worker/) pra criar sua conta de admin:\n");
console.log(`npx wrangler@3 d1 execute flui-db --remote --command="${sql}"`);
console.log("\nDepois disso, entre em admin-login.html com este e-mail e senha.\n");
