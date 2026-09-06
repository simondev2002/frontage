import Foundation

// MARK: - Account

struct User: Codable, Equatable {
    var id: String
    var email: String?
    var name: String?
    var createdAt: Int?
    var hasApple: Bool?
    /// When the owner agreed to AI processing of their data (guideline 5.1.2(i)); nil until they do.
    var aiConsentAt: Int?
}

struct Entitlement: Codable, Equatable {
    struct Plan: Codable, Equatable {
        var name: String
        var sites: Int
        var editsPerMonth: Int
        var generations: Int
        var generationsPeriod: String
        var publish: Bool
        var customDomain: Bool
        var badge: Bool
    }
    struct Usage: Codable, Equatable { var month: String; var generations: Int; var edits: Int; var sites: Int }
    struct Remaining: Codable, Equatable { var edits: Int; var generations: Int; var sites: Int }
    struct Subscription: Codable, Equatable {
        var provider: String
        var productId: String?
        var status: String
        var expiresAt: Int?
        var autoRenew: Bool
        var environment: String?
    }
    var tier: String
    var plan: Plan
    var usage: Usage
    var remaining: Remaining
    var subscription: Subscription?
    var prices: [String: String]?

    var isPaid: Bool { tier != "free" }
    var isBusiness: Bool { tier == "business" }
}

struct ServerConfig: Codable, Equatable {
    var brand: String
    var sitesDomain: String
    var supportEmail: String
    var termsUrl: String
    var privacyUrl: String
    var products: [ProductRef]
    var externalLinkUS: Bool
    var aiAvailable: Bool
}
struct ProductRef: Codable, Equatable { var productId: String; var tier: String }

struct MeResponse: Codable {
    var user: User
    var entitlement: Entitlement
    var config: ServerConfig
}

struct AuthResponse: Codable {
    var token: String
    var user: User
}

// MARK: - Sites

struct SiteURLs: Codable, Equatable {
    var preview: String
    var subdomain: String?
    var custom: String?
    var live: String?
}

struct ImageAsset: Codable, Equatable, Identifiable, Hashable {
    var id: String
    var url: String
    var width: Int?
    var height: Int?
    var caption: String
    var kind: String
    var createdAt: Int?

    var absoluteURL: URL { URL(string: url, relativeTo: AppConfig.apiBaseURL)!.absoluteURL }
}

struct Suggestion: Codable, Equatable, Identifiable {
    var label: String
    var instruction: String
    var action: String?
    var id: String { label }
    /// Suggestions that need the owner's own words open in the composer instead of sending.
    var needsInput: Bool { instruction.hasSuffix("\"\"") || instruction.hasSuffix("https://") }
}
struct SiteStats: Codable, Equatable { var week: Int; var month: Int }

struct Site: Codable, Equatable, Identifiable {
    var id: String
    var name: String
    var slug: String?
    var status: String
    var createdAt: Int
    var updatedAt: Int
    var publishedAt: Int?
    var customDomain: String?
    var customDomainStatus: String?
    var urls: SiteURLs
    var hasSpec: Bool
    var spec: JSONValue?
    var unreadLeads: Int?
    var paused: Bool?
    var suspended: Bool?
    var suspendedReason: String?
    var stats: SiteStats?
    var suggestions: [Suggestion]?
    var images: [ImageAsset]?

    var isPublished: Bool { status == "published" }
    var isPaused: Bool { paused == true }
    var previewURL: URL { URL(string: urls.preview)! }
    var liveURL: URL? { urls.live.flatMap(URL.init(string:)) }
}

struct SitesResponse: Codable {
    var sites: [Site]
    var entitlement: Entitlement
    var aiAvailable: Bool
}
struct SiteResponse: Codable {
    var site: Site
    var entitlement: Entitlement?
}

struct Job: Codable, Equatable, Identifiable {
    var id: String
    var siteId: String?
    var type: String
    var status: String
    var progress: Double
    var statusText: String?
    var result: JSONValue?
    var error: String?

    var isFinished: Bool { status == "done" || status == "failed" }
    var errorCode: String? { result?["code"]?.stringValue }
}
struct JobResponse: Codable {
    var job: Job
    var site: Site?
}
struct CreateSiteResponse: Codable {
    var site: Site
    var job: Job
}

struct ChatMessage: Codable, Identifiable, Equatable {
    var id: Int
    var role: String
    var content: String
    var versionId: Int?
    var createdAt: Int
}

struct SiteVersion: Codable, Identifiable, Equatable {
    var id: Int
    var summary: String?
    var source: String
    var createdAt: Int
}

struct Lead: Codable, Identifiable, Equatable {
    var id: Int
    var siteId: String
    var name: String?
    var email: String?
    var phone: String?
    var message: String?
    var createdAt: Int
    var readAt: Int?
}

struct DNSRecord: Codable, Identifiable, Equatable {
    var type: String
    var host: String
    var value: String
    var note: String?
    var id: String { type + host + value }
}
/// Who manages the domain's DNS (from its nameservers) and where to add records.
struct DomainProvider: Codable, Equatable {
    var name: String?
    var dnsUrl: String?
    var nameservers: [String]?
}
struct DomainInfo: Codable, Equatable {
    var domain: String?
    var status: String?
    var records: [DNSRecord]?
    var checkedAt: Int?
    var provider: DomainProvider?
}
struct DomainVerifyResponse: Codable {
    var status: String
    var checks: [String: Bool]?
    var records: [DNSRecord]?
    var provider: DomainProvider?
    var site: Site
}
struct SlugCheck: Codable {
    var slug: String?
    var available: Bool
    var domain: String
}

// MARK: - Errors

struct APIErrorBody: Codable {
    var error: String
    var message: String
    var requiredTier: String?
    var currentTier: String?
}

enum APIError: LocalizedError {
    case http(status: Int, body: APIErrorBody?)
    case network(Error)
    case decoding(Error)
    case unauthorized

    var errorDescription: String? {
        switch self {
        case .http(_, let body): return body?.message ?? "Something went wrong. Please try again."
        case .network: return "Can't reach Frontage. Check your connection and try again."
        case .decoding: return "Unexpected response from the server."
        case .unauthorized: return "Please sign in again."
        }
    }
    var code: String? {
        if case .http(_, let body) = self { return body?.error }
        return nil
    }
    /// 402: the server wants the user to upgrade to this tier.
    var requiredTier: String? {
        if case .http(let status, let body) = self, status == 402 { return body?.requiredTier ?? "starter" }
        return nil
    }
}

extension Int {
    var asDate: Date { Date(timeIntervalSince1970: TimeInterval(self) / 1000) }
}
