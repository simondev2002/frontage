import SwiftUI
import PhotosUI

/// The heart of the app: live preview on top, the conversation with Frontage underneath,
/// and a composer at the bottom. While a change is being applied the site is hidden behind
/// a calm "Applying your changes" panel, and the AI's answer lands in the conversation.
struct SiteEditorView: View {
    let siteId: String
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss

    @State private var site: Site?
    @State private var reloadToken = 0
    @State private var desktop = false
    @State private var loadingWeb = true
    @State private var instruction = ""
    @State private var applying = false
    @State private var applyText = "Reading your request"
    @State private var messages: [ChatMessage] = []
    /// The request that was just sent, shown in the conversation until the server echoes it back.
    @State private var pendingMessage: String?
    @State private var chatOpen = false
    @State private var sheet: EditorSheet?
    @State private var confirmDelete = false
    @State private var showLeads = false
    @State private var attachments: [PickedPhoto] = []
    @State private var askConsent = false
    @State private var regenJob: Job?
    @State private var messagesLoadFailed = false
    @FocusState private var composerFocused: Bool

    enum EditorSheet: String, Identifiable { case history, versions, details, look, photos, publish, sections; var id: String { rawValue } }

    private let fallbackSuggestions = ["Make it bolder", "Change the colors", "Shorter headline", "Add an FAQ", "Add our opening hours", "More premium feel", "Add a reviews section", "Warmer wording"]

    /// The server suggests next steps based on what the site still lacks.
    private var chipSuggestions: [Suggestion] {
        if let s = site?.suggestions, !s.isEmpty { return s }
        return fallbackSuggestions.map { Suggestion(label: $0, instruction: $0, action: nil) }
    }

    private func tap(_ s: Suggestion) {
        if s.action == "photos" { sheet = .photos; return }
        instruction = s.instruction
        if s.needsInput { composerFocused = true } else { Task { await send() } }
    }

    private func differentLook() async {
        do { regenJob = try await APIClient.shared.regenerate(siteId, brief: nil, differentLook: true) } catch { app.handle(error) }
    }

    var body: some View {
        VStack(spacing: 0) {
            // Phone/desktop switch lives above the preview so it never covers the site's own menu.
            Picker("View", selection: $desktop) {
                Label("Phone", systemImage: "iphone").tag(false)
                Label("Desktop", systemImage: "desktopcomputer").tag(true)
            }
            .pickerStyle(.segmented)
            .padding(.horizontal, 16).padding(.vertical, 6)
            .background(Theme.paper)
            ZStack {
                preview.opacity(applying ? 0 : 1)
                if applying { ApplyingView(status: applyText).transition(.opacity) }
            }
            .animation(.easeInOut(duration: 0.3), value: applying)
            if chatOpen || applying {
                chatPanel.transition(.move(edge: .bottom).combined(with: .opacity))
            }
            composer
        }
        .animation(.spring(duration: 0.35), value: chatOpen)
        .background(Theme.paper.ignoresSafeArea())
        .navigationTitle(site?.name ?? "Your website")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { toolbarContent }
        .task { await load(); await loadMessages() }
        .sheet(item: $sheet) { s in
            switch s {
            case .history: HistorySheet(siteId: siteId)
            case .versions: VersionsSheet(siteId: siteId) { updated in site = updated; app.upsert(updated); reloadToken += 1 }
            case .details: DetailsSheet(site: site!) { updated in site = updated; app.upsert(updated); reloadToken += 1 }
            case .look: LookSheet(site: site!) { updated in site = updated; app.upsert(updated); reloadToken += 1 }
            case .photos: PhotosSheet(site: site!) { updated in site = updated; app.upsert(updated); reloadToken += 1 }
            case .publish: PublishSheet(site: site!) { updated in site = updated; app.upsert(updated); reloadToken += 1 }
            case .sections: SectionsSheet(site: site!) { updated in site = updated; app.upsert(updated); reloadToken += 1 }
            }
        }
        .alert("Use AI to change your site?", isPresented: $askConsent) {
            Button("Agree and continue") {
                Task {
                    // If recording the consent fails, say so; sending would only re-open this alert.
                    do {
                        app.user = try await APIClient.shared.setAiConsent(true)
                        await send()
                    } catch { app.handle(error) }
                }
            }
            Button("Not now", role: .cancel) {}
        } message: {
            Text("Your site content and your request are sent to Anthropic, our AI provider, to make the change. See our Privacy Policy in Settings. You can withdraw this at any time.")
        }
        .confirmationDialog("Delete this website?", isPresented: $confirmDelete, titleVisibility: .visible) {
            Button("Delete website", role: .destructive) { Task { await deleteSite() } }
        } message: { Text("This removes the site, its photos and messages. It cannot be undone.") }
        .navigationDestination(isPresented: $showLeads) { LeadsView(siteId: siteId) }
        .navigationDestination(item: $regenJob) { job in
            GeneratingView(jobId: job.id, onDone: { updated in regenJob = nil; site = updated; reloadToken += 1 }, onRetry: { regenJob = nil }, retryLabel: "Back")
        }
        .onReceive(NotificationCenter.default.publisher(for: .siteChanged)) { _ in Task { await load(); reloadToken += 1 } }
    }

    // MARK: Preview

    private var preview: some View {
        ZStack {
            if let site {
                WebPreview(url: site.previewURL, reloadToken: reloadToken, desktop: desktop, loading: $loadingWeb)
                    .ignoresSafeArea(edges: .bottom)
                if loadingWeb { ProgressView().padding(14).background(.ultraThinMaterial, in: Circle()) }
            } else {
                ProgressView()
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: Conversation

    private var chatPanel: some View {
        VStack(spacing: 0) {
            HStack {
                Text("Conversation").font(Theme.body(13, weight: .semibold)).foregroundStyle(Theme.muted)
                Spacer()
                if !applying {
                    Button { withAnimation { chatOpen = false } } label: {
                        Image(systemName: "chevron.down").font(.caption.bold()).foregroundStyle(Theme.muted).padding(6)
                    }
                }
            }
            .padding(.horizontal, 16).padding(.top, 6)
            ScrollViewReader { proxy in
                ScrollView {
                    LazyVStack(spacing: 8) {
                        if messages.isEmpty && pendingMessage == nil && !applying {
                            Text("Ask for any change below. Frontage answers here and updates the site above.")
                                .font(Theme.body(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center)
                                .frame(maxWidth: .infinity).padding(.top, 24)
                        }
                        ForEach(messages) { m in bubble(m.content, user: m.role == "user").id(m.id) }
                        if let pendingMessage { bubble(pendingMessage, user: true).id(-1) }
                        if applying { typingRow.id(-2) }
                    }
                    .padding(.horizontal, 16).padding(.vertical, 8)
                }
                .onAppear { scrollToEnd(proxy, animated: false) }
                .onChange(of: messages.count) { _, _ in scrollToEnd(proxy, animated: true) }
                .onChange(of: applying) { _, _ in scrollToEnd(proxy, animated: true) }
                .onChange(of: pendingMessage) { _, _ in scrollToEnd(proxy, animated: true) }
            }
        }
        .frame(height: 210)
        .background(Theme.paper)
        .overlay(alignment: .top) { Divider() }
    }

    private func scrollToEnd(_ proxy: ScrollViewProxy, animated: Bool) {
        let target: Int? = applying ? -2 : (pendingMessage != nil ? -1 : messages.last?.id)
        guard let target else { return }
        if animated { withAnimation { proxy.scrollTo(target, anchor: .bottom) } } else { proxy.scrollTo(target, anchor: .bottom) }
    }

    private func bubble(_ text: String, user: Bool) -> some View {
        HStack(alignment: .top, spacing: 8) {
            if user { Spacer(minLength: 48) } else { BrandMark(size: 20).padding(.top, 8) }
            Text(text).font(Theme.body(15))
                .foregroundStyle(user ? .white : Theme.ink)
                .padding(.horizontal, 13).padding(.vertical, 10)
                .background(user ? Theme.green : Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(user ? .clear : Theme.line))
            if !user { Spacer(minLength: 48) }
        }
    }

    private var typingRow: some View {
        HStack(spacing: 8) {
            BrandMark(size: 20)
            ProgressView().controlSize(.small)
            Text(applyText).font(Theme.body(13)).foregroundStyle(Theme.muted).contentTransition(.opacity)
            Spacer()
        }
        .padding(.leading, 2)
    }

    // MARK: Composer

    private var composer: some View {
        VStack(spacing: 10) {
            if !chatOpen && !applying && !messages.isEmpty {
                Button { withAnimation { chatOpen = true } } label: {
                    Label("Conversation · \(messages.count)", systemImage: "bubble.left.and.bubble.right")
                        .font(Theme.body(12, weight: .semibold)).foregroundStyle(Theme.muted)
                }
            }
            if instruction.isEmpty && !composerFocused && attachments.isEmpty && !applying {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(chipSuggestions) { s in
                            // A plain view with a tap gesture: a horizontal drag scrolls, only a tap sends.
                            Text(s.label)
                                .font(Theme.body(15, weight: .medium))
                                .lineLimit(1)
                                .padding(.horizontal, 14).padding(.vertical, 9)
                                .background(Theme.card, in: Capsule())
                                .overlay(Capsule().stroke(Theme.line))
                                .foregroundStyle(Theme.ink)
                                .contentShape(Capsule())
                                .onTapGesture { tap(s) }
                        }
                    }
                    .padding(.horizontal, 16)
                }
                .frame(height: 40)
                .scrollBounceBehavior(.basedOnSize, axes: .horizontal)
            }
            if !attachments.isEmpty {
                ScrollView(.horizontal, showsIndicators: false) {
                    HStack(spacing: 8) {
                        ForEach(attachments) { p in
                            PhotoTile(photo: p) { attachments.removeAll { $0.id == p.id } }
                                .frame(width: 64, height: 64)
                        }
                    }
                    .padding(.horizontal, 16)
                }
            }
            HStack(spacing: 10) {
                // Attach photos from the library or the camera; they upload straight away.
                PhotoSourceButton(kind: "featured", siteId: siteId, maxCount: 8, photos: $attachments) {
                    Image(systemName: "paperclip").font(.headline).foregroundStyle(Theme.ink)
                        .frame(width: 40, height: 40)
                        .background(Theme.card, in: Circle())
                        .overlay(Circle().stroke(Theme.line))
                }
                TextField(attachments.isEmpty ? "Ask for any change…" : "What should we do with these photos?", text: $instruction, axis: .vertical)
                    .lineLimit(1...4)
                    .focused($composerFocused)
                    .padding(.horizontal, 14).padding(.vertical, 11)
                    .background(Theme.card, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).stroke(Theme.line))
                Button { Task { await send() } } label: {
                    Image(systemName: "arrow.up").font(.headline).foregroundStyle(.white)
                        .frame(width: 42, height: 42).background(instruction.trimmingCharacters(in: .whitespaces).isEmpty || applying ? Theme.muted : Theme.green, in: Circle())
                }
                .disabled(instruction.trimmingCharacters(in: .whitespaces).isEmpty || applying)
            }
            .padding(.horizontal, 16)
            if let e = app.entitlement {
                if e.tier == "free" && e.remaining.edits > 0 {
                    Text("\(e.remaining.edits) free \(e.remaining.edits == 1 ? "change" : "changes") left. Subscribe to publish.")
                        .font(Theme.body(12)).foregroundStyle(Theme.muted)
                } else if e.remaining.edits <= 0 {
                    HStack(spacing: 4) {
                        Text(e.tier == "free" ? "Your free changes are used up." : "This month's changes are used up.")
                        Button(e.tier == "free" ? "See plans" : "Upgrade") { app.showPaywall(e.tier == "free" ? "starter" : "business", reason: outOfChangesReason(e)) }
                            .fontWeight(.semibold)
                    }
                    .font(Theme.body(12)).foregroundStyle(Theme.muted)
                } else {
                    Text("\(e.remaining.edits) changes left this month")
                        .font(Theme.body(12)).foregroundStyle(Theme.muted)
                }
            }
        }
        .padding(.vertical, 10)
        .background(Theme.paper)
    }

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            Button { sheet = .publish } label: {
                Text(site?.isPublished == true ? "Live" : "Publish")
                    .font(Theme.body(15, weight: .bold)).foregroundStyle(.white)
                    .padding(.horizontal, 14).padding(.vertical, 7)
                    .background(site?.isPublished == true ? Theme.success : Theme.green, in: Capsule())
            }
            .disabled(site == nil)
        }
        ToolbarItem(placement: .topBarTrailing) {
            Menu {
                // These sheets edit the spec, which the site list does not include; wait for the full site.
                Button { sheet = .sections } label: { Label("Sections & text", systemImage: "square.and.pencil") }.disabled(site?.spec == nil)
                Button { sheet = .details } label: { Label("Business details", systemImage: "person.text.rectangle") }.disabled(site?.spec == nil)
                Button { sheet = .look } label: { Label("Look & colors", systemImage: "paintpalette") }.disabled(site?.spec == nil)
                Button { sheet = .photos } label: { Label("Photos", systemImage: "photo.on.rectangle") }.disabled(site?.spec == nil)
                Divider()
                Button { showLeads = true } label: { Label("Messages\((site?.unreadLeads ?? 0) > 0 ? " (\(site?.unreadLeads ?? 0))" : "")", systemImage: "tray") }
                Button { sheet = .history } label: { Label("Change history", systemImage: "clock.arrow.circlepath") }
                Button { sheet = .versions } label: { Label("Versions & undo", systemImage: "arrow.uturn.backward") }
                Button { Task { await differentLook() } } label: { Label("Try a different look", systemImage: "sparkles") }
                Divider()
                Button(role: .destructive) { confirmDelete = true } label: { Label("Delete website", systemImage: "trash") }
            } label: { Image(systemName: "ellipsis.circle") }
            .disabled(site == nil)
        }
    }

    // MARK: Actions

    private func load() async {
        if let cached = app.sites.first(where: { $0.id == siteId }), site == nil { site = cached }
        do {
            let r = try await APIClient.shared.site(siteId)
            site = r.site
            if let e = r.entitlement { app.entitlement = e }
            app.upsert(r.site)
        } catch { app.handle(error) }
    }

    private func loadMessages() async {
        do {
            messages = try await APIClient.shared.messages(siteId)
            messagesLoadFailed = false
        } catch {
            // Say it once; the conversation is fetched again after every change anyway.
            if !messagesLoadFailed { messagesLoadFailed = true; app.toast = "Couldn't load the conversation. Check your connection." }
        }
    }

    /// Why the paywall opens when the owner is out of changes, in plain words.
    private func outOfChangesReason(_ e: Entitlement) -> String {
        if e.tier == "free" {
            return "You have used your \(e.plan.editsPerMonth) free changes. Subscribe to keep editing and to publish your website."
        }
        return "You have used this month's \(e.plan.editsPerMonth) changes. Business includes more each month, or they reset next month."
    }

    private func send() async {
        let text = instruction.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty, !applying else { return }
        guard app.aiAvailable else { app.toast = "AI editing is not available right now."; return }
        if app.user?.aiConsentAt == nil { askConsent = true; return }
        // Out of changes: explain and offer the plans instead of a failed request.
        if let e = app.entitlement, e.remaining.edits <= 0 {
            app.showPaywall(e.tier == "free" ? "starter" : "business", reason: outOfChangesReason(e))
            return
        }
        composerFocused = false
        pendingMessage = text
        applyText = attachments.contains { $0.uploading } ? "Uploading your photos" : "Reading your request"
        withAnimation { chatOpen = true; applying = true }
        // Let attached photos finish uploading so the AI can place them.
        var waited = 0
        while attachments.contains(where: { $0.uploading }) && waited < 60 {
            try? await Task.sleep(for: .milliseconds(500)); waited += 1
        }
        // A photo whose upload failed would be dropped silently; let the owner decide first.
        let failedPhotos = attachments.filter { $0.failed }.count
        if failedPhotos > 0 {
            app.toast = "\(failedPhotos) photo\(failedPhotos == 1 ? "" : "s") didn't upload. Remove them or try again."
            pendingMessage = nil
            withAnimation { applying = false; if messages.isEmpty { chatOpen = false } }
            return
        }
        let imageIds = attachments.compactMap(\.uploadedId)
        var succeeded = false
        do {
            let job = try await APIClient.shared.edit(siteId, instruction: text, imageIds: imageIds)
            instruction = ""
            var current = job
            var pollFailures = 0
            while !current.isFinished {
                try await Task.sleep(for: .milliseconds(1200))
                do {
                    current = try await APIClient.shared.job(job.id).job
                    pollFailures = 0
                } catch {
                    // A dropped poll must not abandon a change the server is still applying.
                    pollFailures += 1
                    if pollFailures >= 5 { throw error }
                    try await Task.sleep(for: .milliseconds(1500))
                    continue
                }
                if let t = current.statusText { applyText = t }
            }
            if current.status == "done" {
                succeeded = true
                attachments = []   // only once the photos are placed; a failed change keeps them for a retry
                applyText = "Refreshing your site"
                await loadMessages()
                await load()
                reloadToken += 1
                await app.refreshEntitlement()
                // Give the preview a moment to start reloading before the curtain lifts.
                try? await Task.sleep(for: .milliseconds(600))
            } else {
                app.toast = current.error ?? "That change didn't go through. Try again."
            }
        } catch {
            // A refused request (paywall, quota) keeps the text so the owner can retry after subscribing.
            app.handle(error)
        }
        if !succeeded && instruction.isEmpty { instruction = text }
        pendingMessage = nil
        withAnimation {
            applying = false
            if !succeeded && messages.isEmpty { chatOpen = false } // nothing to show yet, so no empty panel
        }
    }

    private func deleteSite() async {
        do {
            let e = try await APIClient.shared.deleteSite(siteId)
            app.remove(siteId: siteId)
            if let e { app.entitlement = e } else { await app.refreshEntitlement() }
            dismiss()
        } catch { app.handle(error) }
    }
}

/// Full-panel state shown instead of the website while an AI change is applied.
struct ApplyingView: View {
    var status: String
    @State private var spin = false
    @State private var pulse = false

    var body: some View {
        VStack(spacing: 18) {
            ZStack {
                Circle().stroke(Theme.line, lineWidth: 6).frame(width: 84, height: 84)
                Circle().trim(from: 0, to: 0.28)
                    .stroke(Theme.green, style: StrokeStyle(lineWidth: 6, lineCap: .round))
                    .frame(width: 84, height: 84)
                    .rotationEffect(.degrees(spin ? 360 : 0))
                    .animation(.linear(duration: 1.1).repeatForever(autoreverses: false), value: spin)
                BrandMark(size: 34)
                    .scaleEffect(pulse ? 1.06 : 0.94)
                    .animation(.easeInOut(duration: 0.9).repeatForever(autoreverses: true), value: pulse)
            }
            Text("Applying your changes now").font(Theme.display(24)).foregroundStyle(Theme.ink)
            Text(status).font(Theme.body(15)).foregroundStyle(Theme.muted).contentTransition(.opacity)
            Text("Your site is hidden while it updates. This usually takes about ten seconds.")
                .font(Theme.body(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center).padding(.horizontal, 40)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Theme.paper)
        .onAppear { spin = true; pulse = true }
    }
}
