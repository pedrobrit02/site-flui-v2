// Endpoints públicos que recebem os formulários do site (Uso e Empréstimo)
// e o beacon de contagem de acessos. Não exigem login.

import { json, base64ToBytes, guessContentType } from "./util.js";

async function salvarTermo(env, { file, fileName, prefixo }) {
  if (!file || !fileName) return { key: null, name: null };
  const bytes = base64ToBytes(file);
  const key = `${prefixo}/${crypto.randomUUID()}-${fileName}`;
  await env.UPLOADS_BUCKET.put(key, bytes, {
    httpMetadata: { contentType: guessContentType(fileName) },
  });
  return { key, name: fileName };
}

export async function handleUsoSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(request, { error: "JSON inválido" }, 400);
  }

  const camposObrigatorios = ["nome", "email", "equipamentos", "inicio", "finalidade"];
  for (const campo of camposObrigatorios) {
    if (!body[campo] || (Array.isArray(body[campo]) && body[campo].length === 0)) {
      return json(request, { error: `Campo obrigatório ausente: ${campo}` }, 400);
    }
  }

  const { key, name } = await salvarTermo(env, {
    file: body.file,
    fileName: body.fileName,
    prefixo: "uso",
  });

  const id = crypto.randomUUID();
  const equipamentos = Array.isArray(body.equipamentos)
    ? body.equipamentos
    : String(body.equipamentos || "").split(",").map((s) => s.trim()).filter(Boolean);

  await env.DB.prepare(
    `INSERT INTO uso_solicitacoes
      (id, nome, matricula_id, email, telefone, setor, equipamentos, inicio, fim, finalidade, observacoes, termo_r2_key, termo_file_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.nome,
      body.matricula_id || null,
      body.email,
      body.telefone || null,
      body.setor || null,
      JSON.stringify(equipamentos),
      body.inicio,
      body.fim || null,
      body.finalidade,
      body.observacoes || null,
      key,
      name
    )
    .run();

  return json(request, { ok: true, id }, 201);
}

export async function handleEmprestimoSubmit(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    return json(request, { error: "JSON inválido" }, 400);
  }

  const camposObrigatorios = ["nome", "email", "materiais", "data_retirada", "finalidade"];
  for (const campo of camposObrigatorios) {
    if (!body[campo] || (Array.isArray(body[campo]) && body[campo].length === 0)) {
      return json(request, { error: `Campo obrigatório ausente: ${campo}` }, 400);
    }
  }

  const { key, name } = await salvarTermo(env, {
    file: body.file,
    fileName: body.fileName,
    prefixo: "emprestimo",
  });

  const id = crypto.randomUUID();

  await env.DB.prepare(
    `INSERT INTO emprestimo_solicitacoes
      (id, nome, matricula_id, email, telefone, setor, materiais, data_retirada, data_devolucao, finalidade, observacoes, termo_r2_key, termo_file_name)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  )
    .bind(
      id,
      body.nome,
      body.matricula_id || null,
      body.email,
      body.telefone || null,
      body.setor || null,
      JSON.stringify(body.materiais),
      body.data_retirada,
      body.data_devolucao || null,
      body.finalidade,
      body.observacoes || null,
      key,
      name
    )
    .run();

  return json(request, { ok: true, id }, 201);
}

const PAGINAS_VALIDAS = new Set(["index", "uso", "emprestimo"]);

export async function handlePageview(request, env) {
  let body;
  try {
    body = await request.json();
  } catch (e) {
    body = {};
  }
  const path = PAGINAS_VALIDAS.has(body.path) ? body.path : "outro";
  await env.DB.prepare("INSERT INTO page_views (path) VALUES (?)").bind(path).run();
  return json(request, { ok: true });
}
