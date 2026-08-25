// Utilidades compartilhadas entre os módulos do Worker.

export function corsHeaders(request) {
  const origin = request.headers.get("Origin");
  const headers = {
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Credentials": "true",
  };
  // Com credentials (cookies de sessão do admin), o header Allow-Origin não
  // pode ser "*" — precisa refletir a origem exata da requisição.
  headers["Access-Control-Allow-Origin"] = origin || "*";
  if (origin) headers["Vary"] = "Origin";
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
