// Cheap pre-publish content check using Haiku. Fails open (allows) on
// infrastructure errors; abuse reports on hosted sites are the backstop.
import { config } from "../config.js";
import { structuredCall, aiConfigured } from "./client.js";
import { MODERATION_SYSTEM } from "./prompts.js";
import { ModerationSchema } from "./schema.js";

export function specText(spec) {
  const out = [spec.meta.businessName, spec.meta.tagline, spec.meta.category, spec.meta.seoDescription];
  for (const s of spec.sections) {
    for (const [k, v] of Object.entries(s)) {
      if (typeof v === "string" && !["id", "type", "variant", "imageId", "css"].includes(k)) out.push(v);
      if (Array.isArray(v)) {
        for (const item of v) {
          if (typeof item === "string") out.push(item);
          else if (item && typeof item === "object") for (const vv of Object.values(item)) if (typeof vv === "string") out.push(vv);
        }
      }
    }
  }
  out.push(spec.footer?.text || "");
  return out.filter(Boolean).join("\n");
}

export async function moderateSpec(spec, { userId, siteId } = {}) {
  if (!aiConfigured()) return { allowed: true, reason: "" };
  try {
    const { data } = await structuredCall({
      kind: "moderate",
      model: config.ai.cheapModel,
      system: MODERATION_SYSTEM,
      messages: [{ role: "user", content: specText(spec).slice(0, 12000) }],
      schema: ModerationSchema,
      maxTokens: 300,
      userId,
      siteId,
    });
    return data;
  } catch (e) {
    console.warn("[moderation] failed open:", e.message);
    return { allowed: true, reason: "" };
  }
}
