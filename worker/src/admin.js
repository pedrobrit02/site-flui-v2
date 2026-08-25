// Endpoints do painel administrativo: login, listagem de solicitações,
// deferir/indeferir (com e-mail), estatísticas, exportação CSV e gestão de
// contas de admin. Todas as rotas (exceto /login) exigem sessão válida.

import { json, safeParse, toCsv, corsHeaders } from "./util.js";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  sessionCookieHeader,
  clearSessionCookieHeader,
  requireAdmin,
} from "./auth.js";
import { enviarEmailDecisao } from "./email.js";

const TIPOS = {
  uso: {
    table: "uso_solicitacoes",
    itensCampo: "equipamentos",
    dataCampo: "inicio",
  },
  emprestimo: {
    table: "emprestimo_solicitacoes",
    itensCampo: "materiais",
    dataCampo: "data_retirada",
  },
};

export async function handleLogin(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(request, { error: "JSON inválido" }, 400);
  }
  const { email, password } = body;
  if (!email || !password) return json(request, { error: "E-mail e senha são obrigatórios" }, 400);

  const admin = await env.DB.prepare("SELECT * FROM admins WHERE email = ?").bind(email.toLowerCase()).first();
  if (!admin) return json(request, { error: "E-mail ou senha inválidos" }, 401);

  const ok = await verifyPassword(password, admin.password_hash);
  if (!ok) return json(request, { error: "E-mail ou senha inválidos" }, 401);

  const token = await createSessionToken(
    { adminId: admin.id, name: admin.name, email: admin.email },
    env.SESSION_SECRET
  );

  const res = json(request, { ok: true, admin: { id: admin.id, name: admin.name, email: admin.email } });
  res.headers.append("Set-Cookie", sessionCookieHeader(token));
  return res;
}

export async function handleLogout(request) {
  const res = json(request, { ok: true });
  res.headers.append("Set-Cookie", clearSessionCookieHeader());
  return res;
}

export async function handleMe(request, env) {
  const session = await requireAdmin(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);
  return json(request, { admin: { id: session.adminId, name: session.name, email: session.email } });
}

export async function handleListSolicitacoes(request, env, url) {
  const session = await requireAdmin(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);

  const tipo = url.searchParams.get("tipo") === "emprestimo" ? "emprestimo" : "uso";
  const status = url.searchParams.get("status");
  const { table, itensCampo } = TIPOS[tipo];

  let query = `SELECT * FROM ${table}`;
  const binds = [];
  if (status) {
    query += " WHERE status = ?";
    binds.push(status);
  }
  query += " ORDER BY created_at DESC LIMIT 500";

  const { results } = await env.DB.prepare(query).bind(...binds).all();
  const parsed = results.map((r) => ({
    ...r,
    [itensCampo]: safeParse(r[itensCampo], []),
    tem_termo: !!r.termo_r2_key,
    termo_r2_key: undefined,
  }));
  return json(request, { tipo, solicitacoes: parsed });
}

export async function handleDecidir(request, env, tipo, id) {
  const session = await requireAdmin(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);

  if (!TIPOS[tipo]) return json(request, { error: "Tipo inválido" }, 400);
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(request, { error: "JSON inválido" }, 400);
  }
  if (!["deferido", "indeferido"].includes(body.status)) {
    return json(request, { error: "status deve ser 'deferido' ou 'indeferido'" }, 400);
  }

  const { table } = TIPOS[tipo];
  const row = await env.DB.prepare(`SELECT * FROM ${table} WHERE id = ?`).bind(id).first();
  if (!row) return json(request, { error: "Solicitação não encontrada" }, 404);

  await env.DB.prepare(
    `UPDATE ${table} SET status = ?, decided_by = ?, decided_at = datetime('now') WHERE id = ?`
  )
    .bind(body.status, session.adminId, id)
    .run();

  const emailResult = await enviarEmailDecisao(env, {
    destinatario: row.email,
    nome: row.nome,
    tipo,
    status: body.status,
    motivo: body.motivo,
  });

  return json(request, { ok: true, email: emailResult });
}

export async function handleTermoDownload(request, env, tipo, id) {
  const session = await requireAdmin(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);
  if (!TIPOS[tipo]) return json(request, { error: "Tipo inválido" }, 400);

  const { table } = TIPOS[tipo];
  const row = await env.DB.prepare(`SELECT termo_r2_key, termo_file_name FROM ${table} WHERE id = ?`)
    .bind(id)
    .first();
  if (!row || !row.termo_r2_key) return json(request, { error: "Termo não encontrado" }, 404);

  const object = await env.UPLOADS_BUCKET.get(row.termo_r2_key);
  if (!object) return json(request, { error: "Arquivo não encontrado no armazenamento" }, 404);

  const headers = new Headers(corsHeaders(request));
  headers.set("Content-Type", "application/pdf");
  headers.set("Content-Disposition", `attachment; filename="${row.termo_file_name || "termo.pdf"}"`);
  return new Response(object.body, { headers });
}

function contarItens(rows, campo) {
  const contagem = {};
  for (const row of rows) {
    const itens = safeParse(row[campo], []);
    for (const item of itens) {
      const nomeItem = typeof item === "string" ? item : item?.nome;
      if (!nomeItem) continue;
      contagem[nomeItem] = (contagem[nomeItem] || 0) + 1;
    }
  }
  return Object.entries(contagem)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);
}

export async function handleStats(request, env) {
  const session = await requireAdmin(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);

  const [usoRows, emprestimoRows] = await Promise.all([
    env.DB.prepare("SELECT status, equipamentos FROM uso_solicitacoes").all(),
    env.DB.prepare("SELECT status, materiais FROM emprestimo_solicitacoes").all(),
  ]);

  const contarStatus = (rows) => {
    const out = { pendente: 0, deferido: 0, indeferido: 0 };
    for (const r of rows) out[r.status] = (out[r.status] || 0) + 1;
    return out;
  };

  return json(request, {
    uso: {
      total: usoRows.results.length,
      por_status: contarStatus(usoRows.results),
      equipamentos_mais_usados: contarItens(usoRows.results, "equipamentos"),
    },
    emprestimo: {
      total: emprestimoRows.results.length,
      por_status: contarStatus(emprestimoRows.results),
      materiais_mais_emprestados: contarItens(emprestimoRows.results, "materiais"),
    },
  });
}

export async function handlePageviewStats(request, env, url) {
  const session = await requireAdmin(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);

  const dias = Math.min(parseInt(url.searchParams.get("dias") || "30", 10) || 30, 180);

  const { results: porPagina } = await env.DB.prepare(
    `SELECT path, COUNT(*) as total FROM page_views
     WHERE created_at >= datetime('now', ?)
     GROUP BY path`
  )
    .bind(`-${dias} days`)
    .all();

  const { results: porDia } = await env.DB.prepare(
    `SELECT date(created_at) as dia, COUNT(*) as total FROM page_views
     WHERE created_at >= datetime('now', ?)
     GROUP BY dia ORDER BY dia ASC`
  )
    .bind(`-${dias} days`)
    .all();

  const totalGeral = porPagina.reduce((acc, r) => acc + r.total, 0);

  return json(request, { dias, total: totalGeral, por_pagina: porPagina, por_dia: porDia });
}

export async function handleExportCsv(request, env, url) {
  const session = await requireAdmin(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);

  const tipo = url.searchParams.get("tipo") === "emprestimo" ? "emprestimo" : "uso";
  const { table, itensCampo } = TIPOS[tipo];
  const { results } = await env.DB.prepare(`SELECT * FROM ${table} ORDER BY created_at DESC`).all();

  const colunasComuns = [
    { label: "ID", get: (r) => r.id },
    { label: "Nome", get: (r) => r.nome },
    { label: "Matrícula/ID", get: (r) => r.matricula_id },
    { label: "E-mail", get: (r) => r.email },
    { label: "Telefone", get: (r) => r.telefone },
    { label: "Setor", get: (r) => r.setor },
    {
      label: tipo === "emprestimo" ? "Materiais" : "Equipamentos",
      get: (r) =>
        safeParse(r[itensCampo], [])
          .map((it) => (typeof it === "string" ? it : `${it.nome} (${it.quantidade || 1})`))
          .join(", "),
    },
    { label: "Finalidade", get: (r) => r.finalidade },
    { label: "Observações", get: (r) => r.observacoes },
    { label: "Status", get: (r) => r.status },
    { label: "Decidido em", get: (r) => r.decided_at },
    { label: "Criado em", get: (r) => r.created_at },
  ];

  const csv = toCsv(results, colunasComuns);
  const headers = new Headers(corsHeaders(request));
  headers.set("Content-Type", "text/csv; charset=utf-8");
  headers.set("Content-Disposition", `attachment; filename="flui_${tipo}.csv"`);
  return new Response("﻿" + csv, { headers }); // BOM p/ acentos abrirem certo no Excel
}

export async function handleListAdmins(request, env) {
  const session = await requireAdmin(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);

  const { results } = await env.DB.prepare("SELECT id, name, email, created_at FROM admins ORDER BY created_at ASC").all();
  return json(request, { admins: results });
}

export async function handleCreateAdmin(request, env) {
  const session = await requireAdmin(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);

  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(request, { error: "JSON inválido" }, 400);
  }
  const { name, email, password } = body;
  if (!name || !email || !password || password.length < 8) {
    return json(request, { error: "Nome, e-mail e senha (mínimo 8 caracteres) são obrigatórios" }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM admins WHERE email = ?").bind(email.toLowerCase()).first();
  if (existing) return json(request, { error: "Já existe um admin com esse e-mail" }, 409);

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await env.DB.prepare("INSERT INTO admins (id, name, email, password_hash) VALUES (?, ?, ?, ?)")
    .bind(id, name, email.toLowerCase(), passwordHash)
    .run();

  return json(request, { ok: true, admin: { id, name, email: email.toLowerCase() } }, 201);
}
