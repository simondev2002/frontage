// Cloudflare for SaaS: customers' custom domains get Cloudflare's certificate,
// cache and DDoS protection by CNAME-ing to our fallback origin. Optional: only
// active when CF_API_TOKEN, CF_ZONE_ID and CF_SAAS=true are set. Without it,
// custom domains still work through Caddy's on-demand TLS (origin only).
import { config } from "./config.js";

const API = "https://api.cloudflare.com/client/v4";

export function cloudflareSaasEnabled() {
  return Boolean(config.cloudflare.saas && config.cloudflare.apiToken && config.cloudflare.zoneId);
}

async function cf(method, path, body) {
  const r = await fetch(`${API}/zones/${config.cloudflare.zoneId}${path}`, {
    method,
    headers: { Authorization: `Bearer ${config.cloudflare.apiToken}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.success === false) {
    const msg = j.errors?.map((e) => e.message).join("; ") || `HTTP ${r.status}`;
    throw new Error(`Cloudflare: ${msg}`);
  }
  return j.result;
}

async function findHostname(hostname) {
  const list = await cf("GET", `/custom_hostnames?hostname=${encodeURIComponent(hostname)}`);
  return list?.[0] || null;
}

/** Registers www.<domain> and <domain> as custom hostnames (idempotent). */
export async function ensureCustomHostnames(domain) {
  if (!cloudflareSaasEnabled()) return [];
  const out = [];
  for (const host of [domain, `www.${domain}`]) {
    const existing = await findHostname(host);
    out.push(existing || (await cf("POST", "/custom_hostnames", { hostname: host, ssl: { method: "http", type: "dv", settings: { min_tls_version: "1.2" } } })));
  }
  return out;
}

export async function removeCustomHostnames(domain) {
  if (!cloudflareSaasEnabled()) return;
  for (const host of [domain, `www.${domain}`]) {
    const existing = await findHostname(host).catch(() => null);
    if (existing) await cf("DELETE", `/custom_hostnames/${existing.id}`).catch((e) => console.warn("[cloudflare] delete", host, e.message));
  }
}

/** "active" once Cloudflare has validated the hostname and issued its certificate. */
export async function customHostnameStatus(domain) {
  if (!cloudflareSaasEnabled()) return null;
  const www = await findHostname(`www.${domain}`);
  const apex = await findHostname(domain);
  const status = (h) => (h ? `${h.status}/${h.ssl?.status || "?"}` : "missing");
  return { www: status(www), apex: status(apex), active: [www, apex].some((h) => h && h.status === "active" && h.ssl?.status === "active") };
}
