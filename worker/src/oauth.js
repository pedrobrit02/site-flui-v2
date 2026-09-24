// Login via Google / Microsoft / GitHub (OAuth2) — mesma ideia do SUAP
// (worker/src/suap.js), só que pra essas três contas pessoais. Cria/loga
// conta de USUÁRIO/patrono (tabela `usuarios`), igual à de e-mail/senha e à
// do SUAP — nunca dá acesso ao painel admin.
//
// Fluxo, igual pros três provedores ("Authorization Code"):
//   1. handleOauthLogin(provider)    -> redireciona pro provedor
//   2. a pessoa loga e autoriza lá
//   3. o provedor redireciona de volta pra handleOauthCallback(provider)
//   4. trocamos o code por um access_token
//   5. buscamos o perfil (nome, e-mail, id) e criamos/atualizamos a linha
//      em `usuarios`
//   6. emitimos o mesmo cookie de sessão usado no login por e-mail/senha
//
// Antes de cada provedor funcionar, precisa cadastrar um app OAuth nele e
// configurar 2 secrets no Worker. Ver instruções e URLs de callback logo
// abaixo, em PROVIDERS.
//
//   Google:
//     https://console.cloud.google.com/apis/credentials
//     -> Criar credenciais -> ID do cliente OAuth -> Aplicativo da Web
//     -> URI de redirecionamento autorizado:
//        https://flui-api.pedro-brito-flui.workers.dev/api/auth/google/callback
//     -> secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//
//   Microsoft:
//     https://portal.azure.com -> Azure Active Directory -> Registros de app
//     -> Novo registro -> Tipos de conta: "Contas em qualquer diretório
//        organizacional e contas pessoais da Microsoft"
//     -> Redirecionar URI (Web):
//        https://flui-api.pedro-brito-flui.workers.dev/api/auth/microsoft/callback
//     -> Certificados e segredos -> Novo segredo do cliente
//     -> secrets: MICROSOFT_CLIENT_ID, MICROSOFT_CLIENT_SECRET
//
//   GitHub:
//     https://github.com/settings/developers -> OAuth Apps -> New OAuth App
//     -> Authorization callback URL:
//        https://flui-api.pedro-brito-flui.workers.dev/api/auth/github/callback
//     -> secrets: GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET
//
// Depois de ter os valores, pra cada um:
//   npx wrangler@3 secret put NOME_DO_SECRET

import { createSessionToken, userSessionCookieHeader, hashPassword } from "./auth.js";

const FRONTEND_APOS_LOGIN = "https://pedrobrit02.github.io/Flui/biblioteca.html";
const FRONTEND_LOGIN = "https://pedrobrit02.github.io/Flui/login.html";
const STATE_COOKIE = "flui_oauth_state";

const PROVIDERS = {
  google: {
    authorizeUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    redirectUri: "https://flui-api.pedro-brito-flui.workers.dev/api/auth/google/callback",
    clientIdKey: "GOOGLE_CLIENT_ID",
    clientSecretKey: "GOOGLE_CLIENT_SECRET",
    async fetchPerfil(accessToken) {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`perfil http ${res.status}`);
      const data = await res.json();
      return {
        id: data.sub,
        nome: data.name || data.email,
        email: (data.email || "").toLowerCase(),
      };
    },
  },

  microsoft: {
    authorizeUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid email profile User.Read",
    redirectUri: "https://flui-api.pedro-brito-flui.workers.dev/api/auth/microsoft/callback",
    clientIdKey: "MICROSOFT_CLIENT_ID",
    clientSecretKey: "MICROSOFT_CLIENT_SECRET",
    async fetchPerfil(accessToken) {
      const res = await fetch("https://graph.microsoft.com/v1.0/me", {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) throw new Error(`perfil http ${res.status}`);
      const data = await res.json();
      return {
        id: data.id,
        nome: data.displayName || data.mail || data.userPrincipalName,
        email: (data.mail || data.userPrincipalName || "").toLowerCase(),
      };
    },
  },

  github: {
    authorizeUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    scope: "read:user user:email",
    redirectUri: "https://flui-api.pedro-brito-flui.workers.dev/api/auth/github/callback",
    clientIdKey: "GITHUB_CLIENT_ID",
    clientSecretKey: "GITHUB_CLIENT_SECRET",
    // GitHub exige um User-Agent nas chamadas de API, senão devolve 403.
    async fetchPerfil(accessToken) {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "User-Agent": "flui-ifmg-site",
        Accept: "application/vnd.github+json",
      };
      const res = await fetch("https://api.github.com/user", { headers });
      if (!res.ok) throw new Error(`perfil http ${res.status}`);
      const data = await res.json();

      // No GitHub o e-mail em /user pode vir nulo (se a pessoa deixou
      // privado) — nesse caso busca em /user/emails e pega o principal.
      let email = (data.email || "").toLowerCase();
      if (!email) {
        try {
          const emailsRes = await fetch("https://api.github.com/user/emails", { headers });
          if (emailsRes.ok) {
            const emails = await emailsRes.json();
            const primario = emails.find((e) => e.primary) || emails[0];
            if (primario) email = String(primario.email || "").toLowerCase();
          }
        } catch (e) {
          /* segue sem e-mail — fica com o fallback abaixo */
        }
      }

      return {
        id: String(data.id),
        nome: data.name || data.login,
        email,
      };
    },
  },
};

function redirect(location) {
  return new Response(null, { status: 302, headers: { Location: location } });
}

function stateCookieHeader(value) {
  // Curto (5 min) — só precisa sobreviver até a pessoa voltar do provedor.
  // SameSite=Lax porque volta numa navegação de topo (redirect), não numa
  // chamada fetch entre origens diferentes.
  return `${STATE_COOKIE}=${encodeURIComponent(value)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=300`;
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

export async function handleOauthLogin(request, env, providerName) {
  const provider = PROVIDERS[providerName];
  const clientId = env[provider.clientIdKey];

  if (!clientId) {
    return redirect(`${FRONTEND_LOGIN}?erro=${providerName}_nao_configurado`);
  }

  const state = crypto.randomUUID();
  const authorizeUrl = new URL(provider.authorizeUrl);
  authorizeUrl.searchParams.set("response_type", "code");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", provider.redirectUri);
  authorizeUrl.searchParams.set("scope", provider.scope);
  authorizeUrl.searchParams.set("state", state);

  const res = redirect(authorizeUrl.toString());
  res.headers.append("Set-Cookie", stateCookieHeader(`${providerName}:${state}`));
  return res;
}

export async function handleOauthCallback(request, env, providerName) {
  const provider = PROVIDERS[providerName];
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const savedState = getCookie(request, STATE_COOKIE);

  if (!code || !state || !savedState || savedState !== `${providerName}:${state}`) {
    const res = redirect(`${FRONTEND_LOGIN}?erro=oauth_state`);
    res.headers.append("Set-Cookie", clearStateCookieHeader());
    return res;
  }

  let accessToken;
  try {
    const tokenRes = await fetch(provider.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: provider.redirectUri,
        client_id: env[provider.clientIdKey],
        client_secret: env[provider.clientSecretKey],
      }),
    });
    if (!tokenRes.ok) throw new Error(`token http ${tokenRes.status}`);
    const tokenData = await tokenRes.json();
    accessToken = tokenData.access_token;
    if (!accessToken) throw new Error("sem access_token na resposta");
  } catch (err) {
    const res = redirect(`${FRONTEND_LOGIN}?erro=${providerName}_token`);
    res.headers.append("Set-Cookie", clearStateCookieHeader());
    return res;
  }

  let perfil;
  try {
    perfil = await provider.fetchPerfil(accessToken);
    if (!perfil.id) throw new Error("perfil sem id");
  } catch (err) {
    const res = redirect(`${FRONTEND_LOGIN}?erro=${providerName}_perfil`);
    res.headers.append("Set-Cookie", clearStateCookieHeader());
    return res;
  }

  const oauthId = String(perfil.id);
  const nome = String(perfil.nome || "Usuário").trim();
  const email = String(perfil.email || "").trim().toLowerCase();

  let usuario = await env.DB.prepare(
    "SELECT * FROM usuarios WHERE oauth_provider = ? AND oauth_id = ?"
  )
    .bind(providerName, oauthId)
    .first();

  if (usuario) {
    await env.DB.prepare(
      "UPDATE usuarios SET nome = ?, email = COALESCE(NULLIF(?, ''), email) WHERE id = ?"
    )
      .bind(nome, email, usuario.id)
      .run();
    usuario = { ...usuario, nome, email: email || usuario.email };
  } else {
    // E-mail é UNIQUE na tabela — se já existir uma conta (manual, SUAP ou
    // de outro provedor) com esse mesmo e-mail, só vincula esse provedor a
    // ela em vez de criar uma linha duplicada.
    const porEmail = email
      ? await env.DB.prepare("SELECT * FROM usuarios WHERE email = ?").bind(email).first()
      : null;

    if (porEmail) {
      await env.DB.prepare(
        "UPDATE usuarios SET oauth_provider = COALESCE(oauth_provider, ?), oauth_id = COALESCE(oauth_id, ?), nome = ? WHERE id = ?"
      )
        .bind(providerName, oauthId, nome, porEmail.id)
        .run();
      usuario = { ...porEmail, nome };
    } else {
      if (!email) {
        // Sem e-mail nenhum (ex: GitHub com e-mail 100% privado) não dá pra
        // criar conta — a tabela exige e-mail único e é por ele que a
        // Biblioteca identifica a pessoa.
        const res = redirect(`${FRONTEND_LOGIN}?erro=${providerName}_sem_email`);
        res.headers.append("Set-Cookie", clearStateCookieHeader());
        return res;
      }
      const id = crypto.randomUUID();
      // Contas criadas via OAuth não têm senha própria — gera um hash
      // aleatório inutilizável só pra respeitar a coluna NOT NULL de
      // password_hash sem precisar mudar o schema.
      const senhaInutilizavel = await hashPassword(crypto.randomUUID() + crypto.randomUUID());
      await env.DB.prepare(
        `INSERT INTO usuarios (id, nome, email, password_hash, vinculo, oauth_provider, oauth_id)
         VALUES (?, ?, ?, ?, 'externo', ?, ?)`
      )
        .bind(id, nome, email, senhaInutilizavel, providerName, oauthId)
        .run();
      usuario = { id, nome, email };
    }
  }

  const token = await createSessionToken(
    { usuarioId: usuario.id, nome: usuario.nome, email: usuario.email },
    env.SESSION_SECRET
  );
  const res = redirect(FRONTEND_APOS_LOGIN);
  res.headers.append("Set-Cookie", userSessionCookieHeader(token));
  res.headers.append("Set-Cookie", clearStateCookieHeader());
  return res;
}
