// End-to-end AI smoke test: generate a site from a sample brief, render it,
// then apply one chat edit. Requires ANTHROPIC_API_KEY. Prints token usage
// and cost so you can sanity-check the unit economics.
//   node scripts/ai-smoke.js            (no photos)
//   node scripts/ai-smoke.js ./a.jpg ./b.jpg   (with photos)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { generateSite } from "../src/ai/generate.js";
import { editSite } from "../src/ai/edit.js";
import { moderateSpec } from "../src/ai/moderate.js";
import { renderSite } from "../src/renderer/index.js";
import { formLabelsFor } from "../src/renderer/sections.js";
import { imageDimensions } from "../src/uploads.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const brief = {
  businessName: "Oak & Ember",
  category: "artisan bakery",
  description: "Family bakery in Larnaca. Wood-fired sourdough, croissants and Cypriot koulouri. Andreas learned baking in his father's village bakery in Lefkara; opened in 2016 with his wife Maria. Around 300 loaves a day. Cakes to order.",
  location: "Larnaca, Cyprus",
  services: ["Country sourdough €4.50", "Butter croissants €2.80", "Village koulouri €1.50", "Cakes to order from €28"],
  differentiators: "36-hour fermentation, oak and olive wood oven, wheat from two farms in the Mesaoria plain",
  primaryAction: "Message us to pre-order",
  phone: "+357 24 123 456",
  email: "hello@oakandember.cy",
  address: "14 Zinonos Kitieos, Larnaca 6023, Cyprus",
  hours: [{ days: "Mon-Fri", hours: "7:00-15:00" }, { days: "Saturday", hours: "7:00-14:00" }, { days: "Sunday", hours: "Closed" }],
  socials: [{ platform: "instagram", url: "https://instagram.com/oakandember" }],
  colors: ["warm terracotta", "cream"],
  mood: ["warm", "honest", "handmade"],
  testimonials: [{ quote: "The best sourdough on the island. I drive from Nicosia on Saturdays just for the country loaf.", author: "Elena P.", role: "Regular since 2018" }],
};
const images = process.argv.slice(2).map((p, i) => {
  const buf = fs.readFileSync(p);
  const { width, height } = imageDimensions(buf);
  const ext = path.extname(p).slice(1).toLowerCase();
  return { id: `img${i + 1}`, path: p, mime: ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg", width, height, kind: "featured", caption: "", url: `file://${path.resolve(p)}` };
});

console.time("generate");
const g = await generateSite({ brief, images });
console.timeEnd("generate");
console.log("model", g.model, "usage", g.usage, "cost $" + g.cost.toFixed(4));
console.log("preset", g.spec.theme.preset, "fonts", g.spec.theme.headingFont, "/", g.spec.theme.bodyFont);
console.log("sections", g.spec.sections.map((s) => `${s.type}:${s.variant || ""}`).join(", "));
const imgMap = Object.fromEntries(images.map((i) => [i.id, i]));
const out = path.join(here, "../data/smoke.html");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, renderSite(g.spec, { images: imgMap, formEndpoint: "#", formLabels: formLabelsFor(g.spec.meta.language), badge: { brand: "Frontage", href: "#" }, preview: true }));
console.log("rendered", out);

console.time("edit");
const e = await editSite({ spec: g.spec, images, instruction: "Make it feel bolder and add a short FAQ section before the contact section." });
console.timeEnd("edit");
console.log("reply:", e.reply);
console.log("changes:", e.changes, "cost $" + e.cost.toFixed(4));
fs.writeFileSync(path.join(here, "../data/smoke-edited.html"), renderSite(e.spec, { images: imgMap, formEndpoint: "#", formLabels: formLabelsFor(e.spec.meta.language), preview: true }));

console.time("moderate");
console.log("moderation:", await moderateSpec(e.spec));
console.timeEnd("moderate");
