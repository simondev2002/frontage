// Conversational editing: instruction -> ops -> new spec.
//
// Memory between turns comes from three things: the prior chat turns (with a
// note of what each change did), the original brief (the business facts), and
// the current spec. Photos attached to the request, or referred to by it, are
// sent as images so the model can actually read them (menus, signs, flyers).
import { config } from "../config.js";
import { structuredCall } from "./client.js";
import { EDIT_SYSTEM, imageManifestText, briefToText } from "./prompts.js";
import { EditResultSchema, applyOps, validateSpec } from "./schema.js";
import { repairSpec, imageContentBlocks } from "./generate.js";

const VISION_HINT = /photo|picture|image|pic\b|pics\b|logo|menu|screenshot|flyer|poster|sign\b|card|this one|that one|the other/i;

/**
 * @param {object} p
 * @param {object} p.spec        current validated spec
 * @param {Array}  p.images      image rows for the site (with paths)
 * @param {string} p.instruction owner's request
 * @param {Array}  p.history     prior chat turns [{role, content, meta?}]
 * @param {object} [p.brief]     the onboarding brief (business facts)
 * @param {Array}  [p.attachedIds] ids of photos attached to this request
 */
export async function editSite({ spec, images, instruction, history = [], brief = null, attachedIds = [], userId, siteId, onProgress }) {
  const manifest = images.map((im) => ({ id: im.id, kind: im.kind, width: im.width, height: im.height, caption: im.caption }));
  const messages = [];
  for (const h of history.slice(-12)) {
    if (h.role !== "user" && h.role !== "assistant") continue;
    let content = h.content;
    if (h.role === "assistant" && h.meta?.changes?.length) content += `\n(Changes I made: ${h.meta.changes.join(", ")})`;
    messages.push({ role: h.role, content });
  }
  if (messages.length && messages[0].role !== "user") messages.shift();

  // Show the model the photos it needs: the ones attached now, plus the rest of
  // the site's photos when the request talks about photos.
  const attached = images.filter((im) => attachedIds.includes(im.id));
  const wantsVision = attached.length > 0 || VISION_HINT.test(instruction);
  const shown = wantsVision ? [...attached, ...images.filter((im) => !attachedIds.includes(im.id) && im.kind !== "reference")].slice(0, 6) : [];
  const content = [
    ...imageContentBlocks(shown, 6),
    {
      type: "text",
      text: [
        brief ? `Original brief from the owner (facts to stay true to):\n${briefToText(brief, [])}` : null,
        `Current website JSON:\n${JSON.stringify(spec)}`,
        `Available photos:\n${imageManifestText(manifest)}`,
        attached.length ? `Photos attached to this request (shown above): ${attached.map((im) => im.id).join(", ")}` : null,
        `Owner's request: ${instruction}`,
      ].filter(Boolean).join("\n\n"),
    },
  ];
  messages.push({ role: "user", content });

  const { data, usage, cost, model } = await structuredCall({
    kind: "edit",
    model: config.ai.editModel,
    effort: config.ai.effortEdit,
    system: EDIT_SYSTEM,
    messages,
    schema: EditResultSchema,
    maxTokens: 16000,
    onProgress: (chars) => onProgress?.(Math.min(0.95, chars / 3000)),
    userId,
    siteId,
  });
  const { spec: next, changes } = applyOps(spec, data.ops);
  return { spec: repairSpec(validateSpec(next), images, brief), reply: data.reply, changes, usage, cost, model };
}
