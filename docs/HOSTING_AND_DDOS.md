# Hosting, DDoS protection and the VPS

## The honest picture

One VPS cannot absorb a volumetric DDoS; nobody's single server can. The way small hosting platforms survive is to never expose the server directly: Cloudflare sits in front, absorbs floods at its edge, caches the customer pages, issues the certificates, and the VPS only ever talks to Cloudflare. That setup is free at your scale and takes an afternoon. Everything below assumes it.

What one VPS *can* do is serve thousands of sites: every hosted page is rendered once and cached in memory, images are static files, and AI work happens at Anthropic. A €8 machine is idle most of the day.

## What to buy

| Piece | Choice | Cost |
|---|---|---|
| VPS | Hostinger KVM 2 (2 vCPU, 8 GB RAM, 100 GB NVMe), operating system **Ubuntu 24.04 LTS**, the plain template without a control panel; pick the data centre closest to your customers. KVM 1 (1 vCPU, 4 GB) also works to start. Hetzner CPX21 is the equivalent if you ever move. | ≈ €8/month |
| Backups | Hostinger weekly snapshots (included on KVM plans) plus Litestream replication of the SQLite file to Cloudflare R2 | ≈ €0 to €2/month |
| Edge | Cloudflare Free plan for `frontageweb.com` (proxy, DDoS, cache, WAF, Universal SSL incl. wildcard) | €0 |
| Custom domains | Cloudflare for SaaS: first 100 customer hostnames free, then $0.10 each per month | €0 to start |
| Email | Resend free tier (3,000/month) | €0 |
| Domain | `frontageweb.com` or your final name | ≈ €10/year |

Hostinger and Hetzner both include network-level DDoS filtering on every server. Everything below is the same on either; the setup steps assume Ubuntu 24.04.

## Architecture

```
visitor ──HTTPS──> Cloudflare edge (DDoS, WAF, cache, TLS) ──HTTPS──> Caddy on the VPS ──HTTP──> Node app (:5150) ──> SQLite + uploads
```

- `app.frontageweb.com` (API, previews, landing) and `*.frontageweb.com` (customer sites) are proxied Cloudflare DNS records ("orange cloud"). Proxied wildcards work on the Free plan.
- Customer domains: the owner CNAMEs `www` to `sites.frontageweb.com`. With **Cloudflare for SaaS** enabled (`CF_SAAS=true`), the server registers each domain as a custom hostname; Cloudflare validates it, issues its certificate and proxies it, so customer domains get the same protection. Apex domains (no `www`) need a provider that supports CNAME flattening or ALIAS records (Cloudflare, Namecheap, Porkbun, DNSimple…); otherwise the owner forwards the apex to `www` at the registrar, which is standard practice.
- The VPS firewall allows 443 only from Cloudflare's IP ranges, so attackers who discover the origin IP cannot reach it. SSH is open only to your IP (or via Tailscale).

## Setup, step by step

1. **Cloudflare zone**: add `frontageweb.com`, point the registrar's nameservers at Cloudflare. DNS: `A @ → VPS IP (proxied)`, `A app → VPS IP (proxied)`, `A * → VPS IP (proxied)`, `A sites → VPS IP (proxied)`. SSL/TLS mode **Full (strict)**.
2. **Origin certificate**: either keep Caddy's wildcard certificate via the Cloudflare DNS challenge (already in the Caddyfile; token needs `Zone:DNS:Edit`) or install a Cloudflare Origin CA certificate. Cloudflare for SaaS needs the token to also have `SSL and Certificates:Edit`.
3. **Cache rule** (Rules → Cache Rules): hostname matches `*.frontageweb.com` and not `app.frontageweb.com` → *Eligible for cache*, Edge TTL 2 minutes, browser TTL respect origin. The app sends `Cache-Control: public, max-age=120` for hosted pages and `immutable` for images, so floods against customer sites are served from the edge. Previews (`/p/…`) send `no-store` and are never cached.
4. **Rate limiting rule** (free plan includes one): path starts with `/api/` → 60 requests per minute per IP, block for 10 minutes. The app has its own per-route limits on top.
5. **WAF**: turn on the free managed ruleset and "Bot Fight Mode". In an attack, flip **Under Attack Mode** on for the sites domain; it adds a JavaScript challenge and stops L7 floods.
6. **Firewall on the VPS** (Ubuntu):
   ```bash
   ufw default deny incoming
   ufw allow from YOUR.HOME.IP to any port 22
   for ip in $(curl -s https://www.cloudflare.com/ips-v4) $(curl -s https://www.cloudflare.com/ips-v6); do ufw allow from $ip to any port 443 proto tcp; done
   ufw enable
   ```
   Refresh the Cloudflare ranges monthly (a cron with the same loop). Port 80 stays closed; Cloudflare redirects HTTP to HTTPS at the edge.
7. **Server config**: `TRUST_PROXY=true` (the app then reads `CF-Connecting-IP` for rate limits and lead records), `CF_API_TOKEN`, `CF_ZONE_ID`, `CF_SAAS=true`, and `SERVER_IPV4` left empty when Cloudflare for SaaS is on (apex instructions then recommend ALIAS/flattening).
8. **Backups**: `litestream replicate data/frontage.db s3://bucket/frontage.db` to R2 (free egress), plus a nightly `rsync` of `data/uploads`. Test a restore once.

## What the app itself already does

- Per-IP and per-account rate limits on sign-in codes, uploads, AI edits, contact forms and abuse reports; 200 messages per site per day.
- Photo storage is capped per account by plan (free 30 photos or 40 MB, Starter 200 or 250 MB, Business 500 or 750 MB), 8 MB per file after the app has already resized to 2200 px, at most 60 uploads a minute, and photos never attached to a site are deleted after 24 hours.
- Header and request timeouts against slow-loris; bodies over the limit are drained and rejected; uploads are sniffed and capped.
- AI spending guardrails: `AI_DAILY_BUDGET_USD` pauses generation platform-wide when the day's spend is reached (default $60), `AI_USER_DAILY_BUDGET_USD` caps any single account (default $6). Monthly plan quotas apply on top, and every call is logged with its cost.
- Hosted pages are cached in memory per site and published version; a cold render is about a millisecond.
- The `/internal/tls-ask` endpoint only allows certificates for hostnames we serve, so nobody can exhaust Let's Encrypt quotas by pointing random domains at the server.

## When to grow

- More than ~5,000 sites or a few million page views a day: move uploads to R2 behind Cloudflare, keep SQLite (still fine) or move to Postgres, and add a second app node behind Cloudflare Load Balancing.
- Uptime beyond one machine: a warm standby VPS restored from the Litestream replica; a Cloudflare DNS change fails over in minutes. Not needed for launch.
