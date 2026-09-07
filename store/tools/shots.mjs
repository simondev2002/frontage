// App Store screenshots from the browser preview: captures the phone screen at 3x for
// six key moments, then composes each into marketing frames for the two iPhone slots
// App Store Connect offers (6.9-inch 1290x2796 and 6.5-inch 1284x2778).
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const BASE = "http://localhost:5150";
const TOKEN = process.env.TOKEN;
const HERO = process.env.HERO || ""; // optional picsum photo id to swap into the bakery hero
const OUT = process.argv[2] || path.join(here, "out");
if (!TOKEN) { console.error("TOKEN env var (dev bearer token) required"); process.exit(1); }

const SIZES = [
  { dir: "iphone-6.9", w: 1290, h: 2796 },
  { dir: "iphone-6.5", w: 1284, h: 2778 },
];
for (const s of SIZES) fs.mkdirSync(path.join(OUT, s.dir), { recursive: true });

const api = async (method, p, body) => {
  const r = await fetch(BASE + p, { method, headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, json: await r.json().catch(() => ({})) };
};

// Server-side state: Starter plan and a published seeded site.
await api("POST", "/api/dev/subscription", { tier: "starter" });
const sites = (await api("GET", "/api/sites")).json.sites || [];
const site = sites.find((s) => s.slug === "oak-and-ember");
if (!site) { console.error("seeded site missing; run scripts/dev-seed.js"); process.exit(1); }
const pub = await api("POST", `/api/sites/${site.id}/publish`);
console.log("publish:", pub.status);

// Marketing-only overrides so the dev server's localhost addresses never appear in a frame.
const LIVE = { cfg: { sitesDomain: "frontageweb.com" }, url: "https://oak-and-ember.frontageweb.com" };
const LEADS = [
  { id: "l1", name: "Maria Constantinou", message: "Can I order three sourdough loaves for Saturday morning?", createdAt: "2026-09-07T08:12:00Z", readAt: null },
  { id: "l2", name: "Andreas P.", message: "Do you make birthday cakes? Need one for the 20th, about 12 people.", createdAt: "2026-09-06T17:40:00Z", readAt: null },
  { id: "l3", name: "Elena Georgiou", message: "Are the cinnamon buns gluten free? My daughter is coeliac.", createdAt: "2026-09-06T09:05:00Z", readAt: "2026-09-06T10:00:00Z" },
  { id: "l4", name: "Tom Whitfield", message: "Hi, we run a cafe nearby and would love to stock your bread. Wholesale prices?", createdAt: "2026-09-05T14:22:00Z", readAt: "2026-09-05T15:00:00Z" },
  { id: "l5", name: "Sophia K.", message: "What time do the croissants come out of the oven on Sundays?", createdAt: "2026-09-04T07:55:00Z", readAt: "2026-09-04T09:00:00Z" },
  { id: "l6", name: "Nikos Charalambous", message: "Do you deliver to Germasogeia? Ordering for an office breakfast.", createdAt: "2026-09-03T11:30:00Z", readAt: "2026-09-03T12:00:00Z" },
  { id: "l7", name: "Rachel Adams", message: "Loved the rye at the market. Can I pre-order two for Friday?", createdAt: "2026-09-02T16:10:00Z", readAt: "2026-09-02T17:00:00Z" },
];

const SHOTS = [
  { file: "01-welcome", title: "Your business website, built for you.", sub: "Answer a few questions and see your finished site in minutes. The first one is free.", bg: "#1F4D3A", fg: "#F6F3EC",
    setup: async (page) => { await page.evaluate((k) => localStorage.removeItem(k), "fp_token"); await page.reload(); await page.waitForSelector(".screen"); await page.waitForTimeout(800); } },
  { file: "02-brief", title: "Tell it about your business.", sub: "Plain words about what you do and who it is for. No templates, no forms to fight.", bg: "#F6F3EC", fg: "#17201B",
    setup: async (page) => { await signIn(page); await page.evaluate(() => { A.startOb(); Object.assign(S.draft, { businessName: "Blue Anchor Yoga", location: "Limassol", category: "Fitness and wellness", description: "Small yoga studio by the old harbour in Limassol. Morning vinyasa, slow evening yin, and beginner courses that start every month. Six people per class, never more.", services: ["Drop-in class from EUR 12", "Beginner course, six weeks"], differentiators: "Six people per class, teachers with over ten years of practice, sea view from the mat.", primaryAction: "Book online" }); go("ob-about", { replace: true }); }); await page.waitForTimeout(600); } },
  { file: "03-generating", title: "Designed and written in about a minute.", sub: "Layout, copy, colors and your photos placed. Ready to preview before you pay anything.", bg: "#E0623D", fg: "#F6F3EC",
    setup: async (page) => { await page.evaluate(() => { S.gen = { progress: 0.62, statusText: "Writing your pages", line: 0 }; go("generating", { replace: true }); }); await page.waitForTimeout(600); } },
  { file: "04-edit", title: "Change anything by asking.", sub: "Frontage answers in the conversation and updates the site in front of you.", bg: "#F6F3EC", fg: "#17201B",
    setup: async (page, ctx) => {
      await page.evaluate(async (id) => { S.site = (await api("GET", `/api/sites/${id}`)).site; S.history = (await api("GET", `/api/sites/${id}/messages`)).messages; S.chatOpen = true; S.pending = null; S.applying = null; S.reload++; go("editor", { replace: true }); }, ctx.siteId);
      await page.waitForTimeout(3500);
      if (HERO) await swapHero(page, `https://picsum.photos/id/${HERO}/1200/900`);
    } },
  { file: "05-live", title: "Live in one tap.", sub: "Your site at yourbusiness.frontageweb.com, or your own domain on the Business plan.", bg: "#1F4D3A", fg: "#F6F3EC",
    setup: async (page, ctx) => { await page.evaluate(async ({ id, live }) => { S.site = (await api("GET", `/api/sites/${id}`)).site; S.cfg = Object.assign({}, S.cfg, live.cfg); S.site.urls = Object.assign({}, S.site.urls, { live: live.url, subdomain: live.url }); S.chatOpen = false; go("editor", { replace: true }); openSheet("publish"); }, { id: ctx.siteId, live: LIVE }); await page.waitForTimeout(2500); } },
  { file: "06-messages", title: "Customer messages land in the app.", sub: "A notification the moment someone writes. Reply from your phone.", bg: "#F6F3EC", fg: "#17201B",
    setup: async (page, ctx) => { await page.evaluate(async ({ id, leads }) => { S.sheet = null; S.site = (await api("GET", `/api/sites/${id}`)).site; S.leads = leads; go("leads", { replace: true }); }, { id: ctx.siteId, leads: LEADS }); await page.waitForTimeout(600); } },
];

async function signIn(page) {
  await page.evaluate(({ k, t }) => localStorage.setItem(k, t), { k: "fp_token", t: TOKEN });
  await page.reload();
  await page.waitForSelector(".screen");
  await page.waitForFunction(() => typeof S !== "undefined" && S.user && S.screen !== "splash", null, { timeout: 15000 });
  await page.waitForTimeout(400);
}

// Replaces the hero photo inside the site preview iframe (marketing only, nothing is saved).
async function swapHero(page, src) {
  const frame = page.frames().find((f) => f !== page.mainFrame() && /\/p\//.test(f.url()));
  if (!frame) { console.warn("no preview iframe found for hero swap"); return; }
  const done = await frame.evaluate((u) => {
    const img = document.querySelector(".hero img") || document.querySelector("img");
    if (!img) return false;
    img.removeAttribute("srcset"); img.src = u;
    return new Promise((res) => { img.onload = () => res(true); img.onerror = () => res(false); setTimeout(() => res(false), 15000); });
  }, src);
  console.log("hero swap:", done);
  await page.waitForTimeout(300);
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1300, height: 960 }, deviceScaleFactor: 3, locale: "en-US", timezoneId: "Europe/Nicosia" });
const page = await context.newPage();
await page.goto(`${BASE}/dev/app-preview`);
await page.waitForSelector(".screen");
const ctx = { siteId: site.id };
const captures = [];
for (const shot of SHOTS) {
  await shot.setup(page, ctx);
  await page.addStyleTag({ content: ".phone > .island{display:none}" }); await page.waitForTimeout(150);
  const buf = await page.locator(".screen").screenshot({ type: "png" });
  captures.push({ ...shot, data: buf.toString("base64") });
  console.log("captured", shot.file);
}

// Compose: headline on top, phone frame below, once per slot size.
const frame = await browser.newPage({ deviceScaleFactor: 1 });
for (const size of SIZES) {
  await frame.setViewportSize({ width: size.w, height: size.h });
  for (const c of captures) {
    const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,700&family=Inter:wght@500;600&display=swap" rel="stylesheet">
<style>
  html,body{margin:0;width:${size.w}px;height:${size.h}px;overflow:hidden}
  body{background:${c.bg};color:${c.fg};font-family:Inter,system-ui,sans-serif;position:relative}
  .copy{padding:150px 100px 0;text-align:center}
  h1{font-family:Fraunces,Georgia,serif;font-weight:700;font-size:96px;line-height:1.05;letter-spacing:-.02em;margin:0 0 30px}
  p{font-size:40px;line-height:1.35;margin:0 auto;max-width:980px;opacity:.88;font-weight:500}
  .phone{position:absolute;left:50%;transform:translateX(-50%);top:700px;width:980px;height:2134px;background:#111;border-radius:120px;padding:26px;box-shadow:0 60px 120px -40px rgba(0,0,0,.45)}
  .screen{width:100%;height:100%;border-radius:106px;overflow:hidden;background:#F6F3EC}
  .screen img{width:100%;height:100%;object-fit:fill;display:block}
  .island{position:absolute;top:76px;left:50%;transform:translateX(-50%);width:300px;height:84px;background:#111;border-radius:44px}
</style></head><body>
<div class="copy"><h1>${esc(c.title)}</h1><p>${esc(c.sub)}</p></div>
<div class="phone"><div class="screen"><img src="data:image/png;base64,${c.data}"></div><div class="island"></div></div>
</body></html>`;
    await frame.setContent(html, { waitUntil: "load" });
    await frame.evaluate(async () => { await document.fonts.ready; });
    await frame.waitForTimeout(300);
    const out = path.join(OUT, size.dir, `${c.file}.png`);
    await frame.screenshot({ path: out, clip: { x: 0, y: 0, width: size.w, height: size.h } });
    console.log("wrote", out);
  }
}
await browser.close();

function esc(s) { return String(s).replace(/[&<>"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch])); }
