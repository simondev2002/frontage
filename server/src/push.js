// APNs push notifications over HTTP/2 with token-based (p8) authentication.
// Used to tell owners about new leads. Silently no-ops when not configured.
import crypto from "node:crypto";
import http2 from "node:http2";
import { config } from "./config.js";
import { all, run, now } from "./db.js";

let jwtCache = { token: null, issuedAt: 0 };
function providerToken() {
  const { apnsKeyId, apnsPrivateKey, teamId } = config.apple;
  if (!apnsKeyId || !apnsPrivateKey || !teamId) return null;
  if (jwtCache.token && now() - jwtCache.issuedAt < 50 * 60e3) return jwtCache.token;
  const enc = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const data = `${enc({ alg: "ES256", kid: apnsKeyId })}.${enc({ iss: teamId, iat: Math.floor(now() / 1000) })}`;
  const sig = crypto.sign("sha256", Buffer.from(data), { key: apnsPrivateKey, dsaEncoding: "ieee-p1363" });
  jwtCache = { token: `${data}.${sig.toString("base64url")}`, issuedAt: now() };
  return jwtCache.token;
}

const sessions = new Map();
function session(host) {
  let s = sessions.get(host);
  if (s && !s.closed && !s.destroyed) return s;
  s = http2.connect(`https://${host}`);
  s.on("error", () => sessions.delete(host));
  s.on("close", () => sessions.delete(host));
  sessions.set(host, s);
  return s;
}

function sendOne(host, deviceToken, payload) {
  return new Promise((resolve) => {
    const jwt = providerToken();
    if (!jwt) return resolve({ status: 0 });
    const req = session(host).request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${jwt}`,
      "apns-topic": config.apple.apnsTopic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let body = "";
    req.on("response", (h) => (status = h[":status"]));
    req.on("data", (c) => (body += c));
    req.on("end", () => resolve({ status, body }));
    req.on("error", (e) => resolve({ status: -1, body: e.message }));
    req.setTimeout(8000, () => req.close());
    req.end(JSON.stringify(payload));
  });
}

export async function pushToUser(userId, { title, body, data = {} }) {
  const devices = all("SELECT token, environment FROM devices WHERE user_id = ?", userId);
  if (!devices.length || !providerToken()) return 0;
  let sent = 0;
  for (const d of devices) {
    const host = (d.environment === "sandbox" || !config.apple.apnsProduction) && d.environment !== "production" ? "api.sandbox.push.apple.com" : "api.push.apple.com";
    const r = await sendOne(host, d.token, { aps: { alert: { title, body }, sound: "default", badge: 1 }, ...data });
    if (r.status === 200) sent++;
    else if (r.status === 410 || (r.status === 400 && /BadDeviceToken|DeviceTokenNotForTopic/.test(r.body || ""))) run("DELETE FROM devices WHERE token = ?", d.token);
    else if (r.status) console.warn("[push] failed", r.status, r.body);
  }
  return sent;
}

export function registerDevice(userId, token, environment) {
  if (!/^[0-9a-fA-F]{32,200}$/.test(token || "")) return false;
  run("INSERT INTO devices (token, user_id, environment, updated_at) VALUES (?,?,?,?) ON CONFLICT(token) DO UPDATE SET user_id = excluded.user_id, environment = excluded.environment, updated_at = excluded.updated_at", token, userId, environment || "production", now());
  return true;
}
