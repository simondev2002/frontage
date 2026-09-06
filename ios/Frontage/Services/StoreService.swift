import Foundation
import StoreKit

/// StoreKit 2 subscriptions. Purchases are verified on the server: every signed
/// transaction (JWS) is posted to /api/billing/apple/transactions, and the
/// server's App Store Server Notifications keep the state current afterwards.
@MainActor
@Observable
final class StoreService {
    var products: [Product] = []
    var loading = false
    var purchasing = false
    var lastError: String?
    var storefrontCountry: String?

    private var updatesTask: Task<Void, Never>?
    private let api = APIClient.shared

    init() {
        updatesTask = Task { [weak self] in
            for await result in Transaction.updates {
                guard let self else { return }
                await self.handle(result)
            }
        }
    }

    deinit { updatesTask?.cancel() }

    var starter: Product? { products.first { $0.id == AppConfig.starterProductID } }
    var business: Product? { products.first { $0.id == AppConfig.businessProductID } }
    var isUSStorefront: Bool { storefrontCountry == "USA" }

    func load() async {
        guard products.isEmpty, !loading else { return }
        loading = true
        defer { loading = false }
        do {
            products = try await Product.products(for: [AppConfig.starterProductID, AppConfig.businessProductID])
                .sorted { $0.price < $1.price }
            storefrontCountry = await Storefront.current?.countryCode
        } catch {
            lastError = "Could not load plans. Please try again."
        }
    }

    /// Returns the updated entitlement from the server, or nil if the user cancelled.
    func purchase(_ product: Product, userId: String) async throws -> Entitlement? {
        purchasing = true
        defer { purchasing = false }
        var options: Set<Product.PurchaseOption> = []
        if let uuid = UUID(uuidString: userId) { options.insert(.appAccountToken(uuid)) }
        let result = try await product.purchase(options: options)
        switch result {
        case .success(let verification):
            let entitlement = try await api.sendTransactions([verification.jwsRepresentation])
            if case .verified(let tx) = verification { await tx.finish() }
            return entitlement
        case .userCancelled:
            return nil
        case .pending:
            // Ask to Buy / SCA: the transaction arrives later via Transaction.updates.
            return nil
        @unknown default:
            return nil
        }
    }

    /// Re-syncs with the App Store (restores purchases) and pushes current entitlements to the server.
    func restore() async throws -> Entitlement? {
        try await AppStore.sync()
        return try await syncEntitlements()
    }

    /// Sends all current entitlements to the server; call on launch after sign-in.
    @discardableResult
    func syncEntitlements() async throws -> Entitlement? {
        var jws: [String] = []
        for await result in Transaction.currentEntitlements {
            jws.append(result.jwsRepresentation)
        }
        guard !jws.isEmpty else { return nil }
        return try await api.sendTransactions(jws)
    }

    private func handle(_ result: VerificationResult<Transaction>) async {
        if api.token != nil {
            _ = try? await api.sendTransactions([result.jwsRepresentation])
        }
        if case .verified(let tx) = result { await tx.finish() }
    }

    // MARK: Display helpers

    static func introOfferText(_ product: Product) -> String? {
        guard let offer = product.subscription?.introductoryOffer else { return nil }
        let period = offer.period
        let unit: String
        switch period.unit {
        case .day: unit = period.value == 1 ? "day" : "days"
        case .week: unit = period.value == 1 ? "week" : "weeks"
        case .month: unit = period.value == 1 ? "month" : "months"
        case .year: unit = period.value == 1 ? "year" : "years"
        @unknown default: unit = "period"
        }
        switch offer.paymentMode {
        case .freeTrial: return "\(period.value) \(unit) free, then \(product.displayPrice)/month"
        case .payAsYouGo:
            // Launch offer: 20% off the first month, then the regular price.
            if period.value == 1 && period.unit == .month { return "First month \(offer.displayPrice), then \(product.displayPrice)/month" }
            return "\(offer.displayPrice)/month for \(period.value) \(unit), then \(product.displayPrice)/month"
        case .payUpFront: return "\(offer.displayPrice) for the first \(period.value) \(unit), then \(product.displayPrice)/month"
        default: return nil
        }
    }
}
