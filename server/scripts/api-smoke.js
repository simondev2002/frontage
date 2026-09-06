// Exercises the HTTP API end to end against a running dev server.
//   node scripts/dev-seed.js  -> prints a token
//   TOKEN=... node scripts/api-smoke.js
import assert from "node:assert/strict";

const BASE = process.env.BASE || "http://localhost:5150";
const TOKEN = process.env.TOKEN;
assert(TOKEN, "TOKEN env var required (from scripts/dev-seed.js)");

import http from "node:http";
// fetch() silently drops a custom Host header, so host-routing checks use node:http.
function hostReq(method, host, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const req = http.request({ hostname: "localhost", port: new URL(BASE).port || 80, path, method, headers: { Host: host, ...(data ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(data) } : {}) } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => { let json = null; try { json = JSON.parse(text); } catch {} resolve({ status: res.statusCode, text, json }); });
    });
    req.on("error", reject);
    if (data) req.write(data);
    req.end();
  });
}
const EMAIL = `owner-${Date.now()}@example.com`;
let step = 0;
const log = (...a) => console.log(`${String(++step).padStart(2, "0")}.`, ...a);
async function api(method, path, body, { token = TOKEN, headers = {}, raw = false } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body && !raw ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? (raw ? body : JSON.stringify(body)) : undefined,
  });
  const text = await r.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { status: r.status, json, text, headers: r.headers };
}

const health = await api("GET", "/api/health", null, { token: null });
assert.equal(health.status, 200);
log("health", health.json);

await api("POST", "/api/dev/subscription", { tier: null });
for (const st of (await api("GET", "/api/sites")).json.sites) if (st.status === "published") await api("POST", `/api/sites/${st.id}/unpublish`);
const me = await api("GET", "/api/me");
assert.equal(me.status, 200);
log("me", me.json.user.email, "tier", me.json.entitlement.tier);

const sites = await api("GET", "/api/sites");
assert.equal(sites.status, 200);
const site = sites.json.sites.find((s) => s.slug === "oak-and-ember");
assert(site, "seeded site present");
log("sites", sites.json.sites.length, "seeded site", site.id, site.status);

// Reset the seeded site's design to the clean fixture so earlier (possibly crashed)
// runs, including the security suite's injection tests, cannot affect this one.
{
  const fs = await import("node:fs");
  const fixture = fs.readFileSync(new URL("../test/fixtures/demo-spec.json", import.meta.url), "utf8")
    .replace(/"img([1-5])"/g, (_, n) => `"${`seedimg${n}0000000000`.slice(0, 16)}"`);
  // Manual edits need a plan (the free tier is "see your first site"), so the
  // free user is refused first, then the reset runs on a temporary Starter plan.
  const refused = await api("PUT", `/api/sites/${site.id}/spec`, { spec: JSON.parse(fixture), summary: "Reset for tests" });
  assert.equal(refused.status, 402, refused.text);
  assert.equal(refused.json.error, "edit_requires_plan");
  log("manual edit on free tier -> 402", refused.json.error, "requiredTier", refused.json.requiredTier);
  await api("POST", "/api/dev/subscription", { tier: "starter" });
  const reset = await api("PUT", `/api/sites/${site.id}/spec`, { spec: JSON.parse(fixture), summary: "Reset for tests" });
  assert.equal(reset.status, 200, reset.text);
  await api("POST", "/api/dev/subscription", { tier: null });
}
const one = await api("GET", `/api/sites/${site.id}`);
assert.equal(one.status, 200);
assert.equal(one.json.site.spec.meta.businessName, "Oak & Ember");
assert.equal(one.json.site.images.length, 5);
log("site detail ok, images", one.json.site.images.length, "preview", one.json.site.urls.preview);
const imgRes = await fetch(BASE + one.json.site.images[0].url);
assert.equal(imgRes.status, 200, "image serves");
assert((imgRes.headers.get("content-type") || "").startsWith("image/"), "image content-type");
log("image serving ok:", one.json.site.images[0].url, imgRes.headers.get("content-type"));

const preview = await api("GET", one.json.site.urls.preview.replace(BASE, ""), null, { token: null });
assert.equal(preview.status, 200);
assert(preview.text.includes("Bread the way your grandmother"), "preview renders spec");
assert(preview.text.includes("not published yet"), "preview banner");
log("preview HTML", preview.text.length, "bytes");

const badPreview = await api("GET", `/p/${site.id}?t=wrong`, null, { token: null });
assert.equal(badPreview.status, 404);
log("wrong preview token -> 404");

// Email sign-in (dev code is echoed back when no email provider is configured)
const start = await api("POST", "/api/auth/email/start", { email: EMAIL }, { token: null });
assert.equal(start.status, 200);
assert(start.json.devCode, "dev code returned");
const verify = await api("POST", "/api/auth/email/verify", { email: EMAIL, code: start.json.devCode }, { token: null });
assert.equal(verify.status, 200);
assert(verify.json.token);
log("email OTP sign-in ok, new user", verify.json.user.id);
const wrong = await api("POST", "/api/auth/email/verify", { email: EMAIL, code: "000000" }, { token: null });
assert.equal(wrong.status, 400);
log("wrong code rejected:", wrong.json.error);

// Free user creates a site. With an AI key configured the generation would cost real
// money, so the site is created with the dev-only skipAi hook unless RUN_AI_STEPS=1.
const runAi = Boolean(process.env.RUN_AI_STEPS) || !health.json.ai;
const created = await api("POST", "/api/sites", { brief: { businessName: "Test Barber", category: "barber shop", description: "Fades and beard trims in Nicosia", phone: "+357 99 000000" }, skipAi: !runAi, aiConsent: true }, { token: verify.json.token });
assert.equal(created.status, 200, created.text);
log("created site", created.json.site.slug, "job", created.json.job ? created.json.job.status : "skipped (AI configured; set RUN_AI_STEPS=1 to spend a generation)");
let job = { status: "skipped" };
if (created.json.job) {
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    job = (await api("GET", `/api/jobs/${created.json.job.id}`, null, { token: verify.json.token })).json.job;
    if (job.status === "done" || job.status === "failed") break;
  }
  log("generate job ->", job.status, job.error || "", job.result || "");
  assert(["done", "failed"].includes(job.status));
}
const second = await api("POST", "/api/sites", { brief: { businessName: "Second Site" }, aiConsent: true }, { token: verify.json.token });
assert.equal(second.status, 402);
log("second site on free tier -> 402", second.json.error, "requiredTier", second.json.requiredTier);

// Slug check + rename
const chk = await api("GET", "/api/slug-check?slug=Oak%20%26%20Ember");
assert.equal(chk.json.slug, "oak-and-ember");
assert.equal(chk.json.available, false);
log("slug check normalizes + detects taken:", chk.json);
const rename = await api("PATCH", `/api/sites/${site.id}`, { slug: "api" });
assert.equal(rename.status, 400);
log("reserved slug rejected:", rename.json.error);

// Publishing requires a plan
const pub402 = await api("POST", `/api/sites/${site.id}/publish`);
assert.equal(pub402.status, 402);
log("publish on free tier -> 402", pub402.json.error);

const sub = await api("POST", "/api/dev/subscription", { tier: "starter" });
assert.equal(sub.json.entitlement.tier, "starter");
log("dev subscription -> starter; edits remaining", sub.json.entitlement.remaining.edits);

const pub = await api("POST", `/api/sites/${site.id}/publish`);
assert.equal(pub.status, 200, pub.text);
assert.equal(pub.json.site.status, "published");
log("published ->", pub.json.site.urls.live);

// Hosting by Host header
const hosted = await hostReq("GET", "oak-and-ember.localhost:5150", "/");
assert.equal(hosted.status, 200);
assert(hosted.text.includes("Made with <b>Frontage</b>"), "starter badge present");
assert(!hosted.text.includes("not published yet"), "no preview banner on live");
log("hosted site served via Host header, badge present");
const robots = await hostReq("GET", "oak-and-ember.localhost:5150", "/robots.txt");
assert(robots.text.includes("Sitemap:"));
const priv = await hostReq("GET", "oak-and-ember.localhost:5150", "/privacy");
assert.equal(priv.status, 200, priv.text);
assert(priv.text.includes("Oak &amp; Ember") && priv.text.includes("contact form"), "privacy notice served in the site's theme");
assert(hosted.text.includes('href="/privacy"'), "footer links to the privacy notice");
const nosite = await hostReq("GET", "nobody-here.localhost:5150", "/");
assert.equal(nosite.status, 404);
log("robots ok; unknown subdomain -> 404");

// Contact form -> lead
const form = await hostReq("POST", "oak-and-ember.localhost:5150", `/f/${site.id}`, { name: "Maria", email: "maria@example.com", message: "Can I order 3 loaves for Saturday?" });
assert.equal(form.status, 200, form.text);
const bot = await api("POST", `/f/${site.id}`, { name: "Bot", message: "spam", website: "http://spam" }, { token: null });
assert.equal(bot.status, 200);
const leads = await api("GET", `/api/sites/${site.id}/leads`);
assert(leads.json.leads.length >= 1);
assert.equal(leads.json.leads[0].name, "Maria");
log("lead stored; honeypot ignored; unread", leads.json.unread);
await api("POST", `/api/leads/${leads.json.leads[0].id}/read`);

// Versions + manual spec edit + restore
const spec = one.json.site.spec;
spec.meta.tagline = "Changed tagline";
const put = await api("PUT", `/api/sites/${site.id}/spec`, { spec, summary: "Tagline" });
assert.equal(put.status, 200, put.text);
const versions = await api("GET", `/api/sites/${site.id}/versions`);
assert(versions.json.versions.length >= 2);
const restore = await api("POST", `/api/sites/${site.id}/versions/${versions.json.versions[1].id}/restore`);
assert.equal(restore.status, 200);
log("versions", versions.json.versions.length, "restore ok ->", restore.json.site.spec.meta.tagline);
const badSpec = await api("PUT", `/api/sites/${site.id}/spec`, { spec: { meta: {} } });
assert.equal(badSpec.status, 400);
log("invalid spec rejected:", badSpec.json.error);

// Edit requires AI; without a key the job fails cleanly. With a key it is a real (paid) edit of the seeded site.
if (runAi) {
  const edit = await api("POST", `/api/sites/${site.id}/edit`, { instruction: "Make the headline shorter" });
  assert.equal(edit.status, 200, edit.text);
  for (let i = 0; i < 90; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    job = (await api("GET", `/api/jobs/${edit.json.job.id}`)).json.job;
    if (job.status === "done" || job.status === "failed") break;
  }
  log("edit job ->", job.status, job.error || job.result?.reply || "");
} else log("edit job -> skipped (AI configured; set RUN_AI_STEPS=1)");

// Custom domains gated to Business
const dom402 = await api("PUT", `/api/sites/${site.id}/domain`, { domain: "oakandember.cy" });
assert.equal(dom402.status, 402);
await api("POST", "/api/dev/subscription", { tier: "business" });
const dom = await api("PUT", `/api/sites/${site.id}/domain`, { domain: "https://www.OakAndEmber.cy/" });
assert.equal(dom.status, 200, dom.text);
assert.equal(dom.json.site.customDomain, "oakandember.cy");
log("domain added (pending), records:", dom.json.records.map((r) => `${r.type} ${r.host} -> ${r.value}`).join(" | "));
const ver = await api("POST", `/api/sites/${site.id}/domain/verify`);
log("domain verify ->", ver.json.status, ver.json.checks);
const hostedBiz = await hostReq("GET", "oak-and-ember.localhost:5150", "/");
assert(!hostedBiz.text.includes("Made with <b>Frontage</b>"), "business tier removes badge");
log("business tier: badge removed on live site");
await api("DELETE", `/api/sites/${site.id}/domain`);

// Unpublish + cleanup of the throwaway user
await api("POST", `/api/sites/${site.id}/unpublish`);
const gone = await hostReq("GET", "oak-and-ember.localhost:5150", "/");
assert.equal(gone.status, 404);
log("unpublished -> coming soon (404)");
const del = await api("DELETE", "/api/me", null, { token: verify.json.token });
assert.equal(del.status, 200);
const after = await api("GET", "/api/me", null, { token: verify.json.token });
assert.equal(after.status, 401);
log("account deletion ok; token invalid afterwards");
await api("POST", "/api/dev/subscription", { tier: null });
console.log("\nAll API checks passed.");
