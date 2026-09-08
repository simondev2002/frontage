import Foundation

/// A loosely typed JSON tree used for the site spec, which the server owns.
/// The app only needs to read a few fields and round-trip the rest untouched.
indirect enum JSONValue: Codable, Equatable, Hashable {
    case string(String)
    case number(Double)
    case bool(Bool)
    case null
    case array([JSONValue])
    case object([String: JSONValue])

    init(from decoder: Decoder) throws {
        let c = try decoder.singleValueContainer()
        if c.decodeNil() { self = .null; return }
        if let b = try? c.decode(Bool.self) { self = .bool(b); return }
        if let n = try? c.decode(Double.self) { self = .number(n); return }
        if let s = try? c.decode(String.self) { self = .string(s); return }
        if let a = try? c.decode([JSONValue].self) { self = .array(a); return }
        if let o = try? c.decode([String: JSONValue].self) { self = .object(o); return }
        throw DecodingError.dataCorruptedError(in: c, debugDescription: "Unsupported JSON value")
    }

    func encode(to encoder: Encoder) throws {
        var c = encoder.singleValueContainer()
        switch self {
        case .string(let s): try c.encode(s)
        case .number(let n):
            if n == n.rounded(), abs(n) < 1e15 { try c.encode(Int(n)) } else { try c.encode(n) }
        case .bool(let b): try c.encode(b)
        case .null: try c.encodeNil()
        case .array(let a): try c.encode(a)
        case .object(let o): try c.encode(o)
        }
    }

    subscript(key: String) -> JSONValue? {
        get { if case .object(let o) = self { return o[key] }; return nil }
        set {
            if case .object(var o) = self { o[key] = newValue; self = .object(o) }
        }
    }
    subscript(index: Int) -> JSONValue? {
        if case .array(let a) = self, a.indices.contains(index) { return a[index] }
        return nil
    }

    var stringValue: String? { if case .string(let s) = self { return s }; return nil }
    var doubleValue: Double? { if case .number(let n) = self { return n }; return nil }
    var intValue: Int? { doubleValue.map { Int($0) } }
    var boolValue: Bool? { if case .bool(let b) = self { return b }; return nil }
    var arrayValue: [JSONValue]? { if case .array(let a) = self { return a }; return nil }
    var objectValue: [String: JSONValue]? { if case .object(let o) = self { return o }; return nil }
    var isNull: Bool { if case .null = self { return true }; return false }

    /// Convenience for building small values.
    static func str(_ s: String?) -> JSONValue { s.map { .string($0) } ?? .null }
}

// MARK: - Typed views over the spec the app edits natively

struct SiteMeta: Codable, Equatable {
    struct Social: Codable, Equatable, Identifiable { var platform: String; var url: String; var id: String { platform + url } }
    struct Hours: Codable, Equatable, Identifiable { var days: String; var hours: String; var id: String { days } }
    var businessName: String
    var tagline: String
    var category: String
    var language: String
    var seoTitle: String
    var seoDescription: String
    var phone: String?
    var email: String?
    var address: String?
    var mapQuery: String?
    var bookingUrl: String?
    var socials: [Social]
    var hours: [Hours]
}

struct SiteTheme: Codable, Equatable {
    struct Colors: Codable, Equatable {
        var primary: String; var secondary: String; var accent: String
        var background: String; var surface: String; var text: String
    }
    var preset: String
    var mode: String
    var colors: Colors
    var headingFont: String
    var bodyFont: String
    var radius: String

    static let presets = ["editorial", "bold", "minimal", "warm", "luxury", "playful", "classic", "tech"]
    static let fonts = ["Inter", "Manrope", "DM Sans", "Space Grotesk", "Plus Jakarta Sans", "Outfit", "Sora", "Work Sans", "Nunito", "Poppins", "Josefin Sans", "Oswald", "Bebas Neue", "Archivo Black", "Syne", "Bricolage Grotesque", "Playfair Display", "Fraunces", "Cormorant Garamond", "Lora", "Merriweather", "Libre Baskerville", "DM Serif Display", "Instrument Serif"]
}

extension JSONValue {
    func decode<T: Decodable>(_ type: T.Type) -> T? {
        guard let data = try? JSONEncoder().encode(self) else { return nil }
        return try? JSONDecoder().decode(T.self, from: data)
    }
    static func from<T: Encodable>(_ value: T) -> JSONValue? {
        guard let data = try? JSONEncoder().encode(value) else { return nil }
        return try? JSONDecoder().decode(JSONValue.self, from: data)
    }
}
