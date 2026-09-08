import SwiftUI
import PhotosUI

// MARK: - Change history (chat)

struct HistorySheet: View {
    var siteId: String
    @Environment(\.dismiss) private var dismiss
    @State private var messages: [ChatMessage] = []
    @State private var loaded = false
    @State private var loadError: String?
    @State private var feedback = SheetFeedback()

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 12) {
                    if let loadError, messages.isEmpty {
                        // A failed fetch must not look like "no changes yet".
                        VStack(spacing: 12) {
                            Text(loadError).font(Theme.body(15)).foregroundStyle(Theme.coral).multilineTextAlignment(.center)
                            AsyncButton { await load() } label: { Text("Retry").font(Theme.body(15, weight: .semibold)) }.buttonStyle(.bordered).tint(Theme.green)
                        }
                        .padding(.top, 40).frame(maxWidth: .infinity)
                    } else if loaded && messages.isEmpty {
                        Text("No changes yet. Ask for one from the editor.").font(Theme.body(15)).foregroundStyle(Theme.muted).padding(.top, 40).frame(maxWidth: .infinity)
                    }
                    ForEach(messages) { m in
                        HStack {
                            if m.role == "user" { Spacer(minLength: 40) }
                            Text(m.content).font(Theme.body(15))
                                .foregroundStyle(m.role == "user" ? .white : Theme.ink)
                                .padding(12)
                                .background(m.role == "user" ? Theme.green : Theme.card, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
                                .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).stroke(m.role == "user" ? .clear : Theme.line))
                            if m.role != "user" { Spacer(minLength: 40) }
                        }
                    }
                }
                .padding(16)
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Change history").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { await load() }
            .sheetFeedback($feedback)
        }
    }

    private func load() async {
        do {
            messages = try await APIClient.shared.messages(siteId)
            loadError = nil
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            feedback.fail(error)
        }
        loaded = true
    }
}

// MARK: - Versions / undo

struct VersionsSheet: View {
    var siteId: String
    var onRestored: (Site) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var versions: [SiteVersion] = []
    @State private var loadError: String?
    @State private var feedback = SheetFeedback()

    var body: some View {
        NavigationStack {
            List {
                if let loadError, versions.isEmpty {
                    // A failed fetch must not look like an empty history.
                    Section {
                        Text(loadError).font(Theme.body(15)).foregroundStyle(Theme.coral)
                        AsyncButton { await load() } label: { Text("Retry").font(Theme.body(15, weight: .semibold)) }
                    }
                }
                Section {
                    ForEach(Array(versions.enumerated()), id: \.element.id) { i, v in
                        HStack {
                            VStack(alignment: .leading, spacing: 3) {
                                Text(v.summary ?? v.source.capitalized).font(Theme.body(15, weight: i == 0 ? .semibold : .regular))
                                Text(v.createdAt.asDate.formatted(date: .abbreviated, time: .shortened)).font(Theme.body(12)).foregroundStyle(Theme.muted)
                            }
                            Spacer()
                            if i == 0 { Text("Current").font(Theme.body(12, weight: .bold)).foregroundStyle(Theme.green) }
                            else {
                                AsyncButton { await restore(v) } label: { Text("Restore").font(Theme.body(14, weight: .semibold)) }
                                    .buttonStyle(.bordered).tint(Theme.green)
                            }
                        }
                    }
                } header: { Text("Every change is saved. Restore any earlier version.") }
            }
            .scrollContentBackground(.hidden).background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Versions").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .task { await load() }
            .sheetFeedback($feedback)
        }
    }

    private func load() async {
        do {
            versions = try await APIClient.shared.versions(siteId)
            loadError = nil
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? error.localizedDescription
            feedback.fail(error)
        }
    }

    private func restore(_ v: SiteVersion) async {
        do {
            let site = try await APIClient.shared.restore(siteId, version: v.id)
            onRestored(site)
            dismiss()
        } catch { feedback.fail(error) }
    }
}

// MARK: - Business details (edits spec.meta natively)

struct DetailsSheet: View {
    var site: Site
    var onSaved: (Site) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var meta: SiteMeta?
    @State private var phone = ""
    @State private var email = ""
    @State private var address = ""
    @State private var booking = ""
    @State private var tagline = ""
    @State private var name = ""
    @State private var hours: [SiteMeta.Hours] = []
    @State private var feedback = SheetFeedback()

    // Explicit because private @State properties make the memberwise initializer private.
    init(site: Site, onSaved: @escaping (Site) -> Void) {
        self.site = site
        self.onSaved = onSaved
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    InputField(title: "Business name", text: $name, capitalization: .words)
                    InputField(title: "Tagline", text: $tagline)
                    InputField(title: "Phone", text: $phone, keyboard: .phonePad)
                    InputField(title: "Email", text: $email, keyboard: .emailAddress, capitalization: .never)
                    InputField(title: "Address", text: $address, capitalization: .words)
                    InputField(title: "Booking or ordering link", text: $booking, keyboard: .URL, capitalization: .never)
                    VStack(alignment: .leading, spacing: 8) {
                        FieldLabel(text: "Opening hours")
                        ForEach(hours.indices, id: \.self) { i in
                            HStack(spacing: 8) {
                                TextField("Days", text: $hours[i].days).padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
                                TextField("Hours", text: $hours[i].hours).padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
                                Button { hours.remove(at: i) } label: { Image(systemName: "minus.circle.fill").foregroundStyle(Theme.muted) }
                            }
                        }
                        Button { hours.append(.init(days: "", hours: "")) } label: { Label("Add hours", systemImage: "plus").font(Theme.body(15, weight: .semibold)) }
                    }
                    Text("For anything else (services, wording, sections), just ask in the editor.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
                .padding(20)
            }
            .scrollDismissesKeyboard(.interactively)
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Business details").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { AsyncButton { await save() } label: { Text("Save").bold() } }
            }
            .onAppear(perform: seed)
            .onChange(of: site) { _, _ in seed() }   // the parent may finish loading the spec after the sheet opened
            .sheetFeedback($feedback)
        }
    }

    private func seed() {
        guard meta == nil else { return }
        guard let m = site.spec?["meta"]?.decode(SiteMeta.self) else {
            feedback.toast = "Couldn't read this site's details. Close the editor and open it again."
            return
        }
        meta = m
        name = m.businessName; tagline = m.tagline; phone = m.phone ?? ""; email = m.email ?? ""; address = m.address ?? ""; booking = m.bookingUrl ?? ""; hours = m.hours
    }

    private func save() async {
        guard var m = meta, var spec = site.spec else {
            feedback.toast = "Couldn't read this site's details. Close the editor and open it again."
            return
        }
        m.businessName = name.trimmingCharacters(in: .whitespaces); m.tagline = tagline
        m.phone = phone.isEmpty ? nil : phone; m.email = email.isEmpty ? nil : email
        m.address = address.isEmpty ? nil : address; m.bookingUrl = booking.isEmpty ? nil : booking
        m.hours = hours.filter { !$0.days.isEmpty && !$0.hours.isEmpty }
        if m.mapQuery == nil || m.mapQuery?.isEmpty == true { m.mapQuery = m.address.map { "\(m.businessName), \($0)" } }
        guard let json = JSONValue.from(m) else {
            feedback.toast = "Couldn't prepare the details for saving."
            return
        }
        spec["meta"] = json
        do {
            var updated = try await APIClient.shared.updateSpec(site.id, spec: spec, summary: "Updated business details")
            if updated.name != m.businessName { updated = try await APIClient.shared.updateSite(site.id, name: m.businessName) }
            onSaved(updated); dismiss()
        } catch { feedback.fail(error) }
    }
}

// MARK: - Look & colors (edits spec.theme natively)

struct LookSheet: View {
    var site: Site
    var onSaved: (Site) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var theme: SiteTheme?
    @State private var colors: [String: Color] = [:]
    @State private var feedback = SheetFeedback()

    private let presetBlurb = ["editorial": "Magazine feel", "bold": "Loud & confident", "minimal": "Quiet & airy", "warm": "Soft & friendly", "luxury": "Refined", "playful": "Fun & rounded", "classic": "Trustworthy", "tech": "Sharp & modern"]

    var body: some View {
        NavigationStack {
            ScrollView {
                if let t = theme {
                    VStack(alignment: .leading, spacing: 20) {
                        VStack(alignment: .leading, spacing: 8) {
                            FieldLabel(text: "Style")
                            LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 10) {
                                ForEach(SiteTheme.presets, id: \.self) { p in
                                    Button { theme?.preset = p } label: {
                                        VStack(alignment: .leading, spacing: 2) {
                                            Text(p.capitalized).font(Theme.body(15, weight: .semibold))
                                            Text(presetBlurb[p] ?? "").font(Theme.body(12)).foregroundStyle(t.preset == p ? .white.opacity(0.8) : Theme.muted)
                                        }
                                        .frame(maxWidth: .infinity, alignment: .leading).padding(12)
                                        .background(t.preset == p ? Theme.ink : Theme.card, in: RoundedRectangle(cornerRadius: 12))
                                        .foregroundStyle(t.preset == p ? .white : Theme.ink)
                                        .overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
                                    }.buttonStyle(.plain)
                                }
                            }
                        }
                        Picker("Mode", selection: Binding(get: { theme?.mode ?? "light" }, set: { theme?.mode = $0 })) {
                            Text("Light").tag("light"); Text("Dark").tag("dark")
                        }.pickerStyle(.segmented)
                        VStack(alignment: .leading, spacing: 10) {
                            FieldLabel(text: "Colors")
                            ForEach(["primary", "accent", "background", "text"], id: \.self) { key in
                                ColorPicker(key.capitalized, selection: Binding(get: { colors[key] ?? .black }, set: { colors[key] = $0 }), supportsOpacity: false)
                                    .padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
                            }
                        }
                        VStack(alignment: .leading, spacing: 10) {
                            FieldLabel(text: "Fonts")
                            Picker("Headings", selection: Binding(get: { theme?.headingFont ?? "" }, set: { theme?.headingFont = $0 })) { ForEach(SiteTheme.fonts, id: \.self) { Text($0) } }
                            Picker("Text", selection: Binding(get: { theme?.bodyFont ?? "" }, set: { theme?.bodyFont = $0 })) { ForEach(SiteTheme.fonts, id: \.self) { Text($0) } }
                        }
                        .padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
                        Text("Tip: for a whole new look, ask the editor, e.g. \"make it feel like a luxury spa\". Frontage picks matching colors and fonts.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                    }
                    .padding(20)
                } else { ProgressView().padding(40) }
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Look & colors").navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { AsyncButton { await save() } label: { Text("Save").bold() } }
            }
            .onAppear(perform: seed)
            .onChange(of: site) { _, _ in seed() }   // the parent may finish loading the spec after the sheet opened
            .sheetFeedback($feedback)
        }
    }

    private func seed() {
        guard theme == nil else { return }
        guard let t = site.spec?["theme"]?.decode(SiteTheme.self) else {
            feedback.toast = "Couldn't read this site's look. Close the editor and open it again."
            return
        }
        theme = t
        colors = ["primary": Color(hex: t.colors.primary), "accent": Color(hex: t.colors.accent), "background": Color(hex: t.colors.background), "text": Color(hex: t.colors.text)]
    }

    private func save() async {
        guard var t = theme, var spec = site.spec else {
            feedback.toast = "Couldn't read this site's look. Close the editor and open it again."
            return
        }
        t.colors.primary = colors["primary"]?.hexString ?? t.colors.primary
        t.colors.accent = colors["accent"]?.hexString ?? t.colors.accent
        t.colors.background = colors["background"]?.hexString ?? t.colors.background
        t.colors.text = colors["text"]?.hexString ?? t.colors.text
        // Keep surface close to background so cards stay coherent.
        t.colors.surface = t.mode == "dark" ? blend(t.colors.background, toward: "#ffffff", 0.06) : "#ffffff"
        guard let json = JSONValue.from(t) else {
            feedback.toast = "Couldn't prepare the look for saving."
            return
        }
        spec["theme"] = json
        do { onSaved(try await APIClient.shared.updateSpec(site.id, spec: spec, summary: "Changed the look")); dismiss() } catch { feedback.fail(error) }
    }

    private func blend(_ a: String, toward b: String, _ t: Double) -> String {
        let ca = UIColor(Color(hex: a)), cb = UIColor(Color(hex: b))
        var r1: CGFloat = 0, g1: CGFloat = 0, b1: CGFloat = 0, a1: CGFloat = 0, r2: CGFloat = 0, g2: CGFloat = 0, b2: CGFloat = 0, a2: CGFloat = 0
        ca.getRed(&r1, green: &g1, blue: &b1, alpha: &a1); cb.getRed(&r2, green: &g2, blue: &b2, alpha: &a2)
        return Color(red: r1 + (r2 - r1) * t, green: g1 + (g2 - g1) * t, blue: b1 + (b2 - b1) * t).hexString
    }
}

// MARK: - Photos

struct PhotosSheet: View {
    var site: Site
    var onChanged: (Site) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var images: [ImageAsset] = []
    @State private var pending: [PickedPhoto] = []
    @State private var feedback = SheetFeedback()
    /// The parent is refreshed once when the sheet goes away, however it was closed.
    @State private var refreshedOnClose = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Photos on this site").font(Theme.body(14, weight: .semibold))
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                        ForEach(images) { im in
                            ZStack(alignment: .topTrailing) {
                                AsyncImage(url: im.absoluteURL) { img in img.resizable().scaledToFill() } placeholder: { Theme.line }
                                    .frame(maxWidth: .infinity).aspectRatio(1, contentMode: .fit).clipShape(RoundedRectangle(cornerRadius: 14))
                                    .overlay(alignment: .bottomLeading) {
                                        if im.kind != "featured" { Text(im.kind).font(Theme.body(10, weight: .bold)).padding(5).background(.black.opacity(0.5), in: Capsule()).foregroundStyle(.white).padding(6) }
                                    }
                                Button { Task { await remove(im) } } label: { Image(systemName: "xmark").font(.caption.bold()).foregroundStyle(.white).padding(6).background(.black.opacity(0.55), in: Circle()) }.padding(6)
                            }
                        }
                    }
                    PhotoGrid(photos: $pending, kind: "featured", siteId: site.id, max: 12)
                    Text("After adding photos, ask the editor to use them: \"Put the new photo of the shop front in the hero\".").font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
                .padding(20)
            }
            .background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Photos").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .onAppear { images = site.images ?? []; refreshedOnClose = false }   // re-armed: the camera cover also triggers onDisappear
            .onDisappear {
                // Swiping the sheet down skipped the Done button, so the editor never saw the new photos.
                guard !refreshedOnClose else { return }
                refreshedOnClose = true
                Task { await refresh() }
            }
            .sheetFeedback($feedback)
        }
    }

    private func remove(_ im: ImageAsset) async {
        do {
            try await APIClient.shared.deleteImage(im.id)
            images.removeAll { $0.id == im.id }
            await refresh()   // the preview and the parent's image list drop the photo straight away
        } catch { feedback.fail(error) }
    }
    /// Reloads the site so the parent gets the current photo list.
    private func refresh() async {
        do { let r = try await APIClient.shared.site(site.id); onChanged(r.site) } catch { feedback.fail(error) }
    }
}
