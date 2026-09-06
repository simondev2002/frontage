import SwiftUI

/// The first-run wizard: a handful of friendly screens that produce a brief,
/// then a generation screen that hands back the finished site.
struct OnboardingFlow: View {
    enum Step: Hashable { case about, look, photos, contact, review, generating(String) }

    var onFinished: (Site) -> Void
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var draft = BriefDraft()
    @State private var path: [Step] = []
    @State private var creating = false
    @State private var error: String?
    @State private var createdSiteId: String?

    var body: some View {
        NavigationStack(path: $path) {
            NameStep(draft: draft) { path.append(.about) }
                .navigationDestination(for: Step.self) { step in
                    switch step {
                    case .about: AboutStep(draft: draft) { path.append(.look) }
                    case .look: LookStep(draft: draft) { path.append(.photos) }
                    case .photos: PhotosStep(draft: draft) { path.append(.contact) }
                    case .contact: ContactStep(draft: draft) { path.append(.review) }
                    case .review: ReviewStep(draft: draft, creating: creating, error: error) { await create() }
                    case .generating(let jobId):
                        GeneratingView(jobId: jobId, onDone: { site in onFinished(site) }, onRetry: { path.removeLast() })
                    }
                }
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { dismiss() }
                    }
                }
        }
        .tint(Theme.green)
        .interactiveDismissDisabled()
    }

    private func create() async {
        error = nil
        creating = true
        defer { creating = false }
        // Wait briefly for in-flight uploads so the AI sees every photo.
        var waited = 0
        while draft.pendingUploads && waited < 40 {
            try? await Task.sleep(for: .milliseconds(500)); waited += 1
        }
        do {
            // A retry after a failed generation re-runs the existing site instead
            // of creating a second one (which the free tier would reject).
            if let id = createdSiteId {
                let job = try await APIClient.shared.regenerate(id, brief: draft.payload())
                path.append(.generating(job.id))
            } else {
                let r = try await APIClient.shared.createSite(brief: draft.payload(), imageIds: draft.uploadedImageIds)
                createdSiteId = r.site.id
                app.upsert(r.site)
                path.append(.generating(r.job.id))
            }
        } catch {
            if !app.handle(error) { self.error = (error as? LocalizedError)?.errorDescription }
        }
    }
}

// MARK: - Shared scaffolding for steps

struct StepScaffold<Content: View>: View {
    var eyebrow: String
    var title: String
    var subtitle: String? = nil
    var cta: String = "Continue"
    var canContinue: Bool = true
    var next: () -> Void
    @ViewBuilder var content: () -> Content

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 22) {
                StepHeader(eyebrow: eyebrow, title: title, subtitle: subtitle)
                content()
                Button(action: next) { Text(cta) }
                    .buttonStyle(PrimaryButtonStyle(fill: Theme.green))
                    .disabled(!canContinue)
                    .opacity(canContinue ? 1 : 0.5)
                    .padding(.top, 8)
            }
            .padding(24)
        }
        .scrollDismissesKeyboard(.interactively)
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }
}
