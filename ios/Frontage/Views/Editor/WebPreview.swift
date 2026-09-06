import SwiftUI
import WebKit

/// Shows the site preview. In desktop mode it wraps the page in a 1280px-wide
/// viewport so the owner can see the large-screen layout scaled down.
struct WebPreview: UIViewRepresentable {
    var url: URL
    var reloadToken: Int
    var desktop: Bool
    @Binding var loading: Bool

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    func makeUIView(context: Context) -> WKWebView {
        let cfg = WKWebViewConfiguration()
        cfg.allowsInlineMediaPlayback = true
        cfg.websiteDataStore = .nonPersistent()
        let web = WKWebView(frame: .zero, configuration: cfg)
        web.navigationDelegate = context.coordinator
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.backgroundColor = .white
        web.isOpaque = true
        return web
    }

    func updateUIView(_ web: WKWebView, context: Context) {
        let key = "\(url.absoluteString)|\(reloadToken)|\(desktop)"
        guard context.coordinator.lastKey != key else { return }
        context.coordinator.lastKey = key
        context.coordinator.parent = self
        loading = true
        // Cache-bust so a freshly saved version always shows.
        var comps = URLComponents(url: url, resolvingAgainstBaseURL: false)!
        comps.queryItems = (comps.queryItems ?? []) + [URLQueryItem(name: "v", value: String(reloadToken))]
        let target = comps.url ?? url
        if desktop {
            let html = """
            <!doctype html><html><head><meta name="viewport" content="width=1280"><style>html,body{margin:0;height:100%;background:#e9e7e2}iframe{width:1280px;height:100%;border:0;display:block}</style></head>
            <body><iframe src="\(target.absoluteString)"></iframe></body></html>
            """
            web.loadHTMLString(html, baseURL: url)
        } else {
            web.load(URLRequest(url: target, cachePolicy: .reloadIgnoringLocalCacheData))
        }
    }

    final class Coordinator: NSObject, WKNavigationDelegate {
        var parent: WebPreview
        var lastKey = ""
        init(_ parent: WebPreview) { self.parent = parent }

        func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { parent.loading = false }
        func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { parent.loading = false }
        func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { parent.loading = false }

        func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
            guard let url = action.request.url else { return .allow }
            // Keep the owner inside their preview; open phone/mail/external links in the system.
            if ["tel", "mailto", "sms"].contains(url.scheme ?? "") {
                await UIApplication.shared.open(url); return .cancel
            }
            if action.navigationType == .linkActivated, url.host != parent.url.host, url.host != nil {
                await UIApplication.shared.open(url); return .cancel
            }
            return .allow
        }
    }
}
