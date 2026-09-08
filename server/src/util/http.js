// Minimal HTTP toolkit: router, body parsing, JSON responses, errors, rate limiting.
import crypto from "node:crypto";
import { config } from "../config.js";
import { isCloudflareIp } from "./cfip.js";

export class HttpError extends Error {
  constructor(status, code, message, extra) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}
export const badRequest = (code, msg, extra) => new HttpError(400, code, msg, extra);
export const unauthorized = (msg = "Please sign in again.") => new HttpError(401, "unauthorized", msg);
export const forbidden = (code, msg, extra) => new HttpError(403, code, msg, extra);
export const notFound = (msg = "Not found") => new HttpError(404, "not_found", msg);
export const paymentRequired = (code, msg, extra) => new HttpError(402, code, msg, extra);
export const tooMany = (msg = "Too many requests. Please slow down.") => new HttpError(429, "rate_limited", msg);

export class Router {
  constructor() {
    this.routes = [];
  }
  add(method, pattern, ...handlers) {
    const keys = [];
    const re = new RegExp(
      "^" +
        pattern.replace(/\/:([a-zA-Z0-9_]+)/g, (_, k) => {
          keys.push(k);
          return "/([^/]+)";
        }) +
        "/?$",
    );
    this.routes.push({ method, re, keys, handlers });
    return this;
  }
  get(p, ...h) { return this.add("GET", p, ...h); }
  post(p, ...h) { return this.add("POST", p, ...h); }
  put(p, ...h) { return this.add("PUT", p, ...h); }
  patch(p, ...h) { return this.add("PATCH", p, ...h); }
  delete(p, ...h) { return this.add("DELETE", p, ...h); }

  match(method, pathname) {
    for (const r of this.routes) {
      if (r.method !== method && r.method !== "*") continue;
      const m = r.re.exec(pathname);
      if (!m) continue;
      const params = {};
      try {
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
      } catch {
        return null; // malformed percent-encoding: not a route we know
      }
      return { params, handlers: r.handlers };
    }
    return null;
  }

  // Runs handlers in order; a handler returns `undefined` to pass to the next.
  async dispatch(ctx) {
    const found = this.match(ctx.method, ctx.path);
    if (!found) return false;
    ctx.params = found.params;
    for (const h of found.handlers) {
      const out = await h(ctx);
      if (out !== undefined) {
        sendResult(ctx, out);
        return true;
      }
      if (ctx.res.writableEnded) return true;
    }
    return true;
  }
}

export function sendResult(ctx, out) {
  if (ctx.res.writableEnded) return;
  if (out === null) return json(ctx.res, 204, null);
  if (typeof out === "object" && out.__raw) {
    const { status = 200, headers = {}, body = "" } = out;
    ctx.res.writeHead(status, headers);
    ctx.res.end(body);
    return;
  }
  json(ctx.res, 200, out);
}

export function json(res, status, body, headers = {}) {
  if (status === 204 || body === null) {
    res.writeHead(204, headers);
    return res.end();
  }
  const text = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...headers,
  });
  res.end(text);
}

export function html(body, status = 200, headers = {}) {
  return {
    __raw: true,
    status,
    headers: { "Content-Type": "text/html; charset=utf-8", ...headers },
    body,
  };
}

// Reads a body up to `limit` bytes. An oversized body is drained (up to a hard
// cap) and then rejected with 413, so the client receives the error instead of
// a connection reset mid-upload. Truly huge bodies are cut off.
export function readRawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const hardCap = Math.min(64 * 1024 * 1024, Math.max(limit * 2, 2 * 1024 * 1024));
    let size = 0;
    let over = false;
    const tooLarge = () => new HttpError(413, "too_large", "That is too large to upload.");
    req.on("data", (c) => {
      size += c.length;
      if (size > hardCap) {
        reject(tooLarge());
        req.destroy();
        return;
      }
      if (over) return;
      if (size > limit) {
        over = true;
        chunks.length = 0;
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => (over ? reject(tooLarge()) : resolve(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}

export async function readJsonBody(req, limit = config.limits.maxJsonBytes) {
  const raw = await readRawBody(req, limit);
  if (!raw.length) return {};
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    throw badRequest("invalid_json", "Request body must be valid JSON.");
  }
}

export function clientIp(req) {
  const sock = req.socket.remoteAddress || "";
  if (!config.trustProxy) return sock;
  // Caddy replaces X-Forwarded-For with the address that connected to it, so the first
  // entry is our peer: a Cloudflare edge when the host is proxied, else the client itself.
  // CF-Connecting-IP is only believed when that peer really is Cloudflare; otherwise a
  // client could send any value and get a fresh rate-limit bucket per request.
  const xff = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  const peer = xff || sock;
  const cf = req.headers["cf-connecting-ip"];
  if (cf && isCloudflareIp(peer)) return String(cf).trim();
  if (xff) return xff;
  const real = req.headers["x-real-ip"];
  if (real) return String(real).trim();
  return sock;
}

// ---- Rate limiting (token bucket per key, in memory) ------------------------
const buckets = new Map();
export function rateLimit(key, { capacity = 30, refillPerSec = 0.5 } = {}) {
  const t = Date.now();
  let b = buckets.get(key);
  if (!b) {
    b = { tokens: capacity, updated: t };
    buckets.set(key, b);
  }
  const elapsed = (t - b.updated) / 1000;
  b.tokens = Math.min(capacity, b.tokens + elapsed * refillPerSec);
  b.updated = t;
  if (b.tokens < 1) throw tooMany();
  b.tokens -= 1;
}
setInterval(() => {
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [k, b] of buckets) if (b.updated < cutoff) buckets.delete(k);
}, 60 * 1000).unref();

// Constant-time string comparison for tokens.
export function safeEqual(a, b) {
  const A = Buffer.from(String(a ?? ""));
  const B = Buffer.from(String(b ?? ""));
  if (A.length !== B.length || A.length === 0) return false;
  return crypto.timingSafeEqual(A, B);
}

// Uses the raw socket address (never X-Forwarded-For) so it cannot be spoofed.
export function isLoopback(req) {
  const a = req.socket?.remoteAddress || "";
  return a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1";
}
export function isPrivateAddress(req) {
  const a = (req.socket?.remoteAddress || "").replace(/^::ffff:/, "");
  return isLoopback(req) || /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|fc|fd|fe80:)/i.test(a);
}

export function baseSecurityHeaders() {
  return {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "SAMEORIGIN",
    "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
    ...(config.env === "production" ? { "Strict-Transport-Security": "max-age=31536000" } : {}),
  };
}

export const uuid = () => crypto.randomUUID();
export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("base64url");
export const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");

export function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
