// Endpoints de conta de usuário/patrono (cadastro e login da Biblioteca
// FLUI) — separado do painel administrativo (worker/src/admin.js): usa a
// tabela `usuarios` e um cookie de sessão próprio (flui_user_session), então
// uma conta de patrono nunca ganha acesso ao painel admin.

import { json } from "./util.js";
import {
  hashPassword,
  verifyPassword,
  createSessionToken,
  userSessionCookieHeader,
  clearUserSessionCookieHeader,
  requireUsuario,
} from "./auth.js";

const VINCULOS_VALIDOS = ["estudante", "docente", "servidor", "externo"];

function usuarioPublico(row) {
  return {
    id: row.id,
    nome: row.nome,
    email: row.email,
    matricula: row.matricula || null,
    curso_setor: row.curso_setor || null,
    vinculo: row.vinculo || null,
  };
}

export async function handleCadastroUsuario(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(request, { error: "JSON inválido" }, 400);
  }

  const nome = String(body.nome || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  const matricula = body.matricula ? String(body.matricula).trim() : null;
  const cursoSetor = String(body.curso_setor || "").trim();
  const vinculo = String(body.vinculo || "").trim().toLowerCase();

  if (!nome || !email || !password) {
    return json(request, { error: "Nome, e-mail e senha são obrigatórios" }, 400);
  }
  if (password.length < 8) {
    return json(request, { error: "A senha precisa ter pelo menos 8 caracteres" }, 400);
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(request, { error: "E-mail inválido" }, 400);
  }
  if (!cursoSetor) {
    return json(request, { error: "Curso/setor é obrigatório" }, 400);
  }
  if (vinculo && !VINCULOS_VALIDOS.includes(vinculo)) {
    return json(request, { error: "Vínculo inválido" }, 400);
  }

  const existente = await env.DB.prepare("SELECT id FROM usuarios WHERE email = ?").bind(email).first();
  if (existente) {
    return json(request, { error: "Já existe uma conta com esse e-mail" }, 409);
  }

  const id = crypto.randomUUID();
  const passwordHash = await hashPassword(password);
  await env.DB.prepare(
    `INSERT INTO usuarios (id, nome, email, password_hash, matricula, curso_setor, vinculo)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(id, nome, email, passwordHash, matricula, cursoSetor, vinculo || null)
    .run();

  const token = await createSessionToken({ usuarioId: id, nome, email }, env.SESSION_SECRET);
  const res = json(
    request,
    { ok: true, usuario: usuarioPublico({ id, nome, email, matricula, curso_setor: cursoSetor, vinculo }) },
    201
  );
  res.headers.append("Set-Cookie", userSessionCookieHeader(token));
  return res;
}

export async function handleLoginUsuario(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(request, { error: "JSON inválido" }, 400);
  }
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return json(request, { error: "E-mail e senha são obrigatórios" }, 400);

  const usuario = await env.DB.prepare("SELECT * FROM usuarios WHERE email = ?").bind(email).first();
  if (!usuario) return json(request, { error: "E-mail ou senha inválidos" }, 401);

  const ok = await verifyPassword(password, usuario.password_hash);
  if (!ok) return json(request, { error: "E-mail ou senha inválidos" }, 401);

  const token = await createSessionToken(
    { usuarioId: usuario.id, nome: usuario.nome, email: usuario.email },
    env.SESSION_SECRET
  );
  const res = json(request, { ok: true, usuario: usuarioPublico(usuario) });
  res.headers.append("Set-Cookie", userSessionCookieHeader(token));
  return res;
}

export async function handleLogoutUsuario(request) {
  const res = json(request, { ok: true });
  res.headers.append("Set-Cookie", clearUserSessionCookieHeader());
  return res;
}

export async function handleMeUsuario(request, env) {
  const session = await requireUsuario(request, env);
  if (!session) return json(request, { error: "Não autenticado" }, 401);

  const usuario = await env.DB.prepare("SELECT * FROM usuarios WHERE id = ?").bind(session.usuarioId).first();
  if (!usuario) return json(request, { error: "Não autenticado" }, 401);

  return json(request, { usuario: usuarioPublico(usuario) });
}
