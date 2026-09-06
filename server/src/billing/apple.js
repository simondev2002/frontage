// Apple In-App Purchase: verifies StoreKit 2 signed transactions sent by the
// app, and App Store Server Notifications V2 sent by Apple. Both paths land
// in the `subscriptions` table which drives entitlements.
import fs from "node:fs";
import path from "node:path";
import { SignedDataVerifier, Environment } from "@apple/app-store-server-library";
import { config, isDev } from "../config.js";
import { get, run, now } from "../db.js";
import { badRequest, readJsonBody, uuid, clientIp, rateLimit } from "../util/http.js";
import { requireAuth } from "../auth.js";
import { entitlement } from "./entitlements.js";

// ---- Verifier setup -------------------------------------------------------------
let rootCerts = null;
function loadRootCerts() {
  if (rootCerts) return rootCerts;
  rootCerts = [];
  const dir = config.apple.certsDir;
  if (fs.existsSync(dir)) {
    for (const f of fs.readdirSync(dir)) if (/\.(cer|der)$/i.test(f)) rootCerts.push(fs.readFileSync(path.join(dir, f)));
  }
  if (!rootCerts.length) console.warn("[apple] No Apple root certificates found in", dir, "- run `npm run certs`. IAP verification is DISABLED (dev only).");
  return rootCerts;
}

const verifiers = new Map();
function verifierFor(envName) {
  const certs = loadRootCerts();
  if (!certs.length) return null;
  const env = envName === "Sandbox" ? Environment.SANDBOX : Environment.PRODUCTION;
  if (env === Environment.SANDBOX && !config.apple.allowSandbox) throw badRequest("sandbox_disabled", "Sandbox purchases are not accepted here.");
  const key = String(env);
  if (!verifiers.has(key)) {
    verifiers.set(key, new SignedDataVerifier(certs, true, env, config.apple.bundleId, env === Environment.PRODUCTION ? config.apple.appAppleId : undefined));
  }
  return verifiers.get(key);
}

function peekPayload(jws) {
  try {
    const p = String(jws).split(".")[1];
    return JSON.parse(Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
  } catch {
    throw badRequest("invalid_jws", "Malformed signed payload");
  }
}

export async function decodeTransaction(jws) {
  const peek = peekPayload(jws);
  const v = verifierFor(peek.environment || "Production");
  if (!v) {
    if (isDev) return peek; // no certs locally: trust the payload for development only
    throw badRequest("verification_unavailable", "Purchase verification is not configured.");
  }
  return v.verifyAndDecodeTransaction(jws);
}
async function decodeRenewal(jws, envName) {
  if (!jws) return null;
  const v = verifierFor(envName);
  if (!v) return isDev ? peekPayload(jws) : null;
  return v.verifyAndDecodeRenewalInfo(jws);
}

export function tierForProduct(productId) {
  return config.apple.products[productId] || null;
}

// ---- Persisting -----------------------------------------------------------------
function statusFrom(tx, renewal) {
  const t = now();
  if (tx.revocationDate) return "revoked";
  if (renewal?.gracePeriodExpiresDate && renewal.gracePeriodExpiresDate > t) return "grace";
  if (renewal?.isInBillingRetryPeriod) return "billing_retry";
  if (tx.expiresDate && tx.expiresDate > t) return "active";
  return "expired";
}

export function upsertAppleSubscription({ userId, tx, renewal, source }) {
  const tier = tierForProduct(tx.productId);
  if (!tier) {
    console.warn("[apple] unknown product", tx.productId);
    return null;
  }
  const ref = `apple:${tx.originalTransactionId}`;
  const existing = get("SELECT * FROM subscriptions WHERE provider_ref = ?", ref);
  let owner = userId || existing?.user_id || null;
  if (!owner && tx.appAccountToken) {
    const u = get("SELECT id FROM users WHERE id = ?", String(tx.appAccountToken).toLowerCase());
    if (u) owner = u.id;
  }
  const status = statusFrom(tx, renewal);
  let expiresAt = tx.expiresDate || null;
  if (status === "grace" && renewal?.gracePeriodExpiresDate) expiresAt = renewal.gracePeriodExpiresDate;
  const autoRenew = renewal ? (renewal.autoRenewStatus === 1 ? 1 : 0) : existing ? existing.auto_renew : 1;
  const raw = JSON.stringify({ tx, renewal, source, at: now() });
  if (existing) {
    // Never let an older transaction (e.g. a replayed sync) roll back a newer state.
    const prev = JSON.parse(existing.raw_json || "{}");
    if (prev.tx?.signedDate && tx.signedDate && tx.signedDate < prev.tx.signedDate && source !== "notification") return existing;
    run("UPDATE subscriptions SET user_id = ?, product_id = ?, tier = ?, status = ?, expires_at = ?, auto_renew = ?, environment = ?, raw_json = ?, updated_at = ? WHERE id = ?",
      owner, tx.productId, tier, status, expiresAt, autoRenew, tx.environment || null, raw, now(), existing.id);
    return get("SELECT * FROM subscriptions WHERE id = ?", existing.id);
  }
  const id = uuid();
  run("INSERT INTO subscriptions (id, user_id, provider, provider_ref, product_id, tier, status, expires_at, auto_renew, environment, raw_json, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
    id, owner, "apple", ref, tx.productId, tier, status, expiresAt, autoRenew, tx.environment || null, raw, now());
  return get("SELECT * FROM subscriptions WHERE id = ?", id);
}

// ---- App Store Server Notifications V2 ------------------------------------------
export async function handleNotification(signedPayload) {
  const peek = peekPayload(signedPayload);
  const envName = peek?.data?.environment || "Production";
  const v = verifierFor(envName);
  let n;
  if (v) n = await v.verifyAndDecodeNotification(signedPayload);
  else if (isDev) n = peek;
  else throw badRequest("verification_unavailable", "Notification verification not configured");

  if (n.notificationUUID && get("SELECT 1 FROM apple_notifications WHERE notification_uuid = ?", n.notificationUUID)) return { duplicate: true };
  run("INSERT OR IGNORE INTO apple_notifications (notification_uuid, type, subtype, payload_json, created_at) VALUES (?,?,?,?,?)", n.notificationUUID || uuid(), n.notificationType, n.subtype || null, JSON.stringify({ type: n.notificationType, subtype: n.subtype, env: envName }), now());

  if (n.notificationType === "TEST") return { ok: true, test: true };
  const data = n.data || {};
  if (!data.signedTransactionInfo) return { ok: true, ignored: n.notificationType };
  const tx = v ? await v.verifyAndDecodeTransaction(data.signedTransactionInfo) : peekPayload(data.signedTransactionInfo);
  const renewal = await decodeRenewal(data.signedRenewalInfo, envName);
  const sub = upsertAppleSubscription({ tx, renewal, source: "notification" });
  // Explicit terminal states that the derived status may not capture.
  if (sub && ["REFUND", "REVOKE"].includes(n.notificationType)) run("UPDATE subscriptions SET status = 'revoked', updated_at = ? WHERE id = ?", now(), sub.id);
  if (sub && n.notificationType === "EXPIRED") run("UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE id = ?", now(), sub.id);
  if (sub && n.notificationType === "GRACE_PERIOD_EXPIRED") run("UPDATE subscriptions SET status = 'expired', updated_at = ? WHERE id = ?", now(), sub.id);
  console.log(`[apple] ${n.notificationType}${n.subtype ? "/" + n.subtype : ""} -> ${sub ? sub.status + " " + sub.tier : "no-sub"}`);
  return { ok: true };
}

// ---- Routes ---------------------------------------------------------------------
export function registerAppleBillingRoutes(router) {
  // App sends Transaction.jwsRepresentation after purchase, and all
  // currentEntitlements on launch (sync). Both go here.
  router.post("/api/billing/apple/transactions", requireAuth, async (ctx) => {
    rateLimit(`iap:${ctx.user.id}`, { capacity: 30, refillPerSec: 0.5 });
    const body = await readJsonBody(ctx.req);
    const list = Array.isArray(body.transactions) ? body.transactions : body.transaction ? [body.transaction] : [];
    if (!list.length) throw badRequest("missing_transaction", "No transaction supplied");
    const results = [];
    for (const jws of list.slice(0, 20)) {
      try {
        const tx = await decodeTransaction(jws);
        // A purchase belongs to the account that made it: the appAccountToken we
        // set at purchase time must match, and an already-owned subscription
        // cannot be claimed by another account.
        const tokenOwner = tx.appAccountToken ? String(tx.appAccountToken).toLowerCase() : null;
        const existing = get("SELECT user_id FROM subscriptions WHERE provider_ref = ?", `apple:${tx.originalTransactionId}`);
        if ((tokenOwner && tokenOwner !== ctx.user.id.toLowerCase()) || (existing?.user_id && existing.user_id !== ctx.user.id)) {
          console.warn("[apple] transaction ownership mismatch", tx.originalTransactionId, "by", ctx.user.id);
          results.push({ productId: tx.productId, error: "not_your_purchase", message: "This purchase belongs to another account." });
          continue;
        }
        const sub = upsertAppleSubscription({ userId: ctx.user.id, tx, renewal: null, source: "app" });
        results.push({ productId: tx.productId, status: sub?.status || "unknown", expiresAt: tx.expiresDate || null });
      } catch (e) {
        console.warn("[apple] transaction rejected:", e.message);
        results.push({ error: e.code || "invalid", message: e.message });
      }
    }
    return { results, entitlement: entitlement(ctx.user.id) };
  });

  const notify = async (ctx) => {
    const body = await readJsonBody(ctx.req, 1024 * 1024);
    if (!body.signedPayload) throw badRequest("missing_payload", "signedPayload required");
    try {
      return await handleNotification(body.signedPayload);
    } catch (e) {
      console.error("[apple] notification failed:", e.message);
      // Apple retries on non-2xx; return 200 for verification errors we cannot fix by retrying.
      return { ok: false, error: e.message };
    }
  };
  router.post("/api/billing/apple/notifications", notify);
  router.post("/api/billing/apple/notifications/sandbox", notify);

  router.get("/api/billing/entitlement", requireAuth, async (ctx) => ({ entitlement: entitlement(ctx.user.id) }));

  router.get("/api/billing/config", requireAuth, async () => ({
    products: Object.entries(config.apple.products).map(([productId, tier]) => ({ productId, tier })),
    plans: config.plans,
    externalLink: config.stripe.externalLinkUS && config.stripe.secretKey ? { enabled: true, storefronts: ["USA"], url: `${config.publicBaseUrl}/subscribe` } : { enabled: false },
  }));
}
