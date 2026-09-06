// Optional web checkout via Stripe. Two reasons it exists:
//  1) Guideline 3.1.3(b): people who subscribe on the web can use the app.
//  2) The US storefront may link out to web checkout (0% Apple commission
//     while the Epic injunction stands). Enable with EXTERNAL_LINK_US=true.
// Routes are only registered when STRIPE_SECRET_KEY is set.
import crypto from "node:crypto";
import { config } from "../config.js";
import { get, run, now } from "../db.js";
import { HttpError, badRequest, readRawBody, readJsonBody, uuid, randomToken, sha256, html } from "../util/http.js";
import { requireAuth } from "../auth.js";
import { escapeHtml } from "../util/http.js";

const API = "https://api.stripe.com/v1";
const linkTokens = new Map(); // one-time tokens from the app -> user id

async function stripe(method, path, params) {
  const r = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${config.stripe.secretKey}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params ? new URLSearchParams(flatten(params)).toString() : undefined,
  });
  const j = await r.json();
  if (!r.ok) throw new HttpError(502, "stripe_error", j.error?.message || "Stripe error");
  return j;
}
function flatten(obj, prefix = "", out = {}) {
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === "object") flatten(v, key, out);
    else if (v !== undefined && v !== null) out[key] = String(v);
  }
  return out;
}

function tierForPrice(priceId) {
  if (priceId === config.stripe.priceStarter) return "starter";
  if (priceId === config.stripe.priceBusiness) return "business";
  return null;
}

async function createCheckout(userId, tier) {
  const price = tier === "business" ? config.stripe.priceBusiness : config.stripe.priceStarter;
  if (!price) throw badRequest("no_price", "That plan is not available on the web yet.");
  const user = get("SELECT * FROM users WHERE id = ?", userId);
  const session = await stripe("POST", "/checkout/sessions", {
    mode: "subscription",
    line_items: { 0: { price, quantity: 1 } },
    success_url: `${config.publicBaseUrl}/subscribe/done?ok=1`,
    cancel_url: `${config.publicBaseUrl}/subscribe/done?ok=0`,
    client_reference_id: userId,
    ...(user?.email ? { customer_email: user.email } : {}),
    metadata: { user_id: userId },
    subscription_data: { metadata: { user_id: userId } },
    allow_promotion_codes: "true",
  });
  return session.url;
}

function upsertStripeSubscription(sub, userIdHint) {
  const item = sub.items?.data?.[0];
  const tier = tierForPrice(item?.price?.id);
  if (!tier) return null;
  const ref = `stripe:${sub.id}`;
  const userId = sub.metadata?.user_id || userIdHint || get("SELECT user_id FROM subscriptions WHERE provider_ref = ?", ref)?.user_id || null;
  const statusMap = { active: "active", trialing: "active", past_due: "billing_retry", unpaid: "expired", canceled: "expired", incomplete: "expired", incomplete_expired: "expired", paused: "expired" };
  const status = statusMap[sub.status] || "expired";
  const expiresAt = (sub.current_period_end || item?.current_period_end || 0) * 1000 || null;
  const autoRenew = sub.cancel_at_period_end ? 0 : 1;
  const existing = get("SELECT id FROM subscriptions WHERE provider_ref = ?", ref);
  if (existing) {
    run("UPDATE subscriptions SET user_id = ?, product_id = ?, tier = ?, status = ?, expires_at = ?, auto_renew = ?, environment = ?, raw_json = ?, updated_at = ? WHERE id = ?",
      userId, item?.price?.id || null, tier, status, expiresAt, autoRenew, sub.livemode ? "Production" : "Sandbox", JSON.stringify(sub).slice(0, 20000), now(), existing.id);
  } else {
    run("INSERT INTO subscriptions (id, user_id, provider, provider_ref, product_id, tier, status, expires_at, auto_renew, environment, raw_json, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
      uuid(), userId, "stripe", ref, item?.price?.id || null, tier, status, expiresAt, autoRenew, sub.livemode ? "Production" : "Sandbox", JSON.stringify(sub).slice(0, 20000), now());
  }
  return true;
}

function verifySignature(rawBody, header) {
  const parts = Object.fromEntries(String(header || "").split(",").map((p) => p.split("=")));
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return false;
  const expected = crypto.createHmac("sha256", config.stripe.webhookSecret).update(`${t}.${rawBody}`).digest("hex");
  if (expected.length !== v1.length) return false;
  if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(v1))) return false;
  return Math.abs(now() / 1000 - Number(t)) < 600;
}

export function stripeEnabled() {
  return Boolean(config.stripe.secretKey);
}

export function registerStripeRoutes(router) {
  if (!stripeEnabled()) return;

  // App asks for a short-lived web checkout link (US storefront external link).
  router.post("/api/billing/stripe/link", requireAuth, async (ctx) => {
    const body = await readJsonBody(ctx.req);
    const tier = body.tier === "business" ? "business" : "starter";
    const token = randomToken(24);
    linkTokens.set(sha256(token), { userId: ctx.user.id, tier, exp: now() + 15 * 60e3 });
    return { url: `${config.publicBaseUrl}/subscribe?t=${token}` };
  });

  // Direct checkout URL creation for a signed-in web user is not needed for
  // v1; the app is the only client. /subscribe consumes the one-time token.
  router.get("/subscribe", async (ctx) => {
    const t = ctx.url.searchParams.get("t") || "";
    const entry = linkTokens.get(sha256(t));
    if (!entry || entry.exp < now()) return html(page("Link expired", "This checkout link has expired. Open the app and try again."), 410);
    linkTokens.delete(sha256(t));
    const url = await createCheckout(entry.userId, entry.tier);
    return { __raw: true, status: 302, headers: { Location: url }, body: "" };
  });

  router.get("/subscribe/done", async (ctx) => {
    const ok = ctx.url.searchParams.get("ok") === "1";
    return html(page(ok ? "You're subscribed" : "Checkout cancelled", ok ? "Thanks! Go back to the app: your plan is active within a few seconds." : "No charge was made. You can subscribe any time from the app."));
  });

  router.post("/api/billing/stripe/webhook", async (ctx) => {
    const raw = (await readRawBody(ctx.req, 1024 * 1024)).toString("utf8");
    // Unsigned webhooks could grant anyone a plan: refuse to process without a secret.
    if (!config.stripe.webhookSecret) throw new HttpError(503, "webhook_not_configured", "STRIPE_WEBHOOK_SECRET is not set");
    if (!verifySignature(raw, ctx.req.headers["stripe-signature"])) throw badRequest("bad_signature", "Invalid Stripe signature");
    const event = JSON.parse(raw);
    const obj = event.data?.object || {};
    if (event.type === "checkout.session.completed" && obj.subscription) {
      const sub = await stripe("GET", `/subscriptions/${obj.subscription}`);
      upsertStripeSubscription(sub, obj.client_reference_id || obj.metadata?.user_id);
    } else if (/^customer\.subscription\.(created|updated|deleted)$/.test(event.type)) {
      upsertStripeSubscription(obj);
    } else if (event.type === "invoice.payment_failed" && obj.subscription) {
      const sub = await stripe("GET", `/subscriptions/${obj.subscription}`);
      upsertStripeSubscription(sub);
    }
    return { received: true };
  });
}

function page(title, text) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · ${config.brand}</title><style>body{font-family:system-ui,-apple-system,sans-serif;background:#fbfaf7;color:#1c1c1a;display:grid;place-items:center;min-height:100vh;margin:0}main{max-width:420px;padding:32px;text-align:center}h1{font-size:1.6rem}p{color:#555}</style></head><body><main><h1>${escapeHtml(title)}</h1><p>${escapeHtml(text)}</p></main></body></html>`;
}
