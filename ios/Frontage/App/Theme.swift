import SwiftUI

/// Warm, confident palette. Ink text on warm paper with a deep green accent.
enum Theme {
    static let paper = Color(red: 0.965, green: 0.953, blue: 0.925)
    static let card = Color(red: 1.0, green: 0.992, blue: 0.973)
    static let ink = Color(red: 0.09, green: 0.125, blue: 0.106)
    static let muted = Color(red: 0.37, green: 0.40, blue: 0.37)
    static let green = Color(red: 0.12, green: 0.30, blue: 0.23)
    static let coral = Color(red: 0.88, green: 0.38, blue: 0.24)
    static let line = Color.black.opacity(0.09)
    static let success = Color(red: 0.16, green: 0.55, blue: 0.35)

    static func display(_ size: CGFloat, weight: Font.Weight = .semibold) -> Font {
        .system(size: size, weight: weight, design: .serif)
    }
    static func body(_ size: CGFloat = 17, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .rounded)
    }
}

extension View {
    func cardStyle(padding: CGFloat = 18) -> some View {
        self.padding(padding)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.line))
    }
}
