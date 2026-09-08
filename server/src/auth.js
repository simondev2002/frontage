// Authentication: Sign in with Apple (identity token verification), email
// one-time codes, bearer sessions, and account deletion (App Store 5.1.1(v)).
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { config, isDev } from "./config.js";
import { db, get, all, run, now, transaction } from "./db.js";
import { HttpError, badRequest, unauthorized, rateLimit, uuid, randomToken, sha256, safeEqual, clientIp, readJsonBody } from "./util/http.js";
import { sendEmail } from "./email.js";

const SESSION_DAYS = 180;
const OTP_TTL_MS = 10 * 60 * 1000;

// ---- Sessions ---------------------------------------------------------------
export function createSession(userId, device) {
  const token = randomToken(32);
  run("INSERT INTO sessions (token_hash, user_id, device, created_at, expires_at) VALUES (?,?,?,?,?)", sha256(token), userId, device || null, now(), now() + SESSION_DAYS * 864e5);
  return token;
}

export function userFromToken(token) {
  if (!token) return null;
  const s = get("SELECT * FROM sessions WHERE token_hash = ?", sha256(token));
  if (!s || s.expires_at < now()) return null;
  const u = get("SELECT * FROM users WHERE id = ? AND deleted_at IS NULL", s.user_id);
  if (!u) return null;
  if (!u.last_seen_at || now() - u.last_seen_at > 60_000) run("UPDATE users SET last_seen_at = ? WHERE id = ?", now(), u.id);
  return u;
}

export function bearer(req) {
  const h = req.headers.authorization || "";
  return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

export async function requireAuth(ctx) {
  const u = userFromToken(bearer(ctx.req));
  if (!u) throw unauthorized();
  ctx.user = u;
}

export function publicUser(u) {
  return { id: u.id, email: u.email, name: u.name, createdAt: u.created_at, hasApple: Boolean(u.apple_sub), aiConsentAt: u.ai_consent_at || null };
}

// App Store guideline 5.1.2(i): personal data may only be shared with third-party
// AI after explicit permission. Every AI-backed route calls this; the app sends
// `aiConsent: true` when the owner has agreed, and Settings can withdraw it.
export function requireAiConsent(ctx, body) {
  const u = get("SELECT ai_consent_at FROM users WHERE id = ?", ctx.user.id);
  if (u?.ai_consent_at) return;
  if (body && body.aiConsent === true) {
    run("UPDATE users SET ai_consent_at = ? WHERE id = ?", now(), ctx.user.id);
    return;
  }
  throw badRequest("consent_required", "Before we can design with AI, please agree that your business details and photos are sent to our AI provider (Anthropic).");
}

// ---- Sign in with Apple -------------------------------------------------------
let appleKeys = { fetchedAt: 0, keys: [] };
async function appleJwks() {
  if (now() - appleKeys.fetchedAt < 12 * 3600e3 && appleKeys.keys.length) return appleKeys.keys;
  const r = await fetch("https://appleid.apple.com/auth/keys");
  if (!r.ok) throw new HttpError(502, "apple_keys", "Could not fetch Apple keys");
  const j = await r.json();
  appleKeys = { fetchedAt: now(), keys: j.keys || [] };
  return appleKeys.keys;
}

const b64u = (s) => Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");

export async function verifyAppleIdentityToken(token, { nonce } = {}) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw badRequest("invalid_token", "Malformed identity token");
  let header, payload;
  try {
    header = JSON.parse(b64u(parts[0]).toString("utf8"));
    payload = JSON.parse(b64u(parts[1]).toString("utf8"));
  } catch {
    throw badRequest("invalid_token", "Malformed identity token");
  }
  let keys = await appleJwks();
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    appleKeys.fetchedAt = 0;
    keys = await appleJwks();
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw badRequest("invalid_token", "Unknown Apple signing key");
  const pub = crypto.createPublicKey({ key: jwk, format: "jwk" });
  const ok = crypto.verify("sha256", Buffer.from(`${parts[0]}.${parts[1]}`), pub, b64u(parts[2]));
  if (!ok) throw badRequest("invalid_token", "Bad identity token signature");
  if (payload.iss !== "https://appleid.apple.com") throw badRequest("invalid_token", "Bad issuer");
  const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
  const allowed = [config.apple.bundleId, ...(process.env.APPLE_EXTRA_AUDIENCES || "").split(",").filter(Boolean)];
  if (!auds.some((a) => allowed.includes(a))) throw badRequest("invalid_token", "Token audience mismatch");
  if (payload.exp * 1000 < now() - 60_000) throw badRequest("invalid_token", "Identity token expired");
  // The app always sends the raw nonce; Apple puts sha256(nonce) in the token.
  // Requiring it stops a captured identity token from being replayed.
  if (!nonce || !payload.nonce || !safeEqual(payload.nonce, sha256(nonce))) throw badRequest("invalid_token", "Nonce missing or mismatched");
  return payload; // { sub, email?, email_verified?, is_private_email? }
}

function appleClientSecret() {
  const { teamId, siwaKeyId, siwaPrivateKey, bundleId } = config.apple;
  if (!teamId || !siwaKeyId || !siwaPrivateKey) return null;
  const header = { alg: "ES256", kid: siwaKeyId, typ: "JWT" };
  const iat = Math.floor(now() / 1000);
  const claims = { iss: teamId, iat, exp: iat + 3600, aud: "https://appleid.apple.com", sub: bundleId };
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = `${enc(header)}.${enc(claims)}`;
  const sig = crypto.sign("sha256", Buffer.from(data), { key: siwaPrivateKey, dsaEncoding: "ieee-p1363" });
  return `${data}.${sig.toString("base64url")}`;
}

async function exchangeAppleCode(code) {
  const secret = appleClientSecret();
  if (!secret || !code) return null;
  const body = new URLSearchParams({ client_id: config.apple.bundleId, client_secret: secret, code, grant_type: "authorization_code" });
  const r = await fetch("https://appleid.apple.com/auth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) {
    console.warn("[apple] code exchange failed", r.status, await r.text());
    return null;
  }
  const j = await r.json();
  return j.refresh_token || null;
}

async function revokeAppleToken(refreshToken) {
  const secret = appleClientSecret();
  if (!secret || !refreshToken) return;
  const body = new URLSearchParams({ client_id: config.apple.bundleId, client_secret: secret, token: refreshToken, token_type_hint: "refresh_token" });
  const r = await fetch("https://appleid.apple.com/auth/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body });
  if (!r.ok) console.warn("[apple] revoke failed", r.status);
}

export async function signInWithApple({ identityToken, authorizationCode, fullName, nonce, device }) {
  const p = await verifyAppleIdentityToken(identityToken, { nonce });
  const email = p.email ? String(p.email).toLowerCase() : null;
  let user = get("SELECT * FROM users WHERE apple_sub = ?", p.sub);
  const emailVerified = p.email_verified === true || p.email_verified === "true";
  if (!user && email && emailVerified) {
    // Link an existing email-code account to this Apple ID (verified emails only).
    user = get("SELECT * FROM users WHERE email = ? AND deleted_at IS NULL", email);
    if (user) run("UPDATE users SET apple_sub = ? WHERE id = ?", p.sub, user.id);
  }
  if (user && user.deleted_at) {
    run("UPDATE users SET deleted_at = NULL, created_at = ? WHERE id = ?", now(), user.id);
  }
  if (!user) {
    const id = uuid();
    const name = fullName ? [fullName.givenName, fullName.familyName].filter(Boolean).join(" ") : null;
    run("INSERT INTO users (id, email, apple_sub, name, created_at, last_seen_at) VALUES (?,?,?,?,?,?)", id, email, p.sub, name || null, now(), now());
    user = get("SELECT * FROM users WHERE id = ?", id);
  }
  const refresh = await exchangeAppleCode(authorizationCode).catch(() => null);
  if (refresh) run("UPDATE users SET apple_refresh_token = ? WHERE id = ?", refresh, user.id);
  const token = createSession(user.id, device);
  return { token, user: get("SELECT * FROM users WHERE id = ?", user.id) };
}

// ---- Email one-time codes ----------------------------------------------------
const codeHash = (email, code) => sha256(`${config.sessionSecret}:${email}:${code}`);

/** App Review credentials from REVIEW_EMAIL / REVIEW_CODE: no email is sent and the fixed code is accepted. */
function isReviewLogin(email, code) {
  const r = config.reviewLogin;
  if (!r.email || !r.code || email !== r.email) return false;
  return code === undefined || safeEqual(code, r.code);
}

export async function startEmailSignIn(emailRaw) {
  const email = String(emailRaw || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) throw badRequest("invalid_email", "Please enter a valid email address.");
  // Per-address limit on top of the per-IP one, so nobody can flood an inbox.
  rateLimit(`otp-email:${email}`, { capacity: 5, refillPerSec: 1 / 120 });
  if (isReviewLogin(email)) return { email };
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  run("INSERT INTO otp_codes (email, code_hash, attempts, expires_at) VALUES (?,?,0,?) ON CONFLICT(email) DO UPDATE SET code_hash = excluded.code_hash, attempts = 0, expires_at = excluded.expires_at", email, codeHash(email, code), now() + OTP_TTL_MS);
  const sent = await sendEmail({
    to: email,
    subject: `${code} is your ${config.brand} sign-in code`,
    text: `Your ${config.brand} sign-in code is ${code}. It expires in 10 minutes.\n\nIf you did not request this, you can ignore this email.`,
    html: `<p style="font:16px system-ui">Your ${config.brand} sign-in code is</p><p style="font:700 32px system-ui;letter-spacing:6px">${code}</p><p style="font:14px system-ui;color:#666">It expires in 10 minutes. If you did not request this, you can ignore this email.</p>`,
  });
  return { email, devCode: isDev && !sent ? code : undefined };
}

export function verifyEmailCode(emailRaw, codeRaw, device) {
  const email = String(emailRaw || "").trim().toLowerCase();
  const code = String(codeRaw || "").replace(/\D/g, "");
  if (!isReviewLogin(email, code)) {
    const row = get("SELECT * FROM otp_codes WHERE email = ?", email);
    if (!row || row.expires_at < now()) throw badRequest("code_expired", "That code has expired. Request a new one.");
    if (row.attempts >= 5) throw badRequest("too_many_attempts", "Too many attempts. Request a new code.");
    if (row.code_hash !== codeHash(email, code)) {
      run("UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?", email);
      throw badRequest("wrong_code", "That code is not right. Check the email and try again.");
    }
    run("DELETE FROM otp_codes WHERE email = ?", email);
  }
  let user = get("SELECT * FROM users WHERE email = ?", email);
  if (user?.deleted_at) run("UPDATE users SET deleted_at = NULL, created_at = ? WHERE id = ?", now(), user.id);
  if (!user) {
    const id = uuid();
    run("INSERT INTO users (id, email, created_at, last_seen_at) VALUES (?,?,?,?)", id, email, now(), now());
    user = get("SELECT * FROM users WHERE id = ?", id);
  }
  const token = createSession(user.id, device);
  return { token, user };
}

// ---- Account deletion ---------------------------------------------------------
export async function deleteAccount(userId) {
  const u = get("SELECT * FROM users WHERE id = ?", userId);
  if (!u) return;
  await revokeAppleToken(u.apple_refresh_token).catch(() => {});
  const images = all("SELECT id, ext FROM images WHERE user_id = ?", userId);
  transaction(() => {
    run("UPDATE subscriptions SET user_id = NULL WHERE user_id = ?", userId);
    run("UPDATE ai_calls SET user_id = NULL WHERE user_id = ?", userId);
    run("DELETE FROM usage WHERE user_id = ?", userId);
    run("DELETE FROM jobs WHERE user_id = ?", userId);
    if (u.email) run("DELETE FROM otp_codes WHERE email = ?", u.email);
    run("DELETE FROM sessions WHERE user_id = ?", userId);
    run("DELETE FROM sites WHERE user_id = ?", userId);
    run("DELETE FROM images WHERE user_id = ?", userId);
    run("DELETE FROM devices WHERE user_id = ?", userId);
    run("DELETE FROM users WHERE id = ?", userId);
  });
  for (const im of images) {
    try { fs.unlinkSync(path.join(config.dataDir, "uploads", `${im.id}.${im.ext}`)); } catch {}
  }
}

// ---- Routes -------------------------------------------------------------------
export function registerAuthRoutes(router) {
  router.post("/api/auth/apple", async (ctx) => {
    rateLimit(`auth:${clientIp(ctx.req)}`, { capacity: 20, refillPerSec: 0.2 });
    const body = await readJsonBody(ctx.req);
    const { token, user } = await signInWithApple({ ...body, device: body.device });
    return { token, user: publicUser(user) };
  });
  router.post("/api/auth/email/start", async (ctx) => {
    rateLimit(`otp:${clientIp(ctx.req)}`, { capacity: 10, refillPerSec: 0.05 });
    const body = await readJsonBody(ctx.req);
    const r = await startEmailSignIn(body.email);
    return { ok: true, email: r.email, ...(r.devCode ? { devCode: r.devCode } : {}) };
  });
  router.post("/api/auth/email/verify", async (ctx) => {
    rateLimit(`otpv:${clientIp(ctx.req)}`, { capacity: 20, refillPerSec: 0.1 });
    const body = await readJsonBody(ctx.req);
    const { token, user } = verifyEmailCode(body.email, body.code, body.device);
    return { token, user: publicUser(user) };
  });
  router.post("/api/auth/signout", requireAuth, async (ctx) => {
    run("DELETE FROM sessions WHERE token_hash = ?", sha256(bearer(ctx.req)));
    return { ok: true };
  });
  router.delete("/api/me", requireAuth, async (ctx) => {
    await deleteAccount(ctx.user.id);
    return { ok: true };
  });
  router.post("/api/me/ai-consent", requireAuth, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    run("UPDATE users SET ai_consent_at = ? WHERE id = ?", body.consent === false ? null : now(), ctx.user.id);
    return { user: publicUser(get("SELECT * FROM users WHERE id = ?", ctx.user.id)) };
  });
  router.patch("/api/me", requireAuth, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    if (typeof body.name === "string") run("UPDATE users SET name = ? WHERE id = ?", body.name.slice(0, 120), ctx.user.id);
    return { user: publicUser(get("SELECT * FROM users WHERE id = ?", ctx.user.id)) };
  });
}

// Purge expired sessions/codes hourly.
setInterval(() => {
  try {
    db.exec(`DELETE FROM sessions WHERE expires_at < ${now()}; DELETE FROM otp_codes WHERE expires_at < ${now()}`);
  } catch {}
}, 3600e3).unref();
