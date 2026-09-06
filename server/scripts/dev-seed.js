// Seeds a dev user + one site from the fixture spec with real image files, and
// prints a bearer token for curl / the iOS simulator. Safe to re-run.
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { get, run, now } from "../src/db.js";
import { createSession } from "../src/auth.js";
import { validateSpec } from "../src/ai/schema.js";
import { config } from "../src/config.js";
import { saveVersion } from "../src/sites.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const uploads = path.join(config.dataDir, "uploads");
fs.mkdirSync(uploads, { recursive: true });

function png(w, h, [r, g, b]) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    for (let x = 0; x < w; x++) {
      const i = y * (w * 3 + 1) + 1 + x * 3;
      const t = (x / w) * 0.35;
      raw[i] = r * (1 - t); raw[i + 1] = g * (1 - t); raw[i + 2] = b * (1 - t);
    }
  }
  const crc = (buf) => { let c = ~0; for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); } return (~c) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const cr = Buffer.alloc(4); cr.writeUInt32BE(crc(td)); return Buffer.concat([len, td, cr]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

async function fetchImage(seed, w, h) {
  try {
    const r = await fetch(`https://picsum.photos/seed/${seed}/${w}/${h}.jpg`, { redirect: "follow" });
    if (r.ok) return { buf: Buffer.from(await r.arrayBuffer()), ext: "jpg", mime: "image/jpeg" };
  } catch {}
  return { buf: png(Math.min(w, 400), Math.min(h, 400), [154, 59, 31]), ext: "png", mime: "image/png" };
}

let user = get("SELECT * FROM users WHERE email = ?", "dev@frontage.test");
if (!user) {
  run("INSERT INTO users (id, email, name, created_at, last_seen_at) VALUES (?,?,?,?,?)", "11111111-1111-4111-8111-111111111111", "dev@frontage.test", "Dev Owner", now(), now());
  user = get("SELECT * FROM users WHERE email = ?", "dev@frontage.test");
}
let site = get("SELECT * FROM sites WHERE user_id = ? AND slug = ?", user.id, "oak-and-ember");
if (!site) {
  run("INSERT INTO sites (id, user_id, slug, name, status, preview_token, created_at, updated_at) VALUES (?,?,?,?,'draft',?,?,?)", "site-oak-and-ember-0001", user.id, "oak-and-ember", "Oak & Ember", "devpreviewtoken", now(), now());
  site = get("SELECT * FROM sites WHERE id = ?", "site-oak-and-ember-0001");
}
const spec = validateSpec(JSON.parse(fs.readFileSync(path.join(here, "../test/fixtures/demo-spec.json"), "utf8")));
const sizes = { img1: [1200, 1500], img2: [1200, 900], img3: [1200, 900], img4: [1200, 1500], img5: [1200, 800] };
const idMap = {};
for (const [old, [w, h]] of Object.entries(sizes)) {
  const id = `seed${old}0000000000`.slice(0, 16);
  idMap[old] = id;
  if (!get("SELECT 1 FROM images WHERE id = ?", id)) {
    const { buf, ext, mime } = await fetchImage(old, w, h);
    fs.writeFileSync(path.join(uploads, `${id}.${ext}`), buf);
    run("INSERT INTO images (id, user_id, site_id, ext, mime, width, height, bytes, kind, caption, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", id, user.id, site.id, ext, mime, w, h, buf.length, "featured", "", now());
  }
}
const json = JSON.stringify(spec).replace(/"img([1-5])"/g, (_, n) => `"${idMap["img" + n]}"`);
saveVersion(site.id, JSON.parse(json), "manual", "Seeded from fixture");
const token = createSession(user.id, "dev-seed");
console.log(JSON.stringify({ userId: user.id, siteId: site.id, token, preview: `${config.publicBaseUrl}/p/${site.id}?t=${site.preview_token}` }, null, 2));
