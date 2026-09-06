// Per-site privacy notice. Every hosted website collects visitor data through its contact
// form and loads Google Fonts (and sometimes a Google Maps embed), so the business owner
// needs a notice of their own: they are the controller, Frontage is the processor.
// The notice is generated from the site's details in English and translated once with the
// cheap model at publish time; the translation is cached in sites.legal_json.
import { z } from "zod";
import { createHash } from "node:crypto";
import { config } from "./config.js";
import { get, run, now } from "./db.js";
import { escapeHtml as esc } from "./util/http.js";
import { buildCss, fontsHref } from "./renderer/css.js";
import { aiConfigured, structuredCall } from "./ai/client.js";

const OPERATOR = "Frontage, a service operated by S.MAKELA GAMES LTD";

/** Facts the notice is built from; changing any of them invalidates the cached translation. */
export function legalInputs(spec) {
  const m = spec.meta;
  const hasForm = spec.sections.some((s) => s.type === "contact");
  const hasMap = spec.sections.some((s) => s.type === "contact") && Boolean(m.mapQuery || m.address);
  const hasBooking = Boolean(m.bookingUrl);
  return {
    name: m.businessName,
    address: m.address || "",
    email: m.email || "",
    phone: m.phone || "",
    language: String(m.language || "en").toLowerCase().split("-")[0],
    hasForm,
    hasMap,
    hasBooking,
  };
}

/** The notice in English, as plain sections. Kept factual and short so it translates well. */
export function privacySections(inputs) {
  const { name, address, email, phone, hasForm, hasMap, hasBooking } = inputs;
  const contactBits = [address, email, phone].filter(Boolean).join(", ");
  const sections = [
    {
      heading: "Who is responsible",
      body: `This website belongs to ${name}${contactBits ? ` (${contactBits})` : ""}. ${name} decides what personal data is collected here and why, and is your point of contact for anything in this notice.`,
    },
  ];
  if (hasForm) {
    sections.push({
      heading: "The contact form",
      body: `When you send a message through the form we receive your name, your email address, your phone number if you add it, and your message. ${name} uses them to reply to you. They are not used for advertising and are not sold. Messages are kept until ${name} deletes them or closes their account.`,
    });
  }
  sections.push(
    {
      heading: "Technical data",
      body: "Like every website, this one records basic technical data when you visit: your IP address, the page requested and the time. It is used only to keep the site secure, to stop abuse of the contact form and to count visits as a daily total. The visit counter stores no cookies and no addresses.",
    },
    {
      heading: "Who hosts and processes the data",
      body: `The website and the messages are hosted by ${OPERATOR}, which acts as a processor on behalf of ${name}, on servers in the European Union, and is delivered through Cloudflare's network. Frontage does not use your data for any purpose of its own. Frontage's own privacy policy is available at ${config.publicBaseUrl}/privacy.`,
    },
    {
      heading: "Fonts and embedded services",
      body: `The site's typefaces are loaded from Google Fonts, which means your browser sends your IP address to Google when the page loads.${hasMap ? " The map on the contact section is provided by Google Maps; Google may set cookies or collect data when the map loads." : ""}${hasBooking ? " Booking or ordering happens on an external service with its own privacy policy." : ""} Links to social networks lead to those services, which apply their own rules.`,
    },
    {
      heading: "Cookies",
      body: `This website itself sets no cookies and uses no tracking or advertising technology.${hasMap ? " Only the embedded map may set cookies from Google." : ""}`,
    },
    {
      heading: "Your rights",
      body: `You can ask ${name} what data they hold about you, ask for it to be corrected or deleted, and object to its use, by contacting them${email ? ` at ${email}` : ""}${phone ? ` or on ${phone}` : ""}. In the European Economic Area and the United Kingdom you also have the right to complain to your data protection authority.`,
    },
    {
      heading: "Legal basis",
      body: `Replying to your message is based on the steps you ask for before entering into a contract, or on ${name}'s legitimate interest in answering enquiries. Security logging is based on legitimate interest in keeping the site safe.`,
    },
  );
  return sections;
}

const LegalSchema = z.object({
  title: z.string(),
  sections: z.array(z.object({ heading: z.string(), body: z.string() })),
});

const LANGUAGE_NAMES = { sv: "Swedish", el: "Greek", de: "German", fr: "French", es: "Spanish", it: "Italian", nl: "Dutch", pt: "Portuguese", da: "Danish", no: "Norwegian", fi: "Finnish", pl: "Polish", tr: "Turkish", ru: "Russian", ar: "Arabic" };

function inputsHash(inputs) {
  return createHash("sha256").update(JSON.stringify(inputs)).digest("hex").slice(0, 16);
}

/**
 * Makes sure a translated notice is cached for non-English sites. Called at publish time;
 * a failure just means the English notice is served, so it never blocks publishing.
 */
export async function ensureLegalTranslation(site, spec) {
  const inputs = legalInputs(spec);
  if (inputs.language === "en" || !LANGUAGE_NAMES[inputs.language] || !aiConfigured()) return;
  const hash = inputsHash(inputs);
  const cached = parseCache(site.legal_json);
  if (cached && cached.hash === hash && cached.language === inputs.language) return;
  const english = { title: "Privacy notice", sections: privacySections(inputs) };
  const { data } = await structuredCall({
    kind: "legal",
    model: config.ai.cheapModel,
    effort: "low",
    system: `Translate the JSON privacy notice into ${LANGUAGE_NAMES[inputs.language]}. Keep the same structure, headings count and meaning. Keep names, email addresses, phone numbers and URLs exactly as they are. Plain, natural language a customer would expect on a small business website; no em dashes.`,
    messages: [{ role: "user", content: JSON.stringify(english) }],
    schema: LegalSchema,
    maxTokens: 4000,
    userId: site.user_id,
    siteId: site.id,
  });
  run("UPDATE sites SET legal_json = ? WHERE id = ?", JSON.stringify({ language: inputs.language, hash, updatedAt: now(), ...data }), site.id);
}

function parseCache(json) {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

/** The notice to show: the cached translation when it matches the site, otherwise English. */
export function legalContent(site, spec) {
  const inputs = legalInputs(spec);
  const cached = parseCache(site.legal_json);
  if (cached && cached.language === inputs.language && cached.hash === inputsHash(inputs) && Array.isArray(cached.sections)) {
    return { title: cached.title || "Privacy notice", sections: cached.sections, language: inputs.language };
  }
  return { title: "Privacy notice", sections: privacySections(inputs), language: "en" };
}

/** Standalone page in the site's own colors and fonts, linking back to the homepage. */
export function renderLegalPage(spec, content, { homeHref = "/", nonce = "" } = {}) {
  const m = spec.meta;
  const updated = new Date().toISOString().slice(0, 10);
  return `<!doctype html>
<html lang="${esc(content.language)}" class="preset-${esc(spec.theme.preset)} mode-${esc(spec.theme.mode)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(content.title)} · ${esc(m.businessName)}</title>
<meta name="robots" content="noindex, follow">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontsHref(spec.theme)}">
<style>${buildCss(spec.theme)}
.legal{padding:60px 0 80px;max-width:720px}
.legal h1{font-size:2.2rem;margin:0 0 6px}
.legal .meta{opacity:.7;margin-bottom:30px}
.legal h2{font-size:1.25rem;margin:28px 0 8px}
.legal p{margin:0 0 12px}
.legal .back{display:inline-block;margin-top:34px}</style>
</head>
<body class="mode-${esc(spec.theme.mode)}">
<header class="nav"><div class="wrap"><a class="brand" href="${esc(homeHref)}">${esc(m.businessName)}</a></div></header>
<main id="main"><div class="wrap"><article class="legal">
<h1>${esc(content.title)}</h1>
<p class="meta">${esc(m.businessName)} · ${esc(updated)}</p>
${content.sections.map((s) => `<h2>${esc(s.heading)}</h2><p>${esc(s.body)}</p>`).join("\n")}
<a class="back" href="${esc(homeHref)}">← ${esc(m.businessName)}</a>
</article></div></main>
</body>
</html>`;
}
