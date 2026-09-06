// Frontage server: API for the iOS app + hosting for customer websites.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { config, ROOT, isDev } from "./config.js";
import { get, all, run, now } from "./db.js";
import { Router, HttpError, json, html, readJsonBody, escapeHtml as esc, isLoopback, baseSecurityHeaders, notFound, safeEqual } from "./util/http.js";
import { invalidateLive, startDomainWatcher } from "./sites.js";
import { registerAuthRoutes, requireAuth, publicUser } from "./auth.js";
import { registerUploadRoutes, serveImage, startUploadMaintenance } from "./uploads.js";
import { registerSiteRoutes } from "./sites.js";
import { registerLeadRoutes, handleFormPost } from "./leads.js";
import { registerAppleBillingRoutes } from "./billing/apple.js";
import { registerStripeRoutes, stripeEnabled } from "./billing/stripe.js";
import { entitlement } from "./billing/entitlements.js";
import { registerHostingRoutes, handleHostRequest } from "./hosting.js";
import { registerDevice } from "./push.js";
import { resumeJobs } from "./jobs.js";
import { aiConfigured } from "./ai/client.js";

const router = new Router();

router.get("/api/health", async () => ({ ok: true, brand: config.brand, ai: aiConfigured(), stripe: stripeEnabled(), env: config.env }));

router.get("/api/me", requireAuth, async (ctx) => ({
  user: publicUser(ctx.user),
  entitlement: entitlement(ctx.user.id),
  config: {
    brand: config.brand,
    sitesDomain: config.sitesDomain,
    supportEmail: config.supportEmail,
    termsUrl: `${config.publicBaseUrl}/terms`,
    privacyUrl: `${config.publicBaseUrl}/privacy`,
    products: Object.entries(config.apple.products).map(([productId, tier]) => ({ productId, tier })),
    externalLinkUS: config.stripe.externalLinkUS && stripeEnabled(),
    aiAvailable: aiConfigured(),
  },
}));

router.post("/api/devices", requireAuth, async (ctx) => {
  const body = await readJsonBody(ctx.req);
  return { ok: registerDevice(ctx.user.id, String(body.token || ""), body.environment === "sandbox" ? "sandbox" : "production") };
});

// Development only: fake a subscription so the app/simulator can be tested
// without StoreKit. Never registered in production, and even in development
// only reachable from the machine itself (raw socket address, not headers).
if (isDev) {
  router.post("/api/dev/subscription", requireAuth, async (ctx) => {
    if (!isLoopback(ctx.req)) throw notFound();
    const body = await readJsonBody(ctx.req);
    const tier = ["starter", "business"].includes(body.tier) ? body.tier : null;
    run(body.purge ? "DELETE FROM subscriptions WHERE user_id = ?" : "DELETE FROM subscriptions WHERE user_id = ? AND provider = 'manual'", ctx.user.id);
    if (tier) {
      run("INSERT INTO subscriptions (id, user_id, provider, provider_ref, product_id, tier, status, expires_at, auto_renew, environment, raw_json, updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)",
        `dev-${ctx.user.id}-${Date.now()}`, ctx.user.id, "manual", `manual:${ctx.user.id}:${Date.now()}`, `dev.${tier}`, tier, "active", now() + 30 * 864e5, 1, "Sandbox", "{}", now());
    }
    return { entitlement: entitlement(ctx.user.id) };
  });
}

registerAuthRoutes(router);
registerUploadRoutes(router);
registerSiteRoutes(router);
registerLeadRoutes(router);
registerAppleBillingRoutes(router);
registerStripeRoutes(router);
registerHostingRoutes(router);

// ---- Admin (simple, token-protected) -------------------------------------------------
function requireAdmin(ctx) {
  const tok = ctx.req.headers["x-admin-token"] || ctx.url.searchParams.get("token");
  if (!config.adminToken || !safeEqual(tok, config.adminToken)) throw new HttpError(401, "unauthorized", "Admin token required");
}

// Moderation actions for abuse reports (guideline 1.2): take a site offline or restore it.
router.post("/api/admin/sites/:id/suspend", async (ctx) => {
  requireAdmin(ctx);
  const body = await readJsonBody(ctx.req);
  const site = get("SELECT id FROM sites WHERE id = ?", ctx.params.id);
  if (!site) throw notFound("Site not found");
  run("UPDATE sites SET suspended_reason = ?, updated_at = ? WHERE id = ?", String(body.reason || "content policy").slice(0, 200), now(), site.id);
  invalidateLive(site.id);
  return { ok: true };
});
router.post("/api/admin/sites/:id/restore", async (ctx) => {
  requireAdmin(ctx);
  run("UPDATE sites SET suspended_reason = NULL, updated_at = ? WHERE id = ?", now(), ctx.params.id);
  invalidateLive(ctx.params.id);
  return { ok: true };
});
router.get("/api/admin/reports", async (ctx) => {
  requireAdmin(ctx);
  return { reports: all("SELECT id, site_id AS siteId, reason, details, created_at AS createdAt FROM reports ORDER BY id DESC LIMIT 100") };
});

router.get("/api/admin/stats", async (ctx) => {
  requireAdmin(ctx);
  const month = new Date().toISOString().slice(0, 7);
  const subs = all("SELECT tier, COUNT(*) AS n FROM subscriptions WHERE status IN ('active','grace','billing_retry') AND (expires_at IS NULL OR expires_at > ?) GROUP BY tier", now());
  const byTier = Object.fromEntries(subs.map((s) => [s.tier, s.n]));
  const mrr = (byTier.starter || 0) * 9.99 + (byTier.business || 0) * 19.99;
  return {
    users: get("SELECT COUNT(*) AS n FROM users WHERE deleted_at IS NULL").n,
    sites: { total: get("SELECT COUNT(*) AS n FROM sites").n, published: get("SELECT COUNT(*) AS n FROM sites WHERE status = 'published'").n, customDomains: get("SELECT COUNT(*) AS n FROM sites WHERE custom_domain_status = 'active'").n },
    subscriptions: byTier,
    mrrGrossUsd: Number(mrr.toFixed(2)),
    ai: {
      month,
      costUsd: Number((get("SELECT COALESCE(SUM(cost_usd),0) AS c FROM ai_calls WHERE created_at > ?", Date.parse(month + "-01T00:00:00Z")).c).toFixed(2)),
      calls: get("SELECT COUNT(*) AS n FROM ai_calls WHERE created_at > ?", Date.parse(month + "-01T00:00:00Z")).n,
      failed24h: get("SELECT COUNT(*) AS n FROM ai_calls WHERE ok = 0 AND created_at > ?", now() - 864e5).n,
      byKind: all("SELECT kind, COUNT(*) AS n, ROUND(AVG(cost_usd), 4) AS avgCost, ROUND(SUM(cost_usd), 2) AS total FROM ai_calls WHERE created_at > ? GROUP BY kind", Date.parse(month + "-01T00:00:00Z")),
    },
    leads30d: get("SELECT COUNT(*) AS n FROM leads WHERE created_at > ?", now() - 30 * 864e5).n,
    reportsOpen: get("SELECT COUNT(*) AS n FROM reports").n,
  };
});

// ---- Static marketing/legal pages on the app host -------------------------------------
const publicDir = path.join(ROOT, "public");
const MIME = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".png": "image/png", ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".ico": "image/x-icon", ".txt": "text/plain", ".json": "application/json", ".webmanifest": "application/manifest+json" };
function serveStatic(ctx) {
  if (ctx.method !== "GET" && ctx.method !== "HEAD") return false;
  let p = ctx.path === "/" ? "/index.html" : ctx.path;
  if (!path.extname(p)) p += ".html";
  // public/dev/* (the browser app preview) is development-only.
  if (p.startsWith("/dev/") && !isDev) return false;
  const file = path.normalize(path.join(publicDir, p));
  if (!file.startsWith(publicDir + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const body = fs.readFileSync(file);
  ctx.res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": isDev ? "no-store" : "public, max-age=600", "Content-Length": body.length, ...baseSecurityHeaders() });
  ctx.res.end(ctx.method === "HEAD" ? undefined : body);
  return true;
}

// ---- Server ------------------------------------------------------------------------------
const server = http.createServer(async (req, res) => {
  const started = Date.now();
  const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
  const ctx = { req, res, url, path: url.pathname, method: req.method === "HEAD" ? "GET" : req.method, params: {}, user: null };
  if (req.method === "HEAD") ctx.method = "HEAD";
  try {
    if (serveImage(ctx)) return;
    const form = /^\/f\/([A-Za-z0-9-]{8,64})$/.exec(ctx.path);
    if (form && ctx.method === "POST") return json(res, 200, await handleFormPost(ctx, form[1]), { "Access-Control-Allow-Origin": "*" });
    if (form && ctx.method === "OPTIONS") return json(res, 204, null, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type", "Access-Control-Allow-Methods": "POST" });
    if (await handleHostRequest(ctx)) return;
    if (ctx.method === "HEAD") ctx.method = "GET";
    if (await router.dispatch(ctx)) return;
    if (serveStatic(ctx)) return;
    if (ctx.path.startsWith("/api/")) return json(res, 404, { error: "not_found", message: "No such endpoint" });
    res.writeHead(404, { "Content-Type": "text/html; charset=utf-8", ...baseSecurityHeaders() });
    res.end(`<!doctype html><title>Not found</title><p style="font-family:system-ui;padding:40px">Page not found. <a href="/">${esc(config.brand)}</a></p>`);
  } catch (e) {
    if (e instanceof HttpError) {
      json(res, e.status, { error: e.code, message: e.message, ...(e.extra || {}) });
    } else {
      console.error(`[${req.method} ${url.pathname}]`, e);
      if (!res.headersSent) json(res, 500, { error: "server_error", message: "Something went wrong on our side. Please try again." });
      else res.end();
    }
  } finally {
    if (isDev && !ctx.path.startsWith("/i/")) console.log(`${req.method} ${url.pathname} ${res.statusCode} ${Date.now() - started}ms`);
  }
});

// Refuse to run in production with unsafe defaults.
if (!isDev) {
  const problems = [];
  if (config.sessionSecret === "dev-only-change-me" || config.sessionSecret.length < 32) problems.push("SESSION_SECRET must be a long random string");
  if (!config.publicBaseUrl.startsWith("https://")) problems.push("PUBLIC_BASE_URL must be https in production");
  if (config.stripe.secretKey && !config.stripe.webhookSecret) problems.push("STRIPE_WEBHOOK_SECRET is required when STRIPE_SECRET_KEY is set");
  if (!config.apple.appAppleId) console.warn("!! APPLE_APP_ID is not set: production App Store receipts cannot be verified");
  if (problems.length) {
    for (const p of problems) console.error("!! " + p);
    process.exit(1);
  }
}

server.keepAliveTimeout = 65_000;
// Slow-request protection: headers must arrive quickly, whole requests within a minute
// (uploads are capped at 8 MB so this is generous), and no header floods.
server.headersTimeout = 20_000;
server.requestTimeout = 60_000;
server.maxHeadersCount = 100;
server.listen(config.port, () => {
  console.log(`${config.brand} server listening on :${config.port} (${config.env})`);
  console.log(`  app host: ${config.appHost}  sites: *.${config.sitesDomain}  AI: ${aiConfigured() ? config.ai.model : "NOT CONFIGURED"}`);
  if (config.sessionSecret === "dev-only-change-me" && !isDev) console.warn("!! SESSION_SECRET is the default; set it in .env");
  resumeJobs();
  startUploadMaintenance();
  startDomainWatcher();
});
