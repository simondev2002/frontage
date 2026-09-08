# Deployment

One small VPS runs everything: the Node app (API + hosting) behind Caddy, which terminates TLS for the app host, the wildcard sites domain, and customers' custom domains.

## 1. DNS (Cloudflare recommended)

For the sites domain `frontageweb.com` (replace with yours):

| Record | Name | Value | Notes |
|---|---|---|---|
| A | `@` | server IPv4 | landing page |
| A | `app` | server IPv4 | API + previews |
| A | `*` | server IPv4 | customer subdomains |
| A | `sites` | server IPv4 | CNAME target customers point `www` at |

Set Cloudflare proxying **off** (grey cloud) for `*` and `sites`, or on-demand TLS and the wildcard DNS challenge get confused. Create a Cloudflare API token with `Zone:DNS:Edit` for the wildcard certificate.

## 2. Server

Ubuntu 24.04 LTS (on Hostinger pick the plain "Ubuntu 24.04" template, not a control panel image), Docker + Compose:

```bash
git clone <this repo> frontage && cd frontage/server
cp .env.example .env         # fill in production values
mkdir -p keys certs data
node scripts/fetch-apple-certs.js    # or run inside the container after build
docker compose up -d --build
```

Required `.env` for production:

```
NODE_ENV=production
APP_HOST=app.frontageweb.com
SITES_DOMAIN=frontageweb.com
PUBLIC_BASE_URL=https://app.frontageweb.com
CNAME_TARGET=sites.frontageweb.com
SERVER_IPV4=<your ip>
SESSION_SECRET=<64 random chars>
ANTHROPIC_API_KEY=...
APPLE_BUNDLE_ID=com.frontage.app
APPLE_APP_ID=<numeric id from App Store Connect>
APPLE_TEAM_ID=...
APPLE_ALLOW_SANDBOX=true          # keep true until launch, then false or keep for TestFlight testers
RESEND_API_KEY=...
ADMIN_TOKEN=<random>
```

Compose also needs `CF_API_TOKEN` and `ACME_EMAIL` (put them in the same `.env`; compose reads it).

## 3. Apple pieces

- **Root certificates** for IAP verification: `npm run certs` writes them to `server/certs` (mounted read-only into the container).
- **App Store Server Notifications V2**: in App Store Connect → App → App Information, set the production URL to `https://app.frontageweb.com/api/billing/apple/notifications` and the sandbox URL to `.../notifications/sandbox`.
- **Sign in with Apple key** (optional but needed for token revocation on account deletion): create a key with the Sign in with Apple capability, put the `.p8` in `keys/AuthKey_SIWA.p8`, set `APPLE_SIWA_KEY_ID`.
- **APNs key**: create an APNs auth key, put it in `keys/AuthKey_APNS.p8`, set `APNS_KEY_ID`, `APNS_PRODUCTION=true` for App Store builds.

## 4. Backups

The whole state is `server/data` (SQLite file + uploads). Nightly: `sqlite3 data/frontage.db ".backup /backups/frontage-$(date +%F).db"` plus an rsync of `data/uploads` to object storage. Litestream is a good continuous option for the database.

## 5. Health and admin

- `GET /api/health` for uptime checks.
- `GET /api/admin/stats` with header `X-Admin-Token` shows users, sites, active subscriptions, gross MRR, AI cost this month by call type, failed AI calls in the last 24h, leads and open reports.
- Logs: `docker compose logs -f app`. Every AI call is also in the `ai_calls` table with tokens, cost and duration.

## 6. Scaling notes

A single container handles thousands of sites (rendering is string concatenation, cached). When you outgrow it: move `data/uploads` to S3-compatible storage behind a CDN, put SQLite on Litestream or switch to Postgres (the `db.js` helpers are the only place SQL lives), and make the job queue external. None of that is needed for the first few thousand customers.

## 7. Current production (set up 7 Sep 2026)

- Hostinger KVM 2 in Düsseldorf (EU), Ubuntu 26.04, IP `179.198.206.40`, SSH as root with the `frontage_vps` key.
- Code at `/opt/frontage`, containers from `/opt/frontage/server` (`app` + `caddy`), state in `/opt/frontage/server/data`, secrets in `.env` and `keys/` there (never in git). Nightly SQLite backups in `/var/backups/frontage` (14 days).
- Cloudflare zone `frontageweb.com`: `@`, `www`, `app` and `*` proxied (the wildcard was switched to proxied on 8 Sep 2026 so hosted sites no longer reveal the origin IP); `sites` stays DNS-only until Cloudflare for SaaS is on, because an external CNAME to a proxied name fails with Cloudflare error 1014 without it. Caddy issues the wildcard through the Cloudflare DNS challenge; customer domains get on-demand certificates.

### Hiding the origin completely (Cloudflare for SaaS)

Goal: no DNS record anywhere resolves to `179.198.206.40`, and the server only accepts web traffic from Cloudflare. Order matters; each step is safe on its own.

1. Account Holder, in the Cloudflare dashboard:
   - My Profile → API Tokens → create a token with `Zone: DNS: Edit`, `Zone: SSL and Certificates: Edit`, `Zone: Zone Settings: Edit`, `Zone: Zone: Read`, scoped to `frontageweb.com`. Put it in `server/.env.production` as `CF_API_TOKEN` (Caddy uses the same variable for the DNS challenge).
   - SSL/TLS → Custom Hostnames → enable Cloudflare for SaaS (the first 100 customer hostnames are free, then $0.10 per hostname per month; Cloudflare may ask for a payment method on file).
2. Then, with the new token (API, no dashboard needed): create `fallback.frontageweb.com` as a proxied A record to the server, set it as the custom-hostname fallback origin, switch `sites.frontageweb.com` to proxied, set the zone SSL mode to Full (strict).
3. Server `.env`: `CF_SAAS=true`, `SERVER_IPV4=` (empty, so the app stops handing out the IP and tells owners to use ALIAS/flattened CNAME or a root-to-www redirect), restart `app`. Re-register any pending custom domain (the domain watcher does it on its next tick).
4. Firewall: `bash /opt/frontage/deploy/cloudflare-firewall.sh` (web ports only from Cloudflare ranges; SSH unchanged), and add it to `/etc/cron.monthly` so the ranges stay current.
5. Verify: `curl -sI https://<any-site>.frontageweb.com` shows `server: cloudflare`; `curl -k --resolve app.frontageweb.com:443:179.198.206.40 https://app.frontageweb.com/api/health` from outside Cloudflare times out.
- Update after a push to `main`:

```bash
ssh root@179.198.206.40 'cd /opt/frontage && git pull --ff-only && cd server && docker compose up -d --build app'
```
