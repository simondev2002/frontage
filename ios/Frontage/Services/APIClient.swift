import Foundation
import UIKit

/// Thin async client for the Frontage API. All calls carry the bearer token
/// stored in the Keychain; 401 clears it so the app returns to sign-in.
final class APIClient {
    static let shared = APIClient()

    private let session: URLSession
    private let decoder = JSONDecoder()
    private let encoder = JSONEncoder()
    var onUnauthorized: (() -> Void)?

    var token: String? {
        get { Keychain.read("session") }
        set { if let v = newValue { Keychain.write("session", v) } else { Keychain.delete("session") } }
    }

    init() {
        let cfg = URLSessionConfiguration.default
        cfg.timeoutIntervalForRequest = 60
        cfg.waitsForConnectivity = true
        session = URLSession(configuration: cfg)
    }

    // MARK: Core

    private func request(_ method: String, _ path: String, query: [String: String] = [:], body: Data? = nil, contentType: String? = nil, auth: Bool = true) async throws -> (Data, HTTPURLResponse) {
        var comps = URLComponents(url: AppConfig.apiBaseURL.appendingPathComponent(path), resolvingAgainstBaseURL: false)!
        if !query.isEmpty { comps.queryItems = query.map { URLQueryItem(name: $0.key, value: $0.value) } }
        var req = URLRequest(url: comps.url!)
        req.httpMethod = method
        if auth, let t = token { req.setValue("Bearer \(t)", forHTTPHeaderField: "Authorization") }
        if let body { req.httpBody = body; req.setValue(contentType ?? "application/json", forHTTPHeaderField: "Content-Type") }
        req.setValue("Frontage-iOS/\(Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1")", forHTTPHeaderField: "User-Agent")
        do {
            let (data, resp) = try await session.data(for: req)
            guard let http = resp as? HTTPURLResponse else { throw APIError.decoding(URLError(.badServerResponse)) }
            if http.statusCode == 401 && auth {
                token = nil
                await MainActor.run { onUnauthorized?() }
                throw APIError.unauthorized
            }
            if http.statusCode >= 400 {
                throw APIError.http(status: http.statusCode, body: try? decoder.decode(APIErrorBody.self, from: data))
            }
            return (data, http)
        } catch let e as APIError { throw e } catch { throw APIError.network(error) }
    }

    private func json<T: Decodable>(_ method: String, _ path: String, query: [String: String] = [:], body: Encodable? = nil, auth: Bool = true) async throws -> T {
        let data = try body.map { try encoder.encode(AnyEncodable($0)) }
        let (out, _) = try await request(method, path, query: query, body: data, auth: auth)
        do { return try decoder.decode(T.self, from: out) } catch { throw APIError.decoding(error) }
    }

    // MARK: Auth

    func signInWithApple(identityToken: String, authorizationCode: String?, givenName: String?, familyName: String?, nonce: String?) async throws -> AuthResponse {
        var dict: [String: Any] = ["identityToken": identityToken, "device": UIDevice.current.model,
                                   "fullName": ["givenName": givenName ?? "", "familyName": familyName ?? ""]]
        if let authorizationCode { dict["authorizationCode"] = authorizationCode }
        if let nonce { dict["nonce"] = nonce }
        let data = try JSONSerialization.data(withJSONObject: dict)
        let (out, _) = try await request("POST", "api/auth/apple", body: data, auth: false)
        return try decoder.decode(AuthResponse.self, from: out)
    }
    func startEmailSignIn(email: String) async throws -> (email: String, devCode: String?) {
        struct R: Decodable { var email: String; var devCode: String? }
        let r: R = try await json("POST", "api/auth/email/start", body: ["email": email], auth: false)
        return (r.email, r.devCode)
    }
    func verifyEmailCode(email: String, code: String) async throws -> AuthResponse {
        try await json("POST", "api/auth/email/verify", body: ["email": email, "code": code, "device": UIDevice.current.model], auth: false)
    }
    func signOut() async { _ = try? await request("POST", "api/auth/signout"); token = nil }
    func deleteAccount() async throws { _ = try await request("DELETE", "api/me"); token = nil }
    func me() async throws -> MeResponse { try await json("GET", "api/me") }
    func registerDevice(token: String) async throws {
        #if DEBUG
        let env = "sandbox"
        #else
        let env = "production"
        #endif
        _ = try await request("POST", "api/devices", body: try encoder.encode(["token": token, "environment": env]))
    }

    // MARK: Sites

    func sites() async throws -> SitesResponse { try await json("GET", "api/sites") }
    func site(_ id: String) async throws -> SiteResponse { try await json("GET", "api/sites/\(id)") }
    /// Records (or withdraws) the owner's permission to send their data to the AI provider.
    func setAiConsent(_ consent: Bool) async throws -> User {
        struct R: Decodable { var user: User }
        let r: R = try await json("POST", "api/me/ai-consent", body: ["consent": consent]); return r.user
    }
    func createSite(brief: BriefPayload, imageIds: [String]) async throws -> CreateSiteResponse {
        try await json("POST", "api/sites", body: CreateSiteBody(brief: brief, imageIds: imageIds, aiConsent: true))
    }
    func regenerate(_ id: String, brief: BriefPayload?, differentLook: Bool = false) async throws -> Job {
        struct R: Decodable { var job: Job }
        struct Body: Encodable { var brief: BriefPayload?; var differentLook: Bool; var aiConsent: Bool }
        let r: R = try await json("POST", "api/sites/\(id)/generate", body: Body(brief: brief, differentLook: differentLook, aiConsent: true))
        return r.job
    }
    func edit(_ id: String, instruction: String, imageIds: [String] = []) async throws -> Job {
        struct R: Decodable { var job: Job }
        struct Body: Encodable { var instruction: String; var imageIds: [String]; var aiConsent: Bool }
        let r: R = try await json("POST", "api/sites/\(id)/edit", body: Body(instruction: instruction, imageIds: imageIds, aiConsent: true))
        return r.job
    }
    func job(_ id: String) async throws -> JobResponse { try await json("GET", "api/jobs/\(id)") }
    func messages(_ siteId: String) async throws -> [ChatMessage] {
        struct R: Decodable { var messages: [ChatMessage] }
        let r: R = try await json("GET", "api/sites/\(siteId)/messages"); return r.messages
    }
    func versions(_ siteId: String) async throws -> [SiteVersion] {
        struct R: Decodable { var versions: [SiteVersion] }
        let r: R = try await json("GET", "api/sites/\(siteId)/versions"); return r.versions
    }
    func restore(_ siteId: String, version: Int) async throws -> Site {
        let r: SiteResponse = try await json("POST", "api/sites/\(siteId)/versions/\(version)/restore"); return r.site
    }
    func updateSpec(_ siteId: String, spec: JSONValue, summary: String) async throws -> Site {
        let r: SiteResponse = try await json("PUT", "api/sites/\(siteId)/spec", body: SpecBody(spec: spec, summary: summary)); return r.site
    }
    func updateSite(_ siteId: String, name: String? = nil, slug: String? = nil) async throws -> Site {
        var b: [String: String] = [:]
        if let name { b["name"] = name }
        if let slug { b["slug"] = slug }
        let r: SiteResponse = try await json("PATCH", "api/sites/\(siteId)", body: b); return r.site
    }
    func slugCheck(_ slug: String, siteId: String) async throws -> SlugCheck { try await json("GET", "api/slug-check", query: ["slug": slug, "site": siteId]) }
    func deleteSite(_ id: String) async throws { _ = try await request("DELETE", "api/sites/\(id)") }
    func publish(_ id: String) async throws -> Site { let r: SiteResponse = try await json("POST", "api/sites/\(id)/publish"); return r.site }
    func unpublish(_ id: String) async throws -> Site { let r: SiteResponse = try await json("POST", "api/sites/\(id)/unpublish"); return r.site }

    // MARK: Domains

    func domain(_ siteId: String) async throws -> DomainInfo { try await json("GET", "api/sites/\(siteId)/domain") }
    func setDomain(_ siteId: String, domain: String) async throws -> (Site, [DNSRecord], DomainProvider?) {
        struct R: Decodable { var site: Site; var records: [DNSRecord]; var provider: DomainProvider? }
        let r: R = try await json("PUT", "api/sites/\(siteId)/domain", body: ["domain": domain]); return (r.site, r.records, r.provider)
    }
    func verifyDomain(_ siteId: String) async throws -> DomainVerifyResponse { try await json("POST", "api/sites/\(siteId)/domain/verify") }
    func removeDomain(_ siteId: String) async throws -> Site { let r: SiteResponse = try await json("DELETE", "api/sites/\(siteId)/domain"); return r.site }

    // MARK: Leads

    func leads(_ siteId: String) async throws -> (leads: [Lead], unread: Int) {
        struct R: Decodable { var leads: [Lead]; var unread: Int }
        let r: R = try await json("GET", "api/sites/\(siteId)/leads"); return (r.leads, r.unread)
    }
    func markLeadRead(_ id: Int) async throws { _ = try await request("POST", "api/leads/\(id)/read") }
    func deleteLead(_ id: Int) async throws { _ = try await request("DELETE", "api/leads/\(id)") }

    // MARK: Images

    func uploadImage(jpeg: Data, siteId: String?, kind: String, caption: String) async throws -> ImageAsset {
        struct R: Decodable { var image: ImageAsset }
        var q = ["kind": kind, "caption": caption]
        if let siteId { q["site"] = siteId }
        let (out, _) = try await request("POST", "api/images", query: q, body: jpeg, contentType: "image/jpeg")
        return try decoder.decode(R.self, from: out).image
    }
    func deleteImage(_ id: String) async throws { _ = try await request("DELETE", "api/images/\(id)") }
    func updateImage(_ id: String, caption: String?, kind: String?, siteId: String?) async throws -> ImageAsset {
        struct R: Decodable { var image: ImageAsset }
        var b: [String: String] = [:]
        if let caption { b["caption"] = caption }
        if let kind { b["kind"] = kind }
        if let siteId { b["siteId"] = siteId }
        let r: R = try await json("PATCH", "api/images/\(id)", body: b); return r.image
    }

    // MARK: Billing

    func sendTransactions(_ jws: [String]) async throws -> Entitlement {
        struct R: Decodable { var entitlement: Entitlement }
        let r: R = try await json("POST", "api/billing/apple/transactions", body: ["transactions": jws]); return r.entitlement
    }
    func entitlement() async throws -> Entitlement {
        struct R: Decodable { var entitlement: Entitlement }
        let r: R = try await json("GET", "api/billing/entitlement"); return r.entitlement
    }
    func webCheckoutLink(tier: String) async throws -> URL {
        struct R: Decodable { var url: String }
        let r: R = try await json("POST", "api/billing/stripe/link", body: ["tier": tier]); return URL(string: r.url)!
    }
    #if DEBUG
    func devSubscription(tier: String?) async throws -> Entitlement {
        struct R: Decodable { var entitlement: Entitlement }
        let r: R = try await json("POST", "api/dev/subscription", body: ["tier": tier]); return r.entitlement
    }
    #endif
}

// MARK: - Bodies

struct CreateSiteBody: Encodable { var brief: BriefPayload; var imageIds: [String]; var aiConsent: Bool }
struct SpecBody: Encodable { var spec: JSONValue; var summary: String }

struct AnyEncodable: Encodable {
    private let encodeFn: (Encoder) throws -> Void
    init(_ value: Encodable) { encodeFn = value.encode }
    func encode(to encoder: Encoder) throws { try encodeFn(encoder) }
}
