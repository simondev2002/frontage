// Sites: creation from a brief, AI generation/edit jobs, versions, publishing,
// subdomains and custom domains.
import dns from "node:dns/promises";
import { config, reservedSlugs, isDev } from "./config.js";
import { get, all, run, now, parseJson, transaction } from "./db.js";
import { badRequest, notFound, forbidden, readJsonBody, uuid, randomToken, rateLimit, isLoopback } from "./util/http.js";
import { requireAuth, requireAiConsent } from "./auth.js";
import { assertCan, bumpUsage, entitlement, tierFor } from "./billing/entitlements.js";
import { enqueueJob, getJob, jobOwner, registerJobHandler, onJobDone } from "./jobs.js";
import { suggestIdeas } from "./ai/suggest.js";
import { generateSite } from "./ai/generate.js";
import { editSite } from "./ai/edit.js";
import { moderateSpec } from "./ai/moderate.js";
import { aiConfigured } from "./ai/client.js";
import { renderSite } from "./renderer/index.js";
import { formLabelsFor } from "./renderer/sections.js";
import { legalContent, renderLegalPage, ensureLegalTranslation } from "./legal.js";
import { validateSpec } from "./ai/schema.js";
import { imagesForSite, imageMap, stripPrivate } from "./uploads.js";
import { unreadLeadCount } from "./leads.js";
import { ensureCustomHostnames, removeCustomHostnames, customHostnameStatus, cloudflareSaasEnabled } from "./cloudflare.js";

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{0,38}[a-z0-9])?$/;
// Replaced per request by hosting.js with a fresh CSP nonce.
export const NONCE_PLACEHOLDER = "%%NONCE%%";
const HOST_RE = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

export function siteUrls(site) {
  const proto = config.env === "production" ? "https" : "http";
  const sub = site.slug ? `${proto}://${site.slug}.${config.sitesDomain}` : null;
  const custom = site.custom_domain && site.custom_domain_status === "active" ? `https://${site.custom_domain}` : null;
  return {
    preview: `${config.publicBaseUrl}/p/${site.id}?t=${site.preview_token}`,
    subdomain: sub,
    custom,
    live: site.status === "published" ? custom || sub : null,
  };
}

// Visits in the last 7 / 30 days (from the daily counter in hosting.js).
export function viewsFor(siteId) {
  const since = (d) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  return {
    week: get("SELECT COALESCE(SUM(views), 0) AS n FROM site_views WHERE site_id = ? AND day >= ?", siteId, since(7)).n,
    month: get("SELECT COALESCE(SUM(views), 0) AS n FROM site_views WHERE site_id = ? AND day >= ?", siteId, since(30)).n,
  };
}

// Next-step ideas the app shows as chips. Needs first (photos, gallery), then the
// AI's site-specific ideas cached on the row, then a few safe standbys.
export function suggestionsFor(spec, images = [], site = null) {
  if (!spec) return [];
  const types = new Set(spec.sections.map((s) => s.type));
  const featured = images.filter((i) => i.kind === "featured");
  const out = [];
  const push = (s) => { if (s?.label && !out.some((o) => o.label.toLowerCase() === s.label.toLowerCase())) out.push(s); };
  if (!featured.length) push({ label: "Add your photos", instruction: "", action: "photos" });
  else if (!types.has("gallery") && featured.length >= 3) push({ label: "Add a photo gallery", instruction: "Add a gallery section with all my photos, placed before the contact section." });
  for (const idea of parseJson(site?.suggestions_json, []) || []) push({ label: idea.label, instruction: idea.instruction, action: null });
  if (!types.has("testimonials")) push({ label: "Add a customer review", instruction: 'Add a reviews section with this review from a customer: ""' });
  if (!spec.meta.hours?.length) push({ label: "Add opening hours", instruction: "Add our opening hours: Monday to Friday 9:00 to 18:00, Saturday 10:00 to 14:00, closed on Sunday." });
  if (!types.has("faq")) push({ label: "Add an FAQ", instruction: "Add a short FAQ section with the questions customers ask most, before the contact section." });
  if (!spec.meta.bookingUrl && /book|appoint|reserv/i.test(`${spec.meta.category} ${spec.nav.cta?.label || ""}`)) push({ label: "Add a booking link", instruction: "Make the main button open my booking page: https://" });
  push({ label: "Make the headline punchier", instruction: "Make the headline punchier and more specific to us." });
  push({ label: "Shorter text", instruction: "Shorten all the text so it reads faster on a phone." });
  return out.slice(0, 7);
}

// Asks the model for fresh ideas and caches them on the site. Runs in the background
// after every generation and edit; failures only mean the chips stay as they were.
export async function refreshSuggestions(siteId) {
  const site = getSite(siteId);
  const spec = parseJson(site?.spec_json);
  if (!site || !spec) return;
  try {
    const ideas = await suggestIdeas({ spec, brief: parseJson(site.brief_json), userId: site.user_id, siteId });
    if (ideas.length) run("UPDATE sites SET suggestions_json = ? WHERE id = ?", JSON.stringify(ideas), siteId);
  } catch (e) {
    console.warn(`[suggest] ${siteId}: ${e.message}`);
  }
}

onJobDone((job) => {
  if (["generate", "edit"].includes(job.type) && job.site_id) refreshSuggestions(job.site_id);
});

export function publicSite(site, { withSpec = true } = {}) {
  const images = withSpec ? imagesForSite(site.id) : null;
  const spec = withSpec ? parseJson(site.spec_json) : undefined;
  return {
    id: site.id,
    name: site.name,
    slug: site.slug,
    status: site.status,
    createdAt: site.created_at,
    updatedAt: site.updated_at,
    publishedAt: site.published_at,
    customDomain: site.custom_domain,
    customDomainStatus: site.custom_domain_status,
    urls: siteUrls(site),
    hasSpec: Boolean(site.spec_json),
    spec,
    brief: withSpec ? parseJson(site.brief_json) : undefined,
    unreadLeads: unreadLeadCount(site.id),
    paused: site.status === "published" && !(config.plans[tierFor(site.user_id)] || config.plans.free).publish,
    suspended: Boolean(site.suspended_reason),
    suspendedReason: site.suspended_reason || null,
    stats: viewsFor(site.id),
    suggestions: withSpec && spec ? suggestionsFor(spec, images, site) : undefined,
    images: withSpec ? images.map(stripPrivate) : undefined,
  };
}

export function getSite(id) {
  return get("SELECT * FROM sites WHERE id = ?", id);
}
function ownedSite(ctx) {
  const s = getSite(ctx.params.id);
  if (!s || s.user_id !== ctx.user.id) throw notFound("Site not found");
  return s;
}

export function slugify(name) {
  return String(name || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40)
    .replace(/-+$/g, "");
}
export function normalizeSlug(raw) {
  const s = slugify(raw);
  if (!SLUG_RE.test(s)) return null;
  if (reservedSlugs().has(s)) return null;
  return s;
}
export function slugAvailable(slug, exceptSiteId = null) {
  const row = get("SELECT id FROM sites WHERE slug = ?", slug);
  return !row || row.id === exceptSiteId;
}
function uniqueSlug(name) {
  let base = normalizeSlug(name) || `site-${Math.random().toString(36).slice(2, 7)}`;
  if (base.length < 3) base = `${base}-site`;
  let s = base;
  for (let i = 2; !slugAvailable(s); i++) s = `${base}-${i}`;
  return s;
}

export function saveVersion(siteId, spec, source, summary) {
  const r = run("INSERT INTO site_versions (site_id, spec_json, summary, source, created_at) VALUES (?,?,?,?,?)", siteId, JSON.stringify(spec), summary || null, source, now());
  run("UPDATE sites SET spec_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(spec), now(), siteId);
  // Keep the last 60 versions per site.
  run("DELETE FROM site_versions WHERE site_id = ? AND id NOT IN (SELECT id FROM site_versions WHERE site_id = ? ORDER BY id DESC LIMIT 60)", siteId, siteId);
  return Number(r.lastInsertRowid);
}

function statusLine(p) {
  if (p < 0.15) return "Studying your business";
  if (p < 0.35) return "Choosing a look and feel";
  if (p < 0.55) return "Writing your headlines";
  if (p < 0.75) return "Arranging sections and photos";
  if (p < 0.9) return "Polishing the details";
  return "Almost there";
}

// ---- Rendering helpers ----------------------------------------------------------
export function renderOptionsFor(site, spec, { preview = false } = {}) {
  const tier = tierFor(site.user_id);
  const badge = config.plans[tier]?.badge ? { brand: config.brand, href: `${config.publicBaseUrl}/?utm_source=badge` } : null;
  const urls = siteUrls(site);
  return {
    images: imageMap(site.id),
    formEndpoint: `/f/${site.id}`,
    formLabels: formLabelsFor(spec.meta.language),
    privacyHref: preview ? `/p/${site.id}/privacy?t=${site.preview_token}` : "/privacy",
    canonical: urls.custom || urls.subdomain || undefined,
    badge,
    reportHref: `${config.publicBaseUrl}/report?site=${site.id}`,
    nonce: NONCE_PLACEHOLDER,
    preview,
    noindex: preview,
    previewLabel: preview ? (site.status === "published" ? "Preview · unpublished changes" : "Preview · not published yet") : undefined,
  };
}

export function renderDraft(site) {
  const spec = validateSpec(parseJson(site.spec_json));
  return renderSite(spec, renderOptionsFor(site, spec, { preview: true }));
}

const liveCache = new Map();
/** The site's own privacy notice page, in the site's theme; translated copy comes from the publish-time cache. */
export function renderLegal(site, { preview = false } = {}) {
  const spec = validateSpec(parseJson(preview ? site.spec_json : site.published_json || site.spec_json));
  const content = legalContent(site, spec);
  const homeHref = preview ? `/p/${site.id}?t=${site.preview_token}` : "/";
  return renderLegalPage(spec, content, { homeHref });
}

export function renderPublished(site) {
  const tier = tierFor(site.user_id);
  const key = `${site.id}:${site.published_at}:${tier}:${site.custom_domain_status}:${site.slug}`;
  const hit = liveCache.get(key);
  if (hit) return hit;
  const spec = validateSpec(parseJson(site.published_json));
  const html = renderSite(spec, renderOptionsFor(site, spec));
  if (liveCache.size > 500) liveCache.delete(liveCache.keys().next().value);
  liveCache.set(key, html);
  return html;
}
export function invalidateLive(siteId) {
  for (const k of [...liveCache.keys()]) if (k.startsWith(siteId + ":")) liveCache.delete(k);
}

// ---- Job handlers ----------------------------------------------------------------
registerJobHandler("generate", async ({ siteId, userId, input, progress }) => {
  const site = getSite(siteId);
  if (!site) throw new Error("Site disappeared");
  const brief = input.brief || parseJson(site.brief_json, {});
  progress(0.05, "Reading your brief");
  const images = imagesForSite(siteId);
  const { spec, cost, issues } = await generateSite({ brief, images, userId, siteId, onProgress: (p) => progress(0.08 + p * 0.87, statusLine(p)), onStatus: (t) => progress(0.55, t) });
  if (issues?.length) console.warn(`[generate] site ${siteId} still has notes after the gate:`, issues.join(" | "));
  const versionId = saveVersion(siteId, spec, "generate", input.regenerate ? "Regenerated" : "First version");
  run("UPDATE sites SET name = ?, updated_at = ? WHERE id = ?", spec.meta.businessName || site.name, now(), siteId);
  bumpUsage(userId, "generations");
  if (isDev) console.log(`[generate] site ${siteId} done, cost $${cost?.toFixed(3)}`);
  return { siteId, versionId };
});

registerJobHandler("edit", async ({ siteId, userId, input, progress }) => {
  const site = getSite(siteId);
  if (!site || !site.spec_json) throw new Error("Site has no design yet");
  const spec = validateSpec(parseJson(site.spec_json));
  const history = all("SELECT role, content, meta FROM chat_messages WHERE site_id = ? ORDER BY id DESC LIMIT 12", siteId).reverse().map((m) => ({ ...m, meta: parseJson(m.meta) }));
  progress(0.1, "Thinking about it");
  const images = imagesForSite(siteId);
  const attachedIds = (input.attached || []).map((a) => a.id);
  const { spec: next, reply, changes, cost } = await editSite({
    spec, images, instruction: input.instruction, history, brief: parseJson(site.brief_json), attachedIds, userId, siteId,
    onProgress: (p) => progress(0.1 + p * 0.85, p < 0.5 ? "Making the change" : "Applying it to your site"),
  });
  const summary = changes.length ? changes.join(", ") : input.instruction.slice(0, 80);
  const versionId = changes.length ? saveVersion(siteId, next, "edit", summary) : null;
  run("INSERT INTO chat_messages (site_id, role, content, version_id, created_at) VALUES (?,?,?,?,?)", siteId, "user", input.instruction + (input.attached?.length ? ` (+${input.attached.length} photo${input.attached.length === 1 ? "" : "s"})` : ""), null, now());
  run("INSERT INTO chat_messages (site_id, role, content, version_id, meta, created_at) VALUES (?,?,?,?,?,?)", siteId, "assistant", reply, versionId, JSON.stringify({ changes, attached: attachedIds }), now());
  bumpUsage(userId, "edits");
  if (isDev) console.log(`[edit] site ${siteId}: ${summary} ($${cost?.toFixed(3)})`);
  return { siteId, versionId, reply, changes };
});

// ---- Custom domains --------------------------------------------------------------
export function normalizeDomain(raw) {
  let d = String(raw || "").trim().toLowerCase();
  d = d.replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
  if (!HOST_RE.test(d)) return null;
  const sitesHost = config.sitesDomain.split(":")[0];
  if (d === sitesHost || d.endsWith("." + sitesHost)) return null;
  return d;
}
// Which company hosts the domain's DNS, from its nameservers, with a link to the
// exact page where the records are added. No partner or API involved.
const PROVIDERS = [
  { match: /domaincontrol\.com$/i, name: "GoDaddy", url: (d) => `https://dcc.godaddy.com/control/${d}/dns` },
  { match: /registrar-servers\.com$/i, name: "Namecheap", url: (d) => `https://ap.www.namecheap.com/Domains/DomainControlPanel/${d}/advancedns` },
  { match: /ns\.cloudflare\.com$/i, name: "Cloudflare", url: (d) => `https://dash.cloudflare.com/?to=/:account/${d}/dns/records` },
  { match: /ui-dns\.(com|de|org|biz)$/i, name: "IONOS", url: () => "https://my.ionos.com/domains" },
  { match: /squarespacedns\.com$|googledomains\.com$/i, name: "Squarespace Domains", url: (d) => `https://account.squarespace.com/domains/managed/${d}/dns/dns-settings` },
  { match: /dns-parking\.com$|hostinger/i, name: "Hostinger", url: (d) => `https://hpanel.hostinger.com/domain/${d}/dns` },
  { match: /porkbun\.com$/i, name: "Porkbun", url: () => "https://porkbun.com/account/domainsSpeedy" },
  { match: /dynadot\.com$/i, name: "Dynadot", url: () => "https://www.dynadot.com/account/domain/list" },
  { match: /name\.com$/i, name: "Name.com", url: (d) => `https://www.name.com/account/domain/details/${d}#dns` },
  { match: /wixdns\.net$/i, name: "Wix", url: () => "https://manage.wix.com/account/domains" },
  { match: /bluehost\.com$/i, name: "Bluehost", url: () => "https://my.bluehost.com/hosting/app#/domains" },
  { match: /ovh\.net$/i, name: "OVH", url: () => "https://www.ovh.com/manager/#/web/domain" },
  { match: /one\.com$/i, name: "one.com", url: () => "https://www.one.com/admin/dns-overview.do" },
  { match: /loopia\.se$/i, name: "Loopia", url: () => "https://customerzone.loopia.com/" },
  { match: /gandi\.net$/i, name: "Gandi", url: (d) => `https://admin.gandi.net/domain/${d}/dns/records` },
  { match: /hover\.com$/i, name: "Hover", url: (d) => `https://www.hover.com/control_panel/domain/${d}/dns` },
  { match: /awsdns/i, name: "Amazon Route 53", url: () => "https://console.aws.amazon.com/route53/v2/hostedzones" },
  { match: /digitalocean\.com$/i, name: "DigitalOcean", url: () => "https://cloud.digitalocean.com/networking/domains" },
  { match: /papaki\.com$/i, name: "Papaki", url: () => "https://www.papaki.com/manage" },
  { match: /namesilo\.com$/i, name: "NameSilo", url: () => "https://www.namesilo.com/account_domains.php" },
  { match: /worldnic\.com$/i, name: "Network Solutions", url: () => "https://www.networksolutions.com/manage-it/" },
  { match: /123-reg\.co\.uk$/i, name: "123 Reg", url: () => "https://www.123-reg.co.uk/secure/cpanel/" },
  { match: /strato/i, name: "Strato", url: () => "https://www.strato.de/apps/CustomerService" },
  { match: /inwx/i, name: "INWX", url: () => "https://www.inwx.com/en/nameserver2" },
];
export async function detectProvider(domain) {
  let ns = [];
  try { ns = await dns.resolveNs(domain); } catch {}
  const hosts = ns.map((n) => String(n).toLowerCase().replace(/\.$/, ""));
  const p = PROVIDERS.find((x) => hosts.some((h) => x.match.test(h)));
  return { nameservers: hosts, name: p ? p.name : null, dnsUrl: p ? p.url(domain) : null };
}

// Checks pending domains in the background so owners do not have to keep
// tapping "Check again": once the records resolve, the domain is activated and
// the owner gets a push and an email.
export function startDomainWatcher() {
  const tick = async () => {
    const pending = all("SELECT * FROM sites WHERE custom_domain IS NOT NULL AND custom_domain_status = 'pending' AND updated_at > ?", now() - 7 * 864e5);
    for (const site of pending) {
      try {
        const r = await checkDomainDns(site.custom_domain);
        run("UPDATE sites SET custom_domain_checked_at = ? WHERE id = ?", now(), site.id);
        if (!(r.www || r.apex)) continue;
        if (cloudflareSaasEnabled()) { const cfs = await customHostnameStatus(site.custom_domain).catch(() => null); if (cfs && !cfs.active) continue; }
        run("UPDATE sites SET custom_domain_status = 'active', updated_at = ? WHERE id = ?", now(), site.id);
        invalidateLive(site.id);
        const { pushToUser } = await import("./push.js");
        const { sendEmail } = await import("./email.js");
        const owner = get("SELECT id, email FROM users WHERE id = ?", site.user_id);
        pushToUser(site.user_id, { title: "Your domain is connected", body: `${site.custom_domain} now shows ${site.name}.`, data: { siteId: site.id } }).catch(() => {});
        if (owner?.email) sendEmail({ to: owner.email, subject: `${site.custom_domain} is connected`, text: `Good news: ${site.custom_domain} now points at ${site.name}. Visitors will see the secure version within a few minutes.` }).catch(() => {});
      } catch (e) {
        console.warn("[domains] watcher", site.custom_domain, e.message);
      }
    }
  };
  setTimeout(tick, 30_000).unref();
  setInterval(tick, 10 * 60e3).unref();
}

export function dnsInstructions(domain) {
  const records = [
    { type: "CNAME", host: "www", value: config.cnameTarget, note: `Points www.${domain} at ${config.brand}` },
  ];
  if (config.serverIPv4) records.push({ type: "A", host: "@", value: config.serverIPv4, note: `Points ${domain} (without www) at ${config.brand}` });
  else records.push({ type: "ALIAS, ANAME or flattened CNAME", host: "@", value: config.cnameTarget, note: `Points ${domain} (without www) at ${config.brand}. If your provider has no such record type, set up a redirect from ${domain} to www.${domain} instead; the www address is the one that matters.` });
  return records;
}
export async function checkDomainDns(domain) {
  const results = { www: false, apex: false };
  const target = config.cnameTarget.toLowerCase();
  try {
    const c = await dns.resolveCname(`www.${domain}`);
    results.www = c.some((x) => x.toLowerCase().replace(/\.$/, "") === target);
  } catch {}
  if (!results.www && config.serverIPv4) {
    try { results.www = (await dns.resolve4(`www.${domain}`)).includes(config.serverIPv4); } catch {}
  }
  try {
    const a = await dns.resolve4(domain);
    if (config.serverIPv4) results.apex = a.includes(config.serverIPv4);
    else {
      // ALIAS/ANAME flattening: compare with the CNAME target's addresses.
      const t = await dns.resolve4(target).catch(() => []);
      results.apex = a.some((ip) => t.includes(ip));
    }
  } catch {}
  return results;
}
export function domainIsServed(host) {
  const h = String(host || "").toLowerCase().replace(/^www\./, "");
  return Boolean(get("SELECT id FROM sites WHERE custom_domain = ? AND custom_domain_status = 'active'", h));
}

// ---- Routes ------------------------------------------------------------------------
export function registerSiteRoutes(router) {
  router.get("/api/sites", requireAuth, async (ctx) => ({
    sites: all("SELECT * FROM sites WHERE user_id = ? ORDER BY created_at DESC", ctx.user.id).map((s) => publicSite(s, { withSpec: false })),
    entitlement: entitlement(ctx.user.id),
    aiAvailable: aiConfigured(),
  }));

  router.post("/api/sites", requireAuth, async (ctx) => {
    rateLimit(`create:${ctx.user.id}`, { capacity: 5, refillPerSec: 0.01 });
    assertCan(ctx.user.id, "create_site");
    assertCan(ctx.user.id, "generate");
    const body = await readJsonBody(ctx.req);
    requireAiConsent(ctx, body);
    const brief = cleanBrief(body.brief || body);
    if (!brief.businessName) throw badRequest("missing_name", "Please tell us the business name.");
    const id = uuid();
    const slug = uniqueSlug(brief.businessName);
    transaction(() => {
      run("INSERT INTO sites (id, user_id, slug, name, status, brief_json, preview_token, created_at, updated_at) VALUES (?,?,?,?,'draft',?,?,?,?)", id, ctx.user.id, slug, brief.businessName, JSON.stringify(brief), randomToken(16), now(), now());
      if (Array.isArray(body.imageIds) && body.imageIds.length) {
        for (const imgId of body.imageIds.slice(0, 60)) run("UPDATE images SET site_id = ? WHERE id = ? AND user_id = ?", id, String(imgId), ctx.user.id);
      }
    });
    // Test hook (development, local machine only): create the site without spending an AI call.
    if (body.skipAi && isDev && isLoopback(ctx.req)) return { site: publicSite(getSite(id)), job: null };
    const job = enqueueJob({ type: "generate", siteId: id, userId: ctx.user.id, input: { brief } });
    return { site: publicSite(getSite(id)), job };
  });

  router.get("/api/sites/:id", requireAuth, async (ctx) => ({ site: publicSite(ownedSite(ctx)), entitlement: entitlement(ctx.user.id) }));

  router.patch("/api/sites/:id", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    const body = await readJsonBody(ctx.req);
    if (typeof body.name === "string" && body.name.trim()) run("UPDATE sites SET name = ?, updated_at = ? WHERE id = ?", body.name.trim().slice(0, 120), now(), site.id);
    if (typeof body.slug === "string") {
      const slug = normalizeSlug(body.slug);
      if (!slug) throw badRequest("invalid_slug", "Use 3-40 letters, numbers or dashes.");
      if (!slugAvailable(slug, site.id)) throw badRequest("slug_taken", "That address is already taken.");
      run("UPDATE sites SET slug = ?, updated_at = ? WHERE id = ?", slug, now(), site.id);
      invalidateLive(site.id);
    }
    return { site: publicSite(getSite(site.id)) };
  });

  router.get("/api/slug-check", requireAuth, async (ctx) => {
    const slug = normalizeSlug(ctx.url.searchParams.get("slug") || "");
    const except = ctx.url.searchParams.get("site");
    return { slug, available: Boolean(slug) && slugAvailable(slug, except), domain: config.sitesDomain };
  });

  router.delete("/api/sites/:id", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    run("DELETE FROM sites WHERE id = ?", site.id);
    invalidateLive(site.id);
    // The fresh entitlement lets the app unlock "New website" straight away.
    return { ok: true, entitlement: entitlement(ctx.user.id) };
  });

  // ---- AI jobs
  router.post("/api/sites/:id/generate", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    assertCan(ctx.user.id, "generate");
    rateLimit(`regen:${ctx.user.id}`, { capacity: 4, refillPerSec: 0.02 });
    if (get("SELECT id FROM jobs WHERE site_id = ? AND status IN ('queued','running')", site.id)) throw badRequest("busy", "Your website is still being created.");
    const body = await readJsonBody(ctx.req);
    requireAiConsent(ctx, body);
    const brief = body.brief ? cleanBrief(body.brief) : parseJson(site.brief_json, {});
    if (body.differentLook) {
      // "Try a different look": same facts, a clearly different design direction.
      const prev = parseJson(site.spec_json)?.theme;
      const note = `Try a clearly different direction from the previous version${prev ? ` (which used the "${prev.preset}" preset with ${prev.headingFont})` : ""}: another preset, palette, fonts and hero layout, keeping every fact the same.`;
      brief.styleNotes = `${brief.styleNotes ? brief.styleNotes + " " : ""}${note}`.slice(0, 600);
    }
    if (body.brief || body.differentLook) run("UPDATE sites SET brief_json = ?, updated_at = ? WHERE id = ?", JSON.stringify(brief), now(), site.id);
    const job = enqueueJob({ type: "generate", siteId: site.id, userId: ctx.user.id, input: { brief, regenerate: Boolean(site.spec_json) } });
    return { job };
  });

  router.post("/api/sites/:id/edit", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    if (!site.spec_json) throw badRequest("no_design", "Create the website first.");
    assertCan(ctx.user.id, "edit");
    rateLimit(`edit:${ctx.user.id}`, { capacity: 10, refillPerSec: 0.2 });
    const body = await readJsonBody(ctx.req);
    requireAiConsent(ctx, body);
    const instruction = String(body.instruction || "").trim().slice(0, 1500);
    if (instruction.length < 2) throw badRequest("empty_instruction", "Tell us what to change.");
    const pending = get("SELECT id FROM jobs WHERE site_id = ? AND status IN ('queued','running')", site.id);
    if (pending) throw badRequest("busy", "One change at a time: the previous change is still being applied.");
    // Photos attached to this request: they must belong to the owner; attach them to the site.
    const attached = [];
    for (const imgId of (Array.isArray(body.imageIds) ? body.imageIds : []).slice(0, 12)) {
      const im = get("SELECT id, caption FROM images WHERE id = ? AND user_id = ?", String(imgId), ctx.user.id);
      if (!im) continue;
      run("UPDATE images SET site_id = ? WHERE id = ?", site.id, im.id);
      attached.push({ id: im.id, caption: im.caption || "" });
    }
    const job = enqueueJob({ type: "edit", siteId: site.id, userId: ctx.user.id, input: { instruction, attached } });
    return { job };
  });

  router.get("/api/jobs/:id", requireAuth, async (ctx) => {
    if (jobOwner(ctx.params.id) !== ctx.user.id) throw notFound("Job not found");
    const job = getJob(ctx.params.id);
    const site = job.siteId ? getSite(job.siteId) : null;
    return { job, site: site && job.status === "done" ? publicSite(site) : undefined };
  });

  router.get("/api/sites/:id/messages", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    return { messages: all("SELECT id, role, content, version_id AS versionId, created_at AS createdAt FROM chat_messages WHERE site_id = ? ORDER BY id DESC LIMIT 60", site.id).reverse() };
  });

  // ---- Versions & manual spec edits
  router.get("/api/sites/:id/versions", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    return { versions: all("SELECT id, summary, source, created_at AS createdAt FROM site_versions WHERE site_id = ? ORDER BY id DESC LIMIT 40", site.id) };
  });
  router.post("/api/sites/:id/versions/:vid/restore", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    const v = get("SELECT * FROM site_versions WHERE id = ? AND site_id = ?", ctx.params.vid, site.id);
    if (!v) throw notFound("Version not found");
    saveVersion(site.id, parseJson(v.spec_json), "restore", `Restored version ${v.id}`);
    return { site: publicSite(getSite(site.id)) };
  });
  router.put("/api/sites/:id/spec", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    // Body first so oversized payloads get a clean 413 instead of a reset mid-upload.
    const body = await readJsonBody(ctx.req, 1024 * 1024);
    assertCan(ctx.user.id, "manual_edit");
    let spec;
    try { spec = validateSpec(body.spec || body); } catch (e) { throw badRequest("invalid_spec", e.message); }
    saveVersion(site.id, spec, "manual", body.summary || "Edited details");
    return { site: publicSite(getSite(site.id)) };
  });

  // ---- Publishing
  router.post("/api/sites/:id/publish", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    if (!site.spec_json) throw badRequest("no_design", "Create the website first.");
    if (site.suspended_reason) throw forbidden("suspended", `This website was taken offline by ${config.brand}: ${site.suspended_reason}. Contact ${config.supportEmail}.`);
    assertCan(ctx.user.id, "publish");
    const spec = validateSpec(parseJson(site.spec_json));
    const mod = await moderateSpec(spec, { userId: ctx.user.id, siteId: site.id });
    if (!mod.allowed) throw forbidden("content_not_allowed", `We can't publish this content: ${mod.reason}. Contact ${config.supportEmail} if you think this is a mistake.`);
    // Non-English sites get their privacy notice translated once here; English is the fallback.
    try { await ensureLegalTranslation(site, spec); } catch (e) { console.warn("[legal] translation skipped:", e.message); }
    const html = renderSite(spec, renderOptionsFor(site, spec));
    run("UPDATE sites SET status = 'published', published_json = ?, published_html = ?, published_at = ?, updated_at = ? WHERE id = ?", JSON.stringify(spec), html, now(), now(), site.id);
    invalidateLive(site.id);
    return { site: publicSite(getSite(site.id)) };
  });
  router.post("/api/sites/:id/unpublish", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    run("UPDATE sites SET status = 'draft', updated_at = ? WHERE id = ?", now(), site.id);
    invalidateLive(site.id);
    return { site: publicSite(getSite(site.id)) };
  });

  // ---- Custom domains
  router.put("/api/sites/:id/domain", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    assertCan(ctx.user.id, "custom_domain");
    const body = await readJsonBody(ctx.req);
    const domain = normalizeDomain(body.domain);
    if (!domain) throw badRequest("invalid_domain", "Enter a domain you own, like mybusiness.com.");
    const taken = get("SELECT id FROM sites WHERE custom_domain = ? AND id != ?", domain, site.id);
    if (taken) throw badRequest("domain_taken", "That domain is connected to another site.");
    run("UPDATE sites SET custom_domain = ?, custom_domain_status = 'pending', custom_domain_checked_at = NULL, updated_at = ? WHERE id = ?", domain, now(), site.id);
    if (site.custom_domain && site.custom_domain !== domain) removeCustomHostnames(site.custom_domain).catch(() => {});
    ensureCustomHostnames(domain).catch((e) => console.warn("[cloudflare] custom hostname", domain, e.message));
    return { site: publicSite(getSite(site.id)), records: dnsInstructions(domain), provider: await detectProvider(domain) };
  });
  router.get("/api/sites/:id/domain", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    if (!site.custom_domain) return { domain: null };
    return { domain: site.custom_domain, status: site.custom_domain_status, records: dnsInstructions(site.custom_domain), checkedAt: site.custom_domain_checked_at, provider: await detectProvider(site.custom_domain) };
  });
  router.post("/api/sites/:id/domain/verify", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    if (!site.custom_domain) throw badRequest("no_domain", "Add a domain first.");
    rateLimit(`dns:${site.id}`, { capacity: 10, refillPerSec: 0.1 });
    const r = await checkDomainDns(site.custom_domain);
    let ok = r.www || r.apex;
    if (ok && cloudflareSaasEnabled()) {
      const cfs = await customHostnameStatus(site.custom_domain).catch(() => null);
      r.cloudflare = cfs;
      if (cfs && !cfs.active) ok = false; // records are right; certificate still being issued
    }
    run("UPDATE sites SET custom_domain_status = ?, custom_domain_checked_at = ?, updated_at = ? WHERE id = ?", ok ? "active" : "pending", now(), now(), site.id);
    invalidateLive(site.id);
    return { status: ok ? "active" : "pending", checks: r, records: dnsInstructions(site.custom_domain), provider: await detectProvider(site.custom_domain), site: publicSite(getSite(site.id)) };
  });
  router.delete("/api/sites/:id/domain", requireAuth, async (ctx) => {
    const site = ownedSite(ctx);
    if (site.custom_domain) removeCustomHostnames(site.custom_domain).catch(() => {});
    run("UPDATE sites SET custom_domain = NULL, custom_domain_status = NULL, updated_at = ? WHERE id = ?", now(), site.id);
    invalidateLive(site.id);
    return { site: publicSite(getSite(site.id)) };
  });
}

// Whitelists and trims the onboarding brief so prompts stay bounded.
export function cleanBrief(b = {}) {
  const str = (v, n = 600) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const arr = (v, n = 20, len = 120) => (Array.isArray(v) ? v.map((x) => str(x, len)).filter(Boolean).slice(0, n) : []);
  return {
    businessName: str(b.businessName, 120),
    category: str(b.category, 120),
    description: str(b.description, 2000),
    location: str(b.location, 200),
    audience: str(b.audience, 300),
    services: arr(b.services, 30, 160),
    differentiators: str(b.differentiators, 800),
    primaryAction: str(b.primaryAction, 120),
    language: str(b.language, 20),
    phone: str(b.phone, 40),
    email: str(b.email, 120),
    address: str(b.address, 240),
    bookingUrl: str(b.bookingUrl, 300),
    hours: Array.isArray(b.hours) ? b.hours.slice(0, 8).map((h) => ({ days: str(h?.days, 40), hours: str(h?.hours, 40) })).filter((h) => h.days && h.hours) : [],
    socials: Array.isArray(b.socials) ? b.socials.slice(0, 8).map((s) => ({ platform: str(s?.platform, 20) || "other", url: str(s?.url, 300) })).filter((s) => s.url) : [],
    colors: arr(b.colors, 5, 40),
    mood: arr(b.mood, 6, 30),
    styleNotes: str(b.styleNotes, 600),
    testimonials: Array.isArray(b.testimonials) ? b.testimonials.slice(0, 6).map((t) => ({ quote: str(t?.quote, 400), author: str(t?.author, 80), role: str(t?.role, 80) })).filter((t) => t.quote) : [],
  };
}
