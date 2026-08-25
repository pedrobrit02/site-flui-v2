// Cloudflare Worker que substitui as chamadas diretas ao Supabase e expõe o
// painel administrativo do FLUI (login, solicitações, estatísticas).
// Bindings usados (ver wrangler.toml):
//   env.DB             — D1 (site + solicitações)
//   env.ASSETS_BUCKET   — R2 público (fotos do site)
//   env.UPLOADS_BUCKET  — R2 privado (termos assinados em PDF)
//   env.SESSION_SECRET  — secret p/ assinar cookies de sessão do admin
//   env.RESEND_API_KEY  — secret p/ enviar e-mail de decisão (Resend)
//   env.RESEND_FROM     — remetente do e-mail (opcional)

import { json, safeParse, guessContentType, corsHeaders } from "./util.js";
import { handleUsoSubmit, handleEmprestimoSubmit, handlePageview } from "./public.js";
import {
  handleLogin,
  handleLogout,
  handleMe,
  handleListSolicitacoes,
  handleDecidir,
  handleTermoDownload,
  handleStats,
  handlePageviewStats,
  handleExportCsv,
  handleListAdmins,
  handleCreateAdmin,
} from "./admin.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }

    try {
      // --- Imagens públicas (equipe, projetos, serviços) via R2 ---
      if (path.startsWith("/assets/")) {
        const key = decodeURIComponent(path.replace(/^\/assets\//, ""));
        if (!key) return json(request, { error: "not found" }, 404);

        const object = await env.ASSETS_BUCKET.get(key);
        if (!object) return json(request, { error: "not found" }, 404);

        const headers = new Headers(corsHeaders(request));
        headers.set("Content-Type", object.httpMetadata?.contentType || guessContentType(key));
        headers.set("Cache-Control", "public, max-age=86400");
        headers.set("ETag", object.httpEtag);
        return new Response(object.body, { headers });
      }

      // --- Conteúdo do site (antigo Supabase) ---
      if (path === "/api/site_meta") {
        const { results } = await env.DB.prepare(
          "SELECT key, value, inserted_at FROM site_meta ORDER BY inserted_at ASC"
        ).all();
        return json(request, results.map((r) => ({ ...r, value: safeParse(r.value, {}) })));
      }

      if (path === "/api/services") {
        const { results } = await env.DB.prepare("SELECT * FROM services ORDER BY position ASC").all();
        return json(request, results);
      }

      if (path === "/api/projects") {
        const { results } = await env.DB.prepare("SELECT * FROM projects ORDER BY inserted_at ASC").all();
        return json(
          request,
          results.map((p) => ({ ...p, body: safeParse(p.body, {}), partners: safeParse(p.partners, []) }))
        );
      }

      if (path === "/api/people") {
        const type = url.searchParams.get("type");
        let query = "SELECT * FROM people";
        const binds = [];
        if (type) {
          query += " WHERE type = ?";
          binds.push(type);
        }
        query += " ORDER BY inserted_at ASC";
        const { results } = await env.DB.prepare(query).bind(...binds).all();
        return json(request, results.map((p) => ({ people: { ...p, details: safeParse(p.details, {}) } })));
      }

      if (path === "/api/team_members") {
        const { results } = await env.DB.prepare(
          `SELECT tm.id, tm.visible, tm.order_index,
                  p.id as p_id, p.full_name, p.role, p.summary,
                  p.details, p.image_path, p.type, p.inserted_at
           FROM team_members tm
           JOIN people p ON p.id = tm.person_id
           WHERE tm.visible = 1
           ORDER BY tm.order_index ASC`
        ).all();
        return json(
          request,
          results.map((r) => ({
            people: {
              id: r.p_id,
              full_name: r.full_name,
              role: r.role,
              summary: r.summary,
              details: safeParse(r.details, {}),
              image_path: r.image_path,
              type: r.type,
              inserted_at: r.inserted_at,
            },
          }))
        );
      }

      // --- Formulários públicos (Uso / Empréstimo / contagem de acessos) ---
      if (path === "/api/uso" && request.method === "POST") return handleUsoSubmit(request, env);
      if (path === "/api/emprestimo" && request.method === "POST") return handleEmprestimoSubmit(request, env);
      if (path === "/api/pageview" && request.method === "POST") return handlePageview(request, env);

      // --- Autenticação do admin ---
      if (path === "/api/admin/login" && request.method === "POST") return handleLogin(request, env);
      if (path === "/api/admin/logout" && request.method === "POST") return handleLogout(request);
      if (path === "/api/admin/me" && request.method === "GET") return handleMe(request, env);

      // --- Admins (gestão de contas) ---
      if (path === "/api/admin/admins" && request.method === "GET") return handleListAdmins(request, env);
      if (path === "/api/admin/admins" && request.method === "POST") return handleCreateAdmin(request, env);

      // --- Solicitações ---
      if (path === "/api/admin/solicitacoes" && request.method === "GET") {
        return handleListSolicitacoes(request, env, url);
      }
      const decidirMatch = path.match(/^\/api\/admin\/solicitacoes\/(uso|emprestimo)\/([^/]+)\/decidir$/);
      if (decidirMatch && request.method === "POST") {
        return handleDecidir(request, env, decidirMatch[1], decidirMatch[2]);
      }
      const termoMatch = path.match(/^\/api\/admin\/solicitacoes\/(uso|emprestimo)\/([^/]+)\/termo$/);
      if (termoMatch && request.method === "GET") {
        return handleTermoDownload(request, env, termoMatch[1], termoMatch[2]);
      }

      // --- Estatísticas e exportação ---
      if (path === "/api/admin/stats" && request.method === "GET") return handleStats(request, env);
      if (path === "/api/admin/pageviews" && request.method === "GET") {
        return handlePageviewStats(request, env, url);
      }
      if (path === "/api/admin/export.csv" && request.method === "GET") return handleExportCsv(request, env, url);

      return json(request, { error: "not found" }, 404);
    } catch (err) {
      return json(request, { error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};
