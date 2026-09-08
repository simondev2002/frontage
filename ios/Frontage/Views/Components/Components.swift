import SwiftUI

// MARK: - Buttons

struct PrimaryButtonStyle: ButtonStyle {
    var fill: Color = Theme.ink
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.body(17, weight: .semibold))
            .foregroundStyle(.white)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 16)
            .background(fill.opacity(configuration.isPressed ? 0.85 : 1), in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .scaleEffect(configuration.isPressed ? 0.985 : 1)
            .animation(.easeOut(duration: 0.12), value: configuration.isPressed)
    }
}

struct SecondaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(Theme.body(17, weight: .semibold))
            .foregroundStyle(Theme.ink)
            .frame(maxWidth: .infinity)
            .padding(.vertical, 15)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).stroke(Theme.line, lineWidth: 1.5))
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Button that runs an async action and shows a spinner while it runs.
struct AsyncButton<Label: View>: View {
    var role: ButtonRole? = nil
    var action: () async -> Void
    @ViewBuilder var label: () -> Label
    @State private var running = false

    var body: some View {
        Button(role: role) {
            guard !running else { return }
            running = true
            Task { await action(); running = false }
        } label: {
            ZStack {
                label().opacity(running ? 0 : 1)
                if running { ProgressView().tint(.white) }
            }
        }
        .disabled(running)
    }
}

// MARK: - Chips

struct Chip: View {
    var text: String
    var selected: Bool
    var action: () -> Void
    var body: some View {
        Button(action: action) {
            Text(text)
                .font(Theme.body(15, weight: .medium))
                .padding(.horizontal, 14).padding(.vertical, 9)
                .background(selected ? Theme.ink : Theme.card, in: Capsule())
                .foregroundStyle(selected ? .white : Theme.ink)
                .overlay(Capsule().stroke(selected ? Theme.ink : Theme.line))
        }
        .buttonStyle(.plain)
    }
}

/// Wrapping layout for chips.
struct FlowLayout: Layout {
    var spacing: CGFloat = 8
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, rowH: CGFloat = 0
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x + sz.width > width, x > 0 { x = 0; y += rowH + spacing; rowH = 0 }
            x += sz.width + spacing
            rowH = max(rowH, sz.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + rowH)
    }
    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        var x = bounds.minX, y = bounds.minY, rowH: CGFloat = 0
        for s in subviews {
            let sz = s.sizeThatFits(.unspecified)
            if x + sz.width > bounds.maxX, x > bounds.minX { x = bounds.minX; y += rowH + spacing; rowH = 0 }
            s.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(sz))
            x += sz.width + spacing
            rowH = max(rowH, sz.height)
        }
    }
}

// MARK: - Text pieces

struct StepHeader: View {
    var eyebrow: String
    var title: String
    var subtitle: String? = nil
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(eyebrow.uppercased()).font(Theme.body(12, weight: .bold)).tracking(1.2).foregroundStyle(Theme.coral)
            Text(title).font(Theme.display(30)).foregroundStyle(Theme.ink)
            if let subtitle { Text(subtitle).font(Theme.body(16)).foregroundStyle(Theme.muted) }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct FieldLabel: View {
    var text: String
    var body: some View { Text(text).font(Theme.body(14, weight: .semibold)).foregroundStyle(Theme.ink) }
}

struct InputField: View {
    var title: String
    var placeholder: String = ""
    @Binding var text: String
    var keyboard: UIKeyboardType = .default
    var capitalization: TextInputAutocapitalization = .sentences
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldLabel(text: title)
            TextField(placeholder, text: $text)
                .keyboardType(keyboard)
                .textInputAutocapitalization(capitalization)
                .autocorrectionDisabled(keyboard != .default)
                .padding(14)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line))
        }
    }
}

struct MultilineField: View {
    var title: String
    var placeholder: String
    @Binding var text: String
    var minHeight: CGFloat = 120
    var body: some View {
        VStack(alignment: .leading, spacing: 6) {
            FieldLabel(text: title)
            ZStack(alignment: .topLeading) {
                if text.isEmpty { Text(placeholder).foregroundStyle(Theme.muted.opacity(0.7)).padding(.horizontal, 18).padding(.vertical, 18) }
                TextEditor(text: $text)
                    .scrollContentBackground(.hidden)
                    .padding(10)
                    .frame(minHeight: minHeight)
            }
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line))
        }
    }
}

// MARK: - Overlays

struct ToastView: View {
    var text: String
    var body: some View {
        Text(text)
            .font(Theme.body(15, weight: .medium))
            .foregroundStyle(.white)
            .padding(.horizontal, 16).padding(.vertical, 12)
            .background(Theme.ink, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
            .shadow(color: .black.opacity(0.25), radius: 20, y: 10)
            .padding(.horizontal, 20)
    }
}

struct ToastModifier: ViewModifier {
    @Binding var message: String?
    func body(content: Content) -> some View {
        content.overlay(alignment: .bottom) {
            if let message {
                ToastView(text: message)
                    .padding(.bottom, 24)
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .onTapGesture { self.message = nil }
                    .task {
                        try? await Task.sleep(for: .seconds(4))
                        if self.message == message { self.message = nil }
                    }
            }
        }
        .animation(.spring(duration: 0.35), value: message)
    }
}
extension View {
    func toast(_ message: Binding<String?>) -> some View { modifier(ToastModifier(message: message)) }
}

/// Feedback for views presented as sheets. The root view's toast and paywall sit
/// behind a sheet, so a sheet that reported errors through `app.handle` showed
/// nothing. Sheets keep their own copies: call `feedback.fail(error)` in catch
/// blocks and attach `.sheetFeedback($feedback)` to the sheet's content.
struct SheetFeedback: Equatable {
    var toast: String?
    var paywall: PaywallRequest?

    mutating func fail(_ error: Error) {
        if let api = error as? APIError, let tier = api.requiredTier {
            paywall = PaywallRequest(requiredTier: tier, reason: api.errorDescription)
        } else {
            toast = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
        }
    }
}

extension View {
    func sheetFeedback(_ feedback: Binding<SheetFeedback>) -> some View {
        self.toast(feedback.toast)
            .sheet(item: feedback.paywall) { req in PaywallView(request: req) }
    }
}

struct LoadingOverlay: View {
    var text: String
    var body: some View {
        ZStack {
            Color.black.opacity(0.25).ignoresSafeArea()
            VStack(spacing: 12) {
                ProgressView().tint(Theme.ink)
                Text(text).font(Theme.body(15, weight: .medium)).foregroundStyle(Theme.ink)
            }
            .padding(24)
            .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        }
    }
}

struct PlanBadge: View {
    var tier: String
    var body: some View {
        Text(tier == "business" ? "Business" : tier == "starter" ? "Starter" : "Free preview")
            .font(Theme.body(12, weight: .bold))
            .padding(.horizontal, 10).padding(.vertical, 5)
            .background(tier == "free" ? Theme.line : Theme.green.opacity(0.12), in: Capsule())
            .foregroundStyle(tier == "free" ? Theme.muted : Theme.green)
    }
}
