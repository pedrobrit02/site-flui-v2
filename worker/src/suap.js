// Login via SUAP (OAuth2) — deixa alunos e servidores do IFMG entrarem na
// Biblioteca FLUI com a própria conta do SUAP, sem precisar criar senha
// nova. É a conta de USUÁRIO/patrono (tabela `usuarios`), igual à de
// e-mail/senha — não dá acesso ao painel admin.
//
// Fluxo padrão OAuth2 "Authorization Code":
//   1. handleSuapLogin    -> redireciona pro SUAP (/o/authorize/)
//   2. a pessoa loga e autoriza no próprio site do SUAP
//   3. o SUAP redireciona de volta pra handleSuapCallback com ?code=...
//   4. trocamos o code por um access_token (/o/token/)
//   5. buscamos o perfil (/api/eu/) e criamos/atualizamos a linha em `usuarios`
//   6. emitimos o mesmo cookie de sessão usado no login por e-mail/senha
//
// Antes de funcionar, precisa:
//   a) cadastrar a aplicação no SUAP (Nome livre, Client type: Confidential,
//      Authorization grant type: Authorization code, Redirect uris:
//      https://flui-api.pedro-brito-flui.workers.dev/api/auth/suap/callback)
//   b) configurar os secrets no Worker com os dados que o SUAP devolver:
//      npx wrangler@3 secret put SUAP_CLIENT_ID
//      npx wrangler@3 secret put SUAP_CLIENT_SECRET
//   c) rodar migration_suap.sql uma vez no banco D1 (adiciona as colunas
//      suap_id/via_suap na tabela usuarios)

import { createSessionToken, userSessionCookieHeader, hashPassword } from "./auth.js";

const SUAP_BASE = "https://suap.ifmg.edu.br";
const REDIRECT_URI = "https://flui-api.pedro-brito-flui.workers.dev/api/auth/suap/callback";
const FRONTEND_APOS_LOGIN = "https://pedrobrit02.github.io/site-flui-v2/biblioteca.html";
const FRONTEND_LOGIN = "https://pedrobrit02.github.io/site-flui-v2/login.html";
const STATE_COOKIE = "flui_suap_state";

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function stateCookieHeader(state) {
  // Curto (5 min) — só precisa sobreviver até a pessoa voltar do SUAP.
  // SameSite=Lax (em vez de None) porque é enviado de volta numa navegação
  // de topo (redirect), não numa chamada fetch entre origens diferentes.
  return `${STATE_COOKIE}=${encodeURIComponent(state)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`;
}

function clearStateCookieHeader() {
  return `${STATE_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function getCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const pair of header.split(";")) {
    const idx = pair.indexOf("=");
    if (idx === -1) continue;
    const k = pair.slice(0, idx).trim();
    if (k === name) return decodeURIComponent(pair.slice(idx + 1).trim());
  }
  return null;
}

function mapVinculo(tipoUsuario) {
  const t = String(tipoUsuario || "").toLowerCase();
  if (t.includes("aluno")) return "estudante";
  if (t.includes("servidor")) return "servidor";
  if (t.includes("docente") || t.includes("professor")) return "docente";
  return "externo";
}

export async function handleSuapLogin(request, env) {
  if (!env.SUAP_CLIENT_ID) {
    return redirect(`${FRONTEND_LOGIN}?erro=suap_token`);
  }

  const state = crypto.randomUUID();
  const authorizeUrl = new URL(`${SUAP_BASE}/o/authorize/`);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", env.SUAP_CLIENT_ID);
  authorizeUrl.searchParams.set("redirect_uri", REDIRECT_URI);
  authorizeUrl.searchParams.set("state", state);

  const res = redirect(authorizeUrl.toString());
  res.headers.append("Set-Cookie", stateCookieHeader(state));
  return res;
}

export async function handleSuapCallback(request, env) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(request, STATE_COOKIE);

  if (!code || !state || !savedState || state !== savedState) {
    const res = redirect(`${FRONTEND_LOGIN}?erro=suap_state`);
    res.headers.append("Set-Cookie", clearStateCookieHeader());
    return res;
  }

  let accessToken;
  try {
    const basicAuth = btoa(`${env.SUAP_CLIENT_ID}:${env.SUAP_CLIENT_SECRET}`);
    const tokenRes = await fetch(`${SUAP_BASE}/o/token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) throw new Error(`token http ${tokenRes.status}`);
    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("sem access_token na resposta");
  } catch (err) {
    const res = redirect(`${FRONTEND_LOGIN}?erro=suap_token`);
    res.headers.append("Set-Cookie", clearStateCookieHeader());
    return res;
  }

  let perfil;
  try {
    const perfilRes = await fetch(`${SUAP_BASE}/api/eu/`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!perfilRes.ok) throw new Error(`perfil http ${perfilRes.status}`);
    perfil = await perfilRes.json();
  } catch (err) {
    const res = redirect(`${FRONTEND_LOGIN}?erro=suap_perfil`);
    res.headers.append("Set-Cookie", clearStateCookieHeader());
    return res;
  }

  const suapId = String(perfil.identificacao || perfil.matricula_siape || perfil.cpf || "").trim();
  const nome = String(perfil.nome || "Usuário SUAP").trim();
  const email = String(perfil.email || "").trim().toLowerCase();
  const vinculo = mapVinculo(perfil.tipo_usuario);
  const cursoSetor = String(
    (perfil.curso && (perfil.curso.descricao || perfil.curso)) || perfil.setor || perfil.campus || ""
  ).trim();

  if (!suapId) {
    const res = redirect(`${FRONTEND_LOGIN}?erro=suap_perfil`);
    res.headers.append("Set-Cookie", clearStateCookieHeader());
    return res;
  }

  let usuario = await env.DB.prepare("SELECT * FROM usuarios WHERE suap_id = ?").bind(suapId).first();

  if (usuario) {
    await env.DB.prepare(
      `UPDATE usuarios
       SET nome = ?,
           email = COALESCE(NULLIF(?, ''), email),
           curso_setor = COALESCE(NULLIF(?, ''), curso_setor),
           vinculo = COALESCE(?, vinculo)
       WHERE id = ?`
    )
      .bind(nome, email, cursoSetor, vinculo, usuario.id)
      .run();
    usuario = { ...usuario, nome, email: email || usuario.email };
  } else {
    // E-mail é UNIQUE na tabela — se já existir uma conta manual (cadastrada
    // por e-mail/senha) com esse mesmo e-mail, só vincula o suap_id a ela em
    // vez de tentar criar uma linha duplicada.
    const porEmail = email
      ? await env.DB.prepare("SELECT * FROM usuarios WHERE email = ?").bind(email).first()
      : null;

    if (porEmail) {
      await env.DB.prepare("UPDATE usuarios SET suap_id = ?, via_suap = 1, nome = ? WHERE id = ?")
        .bind(suapId, nome, porEmail.id)
        .run();
      usuario = { ...porEmail, suap_id: suapId, nome };
    } else {
      const id = crypto.randomUUID();
      // Contas criadas via SUAP não têm senha própria (login é sempre pelo
      // SUAP) — gera um hash aleatório inutilizável só pra respeitar a
      // coluna NOT NULL de password_hash sem precisar mudar o schema.
      const senhaInutilizavel = await hashPassword(crypto.randomUUID() + crypto.randomUUID());
      const emailFinal = email || `${suapId}@suap.ifmg.edu.br`;
      await env.DB.prepare(
        `INSERT INTO usuarios (id, nome, email, password_hash, matricula, curso_setor, vinculo, suap_id, via_suap)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`
      )
        .bind(id, nome, emailFinal, senhaInutilizavel, suapId, cursoSetor || null, vinculo, suapId)
        .run();
      usuario = { id, nome, email: emailFinal };
    }
  }

  const token = await createSessionToken(
    { usuarioId: usuario.id, nome: usuario.nome, email: usuario.email },
    env.SESSION_SECRET
  );
  // Ver comentário equivalente em oauth.js: o token também vai no
  // fragmento da URL pra funcionar mesmo quando o navegador bloqueia o
  // cookie cross-site.
  const res = redirect(`${FRONTEND_APOS_LOGIN}#token=${encodeURIComponent(token)}`);
  res.headers.append("Set-Cookie", userSessionCookieHeader(token));
  res.headers.append("Set-Cookie", clearStateCookieHeader());
  return res;
}
