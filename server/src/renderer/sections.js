// Section renderers: spec section -> HTML string. `ctx` gives access to
// images, meta and helpers. All user text passes through esc(); every link
// passes through safeHref(); "custom" HTML goes through an allowlist sanitizer.
import { escapeHtml as esc } from "../util/http.js";
import { icon, socialIcon } from "./icons.js";

// Only anchors, same-origin paths and http(s)/mailto/tel/sms links survive.
export function safeHref(h) {
  const s = String(h || "").trim();
  if (!s) return "#";
  if (/^#[\w-]*$/.test(s)) return s;
  if (/^\/(?!\/)[^\s"'<>]*$/.test(s)) return s;
  if (/^(https?:\/\/|mailto:|tel:|sms:)[^\s"'<>]+$/i.test(s)) return s;
  return "#";
}

export function img(ctx, id, { cls = "", eager = false, alt = "" } = {}) {
  const im = ctx.image(id);
  if (!im) return "";
  const dims = im.width && im.height ? ` width="${im.width}" height="${im.height}"` : "";
  const load = eager ? ' fetchpriority="high"' : ' loading="lazy" decoding="async"';
  return `<img src="${esc(im.url)}" alt="${esc(alt || im.caption || "")}"${dims}${load}${cls ? ` class="${cls}"` : ""}>`;
}

const btn = (cta, cls = "primary") => (cta ? `<a class="btn ${cls}" href="${esc(safeHref(cta.href))}">${esc(cta.label)}</a>` : "");
const heading = (s, tag = "h2") => (s ? `<${tag}>${esc(s)}</${tag}>` : "");
const eyebrow = (s) => (s ? `<div class="eyebrow">${esc(s)}</div>` : "");
const intro = (s) => (s ? `<p class="intro">${esc(s)}</p>` : "");
const paras = (arr) => (arr || []).map((p) => `<p>${esc(p)}</p>`).join("");
const telHref = (phone) => "tel:" + String(phone).replace(/[^\d+]/g, "");

export const sections = {
  hero(s, ctx) {
    const v = s.variant || "split";
    if (v === "offset" || v === "poster") return heroVariant(s, ctx, v);
    // Without a photo, the renderer draws brand artwork so the hero still looks designed.
    const media = s.imageId && ctx.image(s.imageId)
      ? `<div class="media">${img(ctx, s.imageId, { eager: true, alt: ctx.meta.businessName })}</div>`
      : v === "split" || v === "centered" || v === "editorial" ? `<div class="media">${artSvg(ctx)}</div>` : "";
    const copy = `${eyebrow(s.eyebrow)}<h1>${esc(s.headline)}</h1><p class="lead">${esc(s.subheadline)}</p><div class="actions">${btn(s.primaryCta)}${btn(s.secondaryCta, v === "fullbleed" ? "light" : "ghost")}</div>`;
    if (v === "split") return `<section class="hero split" id="${esc(s.id)}"><div class="wrap"><div class="copy">${copy}</div>${media}</div></section>`;
    if (v === "centered") return `<section class="hero centered" id="${esc(s.id)}"><div class="wrap">${copy}${media}</div></section>`;
    if (v === "fullbleed" && media) return `<section class="hero fullbleed" id="${esc(s.id)}">${media}<div class="wrap">${copy}</div></section>`;
    if (v === "editorial") {
      return `<section class="hero editorial" id="${esc(s.id)}"><div class="wrap">${eyebrow(s.eyebrow)}<h1>${esc(s.headline)}</h1><div class="row"><div><p class="lead">${esc(s.subheadline)}</p><div class="actions">${btn(s.primaryCta)}${btn(s.secondaryCta, "ghost")}</div></div></div>${media}</div></section>`;
    }
    return `<section class="hero minimal" id="${esc(s.id)}"><div class="wrap">${copy}${media}</div></section>`;
  },

  about(s, ctx) {
    const v = s.variant || "text";
    if (v === "story") return aboutStory(s, ctx);
    const stats = s.stats?.length
      ? `<div class="stats">${s.stats.map((x) => `<div class="stat"><b>${esc(x.value)}</b><span>${esc(x.label)}</span></div>`).join("")}</div>`
      : "";
    const text = `<div class="text">${eyebrow(s.eyebrow)}${heading(s.heading)}${paras(s.paragraphs)}${v === "stats" ? stats : ""}</div>`;
    if ((v === "imageLeft" || v === "imageRight") && s.imageId && ctx.image(s.imageId)) {
      return `<section class="about ${v}" id="${esc(s.id)}"><div class="wrap two">${text}<div class="media">${img(ctx, s.imageId)}</div></div></section>`;
    }
    return `<section class="about" id="${esc(s.id)}"><div class="wrap one">${text}${v !== "stats" ? stats : ""}</div></section>`;
  },

  services(s, ctx) {
    const v = s.variant || "cards";
    if (v === "numbered") return servicesNumbered(s, ctx);
    const head = `${heading(s.heading)}${intro(s.intro)}`;
    if (v === "list") {
      const rows = s.items.map((it) => `<div class="row"><h3>${it.icon ? icon(it.icon) : ""}${esc(it.title)}</h3><p>${esc(it.description)}</p>${it.price ? `<div class="price">${esc(it.price)}</div>` : "<div></div>"}</div>`).join("");
      return `<section class="services" id="${esc(s.id)}"><div class="wrap">${head}<div class="slist">${rows}</div></div></section>`;
    }
    const n = s.items.length;
    const cols = n <= 2 ? "cols-2" : n === 4 || n >= 7 ? "cols-4" : "cols-3";
    const cards = s.items.map((it) => `<div class="card reveal">${it.imageId && ctx.image(it.imageId) ? img(ctx, it.imageId, { alt: it.title }) : it.icon ? icon(it.icon) : ""}<h3>${esc(it.title)}</h3><p>${esc(it.description)}</p>${it.price ? `<div class="price">${esc(it.price)}</div>` : ""}</div>`).join("");
    return `<section class="services" id="${esc(s.id)}"><div class="wrap">${head}<div class="grid ${v === "grid" ? "cols-4" : cols}">${cards}</div></div></section>`;
  },

  gallery(s, ctx) {
    const v = s.variant || "grid";
    const ids = (s.imageIds || []).filter((id) => ctx.image(id));
    if (!ids.length) return "";
    if (v === "editorial") return galleryEditorial(s, ctx, ids);
    if (v === "filmstrip") return galleryFilmstrip(s, ctx, ids);
    const items = ids.map((id) => {
      const im = ctx.image(id);
      const tall = v === "masonry" && im.height > im.width ? ' class="tall"' : "";
      return `<figure${tall} style="margin:0">${img(ctx, id)}</figure>`;
    }).join("");
    const cols = v === "grid" ? (ids.length <= 2 ? "cols-2" : ids.length % 4 === 0 ? "cols-4" : "cols-3") : "";
    return `<section class="gallery ${v}" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}${intro(s.intro)}<div class="grid ${cols}">${items}</div></div></section>`;
  },

  testimonials(s) {
    const v = s.variant || "cards";
    if (!s.items.length) return "";
    if (v === "featured") return testimonialsFeatured(s);
    const stars = `<div class="stars">${icon("star").repeat(5)}</div>`;
    if (v === "single") {
      const t = s.items[0];
      return `<section class="testimonials" id="${esc(s.id)}"><div class="wrap"><div class="tsingle">${heading(s.heading)}<p class="quote">${esc(t.quote)}</p><div class="who"><b>${esc(t.author)}</b>${t.role ? esc(t.role) : ""}</div></div></div></section>`;
    }
    const cards = s.items.map((t) => `<div class="card reveal">${stars}<p class="quote">${esc(t.quote)}</p><div class="who"><b>${esc(t.author)}</b>${t.role ? esc(t.role) : ""}</div></div>`).join("");
    const cols = s.items.length === 2 || s.items.length === 4 ? "cols-2" : "cols-3";
    return `<section class="testimonials" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}<div class="grid ${cols}">${cards}</div></div></section>`;
  },

  features(s) {
    const v = s.variant || "grid";
    const items = s.items.map((it) => `<div class="item reveal">${icon(it.icon)}<div><h3>${esc(it.title)}</h3><p>${esc(it.description)}</p></div></div>`).join("");
    const cols = v === "columns" ? "cols-3" : "cols-2";
    return `<section class="features ${v}" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}${intro(s.intro)}<div class="feat grid ${cols} ${v === "checklist" ? "checklist" : ""}">${items}</div></div></section>`;
  },

  menu(s) {
    if (s.variant === "ruled") return menuRuled(s);
    const cats = s.categories.map((c) => `<div class="cat"><h3>${esc(c.name)}</h3>${c.items.map((it) => `<div class="item"><b>${esc(it.name)}</b><span class="p">${esc(it.price)}</span>${it.description ? `<p>${esc(it.description)}</p>` : ""}</div>`).join("")}</div>`).join("");
    return `<section class="menu" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}${intro(s.intro)}<div class="cats">${cats}</div></div></section>`;
  },

  pricing(s) {
    const plans = s.plans.map((p) => `<div class="card plan${p.highlighted ? " hi" : ""}"><h3>${esc(p.name)}</h3><div class="amt">${esc(p.price)}${p.period ? `<small> ${esc(p.period)}</small>` : ""}</div>${p.description ? `<p>${esc(p.description)}</p>` : ""}<ul>${p.features.map((f) => `<li>${icon("check")}<span>${esc(f)}</span></li>`).join("")}</ul>${btn(p.cta, p.highlighted ? "primary" : "ghost")}</div>`).join("");
    const cols = s.plans.length === 2 ? "cols-2" : s.plans.length >= 4 ? "cols-4" : "cols-3";
    return `<section class="pricing" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}${intro(s.intro)}<div class="grid ${cols}">${plans}</div></div></section>`;
  },

  faq(s, ctx) {
    if (s.variant === "numbered" || s.variant === "open") return faqVariant(s, ctx, s.variant);
    const items = s.items.map((q) => `<details><summary>${esc(q.question)}</summary><p>${esc(q.answer)}</p></details>`).join("");
    return `<section class="faq" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}${items}</div></section>`;
  },

  team(s, ctx) {
    const m = s.members.map((p) => `<div class="reveal">${p.imageId ? img(ctx, p.imageId, { alt: p.name }) : ""}<h3 style="margin:0">${esc(p.name)}</h3><div class="role">${esc(p.role)}</div>${p.bio ? `<p style="color:var(--muted);margin-top:8px">${esc(p.bio)}</p>` : ""}</div>`).join("");
    const cols = s.members.length <= 2 ? "cols-2" : s.members.length === 4 ? "cols-4" : "cols-3";
    return `<section class="team" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}${intro(s.intro)}<div class="grid ${cols}">${m}</div></div></section>`;
  },

  hours(s, ctx) {
    const rows = (ctx.meta.hours || []).map((h) => `<tr><td>${esc(h.days)}</td><td>${esc(h.hours)}</td></tr>`).join("");
    if (!rows) return "";
    return `<section class="hours" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}<table class="hours-table">${rows}</table>${s.note ? `<p class="intro" style="margin-top:18px">${esc(s.note)}</p>` : ""}</div></section>`;
  },

  contact(s, ctx) {
    if (s.variant === "table" || s.variant === "address") return contactVariant(s, ctx, s.variant);
    const m = ctx.meta;
    const li = [];
    if (m.phone) li.push(`<li>${icon("phone")}<a href="${esc(telHref(m.phone))}">${esc(m.phone)}</a></li>`);
    if (m.email) li.push(`<li>${icon("mail")}<a href="${esc(safeHref("mailto:" + m.email))}">${esc(m.email)}</a></li>`);
    if (m.address) li.push(`<li>${icon("map-pin")}<span>${esc(m.address)}</span></li>`);
    if (m.hours?.length) li.push(`<li>${icon("clock")}<span>${m.hours.map((h) => `${esc(h.days)}: ${esc(h.hours)}`).join("<br>")}</span></li>`);
    const map = s.showMap && (m.mapQuery || m.address)
      ? `<div class="map"><iframe title="Map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(m.mapQuery || m.address)}&output=embed"></iframe></div>`
      : "";
    const form = s.showForm ? leadForm(ctx) : "";
    const bookHref = m.bookingUrl ? safeHref(m.bookingUrl) : "#";
    const book = m.bookingUrl && bookHref !== "#" ? `<div class="actions"><a class="btn primary" href="${esc(bookHref)}" target="_blank" rel="noopener">${esc(ctx.formLabels?.book || "Book now")}</a></div>` : "";
    const left = `<div>${heading(s.heading)}${intro(s.intro)}<ul class="clist">${li.join("")}</ul>${book}${s.variant === "split" ? map : ""}</div>`;
    if (s.variant === "split") return `<section class="contact" id="${esc(s.id)}"><div class="wrap two">${left}<div>${form}</div></div></section>`;
    return `<section class="contact" id="${esc(s.id)}"><div class="wrap">${left}${form ? `<div style="margin-top:32px;max-width:640px">${form}</div>` : ""}${map}</div></section>`;
  },

  cta(s, ctx) {
    if (s.variant === "framed" || s.variant === "overlap") return ctaVariant(s, ctx, s.variant);
    if (s.variant === "card") {
      return `<section id="${esc(s.id)}"><div class="wrap"><div class="cta-card"><div>${heading(s.heading)}${s.text ? `<p class="intro" style="margin-bottom:0">${esc(s.text)}</p>` : ""}<div class="actions">${btn(s.button)}</div></div>${s.imageId ? img(ctx, s.imageId) : ""}</div></div></section>`;
    }
    return `<section class="cta-banner" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}${s.text ? `<p>${esc(s.text)}</p>` : ""}<div class="actions">${btn(s.button, "light")}</div></div></section>`;
  },

  text(s) {
    return `<section class="textsec" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}${paras(s.paragraphs)}</div></section>`;
  },

  custom(s) {
    const css = sanitizeCss(s.css || "");
    return `<section class="custom" id="${esc(s.id)}">${css ? `<style>${css}</style>` : ""}<div class="wrap">${heading(s.heading)}${sanitizeHtml(s.html || "")}</div></section>`;
  },
};

// ---- Variants ported from the design lab (tools/design-lab), September 2026 ----
// Each one is a candidate design curated from the lab's contact sheets, rewritten
// against the spec fields. Numbers, rules and icons are the only decoration, so
// nothing here depends on the site's language.
const ARROW = `<svg class="arr" width="14" height="14" viewBox="0 0 14 14" aria-hidden="true"><path d="M1 7h11M8 3l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const kicker = (s) => (s ? `<div class="kicker">${esc(s)}</div>` : "");
const quiet = (s) => (s ? `<div class="eyebrow quiet">${esc(s)}</div>` : "");
const btnArrow = (cta, cls = "primary") => (cta ? `<a class="btn ${cls}" href="${esc(safeHref(cta.href))}">${esc(cta.label)}${ARROW}</a>` : "");
const textLink = (cta) => (cta ? `<a class="textlink" href="${esc(safeHref(cta.href))}">${esc(cta.label)}${ARROW}</a>` : "");
const contactLinks = (m) => [m.phone && `<a href="${esc(telHref(m.phone))}">${esc(m.phone)}</a>`, m.email && `<a href="${esc(safeHref("mailto:" + m.email))}">${esc(m.email)}</a>`].filter(Boolean);

function heroVariant(s, ctx, v) {
  const m = ctx.meta;
  const photo = s.imageId && ctx.image(s.imageId) ? img(ctx, s.imageId, { eager: true, alt: m.businessName }) : artSvg(ctx);
  if (v === "poster") {
    const caption = `<div class="caption">${s.eyebrow ? `<span>${esc(s.eyebrow)}</span>` : ""}<span class="brand-mark">${esc(m.businessName)}</span></div>`;
    const cap = m.address ? `<figcaption>${esc(m.address)}</figcaption>` : "";
    return `<section class="hero poster" id="${esc(s.id)}"><div class="wrap">${caption}<h1>${esc(s.headline)}</h1><div class="row"><p class="lead">${esc(s.subheadline)}</p><div class="actions">${btnArrow(s.primaryCta)}${btn(s.secondaryCta, "ghost")}</div></div><figure class="figure">${photo}${cap}</figure></div></section>`;
  }
  return `<section class="hero offset" id="${esc(s.id)}"><div class="wrap"><div class="copy">${kicker(s.eyebrow)}<h1>${esc(s.headline)}</h1><p class="lead">${esc(s.subheadline)}</p><div class="actions">${btn(s.primaryCta)}${textLink(s.secondaryCta)}</div></div><div class="media"><div class="plate">${photo}</div><div class="mark" aria-hidden="true">01</div></div></div></section>`;
}

function aboutStory(s, ctx) {
  const im = s.imageId && ctx.image(s.imageId);
  const stats = s.stats?.length ? `<div class="strip">${s.stats.map((x) => `<div><b>${esc(x.value)}</b><span>${esc(x.label)}</span></div>`).join("")}</div>` : "";
  const text = `<div class="text">${quiet(s.eyebrow)}${heading(s.heading)}<div class="prose">${paras(s.paragraphs)}</div>${stats}</div>`;
  if (!im) return `<section class="about story" id="${esc(s.id)}"><div class="wrap one">${text}</div></section>`;
  const cap = im.caption ? `<figcaption>${esc(im.caption)}</figcaption>` : "";
  return `<section class="about story" id="${esc(s.id)}"><div class="wrap two"><figure class="media">${img(ctx, s.imageId)}${cap}</figure>${text}</div></section>`;
}

function servicesNumbered(s, ctx) {
  const pinned = s.items.findIndex((it) => it.imageId && ctx.image(it.imageId));
  let thumbs = 0;
  const rows = s.items.map((it, i) => {
    const thumb = i !== pinned && it.imageId && ctx.image(it.imageId) ? img(ctx, it.imageId, { alt: it.title }) : "";
    if (thumb) thumbs++;
    return `<li>${thumb}<h3>${esc(it.title)}</h3><p>${esc(it.description)}</p>${it.price ? `<div class="price">${esc(it.price)}</div>` : ""}</li>`;
  }).join("");
  const m = ctx.meta;
  const aside = pinned >= 0
    ? `<aside class="aside"><figure>${img(ctx, s.items[pinned].imageId, { alt: s.items[pinned].title })}<figcaption><span>${esc(m.tagline || "")}</span>${m.phone ? `<a href="${esc(telHref(m.phone))}">${esc(m.phone)}</a>` : ""}</figcaption></figure></aside>`
    : "";
  return `<section class="services numbered" id="${esc(s.id)}"><div class="wrap${aside ? " two" : ""}"><div class="main">${heading(s.heading)}${intro(s.intro)}<ol class="nlist${thumbs ? "" : " plain"}">${rows}</ol></div>${aside}</div></section>`;
}

function testimonialsFeatured(s) {
  const fig = (t, cls) => `<figure${cls ? ` class="${cls}"` : ""}><blockquote><p>${esc(t.quote)}</p></blockquote><figcaption><b>${esc(t.author)}</b>${t.role ? `<span>${esc(t.role)}</span>` : ""}</figcaption></figure>`;
  const [first, ...rest] = s.items;
  return `<section class="testimonials featured" id="${esc(s.id)}"><div class="wrap">${heading(s.heading)}${fig(first, "feat")}${rest.length ? `<div class="rest">${rest.map((t) => fig(t)).join("")}</div>` : ""}</div></section>`;
}

function menuRuled(s) {
  const cats = s.categories.map((c) => `<div class="rcat"><div class="rhead"><h3>${esc(c.name)}</h3></div><ul class="ritems">${c.items.map((it) => `<li><span class="name">${esc(it.name)}</span><span class="leader" aria-hidden="true"></span><span class="p">${esc(it.price)}</span>${it.description ? `<span class="desc">${esc(it.description)}</span>` : ""}</li>`).join("")}</ul></div>`).join("");
  return `<section class="menu ruled" id="${esc(s.id)}"><div class="wrap"><header class="rmenu-head">${heading(s.heading)}${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}</header><div class="rcats">${cats}</div></div></section>`;
}

function galleryEditorial(s, ctx, ids) {
  const items = ids.map((id) => `<figure>${img(ctx, id)}<figcaption>${esc(ctx.image(id).caption || "")}</figcaption></figure>`).join("");
  const head = s.heading ? `<header class="ehead">${heading(s.heading)}${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}<span class="rule" aria-hidden="true"></span></header>` : "";
  return `<section class="gallery editorial" id="${esc(s.id)}"><div class="wrap"><div class="egrid${head ? "" : " nohead"}">${head}${items}</div></div></section>`;
}

function galleryFilmstrip(s, ctx, ids) {
  const items = ids.map((id) => `<li><figure>${img(ctx, id)}</figure></li>`).join("");
  const head = s.heading || s.intro ? `<div class="wrap fhead"><div>${heading(s.heading)}${s.intro ? `<p class="intro">${esc(s.intro)}</p>` : ""}</div><span class="hint" aria-hidden="true">${ARROW}</span></div>` : "";
  return `<section class="gallery filmstrip" id="${esc(s.id)}">${head}<ul class="film" style="--n:${Math.min(ids.length, 6)}">${items}</ul></section>`;
}

function faqVariant(s, ctx, v) {
  const links = contactLinks(ctx.meta);
  const note = links.length ? `<p class="note">${links.join('<span aria-hidden="true"> · </span>')}</p>` : "";
  const head = `<header class="fhead">${heading(s.heading)}${note}</header>`;
  if (v === "open") {
    const items = s.items.map((q) => `<div><dt>${esc(q.question)}</dt><dd>${esc(q.answer)}</dd></div>`).join("");
    return `<section class="faq open" id="${esc(s.id)}"><div class="wrap fwrap">${head}<dl class="olist">${items}</dl></div></section>`;
  }
  const plus = `<svg class="plus" width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1v14M1 8h14" stroke="currentColor" stroke-width="1.5" stroke-linecap="square"/></svg>`;
  const items = s.items.map((q) => `<details><summary><span class="n" aria-hidden="true"></span><span class="q">${esc(q.question)}</span>${plus}</summary><div class="a"><p>${esc(q.answer)}</p></div></details>`).join("");
  return `<section class="faq numbered" id="${esc(s.id)}"><div class="wrap fwrap">${head}<div class="flist">${items}</div></div></section>`;
}

function contactVariant(s, ctx, v) {
  const m = ctx.meta;
  const hours = m.hours?.length ? m.hours : [];
  const map = s.showMap && (m.mapQuery || m.address)
    ? `<div class="map"><iframe title="Map" loading="lazy" referrerpolicy="no-referrer-when-downgrade" src="https://www.google.com/maps?q=${encodeURIComponent(m.mapQuery || m.address)}&output=embed"></iframe></div>`
    : "";
  const bookHref = m.bookingUrl ? safeHref(m.bookingUrl) : "#";
  const book = m.bookingUrl && bookHref !== "#" ? `<div class="actions"><a class="btn primary" href="${esc(bookHref)}" target="_blank" rel="noopener">${esc(ctx.formLabels?.book || "Book now")}</a></div>` : "";
  const form = s.showForm ? leadForm(ctx) : "";
  const head = `<header class="chead">${heading(s.heading)}${intro(s.intro)}</header>`;
  if (v === "address") {
    const links = [m.phone && `<li>${icon("phone")}<a href="${esc(telHref(m.phone))}">${esc(m.phone)}</a></li>`, m.email && `<li>${icon("mail")}<a href="${esc(safeHref("mailto:" + m.email))}">${esc(m.email)}</a></li>`].filter(Boolean).join("");
    const big = m.address || links ? `<div class="big">${m.address ? `<p class="street">${esc(m.address)}</p>` : ""}${links ? `<ul class="links">${links}</ul>` : ""}</div>` : "";
    const hrow = hours.length ? `<dl class="hrow">${hours.map((h) => `<div><dt>${esc(h.days)}</dt><dd>${esc(h.hours)}</dd></div>`).join("")}</dl>` : "";
    return `<section class="contact address" id="${esc(s.id)}"><div class="wrap">${head}${big}${hrow}${book}${form}${map}</div></section>`;
  }
  const table = hours.length ? `<table class="hours-t">${hours.map((h) => `<tr><th scope="row">${esc(h.days)}</th><td>${esc(h.hours)}</td></tr>`).join("")}</table>` : "";
  const details = [
    m.address && `<div>${icon("map-pin")}<span>${esc(m.address)}</span></div>`,
    m.phone && `<div>${icon("phone")}<a href="${esc(telHref(m.phone))}">${esc(m.phone)}</a></div>`,
    m.email && `<div>${icon("mail")}<a href="${esc(safeHref("mailto:" + m.email))}">${esc(m.email)}</a></div>`,
  ].filter(Boolean).join("");
  const info = `<div class="info">${table}${details ? `<div class="details">${details}</div>` : ""}${book}${map}</div>`;
  return `<section class="contact table" id="${esc(s.id)}"><div class="wrap">${head}<div class="cgrid${form ? " two" : ""}">${info}${form}</div></div></section>`;
}

function ctaVariant(s, ctx, v) {
  const im = s.imageId && ctx.image(s.imageId);
  const copy = `${heading(s.heading)}${s.text ? `<p>${esc(s.text)}</p>` : ""}<div class="actions">${btnArrow(s.button, "invert")}</div>`;
  if (v === "overlap" && im) {
    return `<section class="cta overlap" id="${esc(s.id)}"><div class="wrap"><figure class="photo">${img(ctx, s.imageId)}</figure><div class="panel"><span class="rule" aria-hidden="true"></span>${copy}</div></div></section>`;
  }
  return `<section class="cta framed" id="${esc(s.id)}"><div class="wrap"><div class="band"><div class="frame${im ? " two" : ""}"><div class="copy">${copy}</div>${im ? `<figure class="media">${img(ctx, s.imageId)}</figure>` : ""}</div></div></div></section>`;
}

// Deterministic brand artwork (soft color fields + one geometric accent) from the
// theme palette and business name, used when a hero has no photo.
export function artSvg(ctx) {
  const t = ctx.theme || {};
  const c = t.colors || { primary: "#1f4d3a", secondary: "#e7efe9", accent: "#c4783a", background: "#fbfaf7" };
  let h = 2166136261;
  for (const ch of String(ctx.meta?.businessName || "frontage")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rnd = () => { h = (Math.imul(h, 1664525) + 1013904223) >>> 0; return h / 4294967296; };
  const P = (min, max) => Math.round(min + rnd() * (max - min));
  const hard = t.preset === "bold" || t.preset === "tech" || t.preset === "playful";
  const blur = hard ? 0 : 90;
  const shapes = [
    `<circle cx="${P(150, 400)}" cy="${P(200, 500)}" r="${P(220, 340)}" fill="${esc(c.primary)}" opacity="${hard ? 0.95 : 0.85}"/>`,
    `<circle cx="${P(450, 700)}" cy="${P(550, 850)}" r="${P(180, 300)}" fill="${esc(c.accent)}" opacity="${hard ? 0.9 : 0.7}"/>`,
    `<circle cx="${P(350, 650)}" cy="${P(100, 350)}" r="${P(120, 220)}" fill="${esc(c.primary)}" opacity="0.45"/>`,
  ];
  const accent = t.preset === "luxury" || t.preset === "minimal" || t.preset === "editorial"
    ? `<circle cx="400" cy="500" r="${P(230, 300)}" fill="none" stroke="${esc(c.background)}" stroke-width="2" opacity="0.7"/>`
    : hard
      ? `<rect x="${P(80, 200)}" y="${P(560, 700)}" width="${P(200, 320)}" height="${P(200, 320)}" fill="${esc(c.background)}" opacity="0.9" transform="rotate(${P(-14, 14)} 400 500)"/>`
      : `<circle cx="${P(200, 600)}" cy="${P(300, 700)}" r="${P(28, 60)}" fill="${esc(c.background)}" opacity="0.9"/>`;
  return `<svg class="art" viewBox="0 0 800 1000" preserveAspectRatio="xMidYMid slice" role="img" aria-label="" xmlns="http://www.w3.org/2000/svg">
<defs><filter id="fx" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="${blur}"/></filter></defs>
<rect width="800" height="1000" fill="${esc(c.secondary)}"/>
<g filter="url(#fx)">${shapes.join("")}</g>
${accent}
</svg>`;
}

const FORM_LABELS = {
  en: { name: "Your name", email: "Email", phone: "Phone (optional)", message: "How can we help?", send: "Send message", book: "Book now", privacy: "Privacy notice", consent: "By sending this form you agree to our", link: "privacy notice" },
  sv: { name: "Ditt namn", email: "E-post", phone: "Telefon (valfritt)", message: "Hur kan vi hjälpa till?", send: "Skicka", book: "Boka nu", privacy: "Integritetspolicy", consent: "Genom att skicka formuläret godkänner du vår", link: "integritetspolicy" },
  el: { name: "Το όνομά σας", email: "Email", phone: "Τηλέφωνο (προαιρετικό)", message: "Πώς μπορούμε να βοηθήσουμε;", send: "Αποστολή", book: "Κράτηση", privacy: "Πολιτική απορρήτου", consent: "Με την αποστολή της φόρμας αποδέχεστε την", link: "πολιτική απορρήτου" },
  de: { name: "Ihr Name", email: "E-Mail", phone: "Telefon (optional)", message: "Wie können wir helfen?", send: "Nachricht senden", book: "Jetzt buchen", privacy: "Datenschutzerklärung", consent: "Mit dem Absenden des Formulars akzeptieren Sie unsere", link: "Datenschutzerklärung" },
  fr: { name: "Votre nom", email: "E-mail", phone: "Téléphone (facultatif)", message: "Comment pouvons-nous aider ?", send: "Envoyer", book: "Réserver", privacy: "Politique de confidentialité", consent: "En envoyant ce formulaire, vous acceptez notre", link: "politique de confidentialité" },
  es: { name: "Tu nombre", email: "Correo", phone: "Teléfono (opcional)", message: "¿Cómo podemos ayudarte?", send: "Enviar", book: "Reservar", privacy: "Política de privacidad", consent: "Al enviar este formulario aceptas nuestra", link: "política de privacidad" },
  it: { name: "Il tuo nome", email: "Email", phone: "Telefono (facoltativo)", message: "Come possiamo aiutarti?", send: "Invia", book: "Prenota", privacy: "Informativa sulla privacy", consent: "Inviando questo modulo accetti la nostra", link: "informativa sulla privacy" },
  nl: { name: "Je naam", email: "E-mail", phone: "Telefoon (optioneel)", message: "Waarmee kunnen we helpen?", send: "Versturen", book: "Boek nu", privacy: "Privacyverklaring", consent: "Door dit formulier te versturen ga je akkoord met onze", link: "privacyverklaring" },
  pt: { name: "O seu nome", email: "Email", phone: "Telefone (opcional)", message: "Como podemos ajudar?", send: "Enviar", book: "Reservar", privacy: "Política de privacidade", consent: "Ao enviar este formulário aceita a nossa", link: "política de privacidade" },
  da: { name: "Dit navn", email: "E-mail", phone: "Telefon (valgfrit)", message: "Hvordan kan vi hjælpe?", send: "Send", book: "Book nu", privacy: "Privatlivspolitik", consent: "Ved at sende formularen accepterer du vores", link: "privatlivspolitik" },
  no: { name: "Ditt navn", email: "E-post", phone: "Telefon (valgfritt)", message: "Hvordan kan vi hjelpe?", send: "Send", book: "Bestill nå", privacy: "Personvernerklæring", consent: "Ved å sende skjemaet godtar du vår", link: "personvernerklæring" },
  fi: { name: "Nimesi", email: "Sähköposti", phone: "Puhelin (valinnainen)", message: "Miten voimme auttaa?", send: "Lähetä", book: "Varaa nyt", privacy: "Tietosuojaseloste", consent: "Lähettämällä lomakkeen hyväksyt", link: "tietosuojaselosteen" },
};
export function formLabelsFor(language) {
  const key = String(language || "en").toLowerCase().split("-")[0];
  return FORM_LABELS[key] || FORM_LABELS.en;
}

export function leadForm(ctx) {
  const L = ctx.formLabels || FORM_LABELS.en;
  return `<form class="lead-form" data-endpoint="${esc(ctx.formEndpoint)}" novalidate>
<label>${esc(L.name)}<input name="name" required autocomplete="name" maxlength="120"></label>
<label>${esc(L.email)}<input name="email" type="email" required autocomplete="email" maxlength="200"></label>
<label>${esc(L.phone)}<input name="phone" type="tel" autocomplete="tel" maxlength="60"></label>
<label>${esc(L.message)}<textarea name="message" required maxlength="4000"></textarea></label>
<input class="hp" name="website" tabindex="-1" autocomplete="off" aria-hidden="true">
<button class="btn primary" type="submit">${esc(L.send)}</button>
${ctx.privacyHref ? `<p class="form-note" style="font-size:13px;opacity:.75;margin:10px 0 0">${esc(L.consent)} <a href="${esc(ctx.privacyHref)}">${esc(L.link || L.privacy)}</a>.</p>` : ""}
<div class="form-msg" role="status" aria-live="polite"></div>
</form>`;
}

export function footer(spec, ctx) {
  const m = spec.meta;
  const f = spec.footer;
  const socials = f.showSocials && m.socials?.length
    ? `<div class="socials">${m.socials.filter((s) => safeHref(s.url) !== "#").map((s) => `<a href="${esc(safeHref(s.url))}" target="_blank" rel="noopener" aria-label="${esc(s.platform)}">${socialIcon(s.platform)}</a>`).join("")}</div>`
    : "";
  const hrs = f.showHours && m.hours?.length ? `<div class="hrs">${m.hours.map((h) => `<div>${esc(h.days)} · ${esc(h.hours)}</div>`).join("")}</div>` : "";
  const contact = [m.phone && `<a href="${esc(telHref(m.phone))}">${esc(m.phone)}</a>`, m.email && `<a href="${esc(safeHref("mailto:" + m.email))}">${esc(m.email)}</a>`, m.address && `<span>${esc(m.address)}</span>`].filter(Boolean).join("<br>");
  const badge = ctx.badge
    ? `<a class="badge" href="${esc(safeHref(ctx.badge.href))}" target="_blank" rel="noopener">Made with <b>${esc(ctx.badge.brand)}</b></a>`
    : "";
  const report = ctx.reportHref ? `<a href="${esc(safeHref(ctx.reportHref))}" rel="nofollow" style="margin-left:10px">Report</a>` : "";
  // Every site gets its own privacy notice (the owner is the controller, Frontage the processor).
  const privacy = ctx.privacyHref ? `<a href="${esc(ctx.privacyHref)}" style="margin-left:10px">${esc((ctx.formLabels || FORM_LABELS.en).privacy)}</a>` : "";
  return `<footer><div class="wrap"><div class="top"><div><div class="brand">${esc(m.businessName)}</div><p style="max-width:44ch;margin-top:10px">${esc(f.text)}</p>${socials}</div><div>${contact}</div>${hrs}</div><div class="bottom"><span>© ${new Date().getFullYear()} ${esc(m.businessName)}</span><span>${badge}${privacy}${report}</span></div></div></footer>`;
}

export function nav(spec, ctx) {
  const n = spec.nav;
  const links = n.links.map((l) => `<li><a href="#${esc(String(l.sectionId).replace(/[^\w-]/g, ""))}">${esc(l.label)}</a></li>`).join("");
  const cta = n.cta ? btn(n.cta) : "";
  const logo = ctx.logo ? `<img src="${esc(ctx.logo.url)}" alt="">` : "";
  return `<header class="nav" id="top"><div class="wrap"><a class="brand" href="#top">${logo}${esc(spec.meta.businessName)}</a><nav aria-label="Main"><ul class="links">${links}${cta ? `<li class="cta-mobile">${cta}</li>` : ""}</ul></nav><div style="display:flex;gap:10px;align-items:center">${cta ? `<span class="cta-desktop">${cta}</span>` : ""}<button class="burger" aria-label="Menu" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg></button></div></div></header>`;
}

// ---- Allowlist sanitizer for the "custom" section -------------------------------
// Rebuilds the fragment from scratch: only known tags and attributes survive,
// dangerous elements are removed together with their content, links and
// image sources are validated, and stray "<" is escaped. Combined with the
// nonce-based CSP on hosted pages this makes injected script inert.
const ALLOWED_TAGS = new Set(["p", "br", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "strong", "em", "b", "i", "u", "s", "blockquote", "span", "div", "section", "hr", "table", "thead", "tbody", "tr", "th", "td", "a", "img", "figure", "figcaption", "small", "sup", "sub", "pre", "code"]);
const DROP_WITH_CONTENT = new Set(["script", "style", "iframe", "object", "embed", "noscript", "template", "svg", "math", "form", "input", "button", "select", "textarea", "video", "audio", "source", "link", "meta", "base", "head", "title", "frame", "frameset", "applet"]);
const ATTRS = { a: ["href", "target"], img: ["src", "alt", "width", "height"], "*": ["class", "id", "style", "title"] };
const VOID = new Set(["br", "hr", "img"]);

function parseAttrs(s) {
  const out = [];
  const r = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = r.exec(s))) out.push([m[1], m[2] ?? m[3] ?? m[4] ?? ""]);
  return out;
}
const escText = (t) => t.replace(/</g, "&lt;");
const escAttr = (v) => String(v).replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
function sanitizeInlineStyle(v) {
  const s = String(v);
  if (/expression|javascript:|url\s*\(|@import|behavior|-moz-binding|<|>/i.test(s)) return "";
  return s.replace(/["']/g, "").slice(0, 400);
}

export function sanitizeHtml(input) {
  const text = String(input || "");
  const out = [];
  const re = /<!--[\s\S]*?-->|<\/?\s*([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s=>/]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*\/?>/g;
  let last = 0;
  let dropUntil = null;
  let m;
  while ((m = re.exec(text))) {
    if (!dropUntil) out.push(escText(text.slice(last, m.index)));
    last = re.lastIndex;
    const raw = m[0];
    if (raw.startsWith("<!--")) continue;
    const tag = (m[1] || "").toLowerCase();
    const closing = /^<\s*\//.test(raw);
    if (dropUntil) {
      if (closing && tag === dropUntil) dropUntil = null;
      continue;
    }
    if (DROP_WITH_CONTENT.has(tag)) {
      if (!closing && !raw.endsWith("/>")) dropUntil = tag;
      continue;
    }
    if (!ALLOWED_TAGS.has(tag)) continue;
    if (closing) {
      if (!VOID.has(tag)) out.push(`</${tag}>`);
      continue;
    }
    const allowed = new Set([...(ATTRS[tag] || []), ...ATTRS["*"]]);
    const kept = [];
    let hasTarget = false;
    for (const [k, v] of parseAttrs(m[2] || "")) {
      const key = k.toLowerCase();
      if (!allowed.has(key)) continue;
      let val = v;
      if (key === "href") val = safeHref(val);
      else if (key === "src") { if (!/^(\/i\/[\w-]+\.(jpg|jpeg|png|webp)|https:\/\/[^\s"'<>]+)$/i.test(val)) continue; }
      else if (key === "style") { val = sanitizeInlineStyle(val); if (!val) continue; }
      else if (key === "target") { if (val !== "_blank") continue; hasTarget = true; }
      else if (key === "class" || key === "id") { if (!/^[\w\s-]{1,120}$/.test(val)) continue; }
      else if (key === "width" || key === "height") { if (!/^\d{1,4}$/.test(val)) continue; }
      else val = String(val).slice(0, 300);
      kept.push(`${key}="${escAttr(val)}"`);
    }
    if (tag === "a" && hasTarget) kept.push('rel="noopener nofollow"');
    out.push(`<${tag}${kept.length ? " " + kept.join(" ") : ""}>`);
  }
  if (!dropUntil) out.push(escText(text.slice(last)));
  return out.join("");
}

export function sanitizeCss(c) {
  return String(c || "")
    .replace(/<|>/g, "")
    .replace(/@import[^;]*;?/gi, "")
    .replace(/expression\s*\(/gi, "")
    .replace(/behavior\s*:/gi, "")
    .replace(/-moz-binding\s*:/gi, "")
    .replace(/url\s*\(\s*(["']?)(?!\/i\/)[^)]*\)/gi, "none")
    .slice(0, 20000);
}
