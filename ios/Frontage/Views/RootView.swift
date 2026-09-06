import SwiftUI

struct RootView: View {
    @Environment(AppState.self) private var app

    var body: some View {
        @Bindable var app = app
        Group {
            switch app.phase {
            case .loading: SplashView()
            case .signedOut: WelcomeView()
            case .ready: HomeView()
            }
        }
        .toast($app.toast)
        .sheet(item: $app.paywall) { req in
            PaywallView(request: req)
        }
        .background(Theme.paper.ignoresSafeArea())
    }
}

struct SplashView: View {
    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea()
            VStack(spacing: 14) {
                BrandMark(size: 56)
                Text(AppConfig.brand).font(Theme.display(28))
                ProgressView().padding(.top, 8)
            }
        }
    }
}

/// The logo: a green tile with a coral awning stripe.
struct BrandMark: View {
    var size: CGFloat = 40
    var body: some View {
        RoundedRectangle(cornerRadius: size * 0.28, style: .continuous)
            .fill(Theme.green)
            .frame(width: size, height: size)
            .overlay(
                Capsule().fill(Theme.coral)
                    .frame(width: size * 0.5, height: size * 0.14)
                    .offset(y: -size * 0.02)
            )
    }
}
