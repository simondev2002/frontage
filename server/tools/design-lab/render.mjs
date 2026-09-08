// Renders every candidate in out/<section>/ at 390px and 1280px on the real Frontage
// stylesheet (warm preset), then builds one contact sheet per section:
//   node tools/design-lab/render.mjs [--sections=hero,services]
// Needs Playwright: set PLAYWRIGHT_DIR to a folder whose node_modules has it.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { buildCss } from "../../src/renderer/css.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const pwDir = process.env.PLAYWRIGHT_DIR || path.join(process.env.LOCALAPPDATA || "", "Temp", "claude", "C--Users-simon", "19d03915-7e7b-4b14-91cb-e43c72824e8b", "scratchpad", "shots");
const { chromium } = await import(pathToFileURL(path.join(pwDir, "node_modules", "playwright", "index.mjs")).href);

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const theme = { preset: "warm", mode: "light", colors: { primary: "#1F4D3A", secondary: "#E0623D", accent: "#B4532E", background: "#F8F3EA", surface: "#FFFDF8", text: "#1E1A16" }, headingFont: "Fraunces", bodyFont: "Inter", radius: "soft" };
const css = buildCss(theme);
const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com"><link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600;9..144,700&family=Inter:wght@400;500;600&display=swap" rel="stylesheet">`;

const page = (fragment) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">${fonts}<style>${css}\nbody{padding:0}</style></head><body><main>${fragment}</main></body></html>`;

const browser = await chromium.launch();
const sections = fs.readdirSync(OUT).filter((d) => fs.statSync(path.join(OUT, d)).isDirectory() && (!args.sections || String(args.sections).split(",").includes(d)));
for (const sec of sections) {
  const dir = path.join(OUT, sec);
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".html") && !f.startsWith("sheet")).sort();
  const shots = [];
  for (const f of files) {
    // Lazy images below the fold never load in a headless full-page shot, so force eager.
    const html = page(fs.readFileSync(path.join(dir, f), "utf8").replace(/loading="lazy"/g, 'loading="eager"'));
    for (const [name, width, dpr] of [["mobile", 390, 2], ["desktop", 1280, 1]]) {
      const p = await browser.newPage({ viewport: { width, height: 900 }, deviceScaleFactor: dpr });
      await p.setContent(html, { waitUntil: "load" });
      await p.evaluate(async () => {
        await document.fonts.ready;
        const timeout = new Promise((r) => setTimeout(r, 8000));
        await Promise.race([timeout, Promise.all([...document.images].map((i) => i.complete ? null : new Promise((r) => { i.onload = i.onerror = r; })))]);
      });
      await p.waitForTimeout(300);
      const overflow = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);
      const out = path.join(dir, `${f.replace(/\.html$/, "")}.${name}.png`);
      await p.screenshot({ path: out, fullPage: true });
      shots.push({ file: f, name, out, overflow });
      await p.close();
    }
  }
  // Contact sheet: one row per candidate, mobile left (scaled), desktop right.
  const rows = files.map((f) => {
    const m = shots.find((s) => s.file === f && s.name === "mobile"), d = shots.find((s) => s.file === f && s.name === "desktop");
    const img = (s) => `<img src="data:image/png;base64,${fs.readFileSync(s.out).toString("base64")}" style="display:block;max-height:${s.name === "mobile" ? 760 : 620}px;width:auto;max-width:${s.name === "mobile" ? 300 : 900}px;object-fit:contain;object-position:top;border:1px solid #999;background:#fff">`;
    return `<div style="display:flex;gap:14px;align-items:flex-start;margin:0 0 22px"><div style="width:120px;font:600 15px system-ui;color:#111">${f.replace(/\.html$/, "")}${m.overflow || d.overflow ? '<div style="color:#c00;font-weight:700">overflow</div>' : ""}</div>${img(m)}${img(d)}</div>`;
  }).join("");
  const sheet = `<!doctype html><body style="margin:0;padding:18px;background:#ddd;font-family:system-ui"><h1 style="font:700 22px system-ui;margin:0 0 14px">${sec}</h1>${rows}</body>`;
  const sp = await browser.newPage({ viewport: { width: 1360, height: 900 }, deviceScaleFactor: 1 });
  await sp.setContent(sheet, { waitUntil: "load" });
  await sp.waitForTimeout(500);
  await sp.screenshot({ path: path.join(dir, "sheet.png"), fullPage: true });
  await sp.close();
  console.log(`${sec}: ${files.length} candidates -> ${path.relative(here, path.join(dir, "sheet.png"))}`);
}
await browser.close();
