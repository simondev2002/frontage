import SwiftUI

struct HomeView: View {
    @Environment(AppState.self) private var app
    @State private var showOnboarding = false
    @State private var showSettings = false
    @State private var openSiteId: String?
    @State private var leadsSiteId: String?
    @State private var retryJob: Job?
    /// Site whose rebuild request is in flight (its card shows a spinner and is disabled meanwhile).
    @State private var starting: String?
    /// Set by the onboarding flow; the editor opens from the cover's onDismiss, not in the same update as the dismissal.
    @State private var onboardedSiteId: String?

    /// Opens the editor, or rebuilds a site whose first generation failed.
    private func open(_ site: Site) {
        if site.hasSpec { openSiteId = site.id; return }
        guard starting == nil else { return }
        starting = site.id
        Task {
            do { retryJob = try await APIClient.shared.regenerate(site.id, brief: nil) }
            catch { app.handle(error) }
            starting = nil
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if app.sitesLoaded && app.sites.isEmpty {
                    EmptyHome { showOnboarding = true }
                } else if app.sites.isEmpty {
                    // The list has not loaded yet (or the app started offline): never show the "first site" pitch here.
                    VStack(spacing: 14) {
                        ProgressView()
                        Text("Loading your websites").font(Theme.body(14)).foregroundStyle(Theme.muted)
                        AsyncButton { await app.refreshSites() } label: { Text("Retry") }
                            .buttonStyle(SecondaryButtonStyle())
                            .frame(maxWidth: 160)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                } else {
                    siteList
                }
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Your websites")
            .navigationBarTitleDisplayMode(.large)
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button { showSettings = true } label: { Image(systemName: "person.crop.circle") }
                }
            }
            .navigationDestination(item: $openSiteId) { id in SiteEditorView(siteId: id) }
            .navigationDestination(item: $leadsSiteId) { id in LeadsView(siteId: id) }
            .navigationDestination(item: $retryJob) { job in
                GeneratingView(jobId: job.id, onDone: { site in retryJob = nil; app.upsert(site); openSiteId = site.id }, onRetry: { retryJob = nil }, retryLabel: "Back")
            }
        }
        .fullScreenCover(isPresented: $showOnboarding, onDismiss: {
            guard let id = onboardedSiteId else { return }
            onboardedSiteId = nil
            openSiteId = id
            AppDelegate.requestPushPermission()
        }) {
            OnboardingFlow { site in
                onboardedSiteId = site.id
                app.upsert(site)
                showOnboarding = false
            }
        }
        .sheet(isPresented: $showSettings) { SettingsView() }
        .onReceive(NotificationCenter.default.publisher(for: .openLeads)) { note in
            if let id = note.object as? String { leadsSiteId = id }
        }
        .refreshable { await app.refreshSites() }
    }

    private var siteList: some View {
        ScrollView {
            VStack(spacing: 14) {
                ForEach(app.sites) { site in
                    Button { open(site) } label: { SiteCard(site: site) }
                        .buttonStyle(.plain)
                        .disabled(starting == site.id)
                        .overlay { if starting == site.id { ProgressView().padding(14).background(.ultraThinMaterial, in: Circle()) } }
                }
                AsyncButton {
                    // The cached count can be stale (a site deleted moments ago), so
                    // confirm with the server before telling the owner no.
                    let blocked = { (app.entitlement?.remaining.sites ?? 0) <= 0 || (app.entitlement?.remaining.generations ?? 0) <= 0 }
                    if blocked() { await app.refreshEntitlement() }
                    let n = app.entitlement?.plan.sites ?? 1
                    let plural = "\(n) website\(n == 1 ? "" : "s")"
                    // A site slot alone is not enough: building it also needs a generation left,
                    // otherwise the owner fills in five steps and hits a wall at the end.
                    let noGeneration = (app.entitlement?.remaining.sites ?? 0) > 0 && (app.entitlement?.remaining.generations ?? 0) <= 0
                    if !blocked() {
                        showOnboarding = true
                    } else if app.entitlement?.isBusiness == true {
                        app.toast = noGeneration ? "You have used this month's website generations. They reset next month." : "Your plan includes \(plural). Delete one to add another."
                    } else if app.entitlement?.isPaid == true {
                        app.showPaywall("business", reason: noGeneration ? "You have used this month's website generations. Business includes more." : "Your plan includes \(plural). Upgrade to add another.")
                    } else {
                        app.showPaywall("starter", reason: noGeneration ? "Your first website was free. Subscribe to build another." : "Your plan includes \(plural). Upgrade to add another.")
                    }
                } label: {
                    Label("New website", systemImage: "plus")
                }
                .buttonStyle(SecondaryButtonStyle())
                .padding(.top, 6)

                if let e = app.entitlement, e.tier == "free" {
                    Text("Your first website is free to preview. Subscribe to make changes and publish it.")
                        .font(Theme.body(14)).foregroundStyle(Theme.muted)
                        .frame(maxWidth: .infinity, alignment: .center)
                }
            }
            .padding(20)
        }
    }
}

struct SiteCard: View {
    var site: Site
    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text(site.name).font(Theme.display(22)).foregroundStyle(Theme.ink)
                Spacer()
                if let n = site.unreadLeads, n > 0 {
                    Text("\(n)").font(Theme.body(12, weight: .bold)).foregroundStyle(.white)
                        .padding(.horizontal, 8).padding(.vertical, 4).background(Theme.coral, in: Capsule())
                }
                Image(systemName: "chevron.right").foregroundStyle(Theme.muted)
            }
            HStack(spacing: 8) {
                Circle().fill(site.isPublished ? Theme.success : Theme.muted.opacity(0.5)).frame(width: 8, height: 8)
                Text(site.isPaused ? "Paused" : site.isPublished ? "Live" : (site.hasSpec ? "Draft" : "Not built yet · tap to build"))
                    .font(Theme.body(14, weight: .medium)).foregroundStyle(site.isPublished ? Theme.success : Theme.muted)
                if let live = site.urls.live ?? site.urls.subdomain {
                    Text(live.replacingOccurrences(of: "https://", with: "").replacingOccurrences(of: "http://", with: ""))
                        .font(Theme.body(14)).foregroundStyle(Theme.muted).lineLimit(1)
                }
            }
            if site.isPublished, let st = site.stats {
                Text("\(st.week) visit\(st.week == 1 ? "" : "s") this week · \(st.month) this month")
                    .font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
        }
        .cardStyle()
    }
}

struct EmptyHome: View {
    var start: () -> Void
    var body: some View {
        VStack(alignment: .leading, spacing: 18) {
            Spacer()
            Text("Your first website is on us.")
                .font(Theme.display(36)).foregroundStyle(Theme.ink)
            Text("Free, and about ten minutes: answer a few questions, add photos, and we do the rest. Subscribe only when you want changes or to go live.")
                .font(Theme.body(17)).foregroundStyle(Theme.muted)
            VStack(alignment: .leading, spacing: 12) {
                step(1, "Tell us about your business")
                step(2, "Add photos and pick a look")
                step(3, "Get a finished site, then change anything by asking")
            }
            .padding(.vertical, 8)
            Spacer()
            Button(action: start) { Text("Build my free website") }.buttonStyle(PrimaryButtonStyle(fill: Theme.green))
        }
        .padding(24)
    }
    private func step(_ n: Int, _ text: String) -> some View {
        HStack(spacing: 12) {
            Text("\(n)").font(Theme.display(15)).foregroundStyle(.white).frame(width: 28, height: 28).background(Theme.ink, in: Circle())
            Text(text).font(Theme.body(16)).foregroundStyle(Theme.ink)
        }
    }
}
