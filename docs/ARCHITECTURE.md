# Architecture

## The one idea

The AI never writes HTML for customers. It writes a **site spec**: a JSON document with a theme (preset, colors, fonts), business metadata, and an ordered list of typed sections (hero, about, services, gallery, menu, testimonials, features, pricing, faq, team, hours, contact, cta, text, custom). A deterministic renderer (`server/src/renderer/`) turns any valid spec into a complete page: responsive CSS, accessible markup, SEO tags, JSON-LD, lazy images, a working contact form, and one of eight design presets with real typographic character.

Why: every site is guaranteed to work on phones, load fast and pass basic accessibility; edits are cheap because Claude returns small operations instead of re-emitting a page; and the design quality is controlled by us, not by whatever HTML the model felt like writing that day.

Structured outputs (`output_config.format` with a zod-derived JSON schema) make the spec always parse. `repairSpec` then fixes the rare semantic slip (unknown image ids, duplicate section ids, bad hex colors).

## Server (`server/src`)

| File | Role |
|---|---|
| `index.js` | HTTP server, request routing order: images → contact forms → customer sites by Host → API router → static pages. |
| `config.js` | All knobs (plans, limits, model choice, Apple/Stripe/email keys) from env / `.env`. |
| `db.js` | SQLite schema (users, sessions, sites, versions, images, chat, jobs, subscriptions, usage, ai_calls, leads, devices, reports). |
| `auth.js` | Sign in with Apple (JWKS signature check), email one-time codes, bearer sessions, account deletion with Apple token revocation. |
| `ai/schema.js` | The site spec and edit-ops schemas (zod), `applyOps`, `validateSpec`. |
| `ai/prompts.js` | Static system prompts (prompt-cached) with the design guide and copy rules; brief formatting. |
| `ai/client.js` | Streaming structured calls with adaptive thinking, server-side refusal fallbacks (with automatic plain retry), cost accounting. |
| `ai/generate.js`, `ai/edit.js`, `ai/moderate.js` | Generation (brief + photos → spec), editing (spec + instruction → ops → spec), Haiku moderation. |
| `renderer/` | `index.js` (document), `css.js` (base + presets), `sections.js` (section variants, nav, footer, sanitizers), `icons.js`. |
| `sites.js` | Site CRUD, slugs, jobs handlers, versions, publishing, custom domains (DNS instructions and verification). |
| `hosting.js` | Serves published sites by Host header, previews (`/p/:id?t=`), robots/sitemap, report page, Caddy TLS ask endpoint. |
| `jobs.js` | Small DB-backed queue so the app polls progress during long AI calls. |
| `uploads.js` | Raw image uploads (phone resizes first), dimension sniffing, immutable image serving. |
| `leads.js` | Contact-form submissions → inbox, push, email. |
| `billing/entitlements.js` | Tier, limits, monthly usage, `assertCan` (throws 402 with `requiredTier`). |
| `billing/apple.js` | JWS verification via Apple's library, App Store Server Notifications V2, transaction sync from the app. |
| `billing/stripe.js` | Optional web checkout + webhook. |
| `push.js`, `email.js` | APNs (HTTP/2, p8 token auth) and Resend. |

### What makes the output good

- **Playbook prompts** (`ai/prompts.js`): a design guide with eight presets, font pairings, colour rules, per-business-type section playbooks (restaurants, salons, trades, professional services, shops, fitness, creative, venues), copy rules (specific over generic, no invented facts, no em dashes) and photo placement rules (every uploaded photo used, hero gets the strongest).
- **Quality gate** (`ai/generate.js`): after generation the spec is checked for placeholder text, too few sections, a missing contact section, unused photos, and the wrong language (a Haiku call compares the copy against the chosen site language). Any miss triggers one corrected regeneration; the better of the two is kept.
- **Plain-JSON mode**: the site schema exceeds the API's constrained-decoding grammar limit, so generation and edits put the JSON schema in the cached system prompt and validate locally with zod; malformed output is repaired where possible (`repairSpec`).
- **Next-step suggestions** (`sites.js` → `suggestionsFor`): the app's chips are derived from what the site still lacks (photos, gallery, reviews, hours, FAQ, booking link) instead of being static.
- **Brand artwork fallback** (`renderer/sections.js` → `artSvg`): heroes without a photo get deterministic colour-field artwork from the palette, so photo-less sites still look designed.
- **"Try a different look"**: regenerates with a note to pick a different preset, palette and hero layout while keeping the facts.
- **Visits**: `site_views` counts daily page views per hosted site (bots filtered, no cookies or IPs); the app shows "n visits this week".
- **Manual editing** (`ios/.../SectionsEditor.swift`, and the "Sections & text" sheet in the web preview): a schema-driven form edits any section's text, buttons, list items and photos, reorders, removes and adds sections from templates, saving through `PUT /spec` (validated by zod). Instant, versioned, no AI credit.

### Request flow for a generation

`POST /api/sites` → `assertCan(create_site, generate)` → insert site (unique slug, preview token) → attach uploaded images → enqueue `generate` job → app polls `GET /api/jobs/:id` → handler reads the brief + image files, calls Claude with images inline, validates/repairs the spec, saves version 1 → app opens the editor, whose WKWebView loads `/p/:id?t=<token>`.

### Request flow for an edit

`POST /api/sites/:id/edit` → `assertCan(edit)` → one job at a time per site → handler sends system prompt (cached) + last 12 chat turns (each assistant turn carries a note of the changes it made) + the original brief + current spec + photo list + instruction → Claude returns `{reply, ops}` → `applyOps` → validate/repair → new version → chat rows → usage++ → app reloads the preview and shows the reply.

Edit discipline: the prompt requires the smallest change that fulfils the request (no layout, copy or photo side effects, no moving photos between sections), flags redundancy instead of deleting unasked, and reverts precisely when told it overstepped. Edits run at effort "high" (about 10 seconds, ≈ $0.05-0.09). Thin briefs produce fewer, fact-free sections rather than invented specifics.

Memory and vision: photos attached to a request, and the site's photos when the request talks about photos, are sent as images so the model can read menus, signs and flyers and resolve "this one" / "that photo". Short follow-ups ("try this image", "make it bigger") are treated as continuations of the previous exchange.

### Custom domains

Connecting a domain the owner already has: the server reads the domain's nameservers, recognises ~25 providers (GoDaddy, Namecheap, Cloudflare, IONOS, Squarespace, Hostinger, Porkbun, Papaki, Loopia, one.com, OVH…), and returns a deep link to that provider's DNS page plus the two records to add. A background watcher re-checks pending domains every 10 minutes for a week and activates the domain, pushes a notification and emails the owner when the records resolve. Caddy then issues the certificate on demand. True one-click writing of records needs a partner such as Entri (Lovable's approach; from $249/month) or the open Domain Connect protocol (free, requires a template accepted into its registry). Selling domains inside the app is possible through a registrar API that needs no reseller application (Porkbun, Dynadot, Name.com) paid with Apple Pay/Stripe, which App Store guideline 3.1.3(e) requires for services consumed outside the app; not built yet.

### Hosting

`Host: joes-bakery.frontageweb.com` → slug lookup → published spec rendered on the fly (badge depends on the owner's current tier) with a small in-memory cache keyed by site/published_at/tier. Custom domains: `www` CNAME → `CNAME_TARGET`, apex A → `SERVER_IPV4`; `POST /domain/verify` checks DNS; Caddy's on-demand TLS asks `/internal/tls-ask` before issuing a certificate, so random hostnames pointed at the server never get certificates.

## iOS app (`ios/Frontage`)

SwiftUI, iOS 17, `@Observable` state, no third-party dependencies.

- `App/AppState.swift`: session, entitlement, sites, paywall routing (any 402 from the API opens the paywall with the required tier).
- `Services/APIClient.swift`: async client; 401 signs the user out.
- `Services/StoreService.swift`: StoreKit 2 products, purchase with `appAccountToken = user id`, `Transaction.updates` listener, entitlement sync, restore.
- `Views/Onboarding`: five steps → review → generating (progress ring polling the job).
- `Views/Editor`: `WebPreview` (phone/desktop toggle via a 1280px viewport wrapper), chat composer with suggestion chips, sheets for business details, look & colors (native theme editing), photos, history, versions/undo.
- `Views/Publish`: address (slug) with availability check, publish/unpublish/share, custom domain with DNS records and "Check again".
- `Views/Leads`, `Views/Settings`, `Views/Settings/PaywallView`.

## Data retention and safety

- Uploaded photos are stored on disk under `data/uploads` and served immutably; deleting an image or account removes the files.
- Sessions are opaque random tokens stored hashed; 180-day expiry.
- Rate limits on auth, uploads, edits, forms and reports are in-memory token buckets (fine for one server; move to Redis if you scale out).
- Content moderation runs before publishing; the `custom` section type is sanitized (scripts, event handlers, iframes stripped).

## SEO in generated sites

Every hosted page is rendered with: a `seoTitle` (under 60 characters, "Business | what it is in Place") and a 120-155 character `seoDescription` written by the model and enforced by `repairSpec`; canonical URL; `robots` index/follow on live sites and `noindex` on previews, paused and suspended sites; Open Graph (`og:site_name`, `og:locale`, `og:url`, `og:image` from the hero photo) and Twitter cards; a favicon (the uploaded logo, otherwise a generated initial in the brand colors); one `h1` in the hero and `h2` per section; `alt` text, `width`/`height`, lazy loading and `decoding="async"` on photos; JSON-LD with a schema.org LocalBusiness subtype chosen from the category (`schemaTypeFor` in `renderer/index.js`: Bakery, Restaurant, BarberShop, ExerciseGym, Dentist and so on) carrying address, phone, email, hours, social profiles and logo, plus `FAQPage` when the site has an FAQ; `robots.txt` with a `Sitemap:` line and `sitemap.xml` with `lastmod`. The prompt also asks for the service and town once in natural copy and forbids emoji in site text.

## Contact-form messages and each site's privacy notice

A visitor message is stored as a lead, shown in the app inbox, pushed to the owner's phone (APNs) and emailed to the owner's account address (Resend, `RESEND_API_KEY`). Limits: 5 per IP per few minutes, 200 per site per day, honeypot field, no AI involved.

Every hosted site also serves its own privacy notice at `/privacy` (drafts at `/p/<id>/privacy?t=…`), linked from the footer and from a consent line under the contact form in the site's language. The notice (`src/legal.js`) is built from the site's details: the business as controller, the form data and why it is kept, technical logs, Frontage (S.MAKELA GAMES LTD) as processor on EU servers behind Cloudflare, Google Fonts, the Google Maps embed when present, cookies (none set by the site), visitor rights, legal bases. English is written from a template; other languages are translated once by the cheap model when the owner publishes and cached in `sites.legal_json` (re-translated only when the underlying facts change). Frontage's own policy and terms already cover the processor role (privacy section 6, terms section 8).
