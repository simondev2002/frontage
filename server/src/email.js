// Transactional email via Resend (https://resend.com). Logs to console when
// no API key is configured so local development needs no email account.
import { config } from "./config.js";

export async function sendEmail({ to, subject, text, html }) {
  if (!config.email.resendKey) {
    console.log(`[email:dev] to=${to} subject="${subject}"\n${text}`);
    return false;
  }
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${config.email.resendKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: config.email.from, to: [to], subject, text, html }),
  });
  if (!r.ok) {
    console.error("[email] send failed", r.status, await r.text());
    return false;
  }
  return true;
}
