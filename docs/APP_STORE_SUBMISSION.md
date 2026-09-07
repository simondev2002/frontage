# App Store submission checklist

## What already exists in App Store Connect (set up 6 September 2026)

| Item | Value |
|---|---|
| Team | S.MAKELA GAMES LTD, team id `9C3MZQRDRZ` |
| App ID (developer portal) | `com.frontage.app`, capabilities: Sign In with Apple (primary App ID), Push Notifications |
| App record | "Frontage: AI Website Builder" ("Frontage" alone was taken), SKU `frontage-ios`, Apple ID `6809199627`, primary language English (U.S.) |
| Subtitle | "AI websites for your business" |
| Categories | Business, secondary Productivity |
| Content rights | No third-party content |
| Age rating | 4+ globally (questionnaire answered: no UGC visible to other users, no chat between users, no ads) |
| Subscription group | "Frontage Plans", id `22363777`, display name "Frontage Plans", app name shown as the app name |
| Starter | `com.frontage.app.starter.monthly`, Apple ID `6809201004`, $9.99/month (USD base, 175 territories), level 2, "Starter / Publish your site on frontageweb.com" |
| Business | `com.frontage.app.business.monthly`, Apple ID `6809200678`, $19.99/month, level 1 (the upgrade), "Business / Your own domain, 3 sites, no badge" |
| Introductory offers | 20% off the first month, "pay as you go" for 1 period: Starter $7.99 (eurozone set by hand to €7.99, Chile 7 990 CLP, Japan 1 200 JPY), Business $15.99 (eurozone €17.99), all countries, no end date (decided 6 Sep 2026; no free trial) |
| Server notifications | Production `https://app.frontageweb.com/api/billing/apple/notifications`, sandbox `https://app.frontageweb.com/api/billing/apple/notifications/sandbox` (version 2) |

The server and iOS code point at these values (`APPLE_APP_ID`, `APPLE_PRODUCT_*` in `server/.env`, `subscriptionGroupID` and product ids in `ios/Frontage/App/Config.swift` and `Frontage.storekit`).

## Still to do in App Store Connect

1. **Paid Applications agreement** (Business > Agreements): the Account Holder must accept it and add bank and tax details before any subscription can be sold or tested in sandbox. Nobody else can do this.
2. **Digital Services Act trader status** (Business section): required for EU availability.
3. **Small Business Program**: enroll at developer.apple.com/app-store/small-business-program before the first sale (15% commission instead of 30%).
4. **App Privacy**: all nine data types are answered (app functionality, linked to the user, no tracking), the policy URL is set and the responses were **published** on 6 Sep 2026; re-check them on the App Privacy page if the app's data use changes. **Pricing**: Free, saved. **Availability**: saved, all 175 countries or regions, "available on app release"; the Mac App Store (Apple silicon) checkbox is off on purpose until the app has been tested on a Mac. **Version 1.0 page**: description, promotional text, keywords, support and marketing URLs, copyright and review notes are filled; still needed by hand: screenshots, App Review contact (name, phone, email), the demo account sign-in, and a build.
5. **App Store Connect API key** for Codemagic (Users and Access > Integrations > App Store Connect API > Team keys): role App Manager with "Access to Certificates, Identifiers & Profiles". Download the `.p8` once and keep it; you also need the Issuer ID and Key ID.

## Building without a Mac: GitHub + Codemagic

1. Create a **private** GitHub repository (suggested name `frontage`) and push this whole folder. `.gitignore` already excludes `server/.env`, the database, uploads and the generated Xcode project. Never commit `.env`.
2. Sign in to Codemagic with GitHub, add the repository, and in **Teams > Integrations > Developer Portal** add the App Store Connect API key with the name **Frontage ASC** (the name is referenced in `codemagic.yaml`).
3. Run the `ios-testflight` workflow. It installs XcodeGen, generates the project from `ios/project.yml`, fetches or creates the distribution certificate and profile for `com.frontage.app`, builds the IPA with the next build number and uploads it to TestFlight. Every push to `main` does the same.
4. The first build usually needs one compile-fix pass because the Swift code was written without a compiler; the build log shows the exact file and line.
5. Install TestFlight on your iPhone, open the build, and test the flow against a deployed server (`Config.swift` uses `https://app.frontageweb.com` for release builds).

## Metadata

- Privacy policy URL: `https://app.frontageweb.com/privacy`. Terms (EULA) URL: `https://app.frontageweb.com/terms`. Support URL: `https://app.frontageweb.com/support`.
- Subscription disclosure in the description: name, length, price, "renews automatically unless cancelled at least 24 hours before the end of the period", "manage in Account Settings". No trial wording.
- Privacy nutrition labels: Contact info (email, name), User content (photos, business info, messages), Identifiers (user id), Purchases, all "linked to you", none used for tracking. Camera and photo library are both used for website photos, which falls under "Photos or Videos".
- Screenshots: six frames (welcome, brief, generating, chat edit, publish sheet, messages inbox) live in `store/screenshots/` (6.5" 1284x2778 and 6.9" 1290x2796) and were uploaded to the iPhone 6.5" slot of version 1.0 on 7 Sep 2026; Apple reuses them for every iPhone size. Regenerate with `store/tools/shots.mjs` (see `store/README.md`). The app is iPhone-only, so no iPad set is needed. Icon: `store/icon-1024.png`, also in the asset catalog.

## Review notes (paste into "Notes")

> Frontage builds a website for a small business from a short questionnaire and photos using AI, then hosts it at `<name>.frontageweb.com`. The first website is free to generate and preview, with 3 free AI changes; a subscription (Starter or Business, auto-renewable) is needed to keep editing and to publish. Demo account: email `review@frontageweb.com`, sign-in code `123456` (fixed for review). That account is on the Business plan (granted with `POST /api/admin/subscription`), so every feature can be checked: AI editing, manual section editing, publishing, custom domains and the messages inbox. To test the purchase flow itself, sign in with any Apple ID, which creates a fresh free account, and subscribe through the paywall with a sandbox account. Published content is moderated before going live, every hosted site has a Report link, accounts can be deleted from Settings, and AI processing happens only after in-app consent.

The fixed review code is implemented: set `REVIEW_EMAIL=review@frontageweb.com` and `REVIEW_CODE=123456` in `server/.env` (see `config.reviewLogin` and `isReviewLogin` in `server/src/auth.js`). For that address no email is sent and only the fixed code is accepted; every other address still goes through the normal one-time code. Leave both variables empty outside review periods, then the bypass is off. Seed the demo account (finished site + Starter entitlement) on production before submitting.

## Common rejection traps and how this app avoids them

| Trap | Avoided by |
|---|---|
| Buying outside IAP / mentioning cheaper web prices | No web links in the paywall except the US-only flag; no price comparisons anywhere. |
| Missing subscription terms | `PaywallView` terms sentence + Terms/Privacy links; metadata disclosure. |
| No account deletion | Settings → Delete account. |
| UGC without moderation/report | Pre-publish moderation, footer report link, admin can unpublish. |
| App is "just a website" | Native onboarding, native editing sheets, StoreKit, push, camera and photo picking. The WKWebView shows only the owner's own site preview. |
| Sign in with Apple missing | Present on the welcome screen. |
| Broken demo account | Seed it on production before submitting and log in yourself the day you submit. |
| Placeholder content | The app icon is a generated placeholder mark (`Assets.xcassets/AppIcon`); replace it with the final design. Legal pages need the company details filled in. |

## AI data consent (guideline 5.1.2(i))

Since the 2025 guideline update Apple requires explicit permission before personal data is shared with third-party AI. The app asks on the review step of onboarding (toggle, default off) and before the first chat edit; the server refuses AI calls without it and Settings › Privacy lets the owner withdraw.

## Before you press submit

- [ ] Paid Applications agreement accepted, bank and tax forms complete.
- [ ] `APPLE_ALLOW_SANDBOX=true` on the server so reviewers' sandbox purchases verify.
- [ ] `NSPhotoLibraryUsageDescription` and `NSCameraUsageDescription` texts are accurate (set in `project.yml`).
- [ ] Test on a physical device: purchase, restore, cancel in Settings, receive a push for a test lead, take a photo with the camera and attach it to an edit.
- [ ] Test account deletion end to end.
- [ ] TestFlight build tested by two people who are not you.

## Release status on 7 Sep 2026 (evening)

Done in App Store Connect: app record, metadata (description without currency-specific prices), six screenshots, icon, App Privacy, age rating, availability, subscriptions with 20% intro offers and their review screenshots (`store/subscription-review-*-1284.png`), build 1.0 (23) attached to the version, review account `review@frontageweb.com` on the Business plan with a published demo site (harbour-lane-coffee.frontageweb.com). Server live at app.frontageweb.com.

Still the Account Holder's to do before "Add for Review": sign the Paid Apps Agreement (Business > Agreements; legal entity must be confirmed first) plus banking and tax forms; complete the DSA trader compliance; fill App Review Information (sign-in `review@frontageweb.com` / `123456`, contact name, phone, email, notes); on each subscription page press "Add for Review" so they ride along with version 1.0; test build 23 on a phone; then Add for Review and submit.
