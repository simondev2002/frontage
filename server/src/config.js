// Central configuration. Values come from environment variables (optionally
// loaded from a .env file next to package.json). Every knob that affects
// pricing, limits or branding lives here so the product can be tuned without
// touching code.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const ROOT = path.resolve(here, "..");

loadDotEnv(path.join(ROOT, ".env"));

function loadDotEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const raw of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    } else {
      // Unquoted values may carry an inline comment: KEY=value   # note
      const hash = val.search(/\s#/);
      if (hash !== -1) val = val.slice(0, hash).trim();
    }
    if (process.env[key] === undefined) process.env[key] = val;
  }
}

const env = (key, fallback) => (process.env[key] === undefined || process.env[key] === "" ? fallback : process.env[key]);
const bool = (key, fallback) => {
  const v = env(key, undefined);
  if (v === undefined) return fallback;
  return ["1", "true", "yes", "on"].includes(String(v).toLowerCase());
};
const int = (key, fallback) => {
  const v = parseInt(env(key, ""), 10);
  return Number.isFinite(v) ? v : fallback;
};

export const config = {
  env: env("NODE_ENV", "development"),
  port: int("PORT", 5150),
  brand: env("BRAND_NAME", "Frontage"),
  // Host that serves the API, landing page and legal pages.
  appHost: env("APP_HOST", "localhost:5150"),
  // Wildcard domain for customer sites: <slug>.<sitesDomain>
  sitesDomain: env("SITES_DOMAIN", "localhost:5150"),
  // What customers point their custom domain at (CNAME target / A record).
  cnameTarget: env("CNAME_TARGET", "sites.frontageweb.com"),
  serverIPv4: env("SERVER_IPV4", ""),
  publicBaseUrl: env("PUBLIC_BASE_URL", "http://localhost:5150"),
  dataDir: env("DATA_DIR", path.join(ROOT, "data")),
  dbFile: env("DB_FILE", path.join(env("DATA_DIR", path.join(ROOT, "data")), "frontage.db")),
  sessionSecret: env("SESSION_SECRET", "dev-only-change-me"),
  adminToken: env("ADMIN_TOKEN", ""),
  supportEmail: env("SUPPORT_EMAIL", "hello@frontageweb.com"),
  // App Review sign-in: a fixed email + code that bypasses the one-time code (both empty = disabled).
  reviewLogin: { email: env("REVIEW_EMAIL", "").trim().toLowerCase(), code: env("REVIEW_CODE", "").replace(/\D/g, "") },

  // Trust X-Forwarded-For (only when Caddy/Nginx is in front; docker-compose sets it).
  // Off by default so a direct client cannot spoof its IP for rate limits.
  trustProxy: bool("TRUST_PROXY", false),

  // ---- AI --------------------------------------------------------------
  ai: {
    model: env("AI_MODEL", "claude-opus-5"),
    editModel: env("AI_EDIT_MODEL", env("AI_MODEL", "claude-opus-5")),
    cheapModel: env("AI_CHEAP_MODEL", "claude-haiku-4-5"),
    effortGenerate: env("AI_EFFORT_GENERATE", "high"),
    effortEdit: env("AI_EFFORT_EDIT", "high"),
    maxImagesPerGeneration: int("AI_MAX_IMAGES", 12),
    fallbacks: bool("AI_SERVER_FALLBACKS", true),
    // Spending guardrails: the platform pauses AI work when the day's spend passes
    // the budget, and a single account cannot burn more than its own daily cap.
    dailyBudgetUsd: Number(env("AI_DAILY_BUDGET_USD", "60")),
    userDailyBudgetUsd: Number(env("AI_USER_DAILY_BUDGET_USD", "6")),
    // USD per million tokens, used for internal cost accounting only.
    pricing: {
      "claude-opus-5": { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 },
      "claude-sonnet-5": { input: 2, output: 10, cacheWrite: 2.5, cacheRead: 0.2 },
      "claude-haiku-4-5": { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 },
    },
  },

  // ---- Plans & limits ----------------------------------------------------
  plans: {
    free: {
      name: "Free preview",
      sites: 1,
      generations: bool("FREE_FIRST_GENERATION", true) ? 1 : 0,
      editsPerMonth: int("FREE_EDITS", 0),
      publish: false,
      customDomain: false,
      badge: true,
    },
    starter: {
      name: "Starter",
      priceLabel: env("STARTER_PRICE_LABEL", "$9.99/month"),
      sites: int("STARTER_SITES", 1),
      generations: int("STARTER_GENERATIONS_PER_MONTH", 3),
      editsPerMonth: int("STARTER_EDITS", 150),
      publish: true,
      customDomain: false,
      badge: true,
    },
    business: {
      name: "Business",
      priceLabel: env("BUSINESS_PRICE_LABEL", "$19.99/month"),
      sites: int("BUSINESS_SITES", 3),
      generations: int("BUSINESS_GENERATIONS_PER_MONTH", 10),
      editsPerMonth: int("BUSINESS_EDITS", 400),
      publish: true,
      customDomain: true,
      badge: false,
    },
  },

  // ---- Apple -------------------------------------------------------------
  apple: {
    bundleId: env("APPLE_BUNDLE_ID", "com.frontage.app"),
    appAppleId: int("APPLE_APP_ID", 0) || undefined,
    teamId: env("APPLE_TEAM_ID", ""),
    // Sign in with Apple: key for client_secret generation (token exchange / revoke)
    siwaKeyId: env("APPLE_SIWA_KEY_ID", ""),
    siwaPrivateKey: readKey(env("APPLE_SIWA_PRIVATE_KEY", ""), env("APPLE_SIWA_PRIVATE_KEY_FILE", "")),
    // App Store Server API (optional, for reconciliation)
    iapKeyId: env("APPLE_IAP_KEY_ID", ""),
    iapIssuerId: env("APPLE_IAP_ISSUER_ID", ""),
    iapPrivateKey: readKey(env("APPLE_IAP_PRIVATE_KEY", ""), env("APPLE_IAP_PRIVATE_KEY_FILE", "")),
    certsDir: env("APPLE_CERTS_DIR", path.join(ROOT, "certs")),
    allowSandbox: bool("APPLE_ALLOW_SANDBOX", true),
    products: {
      [env("APPLE_PRODUCT_STARTER", "com.frontage.app.starter.monthly")]: "starter",
      [env("APPLE_PRODUCT_BUSINESS", "com.frontage.app.business.monthly")]: "business",
    },
    // APNs
    apnsKeyId: env("APNS_KEY_ID", ""),
    apnsPrivateKey: readKey(env("APNS_PRIVATE_KEY", ""), env("APNS_PRIVATE_KEY_FILE", "")),
    apnsTopic: env("APNS_TOPIC", env("APPLE_BUNDLE_ID", "com.frontage.app")),
    apnsProduction: bool("APNS_PRODUCTION", false),
  },

  // ---- Cloudflare for SaaS (custom hostnames behind Cloudflare; optional) --
  cloudflare: {
    apiToken: env("CF_API_TOKEN", ""),
    zoneId: env("CF_ZONE_ID", ""),
    saas: bool("CF_SAAS", false),
  },

  // ---- Stripe (web checkout; optional) -----------------------------------
  stripe: {
    secretKey: env("STRIPE_SECRET_KEY", ""),
    webhookSecret: env("STRIPE_WEBHOOK_SECRET", ""),
    priceStarter: env("STRIPE_PRICE_STARTER", ""),
    priceBusiness: env("STRIPE_PRICE_BUSINESS", ""),
    // Show the "subscribe on the web" link inside the iOS app for the US storefront.
    externalLinkUS: bool("EXTERNAL_LINK_US", false),
  },

  // ---- Email (Resend) ----------------------------------------------------
  email: {
    resendKey: env("RESEND_API_KEY", ""),
    from: env("EMAIL_FROM", "Frontage <hello@frontageweb.com>"),
  },

  limits: {
    maxUploadBytes: int("MAX_UPLOAD_BYTES", 8 * 1024 * 1024),
    maxImagesPerSite: int("MAX_IMAGES_PER_SITE", 40),
    maxJsonBytes: 512 * 1024,
  },
};

function readKey(inline, file) {
  if (inline) return inline.replace(/\\n/g, "\n");
  if (file && fs.existsSync(file)) return fs.readFileSync(file, "utf8");
  return "";
}

export const isDev = config.env !== "production";

export function reservedSlugs() {
  return new Set([
    "www", "api", "app", "admin", "mail", "smtp", "imap", "sites", "static", "cdn", "assets",
    "help", "support", "blog", "status", "dev", "staging", "test", "demo", "preview", "frontage",
    "login", "signup", "billing", "account", "dashboard", "ns1", "ns2", "ftp", "email", "abuse",
  ]);
}
