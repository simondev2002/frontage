import SwiftUI

/// Messages sent through the site's contact form.
struct LeadsView: View {
    var siteId: String
    @Environment(AppState.self) private var app
    @State private var leads: [Lead] = []
    @State private var loaded = false
    @State private var loadError: String?
    @State private var selected: Lead?

    var body: some View {
        Group {
            if let loadError, leads.isEmpty {
                // A failed fetch must not look like "no messages yet".
                VStack(spacing: 12) {
                    Image(systemName: "wifi.exclamationmark").font(.system(size: 40)).foregroundStyle(Theme.muted)
                    Text(loadError).font(Theme.body(15)).foregroundStyle(Theme.coral).multilineTextAlignment(.center)
                    AsyncButton { await load() } label: { Text("Retry") }.buttonStyle(SecondaryButtonStyle())
                }
                .padding(32)
            } else if loaded && leads.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "tray").font(.system(size: 40)).foregroundStyle(Theme.muted)
                    Text("No messages yet").font(Theme.display(24))
                    Text("When someone fills in the contact form on your website, it shows up here and you get a notification.")
                        .font(Theme.body(15)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                }
                .padding(32)
            } else {
                List {
                    ForEach(leads) { lead in
                        Button { open(lead) } label: {
                            HStack(alignment: .top, spacing: 12) {
                                Circle().fill(lead.readAt == nil ? Theme.coral : .clear).frame(width: 8, height: 8).padding(.top, 7)
                                VStack(alignment: .leading, spacing: 4) {
                                    HStack {
                                        Text(lead.name ?? "Someone").font(Theme.body(16, weight: lead.readAt == nil ? .bold : .semibold))
                                        Spacer()
                                        Text(lead.createdAt.asDate.formatted(.relative(presentation: .named))).font(Theme.body(12)).foregroundStyle(Theme.muted)
                                    }
                                    Text(lead.message ?? "").font(Theme.body(14)).foregroundStyle(Theme.muted).lineLimit(2)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                        .swipeActions { Button(role: .destructive) { Task { await delete(lead) } } label: { Label("Delete", systemImage: "trash") } }
                    }
                }
                .listStyle(.plain)
            }
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle("Messages")
        .task { await load() }
        .refreshable { await load() }
        .sheet(item: $selected) { lead in LeadDetail(lead: lead) }
    }

    private func load() async {
        do {
            let r = try await APIClient.shared.leads(siteId)
            leads = r.leads
            loadError = nil
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            if !leads.isEmpty { app.handle(error) }
        }
        loaded = true
    }
    private func open(_ lead: Lead) {
        selected = lead
        if lead.readAt == nil {
            if let i = leads.firstIndex(where: { $0.id == lead.id }) { leads[i].readAt = Int(Date().timeIntervalSince1970 * 1000) }
            Task { try? await APIClient.shared.markLeadRead(lead.id); await app.refreshSites() }
        }
    }
    private func delete(_ lead: Lead) async {
        do {
            try await APIClient.shared.deleteLead(lead.id)
            leads.removeAll { $0.id == lead.id }
            await app.refreshSites()   // unread badge on the site card
        } catch { app.handle(error) }
    }
}

struct LeadDetail: View {
    var lead: Lead
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    Text(lead.name ?? "Someone").font(Theme.display(26))
                    Text(lead.createdAt.asDate.formatted(date: .long, time: .shortened)).font(Theme.body(13)).foregroundStyle(Theme.muted)
                    Text(lead.message ?? "").font(Theme.body(17)).textSelection(.enabled).cardStyle()
                    VStack(spacing: 10) {
                        if let phone = lead.phone, !phone.isEmpty, let url = URL(string: "tel:" + phone.filter { !$0.isWhitespace }) {
                            Link(destination: url) { Label("Call \(phone)", systemImage: "phone.fill") }.buttonStyle(PrimaryButtonStyle(fill: Theme.green))
                        }
                        if let email = lead.email, !email.isEmpty, let url = URL(string: "mailto:" + email) {
                            Link(destination: url) { Label("Email \(email)", systemImage: "envelope.fill") }.buttonStyle(SecondaryButtonStyle())
                        }
                    }
                    Spacer()
                }
                .padding(24)
            }
            .background(Theme.paper.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}
