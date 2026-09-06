// First-time site generation from the onboarding brief + photos, with an
// automatic quality gate: obvious misses (wrong language, placeholder text,
// missing contact section) trigger one corrected regeneration.
import fs from "node:fs";
import { z } from "zod";
import { config } from "../config.js";
import { structuredCall, aiConfigured } from "./client.js";
import { GENERATE_SYSTEM, LANGUAGE_CHECK_SYSTEM, LANGUAGE_NAMES, briefToText } from "./prompts.js";
import { SiteSpecSchema, FONTS, ICONS, SOCIALS, validateSpec } from "./schema.js";
import { specText } from "./moderate.js";

const HEX = /^#[0-9a-fA-F]{6}$/;
const PLACEHOLDER = /lorem ipsum|\[insert|\[your |\[business|placeholder text|\bTODO\b|xxx-xxx|123-456-7890|example\.com/i;

// Maps a model-written name onto the allowed list (case/spacing tolerant), else the fallback.
function closestName(value, list, fallback) {
  if (value === null || value === undefined) return fallback;
  const norm = (x) => String(x).toLowerCase().replace(/[^a-z0-9]/g, "");
  const v = norm(value);
  const exact = list.find((x) => norm(x) === v);
  if (exact) return exact;
  const partial = list.find((x) => v.includes(norm(x)) || norm(x).includes(v));
  return partial || fallback;
}

export function imageContentBlocks(images, limit) {
  const blocks = [];
  for (const im of images.slice(0, limit)) {
    if (!im.path || !fs.existsSync(im.path)) continue;
    const data = fs.readFileSync(im.path).toString("base64");
    blocks.push({ type: "text", text: `Photo id: ${im.id} (${im.kind}${im.caption ? `, owner note: ${im.caption}` : ""})` });
    blocks.push({ type: "image", source: { type: "base64", media_type: im.mime, data } });
  }
  return blocks;
}

async function runGeneration({ brief, images, manifest, corrections, userId, siteId, onProgress }) {
  const text = briefToText(brief, manifest) + (corrections?.length ? `\n\n# Corrections required (the previous attempt had these problems)\n${corrections.map((c) => "- " + c).join("\n")}` : "") + "\n\nCreate the complete website now.";
  const content = [...imageContentBlocks(images, config.ai.maxImagesPerGeneration), { type: "text", text }];
  return structuredCall({
    kind: "generate",
    model: config.ai.model,
    effort: config.ai.effortGenerate,
    system: GENERATE_SYSTEM,
    messages: [{ role: "user", content }],
    schema: SiteSpecSchema,
    maxTokens: 32000,
    onProgress: (chars) => onProgress?.(Math.min(0.95, chars / 12000)),
    userId,
    siteId,
  });
}

export async function generateSite({ brief, images, userId, siteId, onProgress, onStatus }) {
  const manifest = images.map((im) => ({ id: im.id, kind: im.kind, width: im.width, height: im.height, caption: im.caption }));
  let { data, usage, cost, model } = await runGeneration({ brief, images, manifest, userId, siteId, onProgress });
  let spec = repairSpec(data, images, brief);
  let issues = await qualityIssues(spec, brief, images, { userId, siteId });
  if (issues.length) {
    console.warn("[generate] quality gate:", issues.join(" | "));
    onStatus?.("Improving the first draft");
    try {
      const second = await runGeneration({ brief, images, manifest, corrections: issues, userId, siteId, onProgress: (p) => onProgress?.(0.5 + p * 0.5) });
      const spec2 = repairSpec(second.data, images, brief);
      const issues2 = await qualityIssues(spec2, brief, images, { userId, siteId });
      if (issues2.length <= issues.length) {
        spec = spec2; usage = second.usage; cost += second.cost; model = second.model; issues = issues2;
      }
    } catch (e) {
      console.warn("[generate] second attempt failed, keeping the first:", e.message);
    }
  }
  return { spec, usage, cost, model, issues };
}

// Cheap checks a good designer would never fail. Returns human-readable corrections.
export async function qualityIssues(spec, brief, images, ctx = {}) {
  const issues = [];
  const text = specText(spec);
  if (PLACEHOLDER.test(text)) issues.push("Remove every placeholder or example value; only use real details from the brief, or leave the field null.");
  if (spec.sections.length < 4) issues.push("The site has too few sections; a complete site has 5-9 sections.");
  const hasContact = spec.sections.some((s) => s.type === "contact");
  if (!hasContact && (brief.phone || brief.email || brief.address)) issues.push("Add a contact section with the owner's contact details and the form.");
  const featured = images.filter((i) => i.kind === "featured");
  const used = new Set();
  for (const s of spec.sections) {
    if (s.imageId) used.add(s.imageId);
    for (const id of s.imageIds || []) used.add(id);
    for (const it of s.items || []) if (it.imageId) used.add(it.imageId);
    for (const m of s.members || []) if (m.imageId) used.add(m.imageId);
  }
  const unused = featured.filter((i) => !used.has(i.id));
  if (featured.length && unused.length > Math.max(1, Math.floor(featured.length / 2))) issues.push(`Use the uploaded photos: ${unused.map((i) => i.id).join(", ")} are not placed anywhere. Add a gallery or place them in sections.`);
  if (brief.language && aiConfigured()) {
    const detected = await detectLanguage([spec.sections[0]?.headline, spec.sections[0]?.subheadline, spec.meta.tagline, spec.sections[1]?.heading, (spec.sections[1]?.paragraphs || [])[0]].filter(Boolean), ctx);
    if (detected && detected !== brief.language.toLowerCase().slice(0, 2)) {
      issues.push(`The copy is written in ${LANGUAGE_NAMES[detected] || detected}; every word must be in ${LANGUAGE_NAMES[brief.language] || brief.language}.`);
    }
  }
  return issues;
}

const LanguageSchema = z.object({ language: z.string().describe("two-letter ISO 639-1 code") });
async function detectLanguage(samples, ctx) {
  if (!samples.length) return null;
  try {
    const { data } = await structuredCall({
      kind: "language_check",
      model: config.ai.cheapModel,
      system: LANGUAGE_CHECK_SYSTEM,
      messages: [{ role: "user", content: samples.map((s, i) => `${i + 1}. ${s}`).join("\n") }],
      schema: LanguageSchema,
      maxTokens: 50,
      userId: ctx.userId,
      siteId: ctx.siteId,
    });
    return String(data.language || "").toLowerCase().slice(0, 2) || null;
  } catch (e) {
    console.warn("[generate] language check skipped:", e.message);
    return null;
  }
}

// Defensive clean-up so a slightly-off model output never breaks rendering.
// Also re-asserts owner-supplied facts (contact details) as the source of truth.
export function repairSpec(spec, images = [], brief = null) {
  // SEO fields must always exist and fit Google's limits, whatever the model returned.
  if (spec.meta) {
    const m = spec.meta;
    const city = brief && brief.location ? String(brief.location).trim() : "";
    const clip = (s, max) => (s.length <= max ? s : s.slice(0, max - 1).replace(/\s+\S*$/, "").trim() + "…");
    if (!m.seoTitle || !String(m.seoTitle).trim()) {
      m.seoTitle = [m.businessName, m.category ? `${m.category}${city ? ` in ${city}` : ""}` : ""].filter(Boolean).join(" | ");
    }
    m.seoTitle = clip(String(m.seoTitle).trim(), 60);
    if (!m.seoDescription || String(m.seoDescription).trim().length < 50) {
      m.seoDescription = [m.tagline, m.category && city ? `${m.category} in ${city}.` : ""].filter(Boolean).join(" ").trim() || m.businessName;
    }
    m.seoDescription = clip(String(m.seoDescription).trim(), 155);
  }
  const ids = new Set(images.map((i) => i.id));
  const okImg = (id) => (id && ids.has(id) ? id : null);
  const seen = new Set();
  spec.sections = (spec.sections || []).map((s, i) => {
    let id = String(s.id || s.type || `s${i}`).toLowerCase().replace(/[^a-z0-9-]/g, "-") || `s${i}`;
    while (seen.has(id)) id = `${id}-${i}`;
    seen.add(id);
    s.id = id;
    if ("imageId" in s) s.imageId = okImg(s.imageId);
    if (Array.isArray(s.imageIds)) s.imageIds = s.imageIds.filter((x) => ids.has(x));
    if (Array.isArray(s.items)) for (const it of s.items) if ("imageId" in it) it.imageId = okImg(it.imageId);
    if (Array.isArray(s.members)) for (const m of s.members) m.imageId = okImg(m.imageId);
    return s;
  });
  if (spec.sections.length && spec.sections[0].type !== "hero") {
    const h = spec.sections.findIndex((s) => s.type === "hero");
    if (h > 0) spec.sections.unshift(...spec.sections.splice(h, 1));
  }
  const secIds = new Set(spec.sections.map((s) => s.id));
  spec.nav.links = (spec.nav.links || []).filter((l) => secIds.has(l.sectionId)).slice(0, 5);
  const c = spec.theme.colors;
  const defaults = { primary: "#1f4d3a", secondary: "#e7efe9", accent: "#c4783a", background: "#fbfaf7", surface: "#ffffff", text: "#1c1c1a" };
  for (const k of Object.keys(defaults)) if (!HEX.test(c[k] || "")) c[k] = defaults[k];
  spec.theme.headingFont = closestName(spec.theme.headingFont, FONTS, "Fraunces");
  spec.theme.bodyFont = closestName(spec.theme.bodyFont, FONTS, "Inter");
  for (const s of spec.sections) {
    if (Array.isArray(s.items)) {
      for (const it of s.items) {
        if ("icon" in it && it.icon !== null && it.icon !== undefined) it.icon = closestName(it.icon, ICONS, s.type === "features" ? "star" : null);
        if (s.type === "features" && !it.icon) it.icon = "star";
      }
    }
  }
  spec.meta.socials = (spec.meta.socials || []).map((so) => ({ ...so, platform: SOCIALS.includes(String(so.platform).toLowerCase()) ? String(so.platform).toLowerCase() : "other" }));
  if (brief) {
    const m = spec.meta;
    for (const k of ["phone", "email", "address", "bookingUrl"]) if (brief[k] && !m[k]) m[k] = brief[k];
    if (brief.hours?.length && !m.hours?.length) m.hours = brief.hours;
    if (brief.socials?.length && !m.socials?.length) m.socials = brief.socials;
    if (brief.businessName) m.businessName = m.businessName || brief.businessName;
    if (brief.language && (!m.language || m.language.length > 5)) m.language = brief.language;
  }
  return validateSpec(spec);
}
