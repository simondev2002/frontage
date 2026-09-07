// Site-specific improvement ideas, shown as chips in the editor. One small model
// call after every generation and edit; the result is cached on the site row so
// reads are free. Generic filler ("make it bolder") is not allowed here: every idea
// must come from what this business is and what its page still lacks.
import { z } from "zod";
import { config } from "../config.js";
import { structuredCall, aiConfigured } from "./client.js";
import { briefToText } from "./prompts.js";

const IdeasSchema = z.object({
  ideas: z.array(z.object({
    label: z.string().min(4).max(34),
    instruction: z.string().min(12).max(320),
  })).min(3).max(6),
});

const SYSTEM = `You advise small business owners on their website inside Frontage, an app where they build and edit a one-page site by asking for changes in plain language.

You get the current site as JSON plus the owner's original brief. Propose the five most valuable next improvements for THIS business and THIS page. Rules:
- Specific, never generic. Name the actual services, place, audience, prices, differentiators or wording from the brief and site. "Add a section about the six-week beginner course" is good; "add more content" or "make it bolder" is not.
- Only things the page does not have yet, or things that are clearly weak (vague headline, no prices, no proof, no clear next step, missing hours or address, no FAQ for an obvious question, a service mentioned in the brief that the page ignores).
- Each idea must be something the editing engine can do to the page: add or rewrite a section, change wording, add facts, restructure. No marketing tasks outside the site, no photo requests (handled elsewhere), no legal boilerplate.
- "label": what the chip says. Sentence case, at most 34 characters, starts with a verb, no emoji, no trailing period.
- "instruction": the full request as the owner would type it, one or two sentences, self-contained, including the concrete content when the brief supplies it. When a fact is needed that only the owner knows (a price, a date, a name), put an empty quoted placeholder "" where it goes and keep the rest concrete.
- Write the label and instruction in the language the site is written in.
- Order by impact for winning customers.`;

export async function suggestIdeas({ spec, brief, userId, siteId }) {
  if (!aiConfigured() || !spec) return [];
  const site = JSON.stringify({ meta: spec.meta, nav: spec.nav, sections: spec.sections }, null, 0);
  const user = [
    "## Owner's brief",
    brief ? briefToText(brief, []) : "(not available)",
    "",
    "## Current site (JSON)",
    site.length > 24000 ? site.slice(0, 24000) + "…" : site,
  ].join("\n");
  const { data } = await structuredCall({
    kind: "suggest",
    model: config.ai.editModel,
    effort: "low",
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
    schema: IdeasSchema,
    maxTokens: 2000,
    userId,
    siteId,
  });
  return data.ideas.map((i) => ({ label: i.label.trim().replace(/\.$/, ""), instruction: i.instruction.trim(), action: null }));
}
