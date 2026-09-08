// Image uploads (raw body, resized on the phone) and public image serving.
import fs from "node:fs";
import path from "node:path";
import { config } from "./config.js";
import { get, all, run, now } from "./db.js";
import { badRequest, notFound, forbidden, paymentRequired, readRawBody, uuid, rateLimit } from "./util/http.js";
import { requireAuth } from "./auth.js";
import { tierFor } from "./billing/entitlements.js";

// Photo storage per account, by plan. Photos arrive already resized to 2200 px (300-600 KB),
// so these are generous for real use and small enough that nobody can fill the disk.
const STORAGE_QUOTA = {
  free: { files: 30, mb: 40 },
  starter: { files: 200, mb: 250 },
  business: { files: 500, mb: 750 },
};

const uploadsDir = path.join(config.dataDir, "uploads");
const MIME_EXT = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const EXT_MIME = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };

// Content sniffing: the declared Content-Type is never trusted.
export function sniffMime(buf) {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf.toString("ascii", 1, 4) === "PNG" && buf[4] === 0x0d && buf[5] === 0x0a) return "image/png";
  if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

export function imageDimensions(buf) {
  try {
    if (buf[0] === 0xff && buf[1] === 0xd8) {
      let i = 2;
      while (i < buf.length) {
        if (buf[i] !== 0xff) { i++; continue; }
        const marker = buf[i + 1];
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
        const len = buf.readUInt16BE(i + 2);
        if ((marker >= 0xc0 && marker <= 0xcf) && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
        }
        i += 2 + len;
      }
    } else if (buf.toString("ascii", 1, 4) === "PNG") {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    } else if (buf.toString("ascii", 0, 4) === "RIFF" && buf.toString("ascii", 8, 12) === "WEBP") {
      const fmt = buf.toString("ascii", 12, 16);
      if (fmt === "VP8X") return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (fmt === "VP8L") { const b = buf.readUInt32LE(21); return { width: (b & 0x3fff) + 1, height: ((b >> 14) & 0x3fff) + 1 }; }
      if (fmt === "VP8 ") return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
    }
  } catch {}
  return { width: null, height: null };
}

export function imageRow(id) {
  return get("SELECT * FROM images WHERE id = ?", id);
}
export function imageUrl(im) {
  return `/i/${im.id}.${im.ext}`;
}
export function imagesForSite(siteId) {
  return all("SELECT * FROM images WHERE site_id = ? ORDER BY created_at", siteId).map(publicImage);
}
export function publicImage(im) {
  return {
    id: im.id,
    url: imageUrl(im),
    width: im.width,
    height: im.height,
    caption: im.caption || "",
    kind: im.kind,
    mime: im.mime,
    bytes: im.bytes,
    path: path.join(uploadsDir, `${im.id}.${im.ext}`),
    createdAt: im.created_at,
  };
}
export function imageMap(siteId) {
  const m = new Map();
  for (const im of imagesForSite(siteId)) m.set(im.id, im);
  return m;
}
export function stripPrivate(im) {
  const { path: _p, ...rest } = im;
  return rest;
}

export function registerUploadRoutes(router) {
  router.post("/api/images", requireAuth, async (ctx) => {
    rateLimit(`upload:${ctx.user.id}`, { capacity: 60, refillPerSec: 1 });
    const q = ctx.url.searchParams;
    const siteId = q.get("site");
    const kind = ["featured", "reference", "logo"].includes(q.get("kind")) ? q.get("kind") : "featured";
    const caption = (q.get("caption") || "").slice(0, 200);
    const declared = String(ctx.req.headers["content-type"] || "").split(";")[0].trim().toLowerCase();
    if (!MIME_EXT[declared]) throw badRequest("unsupported_type", "Please upload a JPEG, PNG or WebP image.");
    const totals = get("SELECT COUNT(*) AS n, COALESCE(SUM(bytes), 0) AS b FROM images WHERE user_id = ?", ctx.user.id);
    const tier = tierFor(ctx.user.id);
    const quota = STORAGE_QUOTA[tier] || STORAGE_QUOTA.free;
    if (totals.n >= quota.files || totals.b > quota.mb * 1024 * 1024) {
      const msg = `Your plan includes up to ${quota.files} photos (${quota.mb} MB). Delete some photos${tier === "business" ? "" : " or upgrade"} to add more.`;
      if (tier === "free") throw paymentRequired("storage_limit", msg, { requiredTier: "starter", currentTier: tier });
      throw badRequest("storage_limit", msg);
    }
    if (siteId) {
      const site = get("SELECT id, user_id FROM sites WHERE id = ?", siteId);
      if (!site || site.user_id !== ctx.user.id) throw notFound("Site not found");
      const n = get("SELECT COUNT(*) AS n FROM images WHERE site_id = ?", siteId).n;
      if (n >= config.limits.maxImagesPerSite) throw badRequest("too_many_images", `A site can have up to ${config.limits.maxImagesPerSite} photos.`);
    }
    const buf = await readRawBody(ctx.req, config.limits.maxUploadBytes);
    if (buf.length < 100) throw badRequest("empty_upload", "The image file is empty.");
    const mime = sniffMime(buf);
    if (!mime) throw badRequest("not_an_image", "That file is not a JPEG, PNG or WebP image.");
    const ext = MIME_EXT[mime];
    const { width, height } = imageDimensions(buf);
    const id = uuid().replace(/-/g, "").slice(0, 16);
    fs.mkdirSync(uploadsDir, { recursive: true });
    fs.writeFileSync(path.join(uploadsDir, `${id}.${ext}`), buf);
    run("INSERT INTO images (id, user_id, site_id, ext, mime, width, height, bytes, kind, caption, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)", id, ctx.user.id, siteId || null, ext, mime, width, height, buf.length, kind, caption, now());
    return { image: stripPrivate(publicImage(imageRow(id))) };
  });

  router.get("/api/images", requireAuth, async (ctx) => {
    const siteId = ctx.url.searchParams.get("site");
    const site = siteId ? get("SELECT id, user_id FROM sites WHERE id = ?", siteId) : null;
    if (!site || site.user_id !== ctx.user.id) throw notFound("Site not found");
    return { images: imagesForSite(siteId).map(stripPrivate) };
  });

  router.patch("/api/images/:id", requireAuth, async (ctx) => {
    const im = imageRow(ctx.params.id);
    if (!im || im.user_id !== ctx.user.id) throw notFound("Image not found");
    const body = await (await import("./util/http.js")).readJsonBody(ctx.req);
    if (typeof body.caption === "string") run("UPDATE images SET caption = ? WHERE id = ?", body.caption.slice(0, 200), im.id);
    if (["featured", "reference", "logo"].includes(body.kind)) run("UPDATE images SET kind = ? WHERE id = ?", body.kind, im.id);
    if (body.siteId) {
      const site = get("SELECT id, user_id FROM sites WHERE id = ?", body.siteId);
      if (!site || site.user_id !== ctx.user.id) throw forbidden("not_owner", "Not your site");
      run("UPDATE images SET site_id = ? WHERE id = ?", site.id, im.id);
    }
    return { image: stripPrivate(publicImage(imageRow(im.id))) };
  });

  router.delete("/api/images/:id", requireAuth, async (ctx) => {
    const im = imageRow(ctx.params.id);
    if (!im || im.user_id !== ctx.user.id) throw notFound("Image not found");
    run("DELETE FROM images WHERE id = ?", im.id);
    try { fs.unlinkSync(path.join(uploadsDir, `${im.id}.${im.ext}`)); } catch {}
    return { ok: true };
  });
}

// Public image serving on every host (sites embed /i/<id>.<ext>).
export function serveImage(ctx) {
  const m = /^\/i\/([A-Za-z0-9_-]{6,40})\.(jpg|jpeg|png|webp)$/i.exec(ctx.path);
  if (!m) return false;
  const file = path.join(uploadsDir, `${m[1]}.${m[2].toLowerCase()}`);
  if (!fs.existsSync(file)) {
    ctx.res.writeHead(404, { "Content-Type": "text/plain" });
    ctx.res.end("Not found");
    return true;
  }
  const st = fs.statSync(file);
  const etag = `"${st.size}-${Number(st.mtimeMs).toString(36)}"`;
  if (ctx.req.headers["if-none-match"] === etag) {
    ctx.res.writeHead(304);
    ctx.res.end();
    return true;
  }
  ctx.res.writeHead(200, {
    "Content-Type": EXT_MIME[m[2].toLowerCase()],
    "Content-Length": st.size,
    "Cache-Control": "public, max-age=31536000, immutable",
    ETag: etag,
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "default-src 'none'; sandbox",
    "Access-Control-Allow-Origin": "*",
  });
  if (ctx.method === "HEAD") return ctx.res.end(), true;
  fs.createReadStream(file).on("error", () => ctx.res.destroy()).pipe(ctx.res);
  return true;
}

// Photos uploaded during onboarding that never got attached to a site are
// removed after 24 hours so abandoned wizards do not fill the disk.
export function startUploadMaintenance() {
  const sweep = () => {
    try {
      const orphans = all("SELECT id, ext FROM images WHERE site_id IS NULL AND created_at < ?", now() - 864e5);
      for (const im of orphans) {
        run("DELETE FROM images WHERE id = ?", im.id);
        try { fs.unlinkSync(path.join(uploadsDir, `${im.id}.${im.ext}`)); } catch {}
      }
      if (orphans.length) console.log(`[uploads] removed ${orphans.length} orphaned photo(s)`);
    } catch (e) {
      console.warn("[uploads] maintenance failed", e.message);
    }
  };
  setTimeout(sweep, 10_000).unref();
  setInterval(sweep, 3600e3).unref();
}
