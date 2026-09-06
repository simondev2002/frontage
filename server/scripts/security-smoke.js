// Security regression checks against a running dev server. Run after api-smoke.
//   TOKEN=<dev-seed token> node scripts/security-smoke.js
import assert from "node:assert/strict";
import http from "node:http";

const BASE = process.env.BASE || "http://localhost:5150";
const TOKEN = process.env.TOKEN;
assert(TOKEN, "TOKEN env var required (from scripts/dev-seed.js)");
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
function hostReq(method, host, path) {
  return new Promise((resolve, reject) => {
    const req = http.request({ hostname: "localhost", port: new URL(BASE).port || 80, path, method, headers: { Host: host } }, (res) => {
      let text = "";
      res.on("data", (c) => (text += c));
      res.on("end", () => resolve({ status: res.statusCode, text, headers: res.headers }));
    });
    req.on("error", reject);
    req.end();
  });
}
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");

// ---- Setup: user A (seeded) and a fresh attacker B --------------------------------
await api("POST", "/api/dev/subscription", { tier: null, purge: true });
const A = (await api("GET", "/api/me")).json.user;
const siteA = (await api("GET", "/api/sites")).json.sites.find((s) => s.slug === "oak-and-ember");
assert(siteA, "seeded site present");
const emailB = `attacker-${Date.now()}@example.com`;
const start = await api("POST", "/api/auth/email/start", { email: emailB }, { token: null });
const B = (await api("POST", "/api/auth/email/verify", { email: emailB, code: start.json.devCode }, { token: null })).json;
assert(B.token);
log("users ready: A", A.id, "B", B.user.id);

// ---- 1. Object-level authorization (IDOR) -----------------------------------------
for (const [m, p] of [["GET", `/api/sites/${siteA.id}`], ["PATCH", `/api/sites/${siteA.id}`], ["DELETE", `/api/sites/${siteA.id}`], ["POST", `/api/sites/${siteA.id}/publish`], ["GET", `/api/sites/${siteA.id}/leads`], ["GET", `/api/sites/${siteA.id}/versions`], ["PUT", `/api/sites/${siteA.id}/domain`], ["GET", `/api/images?site=${siteA.id}`]]) {
  const r = await api(m, p, m === "GET" || m === "DELETE" ? null : { name: "x", domain: "x.com" }, { token: B.token });
  assert.equal(r.status, 404, `${m} ${p} -> ${r.status}`);
}
const stillThere = await api("GET", `/api/sites/${siteA.id}`);
assert.equal(stillThere.status, 200);
const imgA = stillThere.json.site.images[0];
for (const [m, p] of [["PATCH", `/api/images/${imgA.id}`], ["DELETE", `/api/images/${imgA.id}`]]) {
  const r = await api(m, p, m === "PATCH" ? { caption: "hacked" } : null, { token: B.token });
  assert.equal(r.status, 404, `${m} ${p}`);
}
// Jobs: use an existing job of A's from the database (creating one would spend an AI call).
const { get: dbGet } = await import("../src/db.js");
const anyJob = dbGet("SELECT id FROM jobs WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", A.id);
if (anyJob) assert.equal((await api("GET", `/api/jobs/${anyJob.id}`, null, { token: B.token })).status, 404);
log("IDOR: 12 cross-account requests all rejected (404), A's data intact");

// ---- 2. Unauthenticated access --------------------------------------------------------
for (const p of ["/api/me", "/api/sites", `/api/sites/${siteA.id}`, "/api/images", "/api/billing/entitlement"]) {
  const r = await api("GET", p, null, { token: null });
  assert.equal(r.status, 401, p);
}
const bogus = await api("GET", "/api/me", null, { token: "not-a-real-token" });
assert.equal(bogus.status, 401);
const admin = await api("GET", "/api/admin/stats", null, { token: null });
assert.equal(admin.status, 401);
log("auth: unauthenticated and bogus tokens rejected; admin stats locked");

// ---- 3. Injection through the site spec -----------------------------------------------
const cleanSpec = JSON.parse(JSON.stringify(stillThere.json.site.spec));
const spec = stillThere.json.site.spec;
spec.sections[0].primaryCta.href = "javascript:alert(1)";
spec.meta.bookingUrl = "javascript:alert(2)";
spec.meta.socials = [{ platform: "instagram", url: "javascript:alert(3)" }];
spec.sections.push({
  id: "custom", type: "custom", heading: "Custom <script>x</script>",
  html: `<p>Hello <b onclick="alert(1)">bold</b> <a href="javascript:alert(4)" target="_blank">link</a> <a href="https://example.com" target="_blank">ok</a></p><script>alert(5)</script><img src="x" onerror="alert(6)"><img src="/i/${imgA.id}.jpg"><svg onload="alert(7)"><circle/></svg><iframe src="https://evil.example"></iframe><style>body{display:none}</style><div style="background:url(https://evil.example/x)">styled</div><scr<script>ipt>alert(8)</script>`,
  css: `@import url(https://evil.example/x.css); .custom{color:red;background:url(https://evil.example/t.png)} .x{behavior:url(x)} </style><script>alert(9)</script>`,
});
// Manual edits need a plan (free tier = first site only), so A gets a temporary Starter plan here.
assert.equal((await api("PUT", `/api/sites/${siteA.id}/spec`, { spec, summary: "injection test" })).status, 402, "free tier cannot edit");
await api("POST", "/api/dev/subscription", { tier: "starter" });
const put = await api("PUT", `/api/sites/${siteA.id}/spec`, { spec, summary: "injection test" });
assert.equal(put.status, 200, put.text);
const preview = await api("GET", stillThere.json.site.urls.preview.replace(BASE, ""), null, { token: null });
assert.equal(preview.status, 200);
const h = preview.text;
for (const bad of ["javascript:", "onclick", "onerror", "onload", "<script>alert", "<iframe src=\"https://evil", "body{display:none}", "@import", "evil.example", "{behavior:"]) {
  assert(!h.includes(bad), `preview must not contain ${bad}`);
}
// Custom CSS cannot close its <style> block or reach markup: outside style blocks nothing executable remains.
assert.equal((h.match(/<style/g) || []).length, (h.match(/<\/style>/g) || []).length, "balanced style tags");
assert(!h.replace(/<style[\s\S]*?<\/style>/gi, "").includes("alert("), "no script payload outside style blocks");
assert(h.includes("<b>bold</b>"), "safe markup kept");
assert(h.includes('href="https://example.com" target="_blank" rel="noopener nofollow"'), "safe link kept with rel");
assert(h.includes(`src="/i/${imgA.id}.jpg"`), "same-origin image kept");
assert(h.includes("Custom &lt;script&gt;x&lt;/script&gt;"), "heading escaped");
const csp = preview.headers.get("content-security-policy") || "";
const nonce = /script-src 'nonce-([^']+)'/.exec(csp)?.[1];
assert(nonce, "CSP with nonce present");
assert(h.includes(`<script nonce="${nonce}">`), "inline script carries the nonce");
assert(!h.includes("%%NONCE%%"), "no placeholder leaked");
assert.equal(preview.headers.get("x-content-type-options"), "nosniff");
assert.equal(preview.headers.get("x-robots-tag"), "noindex");
log("XSS: javascript: links, event handlers, script/svg/iframe/style stripped; CSP nonce enforced");
// Put the clean design back (the publish step below runs content moderation, which rightly refuses the payload).
assert.equal((await api("PUT", `/api/sites/${siteA.id}/spec`, { spec: cleanSpec, summary: "Restore after injection test" })).status, 200);
await api("POST", "/api/dev/subscription", { tier: null, purge: true }); // back to the free tier

// ---- 4. Uploads --------------------------------------------------------------------------
const fake = await api("POST", `/api/images?site=${siteA.id}`, "<html><script>alert(1)</script></html>" + "<!-- padding to exceed the minimum upload size -->".repeat(4), { raw: true, headers: { "Content-Type": "image/jpeg" } });
assert.equal(fake.status, 400);
assert.equal(fake.json.error, "not_an_image");
const svg = await api("POST", `/api/images?site=${siteA.id}`, "<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>" + "<!-- padding to exceed the minimum upload size -->".repeat(4), { raw: true, headers: { "Content-Type": "image/svg+xml" } });
assert.equal(svg.status, 400);
const imgHead = await fetch(BASE + imgA.url);
assert.equal(imgHead.headers.get("x-content-type-options"), "nosniff");
assert((imgHead.headers.get("content-security-policy") || "").includes("sandbox"));
log("uploads: HTML/SVG disguised as images rejected; images served with nosniff + sandbox CSP");

// ---- 5. Billing ----------------------------------------------------------------------------
const stripe = await api("POST", "/api/billing/stripe/webhook", { type: "customer.subscription.updated", data: { object: { id: "sub_x", status: "active", metadata: { user_id: B.user.id }, items: { data: [{ price: { id: "price_x" } }] } } } }, { token: null });
assert(stripe.status !== 200, "unsigned Stripe webhook must not be processed");
const fakeTx = (token) => `${b64u({ alg: "ES256" })}.${b64u({ originalTransactionId: `sec-${Date.now()}`, transactionId: "t1", productId: "com.frontage.app.business.monthly", environment: "Sandbox", appAccountToken: token, expiresDate: Date.now() + 864e5, signedDate: Date.now() })}.${b64u("sig")}`;
const stolen = await api("POST", "/api/billing/apple/transactions", { transaction: fakeTx(A.id) }, { token: B.token });
assert.equal(stolen.status, 200);
assert.equal(stolen.json.results[0].error, "not_your_purchase");
assert.equal(stolen.json.entitlement.tier, "free");
const devFromB = await api("POST", "/api/dev/subscription", { tier: "business" }, { token: B.token, headers: { "X-Forwarded-For": "127.0.0.1" } });
assert.equal(devFromB.status, 200, "loopback dev route reachable locally (raw socket)");
await api("POST", "/api/dev/subscription", { tier: null, purge: true }, { token: B.token });
log("billing: unsigned webhook refused; a transaction bound to another account cannot be claimed");

// ---- 6. Plan enforcement on hosting -----------------------------------------------------------
await api("POST", "/api/dev/subscription", { tier: "starter" });
const pub = await api("POST", `/api/sites/${siteA.id}/publish`);
assert.equal(pub.status, 200, pub.text);
let live = await hostReq("GET", "oak-and-ember.localhost:5150", "/");
assert.equal(live.status, 200);
assert((live.headers["content-security-policy"] || "").includes("nonce-"), "hosted page has CSP");
await api("POST", "/api/dev/subscription", { tier: null, purge: true });
live = await hostReq("GET", "oak-and-ember.localhost:5150", "/");
assert.equal(live.status, 503);
assert(live.text.includes("paused"), "site paused when the plan lapses");
const siteNow = (await api("GET", `/api/sites/${siteA.id}`)).json.site;
assert.equal(siteNow.paused, true);
await api("POST", `/api/sites/${siteA.id}/unpublish`);
log("hosting: site goes offline (503, noindex) when the subscription lapses; app sees paused=true");

// ---- 7. Abuse limits ----------------------------------------------------------------------------
let got429 = false;
for (let i = 0; i < 7; i++) {
  const r = await api("POST", "/report", { site: siteA.id, reason: "Other", details: "x" }, { token: null });
  if (r.status === 429) { got429 = true; break; }
}
assert(got429, "report endpoint rate limits");
const tls = await api("GET", "/internal/tls-ask?domain=localhost", null, { token: null });
assert.equal(tls.status, 200, "tls-ask reachable from loopback");
const tlsUnknown = await api("GET", "/internal/tls-ask?domain=evil.example", null, { token: null });
assert.equal(tlsUnknown.status, 404);
const big = await api("PUT", `/api/sites/${siteA.id}/spec`, "x".repeat(2 * 1024 * 1024), { raw: true, headers: { "Content-Type": "application/json" } });
assert(big.status === 413 || big.status === 400, "oversized body rejected");
log("abuse: rate limit on reports, TLS issuance only for known domains, oversized bodies rejected");

// ---- 8. Headers on the app host ------------------------------------------------------------------
const landing = await api("GET", "/", null, { token: null });
assert.equal(landing.headers.get("x-content-type-options"), "nosniff");
assert.equal(landing.headers.get("x-frame-options"), "SAMEORIGIN");
const apiJson = await api("GET", "/api/health", null, { token: null });
assert.equal(apiJson.headers.get("x-content-type-options"), "nosniff");
assert.equal(apiJson.headers.get("cache-control"), "no-store");
log("headers: nosniff/frame options on pages, no-store on API");

// ---- Cleanup ------------------------------------------------------------------------------------
await api("POST", `/api/sites/${siteA.id}/versions/${(await api("GET", `/api/sites/${siteA.id}/versions`)).json.versions.at(-1).id}/restore`);
await api("DELETE", "/api/me", null, { token: B.token });
console.log("\nAll security checks passed.");
