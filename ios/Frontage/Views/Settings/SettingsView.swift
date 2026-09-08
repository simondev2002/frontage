import SwiftUI
import StoreKit
import UserNotifications

struct SettingsView: View {
    @Environment(AppState.self) private var app
    @Environment(StoreService.self) private var store
    @Environment(\.dismiss) private var dismiss
    @State private var showManage = false
    @State private var confirmDelete = false
    @State private var busy = false
    /// Settings is a sheet: the root's toast and paywall would render behind it.
    @State private var feedback = SheetFeedback()

    var body: some View {
        NavigationStack {
            List {
                Section("Account") {
                    LabeledContent("Email", value: app.user?.email ?? "—")
                    if let name = app.user?.name, !name.isEmpty { LabeledContent("Name", value: name) }
                }

                Section("Plan") {
                    if let e = app.entitlement {
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(e.plan.name).font(Theme.body(16, weight: .semibold))
                                Text(planLine(e)).font(Theme.body(13)).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            PlanBadge(tier: e.tier)
                        }
                        LabeledContent("AI changes this month", value: "\(e.usage.edits) of \(e.plan.editsPerMonth)")
                        if e.tier == "free" {
                            Button("See plans") { feedback.paywall = PaywallRequest(requiredTier: "starter", reason: nil) }
                        } else {
                            Button("Upgrade or change plan") { feedback.paywall = PaywallRequest(requiredTier: e.tier == "starter" ? "business" : "starter", reason: nil) }
                            if e.subscription?.provider == "apple" || e.subscription == nil {
                                Button("Manage subscription") { showManage = true }
                            } else if e.subscription?.provider == "stripe" {
                                Text("Billed on our website. Manage it at \(AppConfig.apiBaseURL.host ?? "frontageweb.com").").font(Theme.body(13)).foregroundStyle(Theme.muted)
                            }
                        }
                    }
                    AsyncButton {
                        do {
                            if let e = try await store.restore(), e.isPaid { app.entitlement = e; feedback.toast = "Purchases restored." }
                            else { feedback.toast = "No purchases found for this Apple ID." }
                        } catch { feedback.toast = "Could not restore right now." }
                    } label: { Text("Restore purchases") }
                }

                Section("Privacy") {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("AI processing").font(Theme.body(16, weight: .semibold))
                        Text(app.user?.aiConsentAt.map { "Agreed on \($0.asDate.formatted(date: .abbreviated, time: .omitted)). Your business details, photos and requests are sent to Anthropic to design your site." } ?? "Not agreed. You will be asked before AI is used.")
                            .font(Theme.body(13)).foregroundStyle(Theme.muted)
                    }
                    if app.user?.aiConsentAt != nil {
                        Button("Withdraw AI processing consent", role: .destructive) {
                            Task {
                                do {
                                    app.user = try await APIClient.shared.setAiConsent(false)
                                    feedback.toast = "Consent withdrawn. AI features will ask again."
                                } catch { feedback.fail(error) }
                            }
                        }
                    }
                }

                Section("Notifications") {
                    Button("Turn on alerts for new messages") {
                        Task {
                            // Once denied, iOS never shows the prompt again; the switch lives in Settings.
                            let settings = await UNUserNotificationCenter.current().notificationSettings()
                            if settings.authorizationStatus == .denied {
                                feedback.toast = "Turn on notifications for Frontage in Settings."
                                if let url = URL(string: UIApplication.openSettingsURLString) { await UIApplication.shared.open(url) }
                            } else {
                                AppDelegate.requestPushPermission()
                            }
                        }
                    }
                    Button("Notification settings") {
                        if let url = URL(string: UIApplication.openNotificationSettingsURLString) { UIApplication.shared.open(url) }
                    }
                }

                Section("Help") {
                    Link("Contact support", destination: URL(string: "mailto:\(app.config?.supportEmail ?? AppConfig.supportEmail)")!)
                    Link("Terms of Service", destination: URL(string: app.config?.termsUrl ?? AppConfig.termsURL.absoluteString)!)
                    Link("Privacy Policy", destination: URL(string: app.config?.privacyUrl ?? AppConfig.privacyURL.absoluteString)!)
                }

                Section {
                    Button("Sign out") { Task { await app.signOut(); dismiss() } }
                    Button("Delete account", role: .destructive) { confirmDelete = true }
                } footer: {
                    Text("Deleting your account removes your websites, photos and messages. Active App Store subscriptions must be cancelled separately in Settings › Apple ID › Subscriptions.")
                }

                #if DEBUG
                Section("Developer") {
                    Button("Fake Starter plan") { Task { app.entitlement = try? await APIClient.shared.devSubscription(tier: "starter") } }
                    Button("Fake Business plan") { Task { app.entitlement = try? await APIClient.shared.devSubscription(tier: "business") } }
                    Button("Back to free") { Task { app.entitlement = try? await APIClient.shared.devSubscription(tier: nil) } }
                    LabeledContent("API", value: AppConfig.apiBaseURL.absoluteString)
                }
                #endif
            }
            .scrollContentBackground(.hidden)
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .manageSubscriptionsSheet(isPresented: $showManage)
            .confirmationDialog("Delete your account?", isPresented: $confirmDelete, titleVisibility: .visible) {
                Button("Delete everything", role: .destructive) {
                    Task {
                        busy = true
                        do { try await app.deleteAccount(); dismiss() } catch { feedback.fail(error) }
                        busy = false
                    }
                }
            } message: { Text("Your websites go offline immediately and your data is removed. This cannot be undone.") }
            .overlay { if busy { LoadingOverlay(text: "Deleting") } }
            .sheetFeedback($feedback)
        }
    }

    private func planLine(_ e: Entitlement) -> String {
        guard let s = e.subscription else { return "Your first website is free to preview. Subscribe to make changes and publish it." }
        let date = s.expiresAt?.asDate.formatted(date: .abbreviated, time: .omitted) ?? ""
        switch s.status {
        case "grace", "billing_retry": return "Payment problem. Update your payment method to keep your site live."
        default: return s.autoRenew ? "Renews \(date)" : "Ends \(date)"
        }
    }
}
