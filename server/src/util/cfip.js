// Cloudflare's published edge ranges (https://www.cloudflare.com/ips). CF-Connecting-IP
// is only believed when the peer that reached our proxy is one of these, otherwise any
// client could pick its own address and dodge the per-IP rate limits. The list is
// refreshed from cloudflare.com at boot when the network allows.
const V4 = ["173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13", "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22"];
const V6 = ["2400:cb00::/32", "2606:4700::/32", "2803:f800::/32", "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32"];

function ipToNum(ip) {
  let s = String(ip || "").trim();
  if (s.startsWith("::ffff:")) s = s.slice(7);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(s)) {
    const p = s.split(".").map(Number);
    if (p.some((x) => x > 255)) return null;
    return { v: 4, n: BigInt(p[0]) * 16777216n + BigInt(p[1]) * 65536n + BigInt(p[2]) * 256n + BigInt(p[3]) };
  }
  if (s.includes(":")) {
    const [head, tail = ""] = s.split("::");
    const h = head ? head.split(":") : [];
    const t = tail ? tail.split(":") : [];
    if (h.length + t.length > 8 || (!s.includes("::") && h.length !== 8)) return null;
    const parts = [...h, ...Array(8 - h.length - t.length).fill("0"), ...t];
    let n = 0n;
    for (const part of parts) {
      if (!/^[0-9a-f]{0,4}$/i.test(part)) return null;
      n = (n << 16n) + BigInt(parseInt(part || "0", 16));
    }
    return { v: 6, n };
  }
  return null;
}

function parseCidr(c) {
  const [ip, b] = String(c).split("/");
  const a = ipToNum(ip);
  const bits = Number(b);
  if (!a || !Number.isInteger(bits)) return null;
  const size = a.v === 4 ? 32 : 128;
  if (bits < 0 || bits > size) return null;
  const shift = BigInt(size - bits);
  return { v: a.v, shift, net: a.n >> shift };
}

let ranges = [...V4, ...V6].map(parseCidr).filter(Boolean);

export function isCloudflareIp(ip) {
  const a = ipToNum(ip);
  if (!a) return false;
  return ranges.some((r) => r.v === a.v && a.n >> r.shift === r.net);
}

export async function refreshCloudflareRanges() {
  try {
    const text = await Promise.all(["https://www.cloudflare.com/ips-v4", "https://www.cloudflare.com/ips-v6"].map((u) => fetch(u, { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.text() : ""))));
    const list = text.join("\n").split(/\s+/).filter(Boolean).map(parseCidr).filter(Boolean);
    if (list.length >= 10) ranges = list;
  } catch {
    // Keep the built-in list.
  }
}
