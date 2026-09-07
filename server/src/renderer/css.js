// Base stylesheet + design presets. Everything is driven by CSS custom
// properties derived from the theme so a single stylesheet serves all sites.

export function fontsHref(theme) {
  const fams = [...new Set([theme.headingFont, theme.bodyFont])]
    .map((f) => `family=${encodeURIComponent(f).replace(/%20/g, "+")}:wght@400;500;600;700;800`)
    .join("&");
  return `https://fonts.googleapis.com/css2?${fams}&display=swap`;
}

function hexToRgb(hex) {
  const h = (hex || "#000000").replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const n = parseInt(full.slice(0, 6), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
export function luminance(hex) {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
export const onColor = (hex) => (luminance(hex) > 0.45 ? "#111111" : "#ffffff");

const SERIFS = ["Playfair Display", "Fraunces", "Cormorant Garamond", "Lora", "Merriweather", "Libre Baskerville", "DM Serif Display", "Instrument Serif"];
const fallback = (f) => (SERIFS.includes(f) ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif");

export function buildCss(theme) {
  const c = theme.colors;
  const radius = { sharp: "0px", soft: "14px", round: "28px" }[theme.radius] || "14px";
  const btnRadius = { sharp: "0px", soft: "10px", round: "999px" }[theme.radius] || "10px";
  const vars = `
:root{
  --primary:${c.primary};--on-primary:${onColor(c.primary)};
  --secondary:${c.secondary};--on-secondary:${onColor(c.secondary)};
  --accent:${c.accent};--bg:${c.background};--surface:${c.surface};--text:${c.text};
  --muted:color-mix(in srgb,var(--text) 62%,transparent);
  --line:color-mix(in srgb,var(--text) 12%,transparent);
  --radius:${radius};--btn-radius:${btnRadius};
  --font-heading:'${theme.headingFont}',${fallback(theme.headingFont)};
  --font-body:'${theme.bodyFont}',${fallback(theme.bodyFont)};
  --wrap:1180px;--pad:clamp(20px,5vw,56px);--section:clamp(64px,9vw,120px);
}`;
  return vars + BASE + (PRESETS[theme.preset] || "") + textureCss(theme);
}

// Page-background textures: tiled SVG noise and gradient layers over the background
// color. Tuned on a phone at 3x so they read as paper, grain or weave without
// hurting text contrast. Sections without their own surface let them show.
function textureCss(theme) {
  const t = theme.texture || "none";
  if (t === "none") return "";
  const dark = theme.mode === "dark";
  const ink = dark ? "255,255,255" : "0,0,0";
  const lum = dark ? 1 : 0;
  const noise = (freq, octaves, alpha, size) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='${freq}' numOctaves='${octaves}' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 ${lum} 0 0 0 0 ${lum} 0 0 0 0 ${lum} 0 0 0 ${alpha} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`)}") repeat 0 0 / ${size}px ${size}px`;
  const layers = {
    paper: `${noise(0.05, 4, 0.10, 320)}, ${noise(1.2, 2, 0.08, 160)}`,
    grain: noise(0.7, 3, 0.2, 180),
    linen: `repeating-linear-gradient(0deg, rgba(${ink},.06) 0 1px, transparent 1px 4px), repeating-linear-gradient(90deg, rgba(${ink},.06) 0 1px, transparent 1px 4px)`,
    dots: `radial-gradient(rgba(${ink},.14) 1.2px, transparent 1.6px) 0 0 / 16px 16px`,
    grid: `linear-gradient(rgba(${ink},.08) 1px, transparent 1px) 0 0 / 28px 28px, linear-gradient(90deg, rgba(${ink},.08) 1px, transparent 1px) 0 0 / 28px 28px`,
    stripes: `repeating-linear-gradient(135deg, rgba(${ink},.06) 0 6px, transparent 6px 16px)`,
  };
  return layers[t] ? `\nbody{background:${layers[t]}, var(--bg)}` : "";
}

const BASE = `
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font-family:var(--font-body);font-size:17px;line-height:1.6;-webkit-font-smoothing:antialiased}
img{max-width:100%;height:auto;display:block}
a{color:inherit;text-decoration:none}
h1,h2,h3,h4{font-family:var(--font-heading);line-height:1.08;margin:0 0 .5em;letter-spacing:-.01em;font-weight:700;text-wrap:balance}
h1{font-size:clamp(2.4rem,6vw,4.6rem)}
h2{font-size:clamp(1.9rem,4vw,3rem)}
h3{font-size:1.25rem}
p{margin:0 0 1em}
.wrap{max-width:var(--wrap);margin:0 auto;padding:0 var(--pad)}
section{padding:var(--section) 0}
.skip{position:absolute;left:-999px;top:8px;background:var(--text);color:var(--bg);padding:8px 12px;z-index:100}
.skip:focus{left:8px}
.eyebrow{display:inline-block;font-size:.8rem;letter-spacing:.14em;text-transform:uppercase;font-weight:700;color:var(--accent);margin-bottom:14px}
.lead{font-size:1.15rem;color:var(--muted);max-width:60ch}
.intro{color:var(--muted);max-width:62ch;margin-bottom:40px}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:14px 26px;border-radius:var(--btn-radius);font-weight:600;font-size:1rem;line-height:1;border:1.5px solid transparent;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,background .15s ease;font-family:var(--font-body)}
.btn:hover{transform:translateY(-1px)}
.btn.primary{background:var(--primary);color:var(--on-primary)}
.btn.primary:hover{box-shadow:0 10px 30px -10px var(--primary)}
.btn.ghost{border-color:var(--line);color:var(--text);background:transparent}
.btn.ghost:hover{border-color:var(--text)}
.btn.light{background:#fff;color:#111}
.actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:28px}
.ic{width:22px;height:22px;flex:none}
/* nav */
.nav{position:sticky;top:0;z-index:50;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.4) blur(14px);-webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--line)}
.nav .wrap{display:flex;align-items:center;justify-content:space-between;height:70px;gap:20px}
.brand{font-family:var(--font-heading);font-weight:700;font-size:1.25rem;letter-spacing:-.01em;display:flex;align-items:center;gap:10px}
.brand img{height:36px;width:auto}
.links{display:flex;gap:28px;align-items:center;list-style:none;margin:0;padding:0}
.links a{font-weight:500;font-size:.95rem;opacity:.85}
.links a:hover{opacity:1}
.nav .btn{padding:11px 18px;font-size:.92rem}
.cta-mobile{display:none}
.burger{display:none;background:none;border:0;padding:8px;color:inherit;cursor:pointer}
.burger svg{width:26px;height:26px}
@media (max-width:860px){
  .links{display:none;position:absolute;left:0;right:0;top:70px;background:var(--bg);flex-direction:column;align-items:stretch;padding:12px var(--pad) 22px;border-bottom:1px solid var(--line);gap:4px}
  .links a{display:block;padding:12px 0;font-size:1.1rem;border-bottom:1px solid var(--line)}
  .links .cta-mobile{display:block;margin-top:14px}
  .links .cta-mobile a{border:0;display:inline-flex;padding:12px 20px}
  .nav.open .links{display:flex}
  .burger{display:inline-flex}
  .nav .cta-desktop{display:none}
}
/* hero */
.hero{padding-top:clamp(48px,7vw,96px)}
.hero .media .art{display:block;width:100%;aspect-ratio:4/5;border-radius:var(--radius)}
.hero.centered .media .art{aspect-ratio:16/9}
.hero.editorial .media .art{aspect-ratio:3/2;margin-top:32px}
@media (max-width:860px){.hero.split .media .art{aspect-ratio:4/3}}
.hero.split .wrap{display:grid;grid-template-columns:1.05fr .95fr;gap:clamp(32px,6vw,80px);align-items:center}
.hero.split .media img{border-radius:var(--radius);aspect-ratio:4/5;object-fit:cover;width:100%}
.hero.centered{text-align:center}
.hero.centered .lead{margin:0 auto}
.hero.centered .actions{justify-content:center}
.hero.centered .media{margin-top:56px}
.hero.centered .media img{border-radius:var(--radius);aspect-ratio:16/9;object-fit:cover;width:100%}
.hero.fullbleed{position:relative;min-height:min(92vh,860px);display:flex;align-items:flex-end;padding:0;color:#fff;isolation:isolate}
.hero.fullbleed .media{position:absolute;inset:0;z-index:-1}
.hero.fullbleed .media img{width:100%;height:100%;object-fit:cover}
.hero.fullbleed .media::after{content:"";position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,.72),rgba(0,0,0,.15) 60%,rgba(0,0,0,.1))}
.hero.fullbleed .wrap{padding-top:120px;padding-bottom:72px;width:100%}
.hero.fullbleed .eyebrow,.hero.fullbleed .lead{color:#fff;opacity:.92}
.hero.fullbleed h1{font-size:clamp(2.8rem,7.5vw,6rem);max-width:14ch}
.hero.editorial .wrap{display:grid;grid-template-columns:1fr;gap:28px}
.hero.editorial h1{font-size:clamp(3rem,9vw,7.5rem);letter-spacing:-.03em;max-width:none;line-height:.98}
.hero.editorial .row{display:grid;grid-template-columns:1.2fr .8fr;gap:40px;align-items:end}
.hero.editorial .media img{border-radius:var(--radius);aspect-ratio:3/2;object-fit:cover;width:100%;margin-top:32px}
.hero.minimal{padding-top:clamp(80px,12vw,160px);padding-bottom:clamp(80px,12vw,160px)}
.hero.minimal h1{max-width:16ch}
.hero.minimal .lead{max-width:52ch}
@media (max-width:860px){.hero.split .wrap,.hero.editorial .row{grid-template-columns:1fr}.hero.split .media{order:-1}.hero.split .media img{aspect-ratio:4/3}}
/* about */
.about .wrap.two{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,6vw,80px);align-items:center}
.about.imageLeft .media{order:-1}
.about .media img{border-radius:var(--radius);aspect-ratio:4/5;object-fit:cover;width:100%}
.about .text p{font-size:1.05rem}
.about .wrap.one{max-width:820px}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:20px;margin-top:40px}
.stat{border-top:2px solid var(--primary);padding-top:14px}
.stat b{display:block;font-family:var(--font-heading);font-size:2.2rem;line-height:1}
.stat span{color:var(--muted);font-size:.95rem}
@media (max-width:860px){.about .wrap.two{grid-template-columns:1fr}.about.imageLeft .media{order:0}.about .media img{aspect-ratio:4/3}}
/* cards */
.grid{display:grid;gap:22px}
.cols-2{grid-template-columns:repeat(2,1fr)}
.cols-3{grid-template-columns:repeat(3,1fr)}
.cols-4{grid-template-columns:repeat(4,1fr)}
@media (max-width:960px){.cols-3,.cols-4{grid-template-columns:repeat(2,1fr)}}
@media (max-width:600px){.cols-2,.cols-3,.cols-4{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:28px;display:flex;flex-direction:column;gap:12px}
.card .ic{width:28px;height:28px;color:var(--accent)}
.card img{border-radius:calc(var(--radius) - 8px);aspect-ratio:4/3;object-fit:cover;margin:-8px -8px 8px;width:calc(100% + 16px);max-width:none}
.card h3{margin:4px 0 0}
.card p{color:var(--muted);margin:0;font-size:.98rem}
.price{font-weight:700;color:var(--primary);margin-top:auto;padding-top:8px}
/* services list */
.slist{display:grid;gap:0;border-top:1px solid var(--line)}
.slist .row{display:grid;grid-template-columns:1.2fr 2fr auto;gap:24px;padding:26px 0;border-bottom:1px solid var(--line);align-items:baseline}
.slist .row h3{margin:0;display:flex;gap:12px;align-items:center}
.slist .row p{margin:0;color:var(--muted)}
.slist .row .price{margin:0;padding:0;white-space:nowrap}
@media (max-width:760px){.slist .row{grid-template-columns:1fr;gap:6px}}
/* features */
.feat{display:grid;gap:36px 28px}
.feat .item{display:flex;gap:16px;align-items:flex-start}
.feat .ic{width:26px;height:26px;color:var(--accent);margin-top:3px}
.feat h3{margin:0 0 4px}
.feat p{margin:0;color:var(--muted)}
.checklist .ic{background:color-mix(in srgb,var(--primary) 14%,transparent);color:var(--primary);border-radius:999px;padding:6px;width:32px;height:32px}
/* gallery */
.gallery .grid{gap:14px}
.gallery img{border-radius:var(--radius);width:100%;aspect-ratio:1;object-fit:cover}
.gallery.masonry .grid{grid-template-columns:repeat(3,1fr);grid-auto-flow:dense}
.gallery.masonry img{aspect-ratio:4/3}
.gallery.masonry .tall{grid-row:span 2}
.gallery.masonry .tall img{height:100%;aspect-ratio:auto;object-fit:cover}
.gallery.strip .grid{display:flex;overflow-x:auto;gap:14px;scroll-snap-type:x mandatory;padding-bottom:8px;scrollbar-width:none}
.gallery.strip img{width:min(78vw,420px);aspect-ratio:4/5;scroll-snap-align:start;flex:none}
@media (max-width:700px){.gallery.masonry .grid{grid-template-columns:repeat(2,1fr)}}
/* testimonials */
.quote{font-family:var(--font-heading);font-size:1.25rem;line-height:1.4;margin:0 0 18px;text-wrap:pretty}
.quote::before{content:"\\201C";color:var(--accent);margin-right:2px}
.who{font-size:.9rem;color:var(--muted)}
.who b{color:var(--text);font-weight:600;display:block}
.tsingle{max-width:820px;margin:0 auto;text-align:center}
.tsingle .quote{font-size:clamp(1.4rem,3vw,2.2rem)}
.stars{color:var(--accent);display:flex;gap:2px;margin-bottom:14px}
.stars .ic{width:18px;height:18px;fill:currentColor}
/* menu */
.menu .cat{margin-bottom:48px}
.menu .cat h3{font-size:1.5rem;border-bottom:2px solid var(--primary);display:inline-block;padding-bottom:8px;margin-bottom:22px}
.menu .item{display:grid;grid-template-columns:1fr auto;gap:8px 24px;padding:14px 0;border-bottom:1px dashed var(--line)}
.menu .item b{font-weight:600}
.menu .item p{grid-column:1;margin:0;color:var(--muted);font-size:.95rem}
.menu .item .p{font-weight:700;color:var(--primary);grid-row:1;grid-column:2}
.menu .cats{display:grid;grid-template-columns:repeat(2,1fr);gap:0 clamp(32px,6vw,80px)}
@media (max-width:860px){.menu .cats{grid-template-columns:1fr}}
/* pricing */
.plan{position:relative}
.plan.hi{border-color:var(--primary);box-shadow:0 20px 50px -30px var(--primary)}
.plan .amt{font-family:var(--font-heading);font-size:2.6rem;line-height:1}
.plan .amt small{font-size:1rem;color:var(--muted);font-family:var(--font-body)}
.plan ul{list-style:none;padding:0;margin:8px 0 18px;display:grid;gap:10px}
.plan li{display:flex;gap:10px;align-items:flex-start;color:var(--muted)}
.plan li .ic{width:18px;height:18px;color:var(--primary);margin-top:4px}
.plan .btn{margin-top:auto}
/* faq */
.faq .wrap{max-width:860px}
details{border-bottom:1px solid var(--line);padding:6px 0}
summary{cursor:pointer;font-weight:600;font-size:1.1rem;padding:16px 0;list-style:none;display:flex;justify-content:space-between;gap:20px}
summary::-webkit-details-marker{display:none}
summary::after{content:"+";font-size:1.5rem;line-height:1;color:var(--accent);flex:none}
details[open] summary::after{content:"\\2013"}
details p{color:var(--muted);padding-bottom:16px}
/* team */
.team img{border-radius:var(--radius);aspect-ratio:1;object-fit:cover;width:100%;margin-bottom:14px}
.team .role{color:var(--accent);font-size:.9rem;font-weight:600}
/* hours */
.hours-table{width:100%;max-width:520px;border-collapse:collapse}
.hours-table td{padding:12px 0;border-bottom:1px solid var(--line)}
.hours-table td:last-child{text-align:right;font-weight:600}
/* contact */
.contact .wrap.two{display:grid;grid-template-columns:1fr 1fr;gap:clamp(32px,6vw,80px)}
@media (max-width:860px){.contact .wrap.two{grid-template-columns:1fr}}
.clist{list-style:none;padding:0;margin:24px 0 0;display:grid;gap:14px}
.clist li{display:flex;gap:14px;align-items:flex-start}
.clist .ic{color:var(--accent);margin-top:2px}
.clist a:hover{text-decoration:underline}
.map{margin-top:28px;border-radius:var(--radius);overflow:hidden;border:1px solid var(--line);aspect-ratio:16/10}
.map iframe{width:100%;height:100%;border:0;display:block}
form.lead-form{display:grid;gap:14px;background:var(--surface);border:1px solid var(--line);padding:28px;border-radius:var(--radius)}
form.lead-form label{display:grid;gap:6px;font-size:.9rem;font-weight:600}
form.lead-form input,form.lead-form textarea{font:inherit;padding:12px 14px;border:1px solid var(--line);border-radius:calc(var(--btn-radius) * .6);background:var(--bg);color:var(--text);width:100%}
form.lead-form textarea{min-height:120px;resize:vertical}
form.lead-form input:focus,form.lead-form textarea:focus{outline:2px solid var(--primary);outline-offset:1px;border-color:transparent}
.form-ok{padding:28px;background:color-mix(in srgb,var(--primary) 10%,var(--surface));border-radius:var(--radius);font-weight:600}
.form-msg{font-size:.9rem;color:var(--muted);min-height:1em}
.hp{position:absolute;left:-9999px}
/* cta */
.cta-banner{background:var(--primary);color:var(--on-primary);text-align:center}
.cta-banner h2{color:inherit}
.cta-banner p{opacity:.9;max-width:60ch;margin:0 auto 1em}
.cta-banner .actions{justify-content:center}
.cta-card{background:var(--surface);border:1px solid var(--line);border-radius:var(--radius);padding:clamp(32px,5vw,64px);display:grid;grid-template-columns:1.2fr .8fr;gap:40px;align-items:center}
.cta-card img{border-radius:calc(var(--radius) - 6px);aspect-ratio:4/3;object-fit:cover;width:100%}
@media (max-width:860px){.cta-card{grid-template-columns:1fr}}
/* text */
.textsec .wrap{max-width:820px}
.textsec p{font-size:1.08rem}
/* footer */
footer{border-top:1px solid var(--line);padding:56px 0 32px;color:var(--muted);font-size:.95rem}
footer .top{display:flex;justify-content:space-between;gap:32px;flex-wrap:wrap;align-items:flex-start}
footer .brand{color:var(--text)}
footer .socials{display:flex;gap:10px;margin-top:18px}
footer .socials a{width:40px;height:40px;border:1px solid var(--line);border-radius:999px;display:inline-flex;align-items:center;justify-content:center;color:var(--text)}
footer .socials a:hover{border-color:var(--text)}
footer .socials svg{width:18px;height:18px}
footer .hrs{display:grid;gap:4px;min-width:220px}
footer .bottom{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-top:40px;padding-top:20px;border-top:1px solid var(--line);font-size:.85rem}
.badge{display:inline-flex;align-items:center;gap:6px;color:var(--muted)}
.badge b{color:var(--text)}
/* reveal */
.reveal{opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease}
.reveal.in{opacity:1;transform:none}
@media (prefers-reduced-motion:reduce){.reveal{opacity:1;transform:none;transition:none}html{scroll-behavior:auto}}
.mode-dark .nav{background:color-mix(in srgb,var(--bg) 75%,transparent)}
.mode-dark .card,.mode-dark form.lead-form{border-color:color-mix(in srgb,#fff 12%,transparent)}
`;

const PRESETS = {
  editorial: `
h1,h2{letter-spacing:-.025em;font-weight:600}
.eyebrow{letter-spacing:.2em}
.card{border:0;border-top:2px solid var(--text);border-radius:0;background:transparent;padding:22px 0 0}
.card img{margin:0 0 14px;width:100%;border-radius:0}
.btn.primary{border-radius:0}
.btn.ghost{border-radius:0}
.hero.split .media img{aspect-ratio:3/4}
section h2{max-width:20ch}
footer{background:var(--text);color:color-mix(in srgb,var(--bg) 70%,transparent);border:0}
footer .brand,footer .socials a,footer .who b{color:var(--bg)}
footer .socials a{border-color:color-mix(in srgb,var(--bg) 30%,transparent)}
footer .bottom{border-top-color:color-mix(in srgb,var(--bg) 20%,transparent)}
footer .badge b{color:var(--bg)}`,
  bold: `
h1{font-weight:800;text-transform:uppercase;letter-spacing:-.02em;line-height:.95}
h2{font-weight:800;text-transform:uppercase;letter-spacing:-.01em}
.eyebrow{background:var(--accent);color:#111;padding:6px 10px;border-radius:4px}
.btn{text-transform:uppercase;letter-spacing:.06em;font-weight:800;padding:16px 30px}
.card{border-width:2px;border-color:var(--text);box-shadow:6px 6px 0 var(--text)}
.stat{border-top-width:6px}
.cta-banner{background:var(--accent);color:#111}`,
  minimal: `
h1,h2{font-weight:500;letter-spacing:-.03em}
.eyebrow{color:var(--muted);font-weight:500;letter-spacing:.1em}
.btn{font-weight:500}
.card{background:transparent;border:0;padding:0}
.card img{margin:0 0 14px;width:100%}
.nav{border-bottom:0}
section{padding:clamp(56px,8vw,100px) 0}
.hero.minimal h1{font-size:clamp(2.6rem,6vw,5rem)}`,
  warm: `
body{font-size:17.5px}
h1,h2{font-weight:600}
.card{background:color-mix(in srgb,var(--primary) 6%,var(--surface));border-color:transparent}
.btn.primary{box-shadow:0 8px 24px -12px var(--primary)}
.hero.split .media img{border-radius:calc(var(--radius) * 2)}
.eyebrow{color:var(--primary)}
.cta-banner{background:var(--secondary);color:var(--on-secondary)}`,
  luxury: `
h1,h2{font-weight:400;letter-spacing:.01em}
h1{font-size:clamp(2.6rem,6vw,5rem)}
.eyebrow{letter-spacing:.3em;font-weight:500}
.btn{border-radius:0;letter-spacing:.12em;text-transform:uppercase;font-size:.85rem;padding:16px 30px;font-weight:500}
.btn.ghost{border-color:var(--text)}
.card{border-radius:0;background:transparent;border:1px solid var(--line);padding:32px}
.nav .wrap{height:84px}
.brand{letter-spacing:.14em;text-transform:uppercase;font-weight:500;font-size:1.05rem}
.links a{letter-spacing:.08em;text-transform:uppercase;font-size:.8rem}
.hero.split .media img{border-radius:0}
section{padding:clamp(80px,10vw,140px) 0}`,
  playful: `
h1,h2{font-weight:800;letter-spacing:-.02em}
.btn{font-weight:700;border-radius:999px}
.btn.primary{box-shadow:0 6px 0 color-mix(in srgb,var(--primary) 70%,#000)}
.btn.primary:hover{transform:translateY(2px);box-shadow:0 3px 0 color-mix(in srgb,var(--primary) 70%,#000)}
.card{border:2px solid var(--text);box-shadow:0 8px 0 -2px var(--secondary);border-radius:24px}
.eyebrow{background:var(--secondary);color:var(--on-secondary);padding:6px 12px;border-radius:999px}
.hero.split .media img{border-radius:32px;transform:rotate(-2deg)}
.gallery img{border-radius:24px}`,
  classic: `
h1,h2{font-weight:700}
.eyebrow{color:var(--primary);letter-spacing:.16em}
.card{border-color:var(--line);box-shadow:0 12px 30px -20px rgba(0,0,0,.25)}
.btn{font-weight:600}
.nav .wrap{height:76px}
section > .wrap > h2::after{content:"";display:block;width:56px;height:3px;background:var(--primary);margin-top:16px}
.hero h1::after{display:none}
.stat{border-top-color:var(--accent)}`,
  tech: `
h1,h2{font-weight:600;letter-spacing:-.035em}
.eyebrow{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.05em;text-transform:none;background:color-mix(in srgb,var(--accent) 12%,transparent);padding:5px 10px;border-radius:6px}
.card{background:color-mix(in srgb,var(--surface) 92%,var(--primary));border:1px solid color-mix(in srgb,var(--primary) 20%,var(--line))}
.btn.primary{background:linear-gradient(135deg,var(--primary),color-mix(in srgb,var(--primary) 70%,var(--accent)))}
.hero .lead{font-size:1.2rem}
.grid{gap:16px}`,
};
