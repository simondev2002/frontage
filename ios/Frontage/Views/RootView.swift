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

/// The logo: the app icon (a striped awning over a serif F) as a rounded tile.
struct BrandMark: View {
    var size: CGFloat = 40
    var body: some View {
        Image("BrandMark")
            .resizable()
            .interpolation(.high)
            .aspectRatio(contentMode: .fit)
            .frame(width: size, height: size)
            .clipShape(RoundedRectangle(cornerRadius: size * 0.225, style: .continuous))
            .accessibilityHidden(true)
    }
}
