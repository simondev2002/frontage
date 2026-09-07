import SwiftUI

/// Publishing, the site address, and (Business plan) custom domains.
struct PublishSheet: View {
    @State var site: Site
    var onChanged: (Site) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app

    @State private var slug = ""
    @State private var slugCheck: SlugCheck?
    @State private var checkingSlug = false
    @State private var domainInput = ""
    @State private var domain: DomainInfo?
    @State private var verifying = false
    @State private var working = false
    @State private var error: String?
    /// The paywall must be presented from inside this sheet; the root's paywall cannot appear over it.
    @State private var paywall: PaywallRequest?
    @State private var publishAfterPlan = false

    private var sitesDomain: String { app.config?.sitesDomain ?? AppConfig.sitesDomain }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 22) {
                    statusCard
                    addressCard
                    domainCard
                    if let error { Text(error).font(Theme.body(14)).foregroundStyle(Theme.coral) }
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Publish").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .onAppear {
                slug = site.slug ?? ""
                if site.customDomain != nil { Task { domain = try? await APIClient.shared.domain(site.id) } }
            }
            .overlay { if working { LoadingOverlay(text: "One moment") } }
            .sheet(item: $paywall, onDismiss: {
                // The owner just subscribed from the "Choose a plan and publish" button: finish the job.
                if publishAfterPlan, app.entitlement?.plan.publish == true {
                    publishAfterPlan = false
                    Task { await publish() }
                }
            }) { req in PaywallView(request: req) }
        }
    }

    private func needPlan(_ tier: String, reason: String) {
        paywall = PaywallRequest(requiredTier: tier, reason: reason)
    }

    // MARK: Status

    private var statusCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack {
                Circle().fill(site.isPublished ? Theme.success : Theme.muted.opacity(0.5)).frame(width: 10, height: 10)
                Text(site.isPublished ? "Your website is live" : "Not published yet").font(Theme.display(22))
            }
            if site.isPublished, let live = site.liveURL {
                Text(live.absoluteString).font(Theme.body(15)).foregroundStyle(Theme.green).textSelection(.enabled)
                HStack(spacing: 10) {
                    ShareLink(item: live) { Label("Share", systemImage: "square.and.arrow.up") }.buttonStyle(.bordered).tint(Theme.green)
                    Link(destination: live) { Label("Open", systemImage: "safari") }.buttonStyle(.bordered).tint(Theme.green)
                }
                Text(site.publishedAt.map { "Last published \($0.asDate.formatted(date: .abbreviated, time: .shortened))" } ?? "")
                    .font(Theme.body(12)).foregroundStyle(Theme.muted)
                AsyncButton { await publish() } label: { Text("Publish latest changes") }.buttonStyle(PrimaryButtonStyle(fill: Theme.green))
                Button(role: .destructive) { Task { await unpublish() } } label: { Text("Take offline").font(Theme.body(14, weight: .medium)) }
            } else {
                Text(app.entitlement?.plan.publish == true ? "Publishing makes your site public at the address below." : "Publishing needs a plan. Your first month is billed through the App Store.")
                    .font(Theme.body(15)).foregroundStyle(Theme.muted)
                if app.entitlement?.plan.publish == true {
                    AsyncButton { await publish() } label: { Text("Publish now") }.buttonStyle(PrimaryButtonStyle(fill: Theme.green))
                } else {
                    Button {
                        publishAfterPlan = true
                        needPlan("starter", reason: "Publishing needs a plan. Pick one and your site goes live right after.")
                    } label: { Text("Choose a plan and publish") }.buttonStyle(PrimaryButtonStyle(fill: Theme.green))
                }
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading).cardStyle()
    }

    // MARK: Address

    private var addressCard: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Site address").font(Theme.body(14, weight: .semibold))
            HStack(spacing: 0) {
                TextField("your-business", text: $slug)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.asciiCapable)
                    .onChange(of: slug) { _, _ in Task { await checkSlug() } }
                Text(".\(sitesDomain)").foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.7)
            }
            .padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
            HStack {
                if checkingSlug { ProgressView().controlSize(.small) }
                else if slug != site.slug, let c = slugCheck {
                    Text(c.available ? "Available" : (c.slug == nil ? "Use letters, numbers and dashes" : "Taken")).font(Theme.body(13, weight: .medium)).foregroundStyle(c.available ? Theme.success : Theme.coral)
                }
                Spacer()
                if slug != site.slug, slugCheck?.available == true {
                    AsyncButton { await saveSlug() } label: { Text("Save address").font(Theme.body(14, weight: .semibold)) }.buttonStyle(.bordered).tint(Theme.green)
                }
            }
        }
        .cardStyle()
    }

    // MARK: Custom domain

    private var domainCard: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack { Text("Your own domain").font(Theme.body(14, weight: .semibold)); Spacer(); PlanBadge(tier: "business") }
            if app.entitlement?.plan.customDomain != true {
                Text("Use mybusiness.com instead of a \(sitesDomain) address, and remove the Frontage badge. Included in Business.").font(Theme.body(15)).foregroundStyle(Theme.muted)
                Button { needPlan("business", reason: "Custom domains are included in the Business plan.") } label: { Text("Upgrade to Business") }.buttonStyle(SecondaryButtonStyle())
            } else if let d = domain, let name = d.domain {
                HStack {
                    Text(name).font(Theme.display(20))
                    Spacer()
                    Text(d.status == "active" ? "Connected" : "Waiting for DNS").font(Theme.body(12, weight: .bold))
                        .padding(.horizontal, 10).padding(.vertical, 5).background((d.status == "active" ? Theme.success : Theme.coral).opacity(0.12), in: Capsule())
                        .foregroundStyle(d.status == "active" ? Theme.success : Theme.coral)
                }
                if d.status != "active" {
                    if let p = d.provider, let name = p.name {
                        Text("Your domain is managed at \(name). Open its DNS page, add the two records below, and come back. We keep checking in the background and notify you when it's live.").font(Theme.body(14)).foregroundStyle(Theme.muted)
                        if let u = p.dnsUrl, let url = URL(string: u) {
                            Link(destination: url) { Label("Open \(name) DNS settings", systemImage: "arrow.up.right.square") }.buttonStyle(PrimaryButtonStyle(fill: Theme.ink))
                        }
                    } else {
                        Text("Add these records where you bought the domain (GoDaddy, Namecheap, Cloudflare…). We keep checking in the background and notify you when it's live.").font(Theme.body(14)).foregroundStyle(Theme.muted)
                    }
                    ForEach(d.records ?? []) { r in
                        VStack(alignment: .leading, spacing: 4) {
                            HStack { Text(r.type).font(Theme.body(12, weight: .bold)).foregroundStyle(Theme.green); Text("Host: \(r.host)").font(Theme.body(13)).foregroundStyle(Theme.muted) }
                            HStack {
                                Text(r.value).font(.system(size: 14, design: .monospaced)).textSelection(.enabled)
                                Spacer()
                                Button { UIPasteboard.general.string = r.value } label: { Image(systemName: "doc.on.doc") }
                            }
                        }
                        .padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
                    }
                    AsyncButton { await verify() } label: { Text("Check now") }.buttonStyle(SecondaryButtonStyle())
                }
                Button(role: .destructive) { Task { await removeDomain() } } label: { Text("Remove domain").font(Theme.body(14, weight: .medium)) }
            } else {
                Text("Enter a domain you already own. Don't have one? Buy one at any registrar, then come back here.").font(Theme.body(15)).foregroundStyle(Theme.muted)
                InputField(title: "Domain", placeholder: "mybusiness.com", text: $domainInput, keyboard: .URL, capitalization: .never)
                AsyncButton { await addDomain() } label: { Text("Connect domain") }.buttonStyle(PrimaryButtonStyle(fill: Theme.ink)).disabled(domainInput.count < 4)
            }
        }
        .cardStyle()
    }

    // MARK: Actions

    private func publish() async {
        error = nil
        do {
            let s = try await APIClient.shared.publish(site.id)
            site = s; onChanged(s)
            await app.refreshEntitlement()
        } catch let e as APIError where e.requiredTier != nil {
            publishAfterPlan = true
            needPlan(e.requiredTier ?? "starter", reason: e.errorDescription ?? "Publishing needs a plan.")
        } catch { if !app.handle(error) { self.error = (error as? LocalizedError)?.errorDescription } }
    }
    private func unpublish() async {
        do { let s = try await APIClient.shared.unpublish(site.id); site = s; onChanged(s) } catch { app.handle(error) }
    }
    private func checkSlug() async {
        let s = slug.lowercased()
        guard s != site.slug, s.count >= 2 else { slugCheck = nil; return }
        checkingSlug = true
        try? await Task.sleep(for: .milliseconds(400))
        guard s == slug.lowercased() else { return }
        slugCheck = try? await APIClient.shared.slugCheck(s, siteId: site.id)
        checkingSlug = false
    }
    private func saveSlug() async {
        do { let s = try await APIClient.shared.updateSite(site.id, slug: slug.lowercased()); site = s; onChanged(s); slugCheck = nil } catch { app.handle(error) }
    }
    private func addDomain() async {
        error = nil
        do {
            let (s, records, provider) = try await APIClient.shared.setDomain(site.id, domain: domainInput)
            site = s; onChanged(s)
            domain = DomainInfo(domain: s.customDomain, status: s.customDomainStatus, records: records, checkedAt: nil, provider: provider)
        } catch let e as APIError where e.requiredTier != nil {
            needPlan(e.requiredTier ?? "business", reason: e.errorDescription ?? "Custom domains are included in the Business plan.")
        } catch { if !app.handle(error) { self.error = (error as? LocalizedError)?.errorDescription } }
    }
    private func verify() async {
        do {
            let r = try await APIClient.shared.verifyDomain(site.id)
            site = r.site; onChanged(r.site)
            domain = DomainInfo(domain: r.site.customDomain, status: r.status, records: r.records, checkedAt: nil, provider: r.provider ?? domain?.provider)
            if r.status != "active" { app.toast = "Not connected yet. We keep checking and will notify you when it's live." }
        } catch { app.handle(error) }
    }
    private func removeDomain() async {
        do { let s = try await APIClient.shared.removeDomain(site.id); site = s; onChanged(s); domain = nil } catch { app.handle(error) }
    }
}
