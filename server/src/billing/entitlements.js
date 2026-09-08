// Which plan a user is on, what it allows, and monthly usage accounting.
import { config } from "../config.js";
import { get, all, run, now, monthKey } from "../db.js";
import { paymentRequired, forbidden } from "../util/http.js";

const ORDER = { free: 0, starter: 1, business: 2 };
const ACTIVE = new Set(["active", "grace", "billing_retry"]);

export function activeSubscription(userId) {
  const rows = all("SELECT * FROM subscriptions WHERE user_id = ? ORDER BY updated_at DESC", userId);
  const live = rows.filter((s) => ACTIVE.has(s.status) && (!s.expires_at || s.expires_at > now()));
  live.sort((a, b) => (ORDER[b.tier] || 0) - (ORDER[a.tier] || 0) || (b.expires_at || 0) - (a.expires_at || 0));
  return live[0] || null;
}

export function tierFor(userId) {
  const s = activeSubscription(userId);
  return s ? s.tier : "free";
}

export function usageFor(userId) {
  const m = monthKey();
  const u = get("SELECT * FROM usage WHERE user_id = ? AND month = ?", userId, m) || {};
  return { month: m, generations: u.generations || 0, edits: u.edits || 0, costUsd: u.cost_usd || 0 };
}

export function siteCount(userId) {
  return get("SELECT COUNT(*) AS n FROM sites WHERE user_id = ?", userId).n;
}

export function entitlement(userId) {
  const sub = activeSubscription(userId);
  const tier = sub ? sub.tier : "free";
  const plan = config.plans[tier];
  const usage = usageFor(userId);
  const lifetimeGenerations = get("SELECT COUNT(*) AS n FROM ai_calls WHERE user_id = ? AND kind = 'generate' AND ok = 1", userId).n;
  const sites = siteCount(userId);
  // Queued and running jobs count now, not when they finish, so parallel requests cannot
  // overshoot the quota (usage rows are only written at completion).
  const inflight = (type) => get("SELECT COUNT(*) AS n FROM jobs WHERE user_id = ? AND type = ? AND status IN ('queued', 'running')", userId, type).n;
  const generationsUsed = (tier === "free" ? lifetimeGenerations : usage.generations) + inflight("generate");
  const editsUsed = usage.edits + inflight("edit");
  return {
    tier,
    plan: {
      name: plan.name,
      sites: plan.sites,
      editsPerMonth: plan.editsPerMonth,
      generations: plan.generations,
      generationsPeriod: tier === "free" ? "lifetime" : "month",
      publish: plan.publish,
      customDomain: plan.customDomain,
      badge: plan.badge,
    },
    usage: { month: usage.month, generations: generationsUsed, edits: editsUsed, sites },
    remaining: {
      edits: Math.max(0, plan.editsPerMonth - editsUsed),
      generations: Math.max(0, plan.generations - generationsUsed),
      sites: Math.max(0, plan.sites - sites),
    },
    subscription: sub
      ? { provider: sub.provider, productId: sub.product_id, status: sub.status, expiresAt: sub.expires_at, autoRenew: Boolean(sub.auto_renew), environment: sub.environment }
      : null,
    prices: { starter: config.plans.starter.priceLabel, business: config.plans.business.priceLabel },
  };
}

// Throws 402 with a machine-readable code the app maps to the paywall.
export function assertCan(userId, action) {
  const e = entitlement(userId);
  const need = (tier, code, msg) => {
    throw paymentRequired(code, msg, { requiredTier: tier, currentTier: e.tier });
  };
  const nextTier = e.tier === "free" ? "starter" : "business";
  switch (action) {
    case "create_site":
      if (e.remaining.sites <= 0) {
        if (e.tier === "business") throw forbidden("site_limit", `Your plan includes ${e.plan.sites} websites. Delete one to create another.`);
        need(nextTier, "site_limit", "Upgrade to create another website.");
      }
      break;
    case "generate":
      if (e.remaining.generations <= 0) {
        need(nextTier, "generation_limit", e.tier === "free" ? "Subscribe to build your website." : "You have used this month's website generations.");
      }
      break;
    case "edit":
      if (e.remaining.edits <= 0) {
        need(nextTier, "edit_limit", e.tier === "free" ? (e.plan.editsPerMonth > 0 ? `You have used your  free changes. Subscribe to keep editing and to publish your website.` : "Your first website is free. Subscribe to make changes and publish it.") : "You have used this month's AI changes. They reset next month.");
      }
      break;
    // Manual (non-AI) changes: free of AI cost, so no monthly quota, but they still need a plan.
    // The free tier is "see your first site", paying starts at the first change.
    case "manual_edit":
      if (e.tier === "free") need("starter", "edit_requires_plan", "Your first website is free. Subscribe to make changes and publish it.");
      break;
    case "publish":
      if (!e.plan.publish) need("starter", "publish_requires_plan", "Subscribe to publish your website.");
      break;
    case "custom_domain":
      if (!e.plan.customDomain) need("business", "domain_requires_business", "Custom domains are included in the Business plan.");
      break;
    default:
      break;
  }
  return e;
}

export function bumpUsage(userId, field) {
  if (!["generations", "edits"].includes(field)) throw new Error("bad usage field");
  run(`INSERT INTO usage (user_id, month, ${field}) VALUES (?,?,1) ON CONFLICT(user_id, month) DO UPDATE SET ${field} = ${field} + 1`, userId, monthKey());
}
