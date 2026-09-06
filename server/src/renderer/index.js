// Site renderer: SiteSpec + images -> complete, self-contained HTML document.
import { escapeHtml as esc } from "../util/http.js";
import { buildCss, fontsHref } from "./css.js";
import { sections, nav, footer, safeHref } from "./sections.js";

/**
 * @param {object} spec        validated SiteSpec
 * @param {object} opts
 * @param {Map|object} opts.images   id -> {url, width, height, caption, kind}
 * @param {string} opts.formEndpoint  where the contact form posts
 * @param {string} [opts.canonical]   canonical URL of the site
 * @param {object} [opts.badge]       {brand, href} to show "Made with" badge
 * @param {string} [opts.reportHref]  abuse report link
 * @param {boolean} [opts.preview]    adds a draft banner
 * @param {string} [opts.previewLabel]
 */
export function renderSite(spec, opts = {}) {
  const images = opts.images instanceof Map ? opts.images : new Map(Object.entries(opts.images || {}));
  const ctx = {
    meta: spec.meta,
    theme: spec.theme,
    image: (id) => (id ? images.get(id) || null : null),
    logo: [...images.values()].find((i) => i.kind === "logo") || null,
    formEndpoint: opts.formEndpoint || "#",
    badge: opts.badge || null,
    reportHref: opts.reportHref || null,
    formLabels: opts.formLabels,
    privacyHref: opts.privacyHref || null,
  };

  const body = spec.sections
    .map((s) => {
      const fn = sections[s.type];
      try {
        return fn ? fn(s, ctx) : "";
      } catch (e) {
        console.error("render section failed", s.type, e);
        return "";
      }
    })
    .join("\n");

  const heroImg = spec.sections.find((s) => s.type === "hero" && s.imageId);
  const ogImage = heroImg ? ctx.image(heroImg.imageId)?.url : null;
  const m = spec.meta;
  const title = m.seoTitle || m.businessName;
  const description = m.seoDescription || m.tagline;
  const canonical = opts.canonical || null;
  const logoUrl = ctx.logo ? absolutize(ctx.logo.url, canonical) : null;

  // Structured data: a LocalBusiness subtype picked from the category so Google shows the
  // right rich result (hours, phone, address), plus FAQPage when the site has an FAQ.
  const business = {
    "@type": schemaTypeFor(m.category),
    ...(canonical ? { "@id": `${canonical.replace(/\/$/, "")}/#business` } : {}),
    name: m.businessName,
    description,
    ...(canonical ? { url: canonical } : {}),
    ...(m.phone ? { telephone: m.phone } : {}),
    ...(m.email ? { email: m.email } : {}),
    ...(m.address ? { address: { "@type": "PostalAddress", streetAddress: m.address } } : {}),
    ...(ogImage ? { image: absolutize(ogImage, canonical) } : {}),
    ...(logoUrl ? { logo: logoUrl } : {}),
    ...(m.hours?.length ? { openingHours: m.hours.map((h) => `${h.days} ${h.hours}`) } : {}),
    ...(m.socials?.length ? { sameAs: m.socials.map((s) => safeHref(s.url)).filter((u) => u.startsWith("http")) } : {}),
  };
  const faq = spec.sections.find((s) => s.type === "faq" && s.items?.length);
  const graph = [business];
  if (faq) {
    graph.push({
      "@type": "FAQPage",
      mainEntity: faq.items.map((it) => ({ "@type": "Question", name: it.question, acceptedAnswer: { "@type": "Answer", text: it.answer } })),
    });
  }
  const jsonLd = { "@context": "https://schema.org", "@graph": graph };

  // Favicon: the uploaded logo when there is one, otherwise a generated initial in the brand colors.
  const c = spec.theme.colors;
  const initial = (m.businessName || "F").trim().charAt(0).toUpperCase();
  const faviconSvg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' rx='14' fill='${c.primary}'/><text x='32' y='43' font-family='system-ui,sans-serif' font-size='34' font-weight='700' text-anchor='middle' fill='${c.background}'>${esc(initial)}</text></svg>`;
  const favicon = logoUrl ? `<link rel="icon" href="${esc(logoUrl)}"><link rel="apple-touch-icon" href="${esc(logoUrl)}">` : `<link rel="icon" href="data:image/svg+xml,${encodeURIComponent(faviconSvg)}">`;
  const locale = OG_LOCALES[(m.language || "en").toLowerCase().slice(0, 2)] || "en_US";

  const previewBar = opts.preview
    ? `<div style="position:fixed;bottom:14px;left:50%;transform:translateX(-50%);z-index:99;background:#111;color:#fff;font:600 13px/1 system-ui,sans-serif;padding:10px 16px;border-radius:999px;box-shadow:0 10px 30px rgba(0,0,0,.3);letter-spacing:.02em">${esc(opts.previewLabel || "Preview · not published yet")}</div>`
    : "";

  return `<!doctype html>
<html lang="${esc(m.language || "en")}" class="preset-${esc(spec.theme.preset)} mode-${esc(spec.theme.mode)}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
${canonical ? `<link rel="canonical" href="${esc(canonical)}">` : ""}
<meta name="robots" content="${opts.noindex ? "noindex, nofollow" : "index, follow, max-image-preview:large"}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(m.businessName)}">
<meta property="og:locale" content="${esc(locale)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
${canonical ? `<meta property="og:url" content="${esc(canonical)}">` : ""}
${ogImage ? `<meta property="og:image" content="${esc(absolutize(ogImage, canonical))}">` : ""}
<meta name="twitter:card" content="${ogImage ? "summary_large_image" : "summary"}">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
${ogImage ? `<meta name="twitter:image" content="${esc(absolutize(ogImage, canonical))}">` : ""}
${favicon}
<meta name="theme-color" content="${esc(spec.theme.colors.background)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontsHref(spec.theme)}">
<style>${buildCss(spec.theme)}</style>
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g, "\\u003c")}</script>
</head>
<body class="mode-${esc(spec.theme.mode)}">
<a class="skip" href="#main">Skip to content</a>
${nav(spec, ctx)}
<main id="main">
${body}
</main>
${footer(spec, ctx)}
${previewBar}
<script${opts.nonce ? ` nonce="${esc(opts.nonce)}"` : ""}>
(function(){
  var nav=document.querySelector('.nav'),b=document.querySelector('.burger');
  if(b){b.addEventListener('click',function(){var o=nav.classList.toggle('open');b.setAttribute('aria-expanded',o)});
    nav.querySelectorAll('.links a').forEach(function(a){a.addEventListener('click',function(){nav.classList.remove('open')})});}
  if('IntersectionObserver' in window){var io=new IntersectionObserver(function(es){es.forEach(function(e){if(e.isIntersecting){e.target.classList.add('in');io.unobserve(e.target)}})},{rootMargin:'0px 0px -8% 0px'});
    document.querySelectorAll('.reveal').forEach(function(el){io.observe(el)});}else{document.querySelectorAll('.reveal').forEach(function(el){el.classList.add('in')})}
  document.querySelectorAll('form.lead-form').forEach(function(f){
    f.addEventListener('submit',function(ev){ev.preventDefault();
      var msg=f.querySelector('.form-msg'),btn=f.querySelector('button');
      var data={};new FormData(f).forEach(function(v,k){data[k]=v});
      if(!data.name||!data.email||!data.message){msg.textContent='Please fill in your name, email and message.';return;}
      btn.disabled=true;msg.textContent='Sending…';
      fetch(f.dataset.endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)})
      .then(function(r){if(!r.ok)throw new Error('bad');return r.json()})
      .then(function(){f.innerHTML='<div class="form-ok">Thanks! Your message was sent. We\u2019ll get back to you shortly.</div>'})
      .catch(function(){btn.disabled=false;msg.textContent='Something went wrong. Please try again or call us.'});
    });
  });
})();
</script>
</body>
</html>`;
}

const OG_LOCALES = { en: "en_US", sv: "sv_SE", el: "el_GR", de: "de_DE", fr: "fr_FR", es: "es_ES", it: "it_IT", nl: "nl_NL", pt: "pt_PT", da: "da_DK", no: "nb_NO", fi: "fi_FI", pl: "pl_PL", tr: "tr_TR", ru: "ru_RU", ar: "ar_AR" };

// schema.org LocalBusiness subtypes keyed by words that tend to appear in the category.
const SCHEMA_TYPES = [
  [/bakery|bread|patisserie|pastry/, "Bakery"],
  [/caf[eé]|coffee|espresso/, "CafeOrCoffeeShop"],
  [/restaurant|taverna|bistro|grill|pizzeria|sushi|kitchen|eatery|diner/, "Restaurant"],
  [/bar\b|pub|wine|cocktail/, "BarOrPub"],
  [/barber/, "BarberShop"],
  [/hair|salon|nail|beauty|lashes|brows/, "BeautySalon"],
  [/spa|massage|wellness/, "DaySpa"],
  [/yoga|pilates|gym|fitness|crossfit|studio.*(train|fit)/, "ExerciseGym"],
  [/dentist|dental/, "Dentist"],
  [/clinic|physio|doctor|medical|health/, "MedicalClinic"],
  [/vet|animal|pet/, "VeterinaryCare"],
  [/hotel|guest ?house|bed and breakfast|villa|apartments?/, "LodgingBusiness"],
  [/real estate|realtor|property/, "RealEstateAgent"],
  [/plumb/, "Plumber"],
  [/electric/, "Electrician"],
  [/roof/, "RoofingContractor"],
  [/clean/, "HousePainter"], // no cleaning subtype exists; the parent class wins below
  [/garden|landscap/, "Locksmith"],
  [/car|auto|garage|mechanic|tyre|tire/, "AutoRepair"],
  [/law|attorney|solicitor|legal/, "Attorney"],
  [/account|bookkeep|tax/, "AccountingService"],
  [/florist|flower/, "Florist"],
  [/photo/, "Photographer"],
  [/shop|store|boutique|market/, "Store"],
  [/school|tutor|academy|lessons|teacher|course/, "EducationalOrganization"],
  [/cinema|theatre|theater|venue|club/, "EntertainmentBusiness"],
];
export function schemaTypeFor(category = "") {
  const c = String(category || "").toLowerCase();
  for (const [re, type] of SCHEMA_TYPES) {
    if (!re.test(c)) continue;
    // Two entries above map to placeholders that would be wrong; fall back to the parent class for them.
    if (type === "HousePainter" || type === "Locksmith") return "HomeAndConstructionBusiness";
    return type;
  }
  return "LocalBusiness";
}

function absolutize(url, base) {
  if (!url || /^https?:\/\//i.test(url) || !base) return url;
  try {
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}
