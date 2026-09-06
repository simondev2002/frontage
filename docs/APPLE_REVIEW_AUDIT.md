# App Review audit: will Frontage pass?

Audited 6 September 2026 against the live App Store Review Guidelines (developer.apple.com/app-store/review/guidelines). Verdict first, then every guideline that touches this app, what we do, and what is still on you.

## Verdict

**On policy: yes, with the fixes made today, this design passes.** Nothing in the business model or feature set conflicts with the guidelines: in-app purchase for the subscriptions, a free first generation instead of a trial, multiplatform access, Sign in with Apple plus our own email codes, account deletion, moderation and reporting for the public websites, explicit AI-data consent.

**In practice, the two things that decide the outcome are outside the code:**

1. The app has never been built and run on a device (it was written on Windows). Guideline 2.1 rejects anything that crashes or misbehaves. A compile-and-test pass in Xcode on a real iPhone is mandatory, and the first submission of any app usually gets one round of reviewer questions.
2. Completeness items you must do in App Store Connect and the legal pages (listed at the end). Reviewers reject placeholder text and missing subscription disclosures every day.

Realistic expectation: a careful first submission passes, or gets one "Guideline 2.1 Information Needed" or "3.1.2 subscription metadata" note that is fixed in a day. The categories that get AI builder apps rejected (payments outside IAP, missing consent for third-party AI, no moderation, no account deletion) are all covered.

## Guideline by guideline

| Guideline | Requirement | Frontage | Status |
|---|---|---|---|
| 1.2 User-generated content | Filter objectionable material, report mechanism with timely responses, ability to block abusive users, published contact info | Haiku moderation before every publish (verified: it refused a page with script payloads); "Report" link in every site footer to a form that stores the report and emails support; admin endpoints suspend/restore a site (a suspended site returns 451 and cannot be republished); support email on landing, support page, in-app Settings | Done |
| 1.5 Developer information | Easy way to contact support | Support page, mailto in app | Done |
| 1.6 Data security | Protect user data | See `SECURITY.md`: hashed sessions, CSP, sanitizer, signed-receipt verification, rate limits | Done |
| 2.1(a) Completeness | Final version, no placeholder text, tested on device, demo account, backend on | Terms/Privacy contain `[COMPANY]` placeholders; app icon is a placeholder; **iOS code untested on device** | **You** |
| 2.1(b) IAP complete | IAP items visible and functional for the reviewer | Paywall shows both products from StoreKit; needs products created in App Store Connect and a signed Paid Apps agreement | **You** |
| 2.3.1 No hidden features; specific review notes | Nothing dormant; describe features | Dev routes exist only in Debug builds (compiled out); write the notes from `APP_STORE_SUBMISSION.md` | You (notes) |
| 2.3.2 Metadata states what needs purchase | Description must say publishing needs a subscription | Include the subscription paragraph in the description | You |
| 2.3.3 Screenshots show the app | Real screens, not splash | Take from a device | You |
| 2.3.6 Age rating | Honest answers | 4+; user-generated content question: yes, with moderation | You |
| 2.3.7 Metadata hygiene | Unique name under 30 characters, no prices in name/subtitle | "Frontage" is a working name; check trademark availability in your markets | You |
| 2.3.8 Icons/screenshots family-friendly | 4+ imagery | Fine | Done |
| 2.5.1 / 2.5.2 Public APIs, no downloaded code | SwiftUI, StoreKit 2, WKWebView only for the owner's own site preview | Done | Done |
| 2.5.4 Background modes | Only for intended purposes | Removed the unused `remote-notification` background mode today; alert pushes need no background mode | Done |
| 3.1.1 In-app purchase | Features unlocked in-app must use IAP; no external purchase links or CTAs outside the US storefront | Both plans are StoreKit auto-renewable subscriptions; the optional "subscribe on our website" button is off by default and only ever shown when the storefront is USA; no price comparisons anywhere | Done |
| 3.1.1 Restore mechanism | Restorable purchases need restore | "Restore purchases" on paywall and in Settings (`AppStore.sync` + server sync) | Done |
| 3.1.2(a) Subscriptions | Ongoing value, at least 7 days, works on all devices, free trial via App Store Connect offer, no scams | Monthly plans, entitlement is server-side so it follows the Apple ID across devices; introductory offer is 20% off the first month (pay as you go), no free trial; the free first generation is the try-before-you-buy | Done |
| 3.1.2(b) Upgrades/downgrades | Seamless, no double subscribing | One subscription group with two levels (Business above Starter) | You (group setup) |
| 3.1.2(c) Subscription information | Clearly describe what the user gets and Schedule 2 items (title, length, price, ToU, privacy) | Paywall lists features, price from StoreKit, period, renewal sentence, Terms and Privacy links | Done; also add to App Store description |
| 3.1.3(b) Multiplatform | Web purchases may be honored if also sold as IAP | Stripe path optional; both plans are IAP | Done |
| 3.1.3(f) Free stand-alone app | Alternative model: no purchasing in app at all | Not used; documented as Plan B in `APPLE_COMPLIANCE.md` | n/a |
| 4.0 / 4.2 Minimum functionality | More than a repackaged website | Native onboarding, photo picker, StoreKit, push, native editing sheets, messages inbox; WKWebView shows only the owner's preview | Done |
| 4.2.6 Template/app generation services | Concerns apps generated for clients | Not applicable: Frontage builds websites, not apps | n/a |
| 4.5.4 Push notifications | Not required for use; no marketing without opt-in | Only "new message" alerts, permission asked after the first site; opt-out via Settings | Done |
| 4.7 Chatbots/mini apps | Software not in the binary | The chat is native UI calling our API; not applicable | n/a |
| 4.8 Login services | Third-party social login requires an Apple-quality alternative | Sign in with Apple plus our own email codes (no social login at all) | Done |
| 5.1.1(i) Privacy policy | Link in metadata and in app; states data, sharing, retention, deletion | `privacy.html` covers all processors including Anthropic, retention table, deletion; linked in Settings and paywall | Done (fill company name) |
| 5.1.1(ii) Permission strings | Purpose strings clear; consent for data collection | Photo library and camera strings set (library picker plus in-app camera for website photos) | Done |
| 5.1.1(iii) Data minimisation | Out-of-process picker for Photos | `PhotosPicker` (no full library access) | Done |
| 5.1.1(v) Account sign-in and deletion | Login only when account-based; in-app deletion | Hosting is account-based; Settings → Delete account removes sites, photos, leads, sessions, usage, revokes Sign in with Apple token | Done |
| 5.1.2(i) Data sharing incl. third-party AI | Disclose and obtain **explicit permission** before sharing personal data with third-party AI; withdrawable | **Added today**: consent toggle on the review step (default off, button disabled until on), consent alert before the first chat edit, recorded server-side (`users.ai_consent_at`), every AI route refuses without it, Settings → Privacy shows the date and can withdraw; privacy policy updated | Done |
| 5.1.2(i) Tracking | ATT only if tracking | No tracking, no ads, no analytics SDK | Done |
| 5.2.1 / 5.2.2 Intellectual property | Rights to content | Terms make the owner responsible for uploaded photos and logos | Done |
| 5.6 Developer Code of Conduct | Honest ratings, responses | Do not prompt for reviews inside the generation flow; use `SKStoreReviewController` sparingly after a publish if at all | You |

## What you must do before submitting

- Build in Xcode, fix compile errors, run on a physical iPhone: sign in with Apple, build a site, purchase in sandbox, restore, cancel, receive a push, delete the account.
- Replace `[COMPANY]`, `[COUNTRY]`, `[ADDRESS]` in `server/public/terms.html` and `privacy.html`; add a real app icon.
- App Store Connect: two auto-renewable products in one subscription group (Business level above Starter), 7-day introductory offer, prices, localized descriptions, Paid Applications agreement, App Store Server Notifications URLs, privacy nutrition labels (contact info, user content, identifiers, purchases; none used for tracking), Terms of Use and Privacy Policy URLs, subscription paragraph in the description.
- Review notes with a working demo account on the production server and a fixed sign-in code (see `APP_STORE_SUBMISSION.md`), plus one paragraph on moderation and reporting.
- Keep `EXTERNAL_LINK_US=false` for the first submission; enable web checkout later if you want it.
- Enrol in the Small Business Program before the first sale (15% instead of 30%).
