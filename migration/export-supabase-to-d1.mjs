// Roda UMA VEZ, localmente (precisa de internet), para copiar os dados que
// hoje estão no Supabase para dentro do arquivo migration/seed.sql — que é
// depois importado no banco Cloudflare D1.
//
// Uso:
//   cd migration
//   npm install
//   node export-supabase-to-d1.mjs
//
// Isso gera "seed.sql" nesta mesma pasta. Depois, no Cloudflare:
//   cd ../worker
//   wrangler d1 execute flui-db --remote --file=../migration/seed.sql

import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "fs";

// Mesma URL/chave pública (anon) já usadas hoje em supabase.js.
const SUPABASE_URL = "https://mvpumfqkjaybssiffkqb.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_6aVOghFz7fQWVDxg2k5AqQ_2gpJ1F1d";

const db = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

function esc(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  if (typeof value === "object") value = JSON.stringify(value);
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function main() {
  let sql = "";
  let totalLinhas = 0;

  const { data: siteMeta, error: e1 } = await db.from("site_meta").select("*");
  if (e1) console.error("Aviso ao ler site_meta:", e1.message);
  for (const row of siteMeta || []) {
    sql += `INSERT INTO site_meta (key, value, inserted_at) VALUES (${esc(row.key)}, ${esc(row.value)}, ${esc(row.inserted_at)});\n`;
    totalLinhas++;
  }

  const { data: services, error: e2 } = await db.from("services").select("*");
  if (e2) console.error("Aviso ao ler services:", e2.message);
  for (const row of services || []) {
    sql += `INSERT INTO services (id, title, description, image_path, position) VALUES (${esc(row.id)}, ${esc(row.title)}, ${esc(row.description)}, ${esc(row.image_path)}, ${esc(row.position)});\n`;
    totalLinhas++;
  }

  const { data: projects, error: e3 } = await db.from("projects").select("*");
  if (e3) console.error("Aviso ao ler projects:", e3.message);
  for (const row of projects || []) {
    sql += `INSERT INTO projects (id, title, subtitle, body, inserted_at) VALUES (${esc(row.id)}, ${esc(row.title)}, ${esc(row.subtitle)}, ${esc(row.body)}, ${esc(row.inserted_at)});\n`;
    totalLinhas++;
  }

  const { data: people, error: e4 } = await db.from("people").select("*");
  if (e4) console.error("Aviso ao ler people:", e4.message);
  for (const row of people || []) {
    sql += `INSERT INTO people (id, full_name, role, summary, details, image_path, type, inserted_at) VALUES (${esc(row.id)}, ${esc(row.full_name)}, ${esc(row.role)}, ${esc(row.summary)}, ${esc(row.details)}, ${esc(row.image_path)}, ${esc(row.type)}, ${esc(row.inserted_at)});\n`;
    totalLinhas++;
  }

  const { data: teamMembers, error: e5 } = await db
    .from("team_members")
    .select("id, visible, order_index, people (id)");
  if (e5) console.error("Aviso ao ler team_members:", e5.message);
  for (const row of teamMembers || []) {
    sql += `INSERT INTO team_members (id, visible, order_index, person_id) VALUES (${esc(row.id)}, ${row.visible ? 1 : 0}, ${esc(row.order_index)}, ${esc(row.people?.id)});\n`;
    totalLinhas++;
  }

  writeFileSync("seed.sql", sql);
  console.log(`seed.sql gerado com sucesso (${totalLinhas} linhas).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
