import SwiftUI
import StoreKit

/// Subscription paywall. Meets App Store guideline 3.1.2: shows each plan's
/// name, price, period, auto-renewal terms and links to Terms and Privacy.
struct PaywallView: View {
    var request: PaywallRequest
    @Environment(AppState.self) private var app
    @Environment(StoreService.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var tier = "starter"
    @State private var error: String?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    StepHeader(eyebrow: "Plans", title: request.requiredTier == "business" ? "Go Business" : "Publish your website",
                               subtitle: request.reason ?? "Pick the plan that fits. Cancel any time.")

                    planCard(tier: "starter", product: store.starter, fallback: app.starterPriceLabel,
                             features: ["Your website built and hosted", "Live at your-business.\(app.config?.sitesDomain ?? AppConfig.sitesDomain)", "150 AI changes a month", "Contact form with messages in the app", "Fast, mobile-friendly, search-ready"])
                    planCard(tier: "business", product: store.business, fallback: app.businessPriceLabel,
                             features: ["Everything in Starter", "Your own domain (mybusiness.com)", "No Frontage badge", "Up to 3 websites", "400 AI changes a month"])

                    if let error { Text(error).font(Theme.body(14)).foregroundStyle(Theme.coral) }

                    AsyncButton { await subscribe() } label: {
                        Text(ctaText)
                    }
                    .buttonStyle(PrimaryButtonStyle(fill: Theme.green))
                    .disabled(store.purchasing || (selectedProduct == nil && !store.products.isEmpty))

                    if app.config?.externalLinkUS == true && store.isUSStorefront {
                        AsyncButton { await webCheckout() } label: { Text("Or subscribe on our website") }
                            .buttonStyle(SecondaryButtonStyle())
                    }

                    VStack(alignment: .leading, spacing: 6) {
                        Text(termsText).font(Theme.body(12)).foregroundStyle(Theme.muted)
                        HStack(spacing: 14) {
                            Link("Terms of Use", destination: URL(string: app.config?.termsUrl ?? AppConfig.termsURL.absoluteString)!)
                            Link("Privacy Policy", destination: URL(string: app.config?.privacyUrl ?? AppConfig.privacyURL.absoluteString)!)
                            Button("Restore purchases") { Task { await restore() } }
                        }
                        .font(Theme.body(12, weight: .semibold))
                    }
                    .padding(.top, 4)
                }
                .padding(24)
            }
            .background(Theme.paper.ignoresSafeArea())
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Not now") { dismiss() } }
            }
            .task {
                tier = request.requiredTier
                await store.load()
            }
        }
    }

    private var selectedProduct: Product? { tier == "business" ? store.business : store.starter }

    private var ctaText: String {
        if let p = selectedProduct {
            if let offer = p.subscription?.introductoryOffer, let intro = StoreService.introOfferText(p) {
                switch offer.paymentMode {
                case .freeTrial: return "Start free trial · \(intro)"
                case .payAsYouGo, .payUpFront: return "Subscribe · \(offer.displayPrice) first month"
                default: break
                }
            }
            return "Subscribe for \(p.displayPrice)/month"
        }
        return store.loading ? "Loading plans…" : "Subscribe"
    }

    private var termsText: String {
        let price = selectedProduct?.displayPrice ?? (tier == "business" ? app.businessPriceLabel : app.starterPriceLabel)
        return "\(tier == "business" ? "Business" : "Starter") is a monthly subscription (\(price) per month) billed to your Apple ID. It renews automatically until cancelled at least 24 hours before the end of the current period. Manage or cancel in Settings › Apple ID › Subscriptions."
    }

    @ViewBuilder
    private func planCard(tier t: String, product: Product?, fallback: String, features: [String]) -> some View {
        let on = tier == t
        Button { tier = t } label: {
            VStack(alignment: .leading, spacing: 10) {
                HStack {
                    Text(t == "business" ? "Business" : "Starter").font(Theme.display(22))
                    Spacer()
                    Image(systemName: on ? "checkmark.circle.fill" : "circle").foregroundStyle(on ? Theme.green : Theme.muted).font(.title3)
                }
                HStack(alignment: .firstTextBaseline, spacing: 4) {
                    Text(product?.displayPrice ?? fallback.replacingOccurrences(of: "/month", with: "")).font(Theme.display(30))
                    Text("/ month").font(Theme.body(14)).foregroundStyle(Theme.muted)
                }
                if let p = product, let intro = StoreService.introOfferText(p) {
                    Text(intro).font(Theme.body(13, weight: .semibold)).foregroundStyle(Theme.coral)
                }
                VStack(alignment: .leading, spacing: 6) {
                    ForEach(features, id: \.self) { f in
                        HStack(alignment: .top, spacing: 8) {
                            Image(systemName: "checkmark").font(.caption.bold()).foregroundStyle(Theme.green).padding(.top, 3)
                            Text(f).font(Theme.body(14)).foregroundStyle(Theme.ink)
                        }
                    }
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(18)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(on ? Theme.green : Theme.line, lineWidth: on ? 2 : 1))
        }
        .buttonStyle(.plain)
    }

    private func subscribe() async {
        error = nil
        guard let product = selectedProduct else {
            await store.load()
            if store.products.isEmpty { error = store.lastError ?? "Plans are not available right now. Please try again shortly." }
            return
        }
        guard let userId = app.user?.id else { return }
        do {
            if let e = try await store.purchase(product, userId: userId) {
                app.entitlement = e
                app.toast = "You're on \(e.plan.name). Thank you!"
                dismiss()
            }
        } catch {
            self.error = "The purchase didn't complete. \((error as? LocalizedError)?.errorDescription ?? "")"
        }
    }

    private func restore() async {
        do {
            if let e = try await store.restore(), e.isPaid { app.entitlement = e; dismiss() } else { error = "No active subscription found for this Apple ID." }
        } catch { self.error = "Could not restore purchases." }
    }

    private func webCheckout() async {
        do {
            let url = try await APIClient.shared.webCheckoutLink(tier: tier)
            await UIApplication.shared.open(url)
        } catch { app.handle(error) }
    }
}
