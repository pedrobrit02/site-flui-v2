// Utilidades de autenticação do painel admin: hash de senha (PBKDF2) e
// tokens de sessão assinados (HMAC), usando só Web Crypto (nativo no
// Workers, sem dependências externas).

const PBKDF2_ITERATIONS = 100000;
const SESSION_DURATION_SECONDS = 60 * 60 * 12; // 12 horas

function bufToHex(buf) {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBuf(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes.buffer;
}

function bufToBase64Url(buf) {
  const bytes = new Uint8Array(buf);
  let str = "";
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlToBuf(b64url) {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const str = atob(b64);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes.buffer;
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return `${PBKDF2_ITERATIONS}$${bufToHex(salt)}$${bufToHex(bits)}`;
}

export async function verifyPassword(password, stored) {
  const parts = String(stored || "").split("$");
  if (parts.length !== 3) return false;
  const [iterationsStr, saltHex, hashHex] = parts;
  const iterations = parseInt(iterationsStr, 10);
  if (!iterations || !saltHex || !hashHex) return false;

  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: hexToBuf(saltHex), iterations, hash: "SHA-256" },
    keyMaterial,
    256
  );
  return timingSafeEqual(bufToHex(bits), hashHex);
}

async function hmacKey(secret) {
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

// Token de sessão: base64url(payload JSON) + "." + base64url(assinatura HMAC)
export async function createSessionToken(payload, secret) {
  const body = { ...payload, exp: Math.floor(Date.now() / 1000) + SESSION_DURATION_SECONDS };
  const bodyStr = JSON.stringify(body);
  const bodyB64 = bufToBase64Url(new TextEncoder().encode(bodyStr));
  const key = await hmacKey(secret);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(bodyB64));
  return `${bodyB64}.${bufToBase64Url(sig)}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || typeof token !== "string" || !token.includes(".")) return null;
  const [bodyB64, sigB64] = token.split(".");
  if (!bodyB64 || !sigB64) return null;

  const key = await hmacKey(secret);
  const valid = await crypto.subtle.verify(
    "HMAC",
    key,
    base64UrlToBuf(sigB64),
    new TextEncoder().encode(bodyB64)
  );
  if (!valid) return null;

  try {
    const body = JSON.parse(new TextDecoder().decode(base64UrlToBuf(bodyB64)));
    if (!body.exp || body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch (e) {
    return null;
  }
}

const SESSION_COOKIE = "flui_admin_session";

export function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  header.split(";").forEach((pair) => {
    const idx = pair.indexOf("=");
    if (idx === -1) return;
    const k = pair.slice(0, idx).trim();
    const v = pair.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  });
  return out;
}

export function sessionCookieHeader(token) {
  // SameSite=None + Secure: o painel (GitHub Pages) e a API (workers.dev)
  // são origens diferentes, então o cookie precisa ser explicitamente
  // liberado para uso cross-site.
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=${60 * 60 * 12}`;
}

export function clearSessionCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=None; Max-Age=0`;
}

export function getSessionTokenFromRequest(request) {
  const cookies = parseCookies(request);
  return cookies[SESSION_COOKIE] || null;
}

export async function requireAdmin(request, env) {
  const token = getSessionTokenFromRequest(request);
  if (!token) return null;
  const payload = await verifySessionToken(token, env.SESSION_SECRET);
  if (!payload || !payload.adminId) return null;
  return payload; // { adminId, name, email, exp }
}
