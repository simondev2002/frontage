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
