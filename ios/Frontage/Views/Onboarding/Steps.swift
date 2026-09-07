import SwiftUI
import PhotosUI

// MARK: - 1. Name

struct NameStep: View {
    @Bindable var draft: BriefDraft
    var next: () -> Void
    @FocusState private var focus: Bool

    var body: some View {
        StepScaffold(eyebrow: "Step 1 of 5", title: "What's your business called?", subtitle: "Exactly as your customers know it.", canContinue: draft.canContinueFromName, next: next) {
            TextField("e.g. Oak & Ember Bakery", text: $draft.businessName)
                .font(Theme.display(28))
                .focused($focus)
                .submitLabel(.next)
                .onSubmit { if draft.canContinueFromName { next() } }
                .padding(.vertical, 6)
            Divider()
            InputField(title: "Where are you based? (optional)", placeholder: "City or neighbourhood", text: $draft.location, capitalization: .words)
            VStack(alignment: .leading, spacing: 6) {
                FieldLabel(text: "Website language")
                Picker("Website language", selection: $draft.language) {
                    ForEach(BriefDraft.languages, id: \.code) { l in Text(l.name).tag(l.code) }
                }
                .pickerStyle(.menu)
                .tint(Theme.ink)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.horizontal, 14).padding(.vertical, 8)
                .background(Theme.card, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
                .overlay(RoundedRectangle(cornerRadius: 12, style: .continuous).stroke(Theme.line))
                Text("The language your customers read. You can write your answers in any language.").font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
        }
        .onAppear { focus = true }
    }
}

// MARK: - 2. About

struct AboutStep: View {
    @Bindable var draft: BriefDraft
    var next: () -> Void
    @State private var newService = ""

    var body: some View {
        StepScaffold(eyebrow: "Step 2 of 5", title: "Tell us about it", subtitle: "Write like you'd explain it to a new customer. The more specific, the better the site.", canContinue: draft.canContinueFromAbout, next: next) {
            VStack(alignment: .leading, spacing: 8) {
                FieldLabel(text: "What kind of business?")
                FlowLayout {
                    ForEach(BriefDraft.categories, id: \.self) { c in
                        Chip(text: c, selected: draft.category == c) { draft.category = c }
                    }
                }
            }
            MultilineField(title: "What do you do, and for whom?", placeholder: "We're a family bakery in Larnaca. Wood-fired sourdough, croissants and Cypriot koulouri, baked fresh every morning since 2016…", text: $draft.description, minHeight: 140)

            VStack(alignment: .leading, spacing: 8) {
                FieldLabel(text: "Main services or products (optional)")
                ForEach(draft.services.indices, id: \.self) { i in
                    HStack {
                        TextField("Service", text: $draft.services[i]).padding(12)
                            .background(Theme.card, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
                        Button { draft.services.remove(at: i) } label: { Image(systemName: "minus.circle.fill").foregroundStyle(Theme.muted) }
                    }
                }
                HStack {
                    TextField("e.g. Beard trim from €12", text: $newService)
                        .padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
                        .onSubmit(addService)
                    Button(action: addService) { Image(systemName: "plus.circle.fill").foregroundStyle(Theme.green).font(.title2) }
                        .disabled(newService.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            }
            MultilineField(title: "What makes you different? (optional)", placeholder: "Family recipes, 20 years of experience, same-day service, the only one in town who…", text: $draft.differentiators, minHeight: 90)
            VStack(alignment: .leading, spacing: 8) {
                FieldLabel(text: "What should visitors do?")
                FlowLayout {
                    ForEach(BriefDraft.actions, id: \.self) { a in
                        Chip(text: a, selected: draft.primaryAction == a) { draft.primaryAction = a }
                    }
                }
            }
        }
    }

    private func addService() {
        let s = newService.trimmingCharacters(in: .whitespaces)
        guard !s.isEmpty else { return }
        draft.services.append(s)
        newService = ""
    }
}

// MARK: - 3. Look

struct LookStep: View {
    @Bindable var draft: BriefDraft
    var next: () -> Void

    var body: some View {
        StepScaffold(eyebrow: "Step 3 of 5", title: "How should it feel?", subtitle: "Pick up to three words. Frontage designs the rest.", next: next) {
            FlowLayout {
                ForEach(BriefDraft.moods, id: \.self) { m in
                    Chip(text: m, selected: draft.mood.contains(m)) {
                        if let i = draft.mood.firstIndex(of: m) { draft.mood.remove(at: i) }
                        else if draft.mood.count < 3 { draft.mood.append(m) }
                    }
                }
            }
            Toggle(isOn: $draft.letAIChooseColors) {
                VStack(alignment: .leading, spacing: 2) {
                    Text("Let Frontage choose the colors").font(Theme.body(16, weight: .semibold))
                    Text("Recommended: we match colors to your photos and business.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
            }
            .tint(Theme.green)
            .padding(14).background(Theme.card, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))

            if !draft.letAIChooseColors {
                VStack(alignment: .leading, spacing: 10) {
                    FieldLabel(text: "Colors you like (up to 3)")
                    LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: 5), spacing: 14) {
                        ForEach(BriefDraft.colorOptions, id: \.hex) { c in
                            let on = draft.colors.contains(c.name)
                            Button {
                                if let i = draft.colors.firstIndex(of: c.name) { draft.colors.remove(at: i) }
                                else if draft.colors.count < 3 { draft.colors.append(c.name) }
                            } label: {
                                VStack(spacing: 6) {
                                    Circle().fill(Color(hex: c.hex)).frame(width: 44, height: 44)
                                        .overlay(Circle().stroke(on ? Theme.ink : Theme.line, lineWidth: on ? 3 : 1))
                                        .overlay { if on { Image(systemName: "checkmark").foregroundStyle(c.hex == "#f4efe4" ? Theme.ink : .white).fontWeight(.bold) } }
                                    Text(c.name).font(Theme.body(11)).foregroundStyle(Theme.muted).lineLimit(1).minimumScaleFactor(0.8)
                                }
                            }
                            .buttonStyle(.plain)
                        }
                    }
                }
            }
            MultilineField(title: "Anything else about the style? (optional)", placeholder: "Like the feel of our Instagram. Big photos. No stock-photo vibes.", text: $draft.styleNotes, minHeight: 80)

            VStack(alignment: .leading, spacing: 8) {
                FieldLabel(text: "Inspiration (optional)")
                Text("Screenshots of sites or brands you like. Used for mood only, never shown on your site.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                PhotoGrid(photos: $draft.references, kind: "reference", siteId: nil, max: 3)
            }
        }
    }
}

// MARK: - 4. Photos

struct PhotosStep: View {
    @Bindable var draft: BriefDraft
    var next: () -> Void
    @State private var logoItems: [PhotosPickerItem] = []

    var body: some View {
        StepScaffold(eyebrow: "Step 4 of 5", title: "Add your photos", subtitle: "Real photos of your work, your place and your people beat stock photos every time. Add 3 to 12.", cta: draft.photos.isEmpty ? "Continue without photos" : "Continue", next: next) {
            PhotoGrid(photos: $draft.photos, kind: "featured", siteId: nil, max: 12)
            VStack(alignment: .leading, spacing: 8) {
                FieldLabel(text: "Logo (optional)")
                HStack(spacing: 12) {
                    if let logo = draft.logo {
                        PhotoTile(photo: logo) { draft.logo = nil }
                            .frame(width: 96, height: 96)
                    } else {
                        PhotosPicker(selection: $logoItems, maxSelectionCount: 1, matching: .images) {
                            Label("Add logo", systemImage: "plus").font(Theme.body(15, weight: .semibold))
                                .frame(width: 120, height: 48)
                                .background(Theme.card, in: RoundedRectangle(cornerRadius: 12)).overlay(RoundedRectangle(cornerRadius: 12).stroke(Theme.line))
                        }
                        .onChange(of: logoItems) { _, new in
                            guard let item = new.first else { return }
                            let p = PickedPhoto(kind: "logo")
                            draft.logo = p
                            Task { await PhotoIntake.load(item: item, into: p, siteId: nil) }
                            logoItems = []
                        }
                    }
                    Text("PNG with transparent background works best.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                }
            }
        }
    }
}

/// Reusable picker + grid with upload state. Used in onboarding and in the editor's Photos sheet.
struct PhotoGrid: View {
    @Binding var photos: [PickedPhoto]
    var kind: String
    var siteId: String?
    var max: Int
    @State private var captioning: PickedPhoto?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 10), count: 3), spacing: 10) {
                ForEach(photos) { p in
                    PhotoTile(photo: p) { photos.removeAll { $0.id == p.id } }
                        .onTapGesture { if kind == "featured" { captioning = p } }
                }
                if photos.count < max {
                    // Camera or library; inspiration screenshots are library-only.
                    PhotoSourceButton(kind: kind, siteId: siteId, maxCount: max - photos.count, allowCamera: kind != "reference", photos: $photos) {
                        Color.clear
                            .aspectRatio(1, contentMode: .fit)
                            .background(Theme.green.opacity(0.08), in: RoundedRectangle(cornerRadius: 14))
                            .overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.green.opacity(0.3), style: StrokeStyle(lineWidth: 1.5, dash: [6])))
                            .overlay {
                                VStack(spacing: 6) {
                                    Image(systemName: kind == "reference" ? "plus" : "camera").font(.title2)
                                    Text(photos.isEmpty ? "Add photos" : "Add more").font(Theme.body(13, weight: .semibold)).lineLimit(1).minimumScaleFactor(0.8)
                                }
                                .foregroundStyle(Theme.green)
                                .padding(6)
                            }
                            .contentShape(RoundedRectangle(cornerRadius: 14))
                    }
                }
            }
            if kind == "featured", !photos.isEmpty {
                Text("Tap a photo to add a note, like \"our shop front\" or \"the team\".").font(Theme.body(13)).foregroundStyle(Theme.muted)
            }
        }
        .sheet(item: $captioning) { p in CaptionSheet(photo: p) }
    }
}

struct PhotoTile: View {
    var photo: PickedPhoto
    var remove: () -> Void
    var body: some View {
        ZStack(alignment: .topTrailing) {
            Group {
                if let img = photo.thumbnail {
                    Image(uiImage: img).resizable().scaledToFill()
                } else {
                    Theme.line
                }
            }
            .frame(maxWidth: .infinity).aspectRatio(1, contentMode: .fit)
            .clipShape(RoundedRectangle(cornerRadius: 14))
            .overlay(alignment: .bottomLeading) {
                if !photo.caption.isEmpty {
                    Text(photo.caption).font(Theme.body(11, weight: .medium)).foregroundStyle(.white).lineLimit(1)
                        .padding(6).background(.black.opacity(0.5), in: RoundedRectangle(cornerRadius: 6)).padding(6)
                }
            }
            .overlay {
                if photo.uploading { ProgressView().tint(.white).padding(8).background(.black.opacity(0.4), in: Circle()) }
                if photo.failed { Image(systemName: "exclamationmark.triangle.fill").foregroundStyle(Theme.coral).padding(8).background(.white, in: Circle()) }
            }
            Button(action: remove) {
                Image(systemName: "xmark").font(.caption.bold()).foregroundStyle(.white).padding(6).background(.black.opacity(0.55), in: Circle())
            }
            .padding(6)
        }
    }
}

struct CaptionSheet: View {
    @Bindable var photo: PickedPhoto
    @Environment(\.dismiss) private var dismiss
    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 16) {
                if let img = photo.thumbnail { Image(uiImage: img).resizable().scaledToFit().frame(maxHeight: 220).clipShape(RoundedRectangle(cornerRadius: 14)) }
                InputField(title: "What's in this photo?", placeholder: "e.g. Our shop front on Zinonos street", text: $photo.caption)
                Text("Helps Frontage place it well. Optional.").font(Theme.body(13)).foregroundStyle(Theme.muted)
                Spacer()
            }
            .padding(20)
            .background(Theme.paper.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
        .presentationDetents([.medium])
    }
}

// MARK: - 5. Contact

struct ContactStep: View {
    @Bindable var draft: BriefDraft
    var next: () -> Void

    var body: some View {
        StepScaffold(eyebrow: "Step 5 of 5", title: "How do customers reach you?", subtitle: "Everything here is optional, but a phone number and address make a local site far more useful.", next: next) {
            InputField(title: "Phone", placeholder: "+357 99 123456", text: $draft.phone, keyboard: .phonePad)
            InputField(title: "Email", placeholder: "hello@yourbusiness.com", text: $draft.email, keyboard: .emailAddress, capitalization: .never)
            InputField(title: "Address", placeholder: "Street, city", text: $draft.address, capitalization: .words)
            InputField(title: "Booking or ordering link", placeholder: "https://…", text: $draft.bookingUrl, keyboard: .URL, capitalization: .never)
            VStack(alignment: .leading, spacing: 8) {
                FieldLabel(text: "Opening hours")
                ForEach(draft.hoursRows.indices, id: \.self) { i in
                    HStack(spacing: 8) {
                        TextField("Mon – Fri", text: $draft.hoursRows[i].days).padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
                        TextField("9:00 – 18:00", text: $draft.hoursRows[i].hours).padding(12).background(Theme.card, in: RoundedRectangle(cornerRadius: 10)).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line))
                        Button { draft.hoursRows.remove(at: i) } label: { Image(systemName: "minus.circle.fill").foregroundStyle(Theme.muted) }
                    }
                }
                Button { draft.hoursRows.append(.init(days: "", hours: "")) } label: { Label("Add hours", systemImage: "plus").font(Theme.body(15, weight: .semibold)) }
            }
            InputField(title: "Instagram", placeholder: "@yourbusiness", text: $draft.instagram, capitalization: .never)
            InputField(title: "Facebook", placeholder: "facebook.com/yourbusiness", text: $draft.facebook, keyboard: .URL, capitalization: .never)
            InputField(title: "Another link (optional)", placeholder: "TikTok, Google Maps, TripAdvisor…", text: $draft.otherLink, keyboard: .URL, capitalization: .never)
        }
    }
}

// MARK: - 6. Review

struct ReviewStep: View {
    var draft: BriefDraft
    var creating: Bool
    var error: String?
    var create: () async -> Void
    @Environment(AppState.self) private var app
    @State private var aiConsent = false

    private func consentThenCreate() async {
        if app.user?.aiConsentAt == nil {
            guard aiConsent else { return }
            if let u = try? await APIClient.shared.setAiConsent(true) { app.user = u }
        }
        await create()
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                StepHeader(eyebrow: "Ready", title: "Let's build \(draft.businessName).", subtitle: "Frontage will design the site, write the words and place your photos. You can change anything afterwards.")
                summary("Business", "\(draft.category.isEmpty ? "Business" : draft.category)\(draft.location.isEmpty ? "" : " · \(draft.location)") · \(BriefDraft.languages.first { $0.code == draft.language }?.name ?? "English")")
                summary("Look", (draft.mood.isEmpty ? ["Frontage's choice"] : draft.mood).joined(separator: ", ") + (draft.letAIChooseColors ? "" : " · " + draft.colors.joined(separator: ", ")))
                summary("Photos", "\(draft.photos.count) photo\(draft.photos.count == 1 ? "" : "s")\(draft.logo == nil ? "" : " + logo")\(draft.references.isEmpty ? "" : " · \(draft.references.count) inspiration")")
                summary("Contact", [draft.phone, draft.email, draft.address].filter { !$0.isEmpty }.joined(separator: " · ").ifEmpty("Not provided yet"))
                if draft.pendingUploads {
                    HStack(spacing: 8) { ProgressView(); Text("Finishing photo uploads…").font(Theme.body(14)).foregroundStyle(Theme.muted) }
                }
                if let error { Text(error).font(Theme.body(14)).foregroundStyle(Theme.coral) }
                if app.user?.aiConsentAt == nil {
                    // Guideline 5.1.2(i): explicit permission before personal data goes to a third-party AI.
                    Toggle(isOn: $aiConsent) {
                        VStack(alignment: .leading, spacing: 4) {
                            Text("Send my business details and photos to Anthropic, our AI provider, to design my website.")
                                .font(Theme.body(14))
                            Link("Privacy Policy", destination: URL(string: app.config?.privacyUrl ?? AppConfig.privacyURL.absoluteString)!)
                                .font(Theme.body(13, weight: .semibold))
                        }
                    }
                    .tint(Theme.green)
                    .padding(14).background(Theme.card, in: RoundedRectangle(cornerRadius: 14)).overlay(RoundedRectangle(cornerRadius: 14).stroke(Theme.line))
                }
                AsyncButton { await consentThenCreate() } label: { Text("Create my website") }
                    .buttonStyle(PrimaryButtonStyle(fill: Theme.green))
                    .disabled(creating || (app.user?.aiConsentAt == nil && !aiConsent))
                    .opacity(app.user?.aiConsentAt == nil && !aiConsent ? 0.5 : 1)
                if app.entitlement?.isPaid != true {
                    Text("Your first website is free to preview. Subscribe when you want to make changes or publish it.")
                        .font(Theme.body(13)).foregroundStyle(Theme.muted).multilineTextAlignment(.center).frame(maxWidth: .infinity)
                }
            }
            .padding(24)
        }
        .background(Theme.paper.ignoresSafeArea())
        .navigationBarTitleDisplayMode(.inline)
    }

    private func summary(_ title: String, _ value: String) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title.uppercased()).font(Theme.body(11, weight: .bold)).tracking(1).foregroundStyle(Theme.muted)
            Text(value).font(Theme.body(16)).foregroundStyle(Theme.ink)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .cardStyle(padding: 14)
    }
}

extension String {
    func ifEmpty(_ fallback: String) -> String { isEmpty ? fallback : self }
}

extension Color {
    init(hex: String) {
        var h = hex.trimmingCharacters(in: .whitespaces).replacingOccurrences(of: "#", with: "")
        if h.count == 3 { h = h.map { "\($0)\($0)" }.joined() }
        let v = UInt64(h, radix: 16) ?? 0
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
    var hexString: String {
        let ui = UIColor(self)
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        ui.getRed(&r, green: &g, blue: &b, alpha: &a)
        return String(format: "#%02x%02x%02x", Int(round(r * 255)), Int(round(g * 255)), Int(round(b * 255)))
    }
}
