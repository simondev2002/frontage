// Thin wrapper around the Anthropic SDK: structured (JSON-schema) calls with
// streaming, server-side refusal fallbacks, usage/cost accounting and
// friendly error codes for the app.
import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { config } from "../config.js";
import { run, get, now, monthKey } from "../db.js";

let _client;
export function client() {
  if (!_client) _client = new Anthropic();
  return _client;
}
export function aiConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export class AIError extends Error {
  constructor(code, message, extra) {
    super(message);
    this.code = code;
    this.extra = extra;
  }
}

const FALLBACK_BETA = "server-side-fallback-2026-07-01";
const isHaiku = (m) => /haiku/i.test(m);
// Set at runtime if the API rejects the fallbacks beta for this account.
let fallbacksUnavailable = false;

function costUsd(model, u) {
  const p = config.ai.pricing[model] || config.ai.pricing[Object.keys(config.ai.pricing).find((k) => model.startsWith(k))] || { input: 5, output: 25, cacheWrite: 6.25, cacheRead: 0.5 };
  const M = 1e6;
  return (
    ((u.input_tokens || 0) * p.input +
      (u.cache_creation_input_tokens || 0) * p.cacheWrite +
      (u.cache_read_input_tokens || 0) * p.cacheRead +
      (u.output_tokens || 0) * p.output) /
    M
  );
}

function recordCall({ kind, model, userId, siteId, usage, ok, error, startedAt }) {
  const u = usage || {};
  const cost = usage ? costUsd(model, u) : 0;
  run(
    `INSERT INTO ai_calls (user_id, site_id, kind, model, input_tokens, cache_read_tokens, cache_write_tokens, output_tokens, cost_usd, duration_ms, ok, error, created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    userId || null, siteId || null, kind, model,
    u.input_tokens || 0, u.cache_read_input_tokens || 0, u.cache_creation_input_tokens || 0, u.output_tokens || 0,
    cost, Date.now() - startedAt, ok ? 1 : 0, error ? String(error).slice(0, 500) : null, now(),
  );
  if (userId && usage) {
    run(
      `INSERT INTO usage (user_id, month, input_tokens, output_tokens, cost_usd) VALUES (?,?,?,?,?)
       ON CONFLICT(user_id, month) DO UPDATE SET input_tokens = input_tokens + excluded.input_tokens,
       output_tokens = output_tokens + excluded.output_tokens, cost_usd = cost_usd + excluded.cost_usd`,
      userId, monthKey(), (u.input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.cache_creation_input_tokens || 0), u.output_tokens || 0, cost,
    );
  }
  return cost;
}

async function runStream(params, withFallbacks, onProgress) {
  const c = client();
  const stream = withFallbacks
    ? c.beta.messages.stream({ ...params, betas: [FALLBACK_BETA], fallbacks: "default" })
    : c.messages.stream(params);
  let chars = 0;
  stream.on("text", (delta) => {
    chars += delta.length;
    if (onProgress) onProgress(chars);
  });
  return stream.finalMessage();
}

/**
 * Runs one structured-output request and returns { data, usage, model, cost }.
 * `schema` is a zod schema; the response is validated against it.
 */
// Daily spend guardrails (platform-wide and per account), computed from ai_calls.
function assertBudget(userId) {
  const dayStart = Date.parse(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
  const total = get("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM ai_calls WHERE created_at > ?", dayStart).c;
  if (config.ai.dailyBudgetUsd > 0 && total >= config.ai.dailyBudgetUsd) {
    console.error(`[ai] daily budget reached ($${total.toFixed(2)} of $${config.ai.dailyBudgetUsd}); pausing AI work`);
    throw new AIError("budget", "AI features are briefly paused while we catch up. Please try again in a little while.");
  }
  if (userId && config.ai.userDailyBudgetUsd > 0) {
    const mine = get("SELECT COALESCE(SUM(cost_usd), 0) AS c FROM ai_calls WHERE user_id = ? AND created_at > ?", userId, dayStart).c;
    if (mine >= config.ai.userDailyBudgetUsd) throw new AIError("budget", "You have used today's AI allowance. It resets at midnight UTC.");
  }
}

export async function structuredCall({ kind, model, effort, system, messages, schema, maxTokens = 32000, onProgress, userId, siteId }) {
  if (!aiConfigured()) throw new AIError("not_configured", "The AI service is not configured on this server (ANTHROPIC_API_KEY).");
  if (kind === "generate" || kind === "edit") assertBudget(userId);
  const fmt = zodOutputFormat(schema);
  // Large schemas can exceed the API's constrained-decoding grammar limit. When
  // that happens for a call kind we fall back to "plain JSON" mode: the schema
  // goes into the (cached) system prompt and the reply is validated locally.
  const plainJson = grammarTooLarge.has(kind);
  const params = {
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: plainJson ? withSchemaInstructions(system, fmt.schema) : system, cache_control: { type: "ephemeral" } }],
    messages,
    output_config: plainJson ? {} : { format: { type: fmt.type, schema: fmt.schema } },
  };
  if (!isHaiku(model)) {
    params.thinking = { type: "adaptive" };
    if (effort) params.output_config.effort = effort;
  }
  const startedAt = Date.now();
  let msg;
  try {
    // The API only accepts `fallbacks` on Opus/Fable-class models (Sonnet and Haiku return 400).
    const wantFallbacks = config.ai.fallbacks && !fallbacksUnavailable && /claude-(opus|fable)/i.test(model);
    try {
      msg = await runStream(params, wantFallbacks, onProgress);
    } catch (e) {
      if (e instanceof Anthropic.BadRequestError && /grammar is too large/i.test(e.message) && !plainJson) {
        grammarTooLarge.add(kind);
        console.warn(`[ai] schema for "${kind}" exceeds the grammar limit; using plain JSON mode from now on`);
        params.system[0].text = withSchemaInstructions(system, fmt.schema);
        delete params.output_config.format;
        msg = await runStream(params, wantFallbacks, onProgress);
      } else if (wantFallbacks && e instanceof Anthropic.APIError && [400, 404, 422].includes(e.status)) {
        // If the fallbacks beta is rejected (400/404/422), remember that and retry on the plain endpoint.
        fallbacksUnavailable = true;
        console.warn("[ai] server-side fallbacks not accepted for this account; continuing without them:", e.message);
        msg = await runStream(params, false, onProgress);
      } else throw e;
    }
  } catch (e) {
    recordCall({ kind, model, userId, siteId, usage: null, ok: false, error: e.message, startedAt });
    throw mapError(e);
  }
  const cost = recordCall({ kind, model: msg.model || model, userId, siteId, usage: msg.usage, ok: msg.stop_reason !== "refusal", error: msg.stop_reason === "refusal" ? "refusal" : null, startedAt });
  if (msg.stop_reason === "refusal") {
    throw new AIError("refused", "The AI declined this request. Please rephrase or contact support.", msg.stop_details || null);
  }
  if (msg.stop_reason === "max_tokens") {
    throw new AIError("truncated", "The AI ran out of room. Please try again with a shorter request.");
  }
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  let data;
  try {
    data = fmt.parse(extractJson(text));
  } catch (e) {
    throw new AIError("invalid_output", "The AI returned something we could not use. Please try again.", e.message);
  }
  return { data, usage: msg.usage, model: msg.model || model, cost };
}

// Kinds whose schema the API refused to compile ("compiled grammar is too
// large"); they run in plain JSON mode. The site spec and edit schemas are
// known to exceed the limit, so they start there instead of wasting a request.
const grammarTooLarge = new Set(["generate", "edit"]);

function withSchemaInstructions(system, schema) {
  return `${system}

## Output format
Respond with one JSON object and nothing else: no prose, no markdown fences. It must validate against this JSON Schema (every listed property is required; use null where a value is unknown and the schema allows null):
${JSON.stringify(schema)}`;
}

// Tolerates code fences or stray text around the JSON object.
function extractJson(text) {
  const t = String(text || "").trim();
  if (t.startsWith("{")) return t;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fenced) return fenced[1].trim();
  const start = t.indexOf("{");
  const end = t.lastIndexOf("}");
  return start !== -1 && end > start ? t.slice(start, end + 1) : t;
}

function mapError(e) {
  if (e instanceof AIError) return e;
  if (e instanceof Anthropic.AuthenticationError) return new AIError("not_configured", "AI service credentials are invalid.");
  if (e instanceof Anthropic.RateLimitError) return new AIError("busy", "We are unusually busy right now. Please try again in a minute.");
  if (e instanceof Anthropic.BadRequestError) return new AIError("bad_request", "The request could not be processed. " + e.message);
  if (e instanceof Anthropic.APIConnectionError) return new AIError("network", "Could not reach the AI service. Please try again.");
  if (e instanceof Anthropic.NotFoundError) return new AIError("model_not_found", `The configured AI model is not available to this API key (${e.message}). Check AI_MODEL in .env.`);
  if (e instanceof Anthropic.APIError) return new AIError("api_error", `AI service error (${e.status}): ${e.message}`);
  return new AIError("unknown", e.message || "Unknown AI error");
}
