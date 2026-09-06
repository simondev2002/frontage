# Frontage

An iOS app where business owners get a finished, professional website in minutes and change it by chatting. Sites live at `yourbusiness.frontageweb.com` (Starter, $9.99/month) or on the owner's own domain (Business, $19.99/month). The first website is free to generate and preview; changes and publishing need a plan, and there is no free trial. AI by Claude, billing through the App Store.

"Frontage" is a working name; change `BRAND_NAME`, `SITES_DOMAIN` and the iOS `AppConfig` to rename.

## What's here

```
server/   Node 24 API + hosting (zero framework, SQLite via node:sqlite, Anthropic SDK, Apple IAP verification)
ios/      SwiftUI app (iOS 17+), XcodeGen project spec, StoreKit test config
docs/     Apple compliance research and review audit, unit economics, architecture, security, hosting and DDoS (VPS + Cloudflare), deployment, App Store submission
```

## How it works

1. **Onboarding** (5 short screens): business name, what it does, look and colors, photos and logo, contact details.
2. **Generation**: the server sends the brief and photos to Claude, which returns a structured *site spec* (JSON: theme, sections, copy, image placement). A deterministic renderer turns the spec into a fast, responsive, accessible single page. Keeping the AI on a schema is what makes every site "flawless" and cheap to edit.
3. **Editing**: the owner types "make it bolder" or "add our Saturday hours"; Claude returns small edit operations against the spec; every change is a restorable version.
4. **Publishing**: moderation pass, then the site is served by Host header on the wildcard domain or a verified custom domain (Caddy handles certificates). Contact-form messages land in the app with a push notification.
5. **Billing**: StoreKit 2 subscriptions verified server-side plus App Store Server Notifications; optional Stripe web checkout for multiplatform access and the US external-link right. See `docs/APPLE_COMPLIANCE.md`.

## Run the server locally

```bash
cd server
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY to enable generation
npm run dev                 # http://localhost:5150
```

Useful scripts:

```bash
node scripts/dev-seed.js            # demo user + demo site with images, prints a bearer token
TOKEN=... node scripts/api-smoke.js # end-to-end API test (27 checks) against the running server
node scripts/render-demo.js bold    # render the fixture site with a preset to data/demo-bold.html
node scripts/ai-smoke.js photo.jpg  # real generation + edit + moderation with cost readout (needs API key)
npm run certs                       # download Apple root certificates for IAP verification
```

Local hosting test: sites resolve at `http://<slug>.localhost:5150` in Chrome/Safari (`*.localhost` maps to 127.0.0.1).

**See the app without a Mac:** double-click `START-PREVIEW.bat` (Windows) or `START-PREVIEW.command` (Mac) in this folder; it starts the server and opens http://localhost:5150/dev/app-preview. The page must be opened through the server, not as a file. It is a browser stand-in for the iOS app, screen for screen, running the real flow (sign in, onboarding, generation, editor, publish, messages, settings). Sign in with Apple and StoreKit purchases are simulated there; everything else hits the same API the app uses.

Security checks: `TOKEN=... node scripts/security-smoke.js` (see `docs/SECURITY.md`).

## Run the iOS app

On a Mac with Xcode 16+:

```bash
cd ios
brew install xcodegen
xcodegen generate
open Frontage.xcodeproj
```

Set your team in `project.yml` (or in Xcode), pick the `Frontage` scheme (it uses `Frontage.storekit` for local purchase testing) and run on the simulator. The Debug build talks to `http://localhost:5150`; on a device set the `FRONTAGE_API` scheme environment variable to your Mac's LAN address.

## Configuration that matters

| Env var | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Enables generation and editing (Claude Opus 5 by default; `AI_EDIT_MODEL=claude-sonnet-5` cuts edit cost). |
| `APP_HOST`, `SITES_DOMAIN`, `PUBLIC_BASE_URL`, `CNAME_TARGET`, `SERVER_IPV4` | Hostnames for the API, customer subdomains and custom-domain DNS instructions. |
| `APPLE_BUNDLE_ID`, `APPLE_APP_ID`, `APPLE_PRODUCT_*` | IAP verification and product → tier mapping. |
| `APPLE_SIWA_*`, `APNS_*` | Sign in with Apple token revocation on account deletion; push notifications for new messages. |
| `FREE_FIRST_GENERATION`, `FREE_EDITS`, `STARTER_EDITS`, `BUSINESS_EDITS` | The profitability guardrails. |
| `STRIPE_*`, `EXTERNAL_LINK_US` | Optional web checkout and the US-only "subscribe on the web" link. |
| `RESEND_API_KEY` | Sign-in codes and lead emails (logged to the console when unset). |

Full list with comments in `server/.env.example`.

## Status

Built and verified on 6 September 2026: the server passes the 27-step API smoke test (auth, entitlements, publishing, host routing, leads, versions, domains, deletion) and the renderer was checked in a browser on desktop and phone widths. The AI path is written against the current Anthropic SDK but has not been run with a live key from this machine; run `scripts/ai-smoke.js` first. The iOS project was written without a Mac available, so expect a short compile-fix pass in Xcode.
