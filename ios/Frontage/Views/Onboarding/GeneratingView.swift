import SwiftUI

/// Polls a generation job and keeps the owner company while the AI works.
struct GeneratingView: View {
    var jobId: String
    var onDone: (Site) -> Void
    var onRetry: () -> Void
    /// Label of the primary button after a failure. Callers whose `onRetry` only pops pass "Back".
    var retryLabel: String = "Try again"

    @Environment(AppState.self) private var app
    @State private var job: Job?
    @State private var lineIndex = 0
    @State private var failed: String?
    @State private var failedCode: String?

    private let lines = [
        "Reading everything you told us",
        "Picking fonts that suit your business",
        "Writing headlines a customer would remember",
        "Arranging your photos",
        "Checking it looks great on phones",
        "Polishing the details",
    ]

    var body: some View {
        VStack(spacing: 28) {
            Spacer()
            ZStack {
                Circle().stroke(Theme.line, lineWidth: 10).frame(width: 150, height: 150)
                Circle()
                    .trim(from: 0, to: max(0.03, job?.progress ?? 0.03))
                    .stroke(Theme.green, style: StrokeStyle(lineWidth: 10, lineCap: .round))
                    .rotationEffect(.degrees(-90))
                    .frame(width: 150, height: 150)
                    .animation(.easeInOut(duration: 0.6), value: job?.progress)
                Text("\(Int((job?.progress ?? 0) * 100))%").font(Theme.display(28))
            }
            VStack(spacing: 8) {
                Text(failed == nil ? "Building your website" : "That didn't work")
                    .font(Theme.display(28)).foregroundStyle(Theme.ink)
                Text(failed ?? job?.statusText ?? lines[lineIndex])
                    .font(Theme.body(16)).foregroundStyle(failed == nil ? Theme.muted : Theme.coral)
                    .multilineTextAlignment(.center)
                    .animation(.easeInOut, value: lineIndex)
            }
            .padding(.horizontal, 32)
            if failed == nil {
                Text("Usually takes one to two minutes. You can keep this screen open or come back later.")
                    .font(Theme.body(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.horizontal, 40)
            }
            Spacer()
            if failed != nil {
                VStack(spacing: 10) {
                    if failedCode != "not_configured" {
                        Button(retryLabel) { onRetry() }.buttonStyle(PrimaryButtonStyle(fill: Theme.green))
                    }
                    // Both buttons do the same thing; do not show "Back" twice.
                    if retryLabel != "Back" || failedCode == "not_configured" {
                        Button("Back") { onRetry() }.buttonStyle(SecondaryButtonStyle())
                    }
                }
                .padding(24)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarBackButtonHidden()
        .task { await poll() }
        .task {
            while !Task.isCancelled {
                try? await Task.sleep(for: .seconds(4))
                withAnimation { lineIndex = (lineIndex + 1) % lines.count }
            }
        }
    }

    private func poll() async {
        var failures = 0
        while !Task.isCancelled {
            do {
                let r = try await APIClient.shared.job(jobId)
                failures = 0
                job = r.job
                if r.job.status == "done" {
                    var site = r.site
                    if site == nil, let id = r.job.siteId { site = try? await APIClient.shared.site(id).site }
                    if let site {
                        app.upsert(site)
                        await app.refreshEntitlement()
                        onDone(site)
                    } else {
                        failed = "Your site was created but could not be loaded. Pull to refresh on the home screen."
                    }
                    return
                }
                if r.job.status == "failed" {
                    failed = r.job.error ?? "Something went wrong."
                    failedCode = r.job.errorCode
                    return
                }
            } catch {
                // Transient network problems: keep polling, but give up after a stretch of them
                // so the owner gets the buttons back instead of a screen with no way out.
                failures += 1
                if failures >= 10 {
                    failed = (error as? LocalizedError)?.errorDescription ?? "Can't reach Frontage. Check your connection and try again."
                    return
                }
            }
            try? await Task.sleep(for: .milliseconds(1500))
        }
    }
}
