import Foundation

/// Build-time configuration. Change `apiBaseURL` for TestFlight/production.
enum AppConfig {
    /// Local dev server. On a physical device use your Mac's LAN IP, e.g. http://192.168.1.20:5150
    #if DEBUG
    static let apiBaseURL = URL(string: ProcessInfo.processInfo.environment["FRONTAGE_API"] ?? "http://localhost:5150")!
    #else
    static let apiBaseURL = URL(string: "https://app.frontageweb.com")!
    #endif

    static let brand = "Frontage"
    static let sitesDomain = "frontageweb.com"
    static let supportEmail = "hello@frontageweb.com"
    static let termsURL = apiBaseURL.appendingPathComponent("terms")
    static let privacyURL = apiBaseURL.appendingPathComponent("privacy")

    /// App Store Connect product identifiers (auto-renewable subscriptions).
    static let starterProductID = "com.frontage.app.starter.monthly"
    static let businessProductID = "com.frontage.app.business.monthly"
    static let subscriptionGroupID = "22363777"   // App Store Connect group "Frontage Plans"

    /// Longest edge for uploaded photos. Keeps uploads fast and AI vision cost bounded.
    static let maxUploadPixels: CGFloat = 2200
}
