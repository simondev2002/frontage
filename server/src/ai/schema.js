// The Site Spec: a compact, structured description of a business website.
// Claude produces and edits this JSON (via structured outputs); the renderer
// turns it into a full HTML page. Keeping the AI on a schema is what makes
// sites "flawless" (always responsive, accessible, fast) and cheap to edit.
import { z } from "zod";

export const FONTS = [
  "Inter", "Manrope", "DM Sans", "Space Grotesk", "Plus Jakarta Sans", "Outfit", "Sora",
  "Work Sans", "Nunito", "Poppins", "Josefin Sans", "Oswald", "Bebas Neue", "Archivo Black",
  "Syne", "Bricolage Grotesque", "Playfair Display", "Fraunces", "Cormorant Garamond", "Lora",
  "Merriweather", "Libre Baskerville", "DM Serif Display", "Instrument Serif",
];

export const ICONS = [
  "scissors", "coffee", "star", "check", "phone", "mail", "map-pin", "clock", "heart", "leaf",
  "sparkle", "shield", "truck", "tool", "camera", "home", "car", "paw", "dumbbell", "cake",
  "flower", "briefcase", "sun", "droplet", "wine", "music", "book", "gift", "key", "smile",
  "zap", "award", "users", "calendar", "globe", "chef", "pen", "brush", "hammer", "bike",
];

export const PRESETS = ["editorial", "bold", "minimal", "warm", "luxury", "playful", "classic", "tech"];
// Subtle page-background textures, drawn by the renderer in CSS (no image files).
export const TEXTURES = ["none", "paper", "grain", "linen", "dots", "grid", "stripes"];
export const SOCIALS = ["instagram", "facebook", "tiktok", "x", "youtube", "linkedin", "whatsapp", "pinterest", "yelp", "google", "tripadvisor", "other"];

const hex = z.string().describe("CSS hex color like #1a1a1a");
const fontField = z.string().describe("Google Font name, exactly one of: " + FONTS.join(", "));
const iconName = z.string().describe("Icon name, exactly one of: " + ICONS.join(", "));
const platformField = z.string().describe("One of: " + SOCIALS.join(", "));
const Cta = z.object({
  label: z.string().describe("Short button text, 1-3 words"),
  href: z.string().describe("Anchor like #contact, or tel:+..., mailto:..., or a full https:// URL"),
});
const ImageId = z.string().nullable().describe("ID of an uploaded image, or null");

export const MetaSchema = z.object({
  businessName: z.string(),
  tagline: z.string().describe("One memorable line, max 80 characters"),
  category: z.string().describe("Plain-language business type, e.g. 'family bakery'"),
  language: z.string().describe("BCP-47 code of the site's language, e.g. en, sv, el, de"),
  seoTitle: z.string().describe("Browser/Google title, max 60 characters, includes business name and city if known"),
  seoDescription: z.string().describe("Google snippet, 120-155 characters"),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  address: z.string().nullable().describe("Single-line street address, or null"),
  mapQuery: z.string().nullable().describe("Search text for an embedded map, usually name + address"),
  bookingUrl: z.string().nullable().describe("External booking/ordering link if the owner provided one"),
  socials: z.array(z.object({ platform: platformField, url: z.string() })),
  hours: z.array(z.object({ days: z.string(), hours: z.string() })).describe("Opening hours rows, e.g. {days:'Mon-Fri', hours:'9:00-18:00'}. Empty if unknown."),
});

export const ThemeSchema = z.object({
  preset: z.enum(PRESETS).describe("Overall design personality"),
  mode: z.enum(["light", "dark"]),
  colors: z.object({
    primary: hex.describe("Main brand color; used for buttons and highlights"),
    secondary: hex.describe("Supporting color for accents/backgrounds"),
    accent: hex.describe("Small pops: eyebrow labels, icons, links"),
    background: hex.describe("Page background"),
    surface: hex.describe("Card background, slightly different from background"),
    text: hex.describe("Body text color with strong contrast on background"),
  }),
  headingFont: fontField,
  bodyFont: fontField,
  radius: z.enum(["sharp", "soft", "round"]),
  texture: z.enum(TEXTURES).default("none").describe("Subtle background texture behind the whole page: none, paper (soft fibres), grain (film grain), linen (fine weave), dots, grid, stripes"),
});

export const NavSchema = z.object({
  links: z.array(z.object({ label: z.string(), sectionId: z.string().describe("id of a section on the page") })).describe("3-5 links max"),
  cta: Cta.nullable(),
});

export const FooterSchema = z.object({
  text: z.string().describe("Short footer line, e.g. tagline or address"),
  showSocials: z.boolean(),
  showHours: z.boolean(),
});

const base = { id: z.string().describe("Stable unique id, lowercase, e.g. 'hero', 'services', 'gallery'") };

export const SectionSchemas = {
  hero: z.object({
    ...base,
    type: z.literal("hero"),
    variant: z.enum(["split", "centered", "fullbleed", "editorial", "minimal"]),
    eyebrow: z.string().nullable().describe("Tiny label above the headline, e.g. 'Est. 1998 · Larnaca'"),
    headline: z.string().describe("The main promise, 3-9 words, specific to the business"),
    subheadline: z.string().describe("1-2 sentences of supporting copy"),
    imageId: ImageId,
    primaryCta: Cta,
    secondaryCta: Cta.nullable(),
  }),
  about: z.object({
    ...base,
    type: z.literal("about"),
    variant: z.enum(["text", "imageLeft", "imageRight", "stats"]),
    eyebrow: z.string().nullable(),
    heading: z.string(),
    paragraphs: z.array(z.string()).describe("1-3 short paragraphs in the owner's voice"),
    imageId: ImageId,
    stats: z.array(z.object({ value: z.string(), label: z.string() })).describe("Only real facts from the brief, else empty"),
  }),
  services: z.object({
    ...base,
    type: z.literal("services"),
    variant: z.enum(["cards", "list", "grid"]),
    heading: z.string(),
    intro: z.string().nullable(),
    items: z.array(z.object({
      title: z.string(),
      description: z.string(),
      price: z.string().nullable().describe("Only if known, e.g. 'from €25'"),
      imageId: ImageId,
      icon: iconName.nullable(),
    })),
  }),
  gallery: z.object({
    ...base,
    type: z.literal("gallery"),
    variant: z.enum(["grid", "masonry", "strip"]),
    heading: z.string().nullable(),
    intro: z.string().nullable(),
    imageIds: z.array(z.string()),
  }),
  testimonials: z.object({
    ...base,
    type: z.literal("testimonials"),
    variant: z.enum(["cards", "single", "wall"]),
    heading: z.string().nullable(),
    items: z.array(z.object({ quote: z.string(), author: z.string(), role: z.string().nullable() })),
  }),
  features: z.object({
    ...base,
    type: z.literal("features"),
    variant: z.enum(["grid", "checklist", "columns"]),
    heading: z.string(),
    intro: z.string().nullable(),
    items: z.array(z.object({ title: z.string(), description: z.string(), icon: iconName })),
  }),
  menu: z.object({
    ...base,
    type: z.literal("menu"),
    heading: z.string(),
    intro: z.string().nullable(),
    categories: z.array(z.object({
      name: z.string(),
      items: z.array(z.object({ name: z.string(), description: z.string().nullable(), price: z.string() })),
    })),
  }),
  pricing: z.object({
    ...base,
    type: z.literal("pricing"),
    heading: z.string(),
    intro: z.string().nullable(),
    plans: z.array(z.object({
      name: z.string(),
      price: z.string(),
      period: z.string().nullable(),
      description: z.string().nullable(),
      features: z.array(z.string()),
      cta: Cta,
      highlighted: z.boolean(),
    })),
  }),
  faq: z.object({
    ...base,
    type: z.literal("faq"),
    heading: z.string(),
    items: z.array(z.object({ question: z.string(), answer: z.string() })),
  }),
  team: z.object({
    ...base,
    type: z.literal("team"),
    heading: z.string(),
    intro: z.string().nullable(),
    members: z.array(z.object({ name: z.string(), role: z.string(), bio: z.string().nullable(), imageId: ImageId })),
  }),
  hours: z.object({
    ...base,
    type: z.literal("hours"),
    heading: z.string(),
    note: z.string().nullable(),
  }),
  contact: z.object({
    ...base,
    type: z.literal("contact"),
    variant: z.enum(["split", "stacked"]),
    heading: z.string(),
    intro: z.string().nullable(),
    showForm: z.boolean(),
    showMap: z.boolean(),
  }),
  cta: z.object({
    ...base,
    type: z.literal("cta"),
    variant: z.enum(["banner", "card"]),
    heading: z.string(),
    text: z.string().nullable(),
    button: Cta,
    imageId: ImageId,
  }),
  text: z.object({
    ...base,
    type: z.literal("text"),
    heading: z.string().nullable(),
    paragraphs: z.array(z.string()),
  }),
  custom: z.object({
    ...base,
    type: z.literal("custom"),
    heading: z.string().nullable(),
    html: z.string().describe("Sanitized HTML fragment for requests the other section types cannot express"),
    css: z.string().describe("Scoped CSS for the fragment, or empty string"),
  }),
};

export const SectionSchema = z.discriminatedUnion("type", Object.values(SectionSchemas));

export const SiteSpecSchema = z.object({
  meta: MetaSchema,
  theme: ThemeSchema,
  nav: NavSchema,
  sections: z.array(SectionSchema).describe("5-9 sections in page order; first is always a hero, last is usually contact"),
  footer: FooterSchema,
});

// Edit operations. Each op carries complete objects so the model never has to
// emit JSON-pointer paths; the server applies them to the current spec.
const OpSchemas = [
  z.object({ op: z.literal("replace_section"), id: z.string(), section: SectionSchema }),
  z.object({ op: z.literal("insert_section"), afterId: z.string().nullable().describe("Insert after this section id; null = at the very top"), section: SectionSchema }),
  z.object({ op: z.literal("remove_section"), id: z.string() }),
  z.object({ op: z.literal("move_section"), id: z.string(), afterId: z.string().nullable() }),
  z.object({ op: z.literal("set_theme"), theme: ThemeSchema }),
  z.object({ op: z.literal("set_meta"), meta: MetaSchema }),
  z.object({ op: z.literal("set_nav"), nav: NavSchema }),
  z.object({ op: z.literal("set_footer"), footer: FooterSchema }),
];
export const EditResultSchema = z.object({
  reply: z.string().describe("One or two friendly sentences telling the owner what changed, in their language"),
  ops: z.array(z.discriminatedUnion("op", OpSchemas)),
});

export const ModerationSchema = z.object({
  allowed: z.boolean(),
  reason: z.string().describe("Short reason when not allowed, else empty string"),
});

export function validateSpec(spec) {
  const r = SiteSpecSchema.safeParse(spec);
  if (!r.success) {
    const issues = r.error.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    const err = new Error("Invalid site spec: " + issues);
    err.issues = r.error.issues;
    throw err;
  }
  return r.data;
}

// Apply edit ops to a spec, returning a new spec. Unknown section ids are
// tolerated (skipped) so a slightly-off model output never corrupts a site.
export function applyOps(spec, ops) {
  const next = structuredClone(spec);
  const changes = [];
  const idx = (id) => next.sections.findIndex((s) => s.id === id);
  for (const op of ops) {
    switch (op.op) {
      case "replace_section": {
        const i = idx(op.id);
        if (i === -1) {
          next.sections.push({ ...op.section });
          changes.push(`added ${op.section.type}`);
        } else {
          next.sections[i] = { ...op.section, id: op.section.id || op.id };
          changes.push(`updated ${op.section.type}`);
        }
        break;
      }
      case "insert_section": {
        const section = { ...op.section };
        if (idx(section.id) !== -1) section.id = `${section.id}-${Math.random().toString(36).slice(2, 6)}`;
        let at;
        if (op.afterId === null) at = 0;
        else {
          const i = idx(op.afterId);
          at = i === -1 ? next.sections.length : i + 1;
        }
        next.sections.splice(at, 0, section);
        changes.push(`added ${section.type}`);
        break;
      }
      case "remove_section": {
        const i = idx(op.id);
        if (i !== -1) {
          changes.push(`removed ${next.sections[i].type}`);
          next.sections.splice(i, 1);
        }
        break;
      }
      case "move_section": {
        const i = idx(op.id);
        if (i === -1) break;
        const [s] = next.sections.splice(i, 1);
        const at = op.afterId === null ? 0 : idx(op.afterId) + 1;
        next.sections.splice(at, 0, s);
        changes.push(`moved ${s.type}`);
        break;
      }
      case "set_theme":
        next.theme = op.theme;
        changes.push("changed the look");
        break;
      case "set_meta":
        next.meta = op.meta;
        changes.push("updated business details");
        break;
      case "set_nav":
        next.nav = op.nav;
        changes.push("updated navigation");
        break;
      case "set_footer":
        next.footer = op.footer;
        changes.push("updated footer");
        break;
      default:
        break;
    }
  }
  // Drop nav links that point nowhere.
  const ids = new Set(next.sections.map((s) => s.id));
  next.nav.links = next.nav.links.filter((l) => ids.has(l.sectionId));
  return { spec: next, changes };
}
