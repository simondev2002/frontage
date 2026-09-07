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
