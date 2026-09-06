// Serves customer websites by Host header (<slug>.sites-domain and custom
// domains), draft previews, robots/sitemap, the abuse report page and the
// Caddy on-demand TLS "ask" endpoint. Every HTML response carries a strict,
// nonce-based Content-Security-Policy so injected markup cannot run script.
import { config } from "./config.js";
import { get, run, now } from "./db.js";
import { html, escapeHtml as esc, readJsonBody, rateLimit, clientIp, randomToken, safeEqual, isPrivateAddress, baseSecurityHeaders } from "./util/http.js";
import { renderDraft, renderPublished, renderLegal, siteUrls, domainIsServed, NONCE_PLACEHOLDER } from "./sites.js";
import { tierFor } from "./billing/entitlements.js";
import { sendEmail } from "./email.js";

const hostOnly = (h) => String(h || "").toLowerCase().split(":")[0];

function csp(nonce) {
  return [
    "default-src 'self'",
    `script-src 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src https://fonts.gstatic.com data:",
    "img-src 'self' https: data:",
    "frame-src https://www.google.com https://maps.google.com",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

// Swaps the render-time placeholder for a fresh nonce and attaches headers.
export function secureHtml(body, status = 200, extra = {}) {
  const nonce = randomToken(16);
  return html(body.replaceAll(NONCE_PLACEHOLDER, nonce), status, {
    ...baseSecurityHeaders(),
    "Content-Security-Policy": csp(nonce),
    ...extra,
  });
}

export function resolveSiteForHost(hostHeader) {
  const host = hostOnly(hostHeader);
  const sitesHost = hostOnly(config.sitesDomain);
  const appHost = hostOnly(config.appHost);
  if (!host || host === appHost || host === "localhost" || host === "127.0.0.1") return { kind: "app" };
  if (host.endsWith("." + sitesHost)) {
    const slug = host.slice(0, -(sitesHost.length + 1));
    if (!slug || slug.includes(".")) return { kind: "none" };
    if (slug === "www" || slug === "app" || slug === "api") return { kind: "app" };
    return { kind: "site", site: get("SELECT * FROM sites WHERE slug = ?", slug) || null, custom: false };
  }
  const bare = host.replace(/^www\./, "");
  const site = get("SELECT * FROM sites WHERE custom_domain = ? AND custom_domain_status = 'active'", bare);
  return { kind: "site", site: site || null, custom: true };
}

export async function handleHostRequest(ctx) {
  const r = resolveSiteForHost(ctx.req.headers.host);
  if (r.kind === "app") return false;
  const send = (out) => {
    ctx.res.writeHead(out.status, out.headers);
    ctx.res.end(ctx.method === "HEAD" ? "" : out.body);
    return true;
  };
  if (r.kind === "none" || !r.site) return send(secureHtml(placeholderPage("Nothing here yet", "There is no website at this address yet."), 404));
  const site = r.site;
  const p = ctx.path;
  const noindex = { "X-Robots-Tag": "noindex", "Cache-Control": "no-store" };
  // Guideline 1.2: content we removed after a report stays offline.
  if (site.suspended_reason) {
    return send(secureHtml(placeholderPage("This website is unavailable", "It was taken offline for violating our content rules."), 451, noindex));
  }
  if (site.status !== "published" || !site.published_json) {
    return send(secureHtml(placeholderPage(site.name, "This website is being prepared. Check back soon."), 404, noindex));
  }
  // The owner's plan decides whether the site is served at all, and where.
  const plan = config.plans[tierFor(site.user_id)] || config.plans.free;
  if (!plan.publish) {
    return send(secureHtml(placeholderPage(site.name, "This website is paused. If you are the owner, open the Frontage app to reactivate it."), 503, { ...noindex, "Retry-After": "86400" }));
  }
  const urls = siteUrls(site);
  if (r.custom && !plan.customDomain) {
    return send({ status: 302, headers: { Location: `${urls.subdomain}/`, "Cache-Control": "no-store" }, body: "" });
  }
  if (p === "/robots.txt") return send({ status: 200, headers: { "Content-Type": "text/plain", ...baseSecurityHeaders() }, body: `User-agent: *\nAllow: /\nSitemap: ${urls.live}/sitemap.xml\n` });
  if (p === "/sitemap.xml") return send({ status: 200, headers: { "Content-Type": "application/xml", ...baseSecurityHeaders() }, body: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>${esc(urls.live)}/</loc><lastmod>${new Date(site.published_at).toISOString()}</lastmod></url></urlset>` });
  if (p === "/privacy") return send(secureHtml(renderLegal(site), 200, { "Cache-Control": "public, max-age=600" }));
  if (p !== "/" && p !== "/index.html") return send(secureHtml(placeholderPage("Page not found", "This page does not exist. Head back to the homepage.", `${urls.live}/`), 404));
  // Canonical host: www.<custom> and the subdomain redirect to the custom domain when active and allowed.
  const host = hostOnly(ctx.req.headers.host);
  if (urls.custom && host !== site.custom_domain) return send({ status: 301, headers: { Location: `${urls.custom}/`, "Cache-Control": "no-store" }, body: "" });
  let body;
  try {
    body = renderPublished(site);
    recordView(site.id, ctx);
  } catch (e) {
    console.error("[hosting] render failed", site.id, e.message);
    body = placeholderPage(site.name, "Temporarily unavailable.");
  }
  return send(secureHtml(body, 200, { "Cache-Control": "public, max-age=120" }));
}

// Privacy-friendly visit counter: a daily total per site, no cookies, no IPs stored.
const BOT_UA = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|telegram|preview|monitor|curl|wget|python|node-fetch|headless|lighthouse/i;
function recordView(siteId, ctx) {
  if (ctx.method === "HEAD") return;
  if (BOT_UA.test(String(ctx.req.headers["user-agent"] || ""))) return;
  const day = new Date().toISOString().slice(0, 10);
  try {
    run("INSERT INTO site_views (site_id, day, views) VALUES (?,?,1) ON CONFLICT(site_id, day) DO UPDATE SET views = views + 1", siteId, day);
  } catch {}
}

export function registerHostingRoutes(router) {
  // Draft preview for the app (WKWebView) and for sharing with friends.
  router.get("/p/:id", async (ctx) => {
    const site = get("SELECT * FROM sites WHERE id = ?", ctx.params.id);
    const t = ctx.url.searchParams.get("t");
    const noindex = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
    if (!site || !safeEqual(t, site.preview_token)) return secureHtml(placeholderPage("Preview not found", "This preview link is not valid."), 404, noindex);
    if (!site.spec_json) return secureHtml(placeholderPage(site.name, "Your website is still being created."), 200, noindex);
    return secureHtml(renderDraft(site), 200, noindex);
  });
  // The draft's privacy notice, so the footer link works in the app preview too.
  router.get("/p/:id/privacy", async (ctx) => {
    const site = get("SELECT * FROM sites WHERE id = ?", ctx.params.id);
    const t = ctx.url.searchParams.get("t");
    const noindex = { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" };
    if (!site || !safeEqual(t, site.preview_token) || !site.spec_json) return secureHtml(placeholderPage("Preview not found", "This preview link is not valid."), 404, noindex);
    return secureHtml(renderLegal(site, { preview: true }), 200, noindex);
  });

  // Caddy on_demand_tls ask endpoint: only issue certificates for domains we serve.
  // Reachable from the docker network / localhost only.
  router.get("/internal/tls-ask", async (ctx) => {
    if (!isPrivateAddress(ctx.req)) return { __raw: true, status: 404, headers: { "Content-Type": "text/plain" }, body: "not found" };
    const domain = hostOnly(ctx.url.searchParams.get("domain"));
    const sitesHost = hostOnly(config.sitesDomain);
    const ok = domain === hostOnly(config.appHost) || domain === sitesHost || domain.endsWith("." + sitesHost) || domainIsServed(domain);
    return { __raw: true, status: ok ? 200 : 404, headers: { "Content-Type": "text/plain" }, body: ok ? "ok" : "unknown" };
  });

  router.get("/report", async (ctx) => {
    const siteId = String(ctx.url.searchParams.get("site") || "").replace(/[^\w-]/g, "").slice(0, 64);
    return secureHtml(reportPage(siteId));
  });
  router.post("/report", async (ctx) => {
    rateLimit(`report:${clientIp(ctx.req)}`, { capacity: 5, refillPerSec: 0.01 });
    const b = await readJsonBody(ctx.req, 32 * 1024);
    const siteId = String(b.site || "").replace(/[^\w-]/g, "").slice(0, 64);
    const reason = String(b.reason || "").slice(0, 60);
    const details = String(b.details || "").slice(0, 2000);
    run("INSERT INTO reports (site_id, host, reason, details, ip, created_at) VALUES (?,?,?,?,?,?)", siteId, String(ctx.req.headers.host || "").slice(0, 253), reason, details, clientIp(ctx.req), now());
    sendEmail({ to: config.supportEmail, subject: `[${config.brand}] Abuse report for site ${siteId}`, text: `Reason: ${reason}\n\n${details}\n\nSite: ${config.publicBaseUrl}/p/${siteId}` }).catch(() => {});
    return { ok: true };
  });
}

export function placeholderPage(title, text, backHref) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f4ef;color:#1d1c1a}main{max-width:460px;padding:40px;text-align:center}h1{font-size:1.8rem;margin:0 0 12px;letter-spacing:-.02em}p{color:#5a5752;line-height:1.5}a.btn{display:inline-block;margin-top:18px;padding:12px 20px;border-radius:10px;background:#1d1c1a;color:#fff;text-decoration:none;font-weight:600}small{display:block;margin-top:40px;color:#8a8680}small a{color:inherit}</style></head>
<body><main><h1>${esc(title)}</h1><p>${esc(text)}</p>${backHref ? `<a class="btn" href="${esc(backHref)}">Go to homepage</a>` : ""}<small>Websites by <a href="${esc(config.publicBaseUrl)}">${esc(config.brand)}</a></small></main></body></html>`;
}

function reportPage(siteId) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Report a website · ${esc(config.brand)}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;background:#f6f4ef;color:#1d1c1a}main{max-width:520px;margin:0 auto;padding:48px 24px}h1{letter-spacing:-.02em}label{display:block;font-weight:600;margin:18px 0 6px}select,textarea{width:100%;font:inherit;padding:12px;border:1px solid #cfcac0;border-radius:10px;background:#fff}textarea{min-height:140px}button{margin-top:20px;padding:12px 22px;border:0;border-radius:10px;background:#1d1c1a;color:#fff;font:inherit;font-weight:600}p{color:#5a5752;line-height:1.5}</style></head>
<body><main><h1>Report a website</h1><p>Tell us what is wrong with this website. We review every report and remove content that breaks our rules.</p>
<form id="f"><input type="hidden" name="site" value="${esc(siteId)}"><label>Reason</label><select name="reason"><option>Scam or fraud</option><option>Impersonation</option><option>Hate or harassment</option><option>Illegal goods or services</option><option>Adult content</option><option>Copyright</option><option>Other</option></select>
<label>Details</label><textarea name="details" placeholder="What did you see?"></textarea><button type="submit">Send report</button><p id="m"></p></form>
<script nonce="${NONCE_PLACEHOLDER}">document.getElementById('f').addEventListener('submit',function(e){e.preventDefault();var d={};new FormData(e.target).forEach(function(v,k){d[k]=v});fetch('/report',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(d)}).then(function(){document.getElementById('m').textContent='Thank you. Your report was sent.';e.target.querySelector('button').disabled=true}).catch(function(){document.getElementById('m').textContent='Could not send. Email ${esc(config.supportEmail)}.'})});</script>
</main></body></html>`;
}
