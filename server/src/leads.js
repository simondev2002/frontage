// Contact-form submissions from hosted sites -> owner's inbox (+ push, email).
import { config } from "./config.js";
import { get, all, run, now } from "./db.js";
import { badRequest, notFound, tooMany, readJsonBody, rateLimit, clientIp, escapeHtml as esc } from "./util/http.js";
import { requireAuth } from "./auth.js";
import { pushToUser } from "./push.js";
import { sendEmail } from "./email.js";

export async function handleFormPost(ctx, siteId) {
  rateLimit(`form:${clientIp(ctx.req)}`, { capacity: 5, refillPerSec: 0.02 });
  const site = get("SELECT id, user_id, name, status FROM sites WHERE id = ?", siteId);
  if (!site) throw notFound("Site not found");
  // Per-site daily cap so a flood cannot bury an owner's inbox or our mail quota.
  const today = get("SELECT COUNT(*) AS n FROM leads WHERE site_id = ? AND created_at > ?", site.id, now() - 864e5).n;
  if (today >= 200) throw tooMany("This form has received too many messages today. Please call instead.");
  const b = await readJsonBody(ctx.req, 64 * 1024);
  if (b.website) return { ok: true }; // honeypot filled by a bot
  const name = String(b.name || "").trim().slice(0, 120);
  const email = String(b.email || "").trim().slice(0, 200);
  const phone = String(b.phone || "").trim().slice(0, 60);
  const message = String(b.message || "").trim().slice(0, 4000);
  if (!name || !message) throw badRequest("missing_fields", "Name and message are required.");
  const r = run("INSERT INTO leads (site_id, name, email, phone, message, ip, created_at) VALUES (?,?,?,?,?,?,?)", site.id, name, email, phone, message, clientIp(ctx.req), now());
  const owner = get("SELECT id, email FROM users WHERE id = ?", site.user_id);
  if (owner) {
    pushToUser(owner.id, {
      title: `New message · ${site.name}`,
      body: `${name}: ${message.slice(0, 120)}`,
      data: { siteId: site.id, leadId: Number(r.lastInsertRowid) },
    }).catch(() => {});
    if (owner.email) {
      sendEmail({
        to: owner.email,
        subject: `New message from your website (${site.name})`,
        text: `${name} sent a message through ${site.name}:\n\n${message}\n\nEmail: ${email || "-"}\nPhone: ${phone || "-"}\n\nReply directly to the customer. Open the ${config.brand} app to see all messages.`,
        html: `<p style="font:16px system-ui"><b>${esc(name)}</b> sent a message through ${esc(site.name)}:</p><blockquote style="font:16px system-ui;border-left:3px solid #ddd;padding-left:12px;white-space:pre-wrap">${esc(message)}</blockquote><p style="font:14px system-ui">Email: ${esc(email || "-")}<br>Phone: ${esc(phone || "-")}</p><p style="font:13px system-ui;color:#666">Open the ${config.brand} app to see all messages.</p>`,
      }).catch(() => {});
    }
  }
  return { ok: true };
}

export function publicLead(l) {
  return { id: l.id, siteId: l.site_id, name: l.name, email: l.email, phone: l.phone, message: l.message, createdAt: l.created_at, readAt: l.read_at };
}

export function unreadLeadCount(siteId) {
  return get("SELECT COUNT(*) AS n FROM leads WHERE site_id = ? AND read_at IS NULL", siteId).n;
}

export function registerLeadRoutes(router) {
  router.get("/api/sites/:id/leads", requireAuth, async (ctx) => {
    const site = get("SELECT id, user_id FROM sites WHERE id = ?", ctx.params.id);
    if (!site || site.user_id !== ctx.user.id) throw notFound("Site not found");
    const leads = all("SELECT * FROM leads WHERE site_id = ? ORDER BY id DESC LIMIT 200", site.id).map(publicLead);
    return { leads, unread: leads.filter((l) => !l.readAt).length };
  });
  router.post("/api/leads/:id/read", requireAuth, async (ctx) => {
    const lead = get("SELECT l.id, s.user_id FROM leads l JOIN sites s ON s.id = l.site_id WHERE l.id = ?", ctx.params.id);
    if (!lead || lead.user_id !== ctx.user.id) throw notFound("Not found");
    run("UPDATE leads SET read_at = ? WHERE id = ?", now(), lead.id);
    return { ok: true };
  });
  router.delete("/api/leads/:id", requireAuth, async (ctx) => {
    const lead = get("SELECT l.id, s.user_id FROM leads l JOIN sites s ON s.id = l.site_id WHERE l.id = ?", ctx.params.id);
    if (!lead || lead.user_id !== ctx.user.id) throw notFound("Not found");
    run("DELETE FROM leads WHERE id = ?", lead.id);
    return { ok: true };
  });
}
