// Scores every candidate against the token contract so curation is not taste alone:
//   node tools/design-lab/lint.mjs            -> table per section
// Flags: hardcoded colours, unscoped selectors, scripts, external assets other than the
// sample photos, missing data-field markers, missing focus styles.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PHOTOS } from "./sections.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const photoUrls = new Set(Object.values(PHOTOS));

export function lint(html, sectionId) {
  const cls = `s-${sectionId}`;
  const issues = [];
  const style = (html.match(/<style>([\s\S]*?)<\/style>/i) || [])[1] || "";
  const markup = html.replace(/<style>[\s\S]*?<\/style>/i, "");
  if (!/^<section[\s>]/.test(html.trim())) issues.push("does not start with <section>");
  if (!new RegExp(`<section[^>]*class="[^"]*\\b${cls}\\b`).test(html)) issues.push(`section lacks class ${cls}`);
  if (/<script/i.test(html) || /\son[a-z]+=/i.test(markup)) issues.push("script or inline handler");
  const colours = style.replace(/white-space/gi, "").match(/#[0-9a-f]{3,8}\b|\brgba?\(|\bhsla?\(|:\s*(white|black|red|blue|grey|gray|orange|green)\b/gi) || [];
  if (colours.length) issues.push(`hardcoded colours: ${[...new Set(colours.map((c) => c.toLowerCase()))].slice(0, 5).join(" ")}`);
  const fonts = style.match(/font-family\s*:(?!\s*(var\(|inherit))[^;]+/gi) || [];
  if (fonts.length) issues.push(`hardcoded font-family x${fonts.length}`);
  const externals = [...markup.matchAll(/(?:src|href)="(https?:[^"]+)"/g)].map((m) => m[1]).filter((u) => !photoUrls.has(u));
  if (externals.length) issues.push(`external urls: ${externals.slice(0, 2).join(" ")}`);
  if (/url\((?!"data:)/i.test(style)) issues.push("css url() to a non-data resource");
  // Every rule's selectors must start with the section class (or be a @media/@supports wrapper).
  const rules = style.replace(/\/\*[\s\S]*?\*\//g, "").match(/[^{}]+(?=\s*\{)/g) || [];
  const unscoped = rules.map((r) => r.trim()).filter((r) => r && !r.startsWith("@") && r.split(",").some((sel) => !sel.trim().startsWith(`.${cls}`) && !sel.trim().startsWith(`section.${cls}`)));
  if (unscoped.length) issues.push(`unscoped selectors: ${unscoped.slice(0, 3).join(" | ")}`);
  const fields = (markup.match(/data-field="/g) || []).length;
  if (fields < 3) issues.push(`only ${fields} data-field markers`);
  if (!/:focus(-visible)?/.test(style)) issues.push("no focus styles");
  if (/@keyframes|animation\s*:/.test(style)) issues.push("animation present");
  if (/gradient\(/.test(style)) issues.push("gradient present");
  if (/box-shadow/.test(style)) issues.push("box-shadow present");
  const kb = Math.round(html.length / 102.4) / 10;
  if (kb > 12) issues.push(`large: ${kb} KB`);
  return { issues, kb, fields, rules: rules.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  for (const sec of fs.readdirSync(OUT).filter((d) => fs.statSync(path.join(OUT, d)).isDirectory())) {
    console.log(`\n${sec}`);
    for (const f of fs.readdirSync(path.join(OUT, sec)).filter((f) => f.endsWith(".html") && !f.startsWith("sheet")).sort()) {
      const r = lint(fs.readFileSync(path.join(OUT, sec, f), "utf8"), sec);
      console.log(`  ${f.replace(/\.html$/, "").padEnd(22)} ${String(r.kb).padStart(5)} KB  ${String(r.fields).padStart(2)} fields  ${r.issues.length ? r.issues.join("; ") : "clean"}`);
    }
  }
}
