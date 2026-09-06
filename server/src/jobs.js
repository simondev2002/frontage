// Tiny in-process job queue backed by the jobs table, so the app can poll
// progress while long AI calls run. Survives restarts (queued jobs resume).
import { get, all, run, now, parseJson } from "./db.js";
import { uuid } from "./util/http.js";

const handlers = new Map();
const CONCURRENCY = Number(process.env.JOB_CONCURRENCY || 3);
let running = 0;

export function registerJobHandler(type, fn) {
  handlers.set(type, fn);
}

export function enqueueJob({ type, siteId, userId, input }) {
  const id = uuid();
  run(
    "INSERT INTO jobs (id, site_id, user_id, type, status, progress, status_text, input_json, created_at, updated_at) VALUES (?,?,?,?,'queued',0,?,?,?,?)",
    id, siteId || null, userId, type, "Waiting to start", JSON.stringify(input || {}), now(), now(),
  );
  setImmediate(pump);
  return getJob(id);
}

export function getJob(id) {
  const j = get("SELECT * FROM jobs WHERE id = ?", id);
  return j ? publicJob(j) : null;
}

export function jobOwner(id) {
  return get("SELECT user_id FROM jobs WHERE id = ?", id)?.user_id || null;
}

export function publicJob(j) {
  return {
    id: j.id,
    siteId: j.site_id,
    type: j.type,
    status: j.status,
    progress: j.progress,
    statusText: j.status_text,
    result: parseJson(j.result_json),
    error: j.error,
    createdAt: j.created_at,
    updatedAt: j.updated_at,
  };
}

export function updateJob(id, patch) {
  const sets = [];
  const vals = [];
  const cols = { status: "status", progress: "progress", statusText: "status_text", result: "result_json", error: "error" };
  for (const [k, v] of Object.entries(patch)) {
    if (!cols[k]) continue;
    sets.push(`${cols[k]} = ?`);
    vals.push(k === "result" ? JSON.stringify(v) : v);
  }
  sets.push("updated_at = ?");
  vals.push(now(), id);
  run(`UPDATE jobs SET ${sets.join(", ")} WHERE id = ?`, ...vals);
}

async function pump() {
  while (running < CONCURRENCY) {
    const next = get("SELECT * FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1");
    if (!next) return;
    const r = run("UPDATE jobs SET status = 'running', status_text = 'Starting', updated_at = ? WHERE id = ? AND status = 'queued'", now(), next.id);
    if (!r.changes) continue;
    running++;
    runJob(next).finally(() => {
      running--;
      setImmediate(pump);
    });
  }
}

async function runJob(j) {
  const fn = handlers.get(j.type);
  if (!fn) return updateJob(j.id, { status: "failed", error: `No handler for ${j.type}` });
  try {
    const result = await fn({
      id: j.id,
      siteId: j.site_id,
      userId: j.user_id,
      input: parseJson(j.input_json, {}),
      progress: (p, text) => updateJob(j.id, { progress: p, ...(text ? { statusText: text } : {}) }),
    });
    updateJob(j.id, { status: "done", progress: 1, statusText: "Done", result: result || {} });
  } catch (e) {
    console.error(`[job ${j.type}] failed:`, e.message);
    updateJob(j.id, { status: "failed", error: e.userMessage || e.message || "Failed", result: e.code ? { code: e.code } : null });
  }
}

export function resumeJobs() {
  run("UPDATE jobs SET status = 'queued' WHERE status = 'running'");
  const stale = all("SELECT id FROM jobs WHERE status = 'queued' AND created_at < ?", now() - 3600e3);
  for (const s of stale) updateJob(s.id, { status: "failed", error: "Timed out" });
  setImmediate(pump);
}
