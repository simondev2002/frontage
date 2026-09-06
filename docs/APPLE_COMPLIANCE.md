# Apple App Store compliance: research and strategy

Researched 6 September 2026. Sources at the bottom. This is the reasoning behind the billing design in this repo; re-check the court situation before launch because it is still moving.

## What the rules actually say

**3.1.1 In-App Purchase.** Unlocking features or functionality inside the app (subscriptions, premium tiers) must go through Apple's in-app purchase system. A website builder's plan unlocks features inside the app (editing, publishing), so Apple treats it as digital content, not as "services consumed outside the app" (3.1.3(e)). Trying to argue the hosting-is-outside-the-app angle is how apps get stuck in review for weeks.

**3.1.3(b) Multiplatform services.** You may let people use a subscription they bought on your website inside the app, provided the same plans are also available as in-app purchases. Netflix-style "login only, buy nothing here" is allowed too, but it kills conversion for a mobile-first product.

**3.1.1(a) United States storefront (post Epic v. Apple).** Since Apple's May 2025 guideline update, apps on the US storefront may include buttons, external links or other calls to action to purchase elsewhere, and no entitlement is required. The Ninth Circuit (December 2025) largely upheld the injunction but said Apple may charge a commission limited to costs "genuinely and reasonably necessary" for coordinating linked-out purchases; the district court still has to set that number. In May 2026 the Supreme Court declined to stay the order and on 30 June 2026 agreed to review the contempt finding. Practical status: 0% commission on linked-out purchases in the US today, with a real chance a modest commission is set later.

**Everything else that matters for this app**
- 3.1.2 Subscriptions: the paywall must show the plan name, price, period, renewal terms, and link to Terms of Use and Privacy Policy. Metadata must include those links too.
- 5.1.1(v) Account deletion must be available in-app.
- 4.8 Sign in with Apple is required if you offer other third-party logins. We offer Apple + email code, which is fine.
- 1.2 User-generated content: because customers publish public websites, Apple expects filtering of objectionable content, a way to report it, and the ability to act on reports.
- 5.1.1 Privacy policy in-app and in metadata; privacy nutrition labels; only collect what you use.
- 2.1 Provide a demo account and notes for the reviewer.

## What Lovable and the others do

Lovable's iOS app ("Lovable: Build Apps With AI", App Store id 6757471107) is listed as free with in-app purchases: they sell through IAP rather than routing around it. Wix's app (id 1545924344) and other builder apps do the same. There is no clever exemption these companies use; the "workaround" is a combination of:

1. Selling the same plans on the web (allowed by 3.1.3(b)) where there is no commission, and letting those customers use the app.
2. Charging the same or a higher price in-app than on the web to absorb Apple's cut. Apple does not require price parity.
3. Using the US external-link right where it applies.
4. Joining the App Store Small Business Program (15% instead of 30% while proceeds stay under $1M a year; new developers qualify from day one).

## What this repo implements

| Requirement | Implementation |
|---|---|
| IAP for both tiers | StoreKit 2 auto-renewable subscriptions in one group (`ios/Frontage/Services/StoreService.swift`). Server verifies every signed transaction with Apple's `app-store-server-library` and consumes App Store Server Notifications V2 (`server/src/billing/apple.js`). |
| Multiplatform (3.1.3(b)) | Optional Stripe checkout on the website (`server/src/billing/stripe.js`). Web subscribers get the same entitlements in the app. |
| US external link (3.1.1(a)) | Server flag `EXTERNAL_LINK_US=true` plus `Storefront.current.countryCode == "USA"` in the app shows an "Or subscribe on our website" button on the paywall. Off by default; turn on only after deciding you want to run web checkout. Never shown outside the US. |
| Paywall disclosures (3.1.2) | `PaywallView` shows name, price from StoreKit, monthly period, renewal sentence, Terms and Privacy links, Restore purchases. |
| Account deletion (5.1.1(v)) | Settings › Delete account → `DELETE /api/me`, which unpublishes and deletes sites, photos, leads and revokes the Sign in with Apple token when the SIWA key is configured. |
| UGC (1.2) | Haiku moderation pass before every publish, "Report" link in every hosted site's footer → `/report`, admin can unpublish (delete the site row or set status draft). |
| Privacy | `server/public/privacy.html` lists every data type and processor (Anthropic, Apple, Stripe, Resend). |
| Small Business Program | Apply in App Store Connect before the first sale; nothing in code. |

## Pricing decisions

- Starter $9.99/month and Business $19.99/month as in-app prices. Net per subscriber at 15%: $8.49 and $16.99. At 30%: $6.99 and $13.99.
- If you run web checkout, keep prices identical. A cheaper web price invites "you told users to buy elsewhere" complaints and, outside the US, you cannot mention it in the app anyway.
- No free trial at launch (decided 6 Sep 2026): the free first generation is the try-before-you-buy, and edits plus publishing need a plan. Instead, an introductory offer gives 20% off the first month (pay as you go: Starter $7.99, Business $15.99) so the first charge is small but a payment method is on file.
- Consider annual plans (e.g. $79/$159) after launch; Apple drops its commission to 15% for subscribers past their first year even outside the Small Business Program.

## Review notes to include in App Store Connect

- Demo account: create one on the production server with a finished site and a Starter subscription (use the sandbox or a promo code) and put the email + a fixed sign-in code in the notes. Add a `REVIEW_EMAIL`/`REVIEW_CODE` bypass to `auth.js` if you want a static code for reviewers.
- Explain that websites are published to `<slug>.frontageweb.com`, that content is moderated before publishing, and that a report link is on every site.
- Mention that subscriptions are managed in Settings and that the app has account deletion.

## Sources

- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Apple developer news, guideline update after the Epic order (May 2025): https://developer.apple.com/news/?id=xqk627qu
- Ninth Circuit opinion, Epic Games v. Apple, No. 25-2935 (Dec 11, 2025): https://law.justia.com/cases/federal/appellate-courts/ca9/25-2935/25-2935-2025-12-11.html
- Fenwick summary of the Ninth Circuit ruling: https://www.fenwick.com/insights/publications/ninth-circuit-largely-upholds-ruling-in-epic-v-apple
- Apple's application to the Supreme Court to stay the mandate (May 2026): https://www.supremecourt.gov/DocketPDF/25/25A1213/407958/20260504154515930_2026-05-04%20Apple-Epic%20SCT%20Application%20to%20Stay%20Mandate.pdf
- Status of US external payments in 2026: https://tiun.io/blog/ios-external-payments-us-cost-2026 and https://www.neonpay.com/blog/apple-app-store-alternative-payment-fees-what-developers-pay-in-2026
- Lovable on the App Store: https://apps.apple.com/us/app/lovable-build-apps-with-ai/id6757471107
- Wix on the App Store: https://apps.apple.com/ai/app/wix-website-builder/id1545924344
- App Store Small Business Program: https://developer.apple.com/app-store/small-business-program/ and https://www.revenuecat.com/blog/engineering/small-business-program
- Apple forum thread on 3.1.1 vs 3.1.3(b): https://developer.apple.com/forums/thread/740710
