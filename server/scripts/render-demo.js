// Renders the fixture spec to data/demo.html so the design can be checked in a browser.
// Usage: node scripts/render-demo.js [preset]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { renderSite } from "../src/renderer/index.js";
import { validateSpec } from "../src/ai/schema.js";
import { formLabelsFor } from "../src/renderer/sections.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const spec = validateSpec(JSON.parse(fs.readFileSync(path.join(here, "../test/fixtures/demo-spec.json"), "utf8")));
const preset = process.argv[2];
if (preset) spec.theme.preset = preset;
const pic = (seed, w, h) => ({ url: `https://picsum.photos/seed/${seed}/${w}/${h}`, width: w, height: h, caption: "", kind: "featured" });
const images = {
  img1: pic("bread1", 1200, 1500),
  img2: pic("bread2", 1200, 900),
  img3: pic("croissant", 1200, 900),
  img4: pic("baker", 1200, 1500),
  img5: pic("oven", 1200, 800),
};
const html = renderSite(spec, {
  images,
  formEndpoint: "/f/demo",
  formLabels: formLabelsFor(spec.meta.language),
  canonical: "https://oak-and-ember.frontageweb.com/",
  badge: { brand: "Frontage", href: "https://frontageweb.com" },
  reportHref: "https://frontageweb.com/report?site=demo",
  preview: true,
});
const out = path.join(here, `../data/demo${preset ? "-" + preset : ""}.html`);
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, html);
console.log("wrote", out, html.length, "bytes");
