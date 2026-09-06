# Security model

What protects what, and how it is verified. `server/scripts/security-smoke.js` exercises every control marked ✔ against a running dev server; run it after every change to auth, billing, hosting or the renderer.

## Accounts and sessions

| Control | Detail | Test |
|---|---|---|
| Sign in with Apple | Identity token signature verified against Apple's JWKS; issuer, audience (bundle id), expiry checked; the request nonce is **required** and compared in constant time, so a captured token cannot be replayed. Email-code accounts are linked to an Apple ID only when Apple marks the email verified. | manual (device) |
| Email codes | 6 digits, 10-minute expiry, 5 attempts, hashed with the server secret. Per-IP and per-address rate limits. In development without an email provider the code is returned to the client so the flow can be tested; production never does this. | ✔ wrong code rejected |
| Sessions | 32-byte random bearer tokens stored hashed, 180-day expiry, revoked on sign-out and account deletion. No cookies, so no CSRF surface. | ✔ bogus/absent token → 401 |
| Account deletion | Removes sites, photos (files too), leads, jobs, devices, usage; anonymizes AI cost rows; revokes the Sign in with Apple token when the SIWA key is configured. Apple guideline 5.1.1(v). | ✔ token invalid afterwards |

## Authorization

Every site, image, job, lead, version and domain endpoint resolves the object *through the signed-in user* and answers 404 for anything the user does not own, so object ids leak nothing. Dev-only endpoints exist only outside production and only from the loopback address as seen on the raw socket (not from `X-Forwarded-For`). `TRUST_PROXY` is off unless a reverse proxy is declared. ✔ 12 cross-account requests rejected.

## Untrusted content on hosted pages

Site content is written by customers and rendered on a shared platform, so it is treated as hostile:

- Every text field is HTML-escaped by the renderer. Every link passes `safeHref` (only `#anchor`, same-origin paths, `http(s)`, `mailto:`, `tel:`, `sms:`). JSON-LD is emitted with `<` escaped.
- The `custom` section runs through an allowlist sanitizer that rebuilds the fragment: known tags and attributes only, `script/style/iframe/svg/object/form/…` removed with their content, image sources limited to our `/i/` files or `https`, inline styles without `url()`/`expression`, `target=_blank` gets `rel="noopener nofollow"`. Custom CSS loses `<`, `>`, `@import`, `expression`, `behavior` and any `url()` that is not one of our images.
- Every rendered page (previews, hosted sites, placeholders, the report form) carries a nonce-based Content-Security-Policy: scripts run only with the per-request nonce, no inline event handlers, `base-uri 'none'`, `object-src 'none'`, frames only for Google Maps, connections only to same origin. Even if something slipped past the sanitizer it could not execute.
- Previews live on the app host, which is why the CSP matters there; the browser app preview keeps its token in `localStorage` on that origin.

✔ Injected `javascript:` links, event handlers, `<script>`, `<svg onload>`, `<iframe>`, `<style>` and `</style>` breakouts are all neutralized; the nonce in the header matches the inline script.

## Uploads and files
- Storage quota per account by plan, enforced server-side on every upload: free 30 photos or 40 MB, Starter 200 or 250 MB, Business 500 or 750 MB; a free account that hits the cap is sent to the paywall. At most 40 photos per site, 8 MB per file, 60 uploads a minute per account; unattached photos are purged after 24 hours.

Declared content types are ignored; the first bytes must be JPEG, PNG or WebP. Files are stored under server-generated ids, served with `nosniff` and a `sandbox` CSP, never from user-controlled paths. Per-user caps (400 files / 500 MB) and per-site caps (40 photos); orphaned onboarding photos are deleted after 24 hours. Oversized bodies are drained and answered with 413. ✔

## Billing

- App Store transactions are verified with Apple's official library against Apple's root certificates (production requires `APPLE_APP_ID`). A transaction is bound to the buyer through `appAccountToken` = user id; another account submitting the same signed transaction is refused, and an already-owned subscription cannot be re-claimed. ✔
- App Store Server Notifications are signature-verified and de-duplicated by notification id.
- Stripe webhooks are refused entirely unless `STRIPE_WEBHOOK_SECRET` is set; with it, signatures are checked in constant time with a 10-minute tolerance. ✔ unsigned event not processed.
- Entitlements are computed server-side on every request; the app never decides what a user may do.

## Hosting

- Sites are served only while the owner's plan allows publishing; a lapsed plan returns 503 + `noindex` and the app shows the site as paused. Custom domains are only honored on the Business plan (otherwise redirected to the subdomain). ✔
- Caddy issues certificates on demand only for hostnames the app confirms (`/internal/tls-ask`, reachable from private addresses only), so pointing random domains at the server cannot exhaust certificate quotas. ✔
- Contact forms: honeypot, per-IP token bucket, 200 messages per site per day. Abuse reports: rate limited, stored, emailed to support.
- Security headers everywhere: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`, `Permissions-Policy`, HSTS in production. ✔

## Operational

- Production refuses to start with the default session secret, a non-HTTPS public URL, or Stripe without a webhook secret.
- Secrets come from `.env` (git-ignored) or files under `keys/`; nothing is logged except request lines in development.
- Every AI call is recorded with tokens and cost; the admin endpoint is token-protected.

## Known limits (worth knowing, not blockers)

- Rate limiting is in-memory per process; behind multiple instances use a shared store.
- The renderer allows `https:` images inside custom HTML, so a customer could embed a tracking pixel on their own site. Acceptable: it is their page.
- The browser app preview is a development tool: it is only served when `NODE_ENV` is not production.
