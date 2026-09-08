import SwiftUI

struct PaywallRequest: Identifiable, Equatable {
    var id = UUID()
    var requiredTier: String        // starter | business
    var reason: String?
}

/// Global session state: who is signed in, what they are entitled to, and their sites.
@MainActor
@Observable
final class AppState {
    enum Phase { case loading, signedOut, ready }

    var phase: Phase = .loading
    var user: User?
    var entitlement: Entitlement?
    var config: ServerConfig?
    var sites: [Site] = []
    /// True once the site list has been fetched successfully; an empty list before that is "still loading", not "no sites".
    var sitesLoaded = false
    var aiAvailable = true
    var paywall: PaywallRequest?
    var toast: String?
    var pendingPushToken: String?

    private let api = APIClient.shared

    init() {
        api.onUnauthorized = { [weak self] in
            Task { @MainActor in self?.becomeSignedOut() }
        }
    }

    // MARK: Lifecycle

    func bootstrap() async {
        guard api.token != nil else { phase = .signedOut; return }
        do {
            let me = try await api.me()
            apply(me)
            let s = try await api.sites()
            sites = s.sites
            entitlement = s.entitlement
            aiAvailable = s.aiAvailable
            sitesLoaded = true
            phase = .ready
            if let t = pendingPushToken { try? await api.registerDevice(token: t); pendingPushToken = nil }
        } catch APIError.unauthorized {
            becomeSignedOut()
        } catch {
            // Offline with a cached token: still let the user in; views retry on their own.
            if api.token != nil { phase = .ready } else { phase = .signedOut }
            toast = (error as? APIError)?.errorDescription
        }
    }

    /// Loads the user, entitlement and config again after a bootstrap that failed offline (`user == nil`).
    func retryBootstrap() async {
        guard user == nil, api.token != nil else { return }
        do {
            let me = try await api.me()
            apply(me)
            if let t = pendingPushToken { try? await api.registerDevice(token: t); pendingPushToken = nil }
        } catch APIError.unauthorized {
            becomeSignedOut()
        } catch {
            toast = (error as? APIError)?.errorDescription
        }
    }

    func signedIn(_ auth: AuthResponse) async {
        api.token = auth.token
        user = auth.user
        phase = .loading
        await bootstrap()
    }

    func signOut() async {
        await api.signOut()
        becomeSignedOut()
    }

    func deleteAccount() async throws {
        try await api.deleteAccount()
        becomeSignedOut()
    }

    private func becomeSignedOut() {
        user = nil; entitlement = nil; sites = []; sitesLoaded = false; paywall = nil
        phase = .signedOut
    }

    private func apply(_ me: MeResponse) {
        user = me.user
        entitlement = me.entitlement
        config = me.config
        aiAvailable = me.config.aiAvailable
    }

    // MARK: Data

    func refreshSites() async {
        // A bootstrap that failed offline left no user/config; pick those up with the sites.
        if user == nil { await retryBootstrap() }
        do {
            let s = try await api.sites()
            sites = s.sites
            entitlement = s.entitlement
            aiAvailable = s.aiAvailable
            sitesLoaded = true
        } catch {
            if case APIError.unauthorized = error { return }
            toast = "Couldn't refresh. Check your connection."
        }
    }

    func refreshEntitlement() async {
        do { entitlement = try await api.entitlement() } catch {
            if case APIError.unauthorized = error { return }
            toast = "Couldn't refresh. Check your connection."
        }
    }

    func upsert(_ site: Site) {
        if let i = sites.firstIndex(where: { $0.id == site.id }) { sites[i] = site } else { sites.insert(site, at: 0) }
    }

    func remove(siteId: String) {
        sites.removeAll { $0.id == siteId }
    }

    // MARK: Errors -> UI

    /// Routes 402s to the paywall and everything else to a toast. Returns true if a paywall was shown.
    @discardableResult
    func handle(_ error: Error, context: String? = nil) -> Bool {
        if let api = error as? APIError, let tier = api.requiredTier {
            paywall = PaywallRequest(requiredTier: tier, reason: api.errorDescription)
            return true
        }
        if case APIError.unauthorized = error { return false }
        toast = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        return false
    }

    func showPaywall(_ tier: String = "starter", reason: String? = nil) {
        paywall = PaywallRequest(requiredTier: tier, reason: reason)
    }

    var starterPriceLabel: String { entitlement?.prices?["starter"] ?? "$9.99/month" }
    var businessPriceLabel: String { entitlement?.prices?["business"] ?? "$19.99/month" }
}
