// Cloudflare Worker que substitui as chamadas diretas ao Supabase.
// Lê do banco Cloudflare D1 (binding "DB", configurado em wrangler.toml)
// e expõe os mesmos dados que o site consumia via window.api.

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function safeParse(value, fallback) {
  if (value === null || value === undefined) return fallback;
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

const CONTENT_TYPES = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  svg: "image/svg+xml",
};

function guessContentType(key) {
  const ext = key.split(".").pop().toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    try {
      // Imagens (equipe, projetos, serviços) servidas do R2, no lugar do
      // Supabase Storage. Chave no bucket == caminho sem o prefixo "assets/".
      if (url.pathname.startsWith("/assets/")) {
        const key = decodeURIComponent(url.pathname.replace(/^\/assets\//, ""));
        if (!key) return json({ error: "not found" }, 404);

        const object = await env.ASSETS_BUCKET.get(key);
        if (!object) return json({ error: "not found" }, 404);

        const headers = new Headers(CORS_HEADERS);
        headers.set("Content-Type", object.httpMetadata?.contentType || guessContentType(key));
        headers.set("Cache-Control", "public, max-age=86400");
        headers.set("ETag", object.httpEtag);
        return new Response(object.body, { headers });
      }

      if (url.pathname === "/api/site_meta") {
        const { results } = await env.DB.prepare(
          "SELECT key, value, inserted_at FROM site_meta ORDER BY inserted_at ASC"
        ).all();
        const parsed = results.map((r) => ({
          ...r,
          value: safeParse(r.value, {}),
        }));
        return json(parsed);
      }

      if (url.pathname === "/api/services") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM services ORDER BY position ASC"
        ).all();
        return json(results);
      }

      if (url.pathname === "/api/projects") {
        const { results } = await env.DB.prepare(
          "SELECT * FROM projects ORDER BY inserted_at ASC"
        ).all();
        const parsed = results.map((p) => ({
          ...p,
          body: safeParse(p.body, {}),
          partners: safeParse(p.partners, []),
        }));
        return json(parsed);
      }

      if (url.pathname === "/api/people") {
        const type = url.searchParams.get("type");
        let query = "SELECT * FROM people";
        const binds = [];
        if (type) {
          query += " WHERE type = ?";
          binds.push(type);
        }
        query += " ORDER BY inserted_at ASC";
        const { results } = await env.DB.prepare(query)
          .bind(...binds)
          .all();
        // Envelopa em { people: ... } para casar com o formato antigo do Supabase
        const parsed = results.map((p) => ({
          people: { ...p, details: safeParse(p.details, {}) },
        }));
        return json(parsed);
      }

      if (url.pathname === "/api/team_members") {
        const { results } = await env.DB.prepare(
          `SELECT tm.id, tm.visible, tm.order_index,
                  p.id as p_id, p.full_name, p.role, p.summary,
                  p.details, p.image_path, p.type, p.inserted_at
           FROM team_members tm
           JOIN people p ON p.id = tm.person_id
           WHERE tm.visible = 1
           ORDER BY tm.order_index ASC`
        ).all();
        const parsed = results.map((r) => ({
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
        }));
        return json(parsed);
      }

      return json({ error: "not found" }, 404);
    } catch (err) {
      return json({ error: String(err && err.message ? err.message : err) }, 500);
    }
  },
};
