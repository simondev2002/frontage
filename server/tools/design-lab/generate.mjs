// Design lab: asks design-leading models for section designs against Frontage's
// design tokens, one candidate per (section, direction, model). Output goes to
// tools/design-lab/out/<section>/<model>-<direction>.html plus a .json with usage.
//
//   node tools/design-lab/generate.mjs --models=claude,openai,moonshot --sections=hero,services
//
// Keys come from tools/design-lab/.env (git-ignored): OPENAI_API_KEY, MOONSHOT_API_KEY,
// and ANTHROPIC_API_KEY (falls back to server/.env).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Anthropic from "@anthropic-ai/sdk";
import { SECTIONS, PHOTOS, BUSINESS } from "./sections.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
loadEnv(path.join(here, ".env"));
loadEnv(path.join(here, "..", "..", ".env"));

const args = Object.fromEntries(process.argv.slice(2).map((a) => { const m = a.match(/^--([^=]+)=(.*)$/); return m ? [m[1], m[2]] : [a.replace(/^--/, ""), true]; }));
const wantModels = String(args.models || "claude").split(",").map((s) => s.trim()).filter(Boolean);
const wantSections = args.sections ? String(args.sections).split(",") : SECTIONS.map((s) => s.id);
const wantDirections = args.directions ? String(args.directions).split(",").map(Number) : [0, 1];

const MODELS = {
  claude: { label: "claude-fable-5-1", call: callClaude },
  openai: { label: "gpt-5.6-sol", call: (p) => callOpenAICompatible("https://api.openai.com/v1/chat/completions", process.env.OPENAI_API_KEY, "gpt-5.6-sol", p, { max_completion_tokens: 9000 }) },
  moonshot: { label: "kimi-k3", call: (p) => callOpenAICompatible("https://api.moonshot.ai/v1/chat/completions", process.env.MOONSHOT_API_KEY, "kimi-k3", p, { max_tokens: 9000, temperature: 0.8 }) },
};

const SYSTEM = `You are a senior web designer known for restrained, editorial websites for small local businesses: bakeries, clinics, studios, salons, trades. Premium and calm, never a SaaS landing page. You write production-ready HTML and CSS by hand.

You design ONE section of a one-page website.

Output rules
- Return exactly one <section> element followed by one <style> element. Nothing else: no markdown fences, no explanation, no <html>/<head>/<body>.
- The section's class is given. Prefix EVERY CSS selector with that class so the styles cannot leak.
- No JavaScript, no external stylesheets, no frameworks, no utility classes, no emoji, no icon fonts. Small inline SVG (under 1 KB each) is fine for a plus sign, an arrow or a rule.
- Colours and fonts ONLY through these custom properties, never hardcoded: --bg, --surface, --text, --muted, --line, --primary, --on-primary, --secondary, --on-secondary, --accent, --font-heading, --font-body, --radius, --btn-radius, --wrap (max content width), --pad (horizontal page padding), --section (vertical section spacing). Semi-transparent tints must derive from them with color-mix().
- Mobile first. It must look excellent at 390px and at 1280px. Use grid or flex, clamp() for type sizes, and never let anything overflow horizontally.
- Content: write the sample content in directly, but mark every content-bearing element with data-field="<name>" (for example data-field="headline", data-field="item.title") so it can be wired to data later. Repeated items must be sibling elements with identical structure. Use the given photo URLs as <img src> with descriptive alt text; images must use width:100%;height:auto or object-fit:cover with an explicit aspect-ratio.
- Accessibility: semantic elements, the heading level given, visible focus styles on links and buttons, readable contrast (assume the page can be light or dark; text sits on --bg, --on-primary sits on --primary).
- Taste: strong typographic hierarchy, generous whitespace, one focal point, restrained decoration (thin rules, eyebrow labels, offsets, overlapping crops, oversized numerals, small caps). No gradients, no glassmorphism, no identical drop-shadow cards, no rounded-everything, no animation.`;

function userPrompt(section, direction) {
  const photos = (key) => PHOTOS[key];
  const sample = JSON.stringify(section.sample, (k, v) => (typeof v === "string" && PHOTOS[v] && k !== "heading" && k !== "headline" ? photos(v) : v), 2);
  return `Business: ${BUSINESS.name}, ${BUSINESS.tagline} ${BUSINESS.city}. Phone ${BUSINESS.phone}, email ${BUSINESS.email}, address ${BUSINESS.address}.

Section to design: "${section.id}" (heading level ${section.heading}).
Purpose: ${section.purpose}
Fields the renderer can supply: ${section.fields}
Sample content (use it verbatim; keys that name a photo are already URLs):
${sample}
Available photo URLs: ${Object.entries(PHOTOS).map(([k, v]) => `${k}: ${v}`).join(", ")}

Design direction for this candidate: ${section.directions[direction]}

Section class to use: s-${section.id}. Heading element: ${section.heading}.`;
}

async function callClaude(prompt) {
  const client = new Anthropic();
  const stream = client.messages.stream({
    model: "claude-fable-5-1",
    max_tokens: 12000,
    thinking: { type: "adaptive" },
    system: SYSTEM,
    messages: [{ role: "user", content: prompt }],
  });
  const msg = await stream.finalMessage();
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  return { text, usage: { input: msg.usage.input_tokens, output: msg.usage.output_tokens } };
}

async function callOpenAICompatible(url, key, model, prompt, extra) {
  if (!key) throw new Error(`no API key for ${model}`);
  const r = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages: [{ role: "system", content: SYSTEM }, { role: "user", content: prompt }], ...extra }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(`${model}: ${r.status} ${JSON.stringify(j).slice(0, 300)}`);
  const text = j.choices?.[0]?.message?.content || "";
  return { text, usage: { input: j.usage?.prompt_tokens, output: j.usage?.completion_tokens } };
}

function extractFragment(text) {
  const t = text.replace(/```[a-z]*\n?/g, "").trim();
  const s = t.indexOf("<section"); const e = t.lastIndexOf("</style>");
  return s >= 0 && e > s ? t.slice(s, e + "</style>".length) : t;
}

for (const section of SECTIONS.filter((s) => wantSections.includes(s.id))) {
  fs.mkdirSync(path.join(OUT, section.id), { recursive: true });
  for (const d of wantDirections) {
    for (const m of wantModels) {
      const model = MODELS[m]; if (!model) { console.warn("unknown model", m); continue; }
      const file = path.join(OUT, section.id, `${model.label}-${d + 1}.html`);
      if (fs.existsSync(file) && !args.force) { console.log("skip (exists)", path.relative(here, file)); continue; }
      const t0 = Date.now();
      try {
        const { text, usage } = await model.call(userPrompt(section, d));
        const frag = extractFragment(text);
        fs.writeFileSync(file, frag);
        fs.writeFileSync(file.replace(/\.html$/, ".json"), JSON.stringify({ model: model.label, section: section.id, direction: d, usage, ms: Date.now() - t0, chars: frag.length }, null, 2));
        console.log(`${section.id} / ${model.label} / direction ${d + 1}: ${frag.length} chars, ${usage.output} out tokens, ${((Date.now() - t0) / 1000).toFixed(0)}s`);
      } catch (e) {
        console.error(`${section.id} / ${model.label} / direction ${d + 1}: FAILED ${e.message}`);
      }
    }
  }
}

function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*(?:#.*)?$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}
