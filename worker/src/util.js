// Utilidades compartilhadas entre os módulos do Worker.

// Origens que podem fazer requisições AUTENTICADAS (com cookie de sessão) —
// só o site publicado e o ambiente local de desenvolvimento (`npm run dev`,
// Vite). Antes isso refletia QUALQUER Origin enviado pelo navegador, o que,
// combinado com cookies SameSite=None, permitia que um site malicioso
// fizesse requisições autenticadas em nome de um admin/usuário logado
// (CSRF) — o navegador só bloqueia a LEITURA da resposta por outra origem,
// não o envio da requisição em si. Restringir a uma lista fixa fecha isso:
// uma origem fora da lista simplesmente não recebe os headers de CORS
// necessários pra a requisição autenticada ser aceita pelo navegador.
const ORIGENS_PERMITIDAS = [
  "https://pedrobrit02.github.io",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

export function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
  // Com credentials (cookies de sessão), o header Allow-Origin não pode ser
  // "*" — precisa ser a origem exata, e só concedemos isso pra quem está
  // na lista acima.
  if (origin && ORIGENS_PERMITIDAS.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return headers;
}

export function json(request, data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

export function safeParse(value, fallback) {
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
  pdf: "application/pdf",
};

export function guessContentType(key) {
  const ext = key.split(".").pop().toLowerCase();
  return CONTENT_TYPES[ext] || "application/octet-stream";
}

export function base64ToBytes(base64) {
  // Aceita tanto data URLs ("data:application/pdf;base64,....") quanto
  // base64 puro.
  const clean = base64.includes(",") ? base64.slice(base64.indexOf(",") + 1) : base64;
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export function csvEscape(value) {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n;]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(rows, columns) {
  const header = columns.map((c) => csvEscape(c.label)).join(";");
  const lines = rows.map((row) => columns.map((c) => csvEscape(c.get(row))).join(";"));
  return [header, ...lines].join("\r\n");
}
