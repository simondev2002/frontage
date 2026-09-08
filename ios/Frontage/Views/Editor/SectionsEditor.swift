import SwiftUI

// Manual editing of the site's sections: reorder, remove, add, and edit every
// text field, button and photo directly. Saves through PUT /spec, so it is
// instant and never spends an AI credit.

enum SectionCatalog {
    static let names: [String: String] = ["hero": "Hero (top of page)", "about": "About", "services": "Services", "gallery": "Gallery", "testimonials": "Reviews", "features": "Highlights", "menu": "Menu", "pricing": "Pricing", "faq": "FAQ", "team": "Team", "hours": "Opening hours", "contact": "Contact", "cta": "Call to action", "text": "Text block", "custom": "Custom HTML"]
    static let variants: [String: [String]] = ["hero": ["offset", "poster", "split", "centered", "fullbleed", "editorial", "minimal"], "about": ["story", "text", "imageLeft", "imageRight", "stats"], "services": ["numbered", "cards", "list", "grid"], "gallery": ["editorial", "filmstrip", "grid", "masonry", "strip"], "testimonials": ["featured", "cards", "single", "wall"], "features": ["grid", "checklist", "columns"], "menu": ["ruled", "classic"], "faq": ["open", "numbered", "accordion"], "contact": ["table", "address", "split", "stacked"], "cta": ["framed", "overlap", "banner", "card"]]
    /// Layout names as owners read them; the raw values stay in the spec.
    static let variantLabels: [String: String] = ["offset": "Photo on a colour plate", "poster": "Poster", "split": "Text beside photo", "centered": "Centered", "fullbleed": "Full-width photo", "editorial": "Editorial", "minimal": "Minimal", "story": "Story with drop cap", "text": "Text only", "imageLeft": "Photo on the left", "imageRight": "Photo on the right", "stats": "With key numbers", "numbered": "Numbered list", "cards": "Cards", "list": "List", "grid": "Grid", "filmstrip": "Filmstrip", "masonry": "Masonry", "strip": "Photo strip", "featured": "One featured quote", "single": "One at a time", "wall": "Wall", "checklist": "Checklist", "columns": "Columns", "ruled": "Ruled menu", "classic": "Classic", "open": "All answers open", "accordion": "Accordion", "table": "Hours table beside form", "address": "Big address", "stacked": "Stacked", "framed": "Framed band", "overlap": "Photo with overlapping panel", "banner": "Banner", "card": "Card"]
    static func variantLabel(_ v: String) -> String { variantLabels[v] ?? v.replacingOccurrences(of: "([a-z])([A-Z])", with: "$1 $2", options: .regularExpression).capitalized }
    static let icons = ["scissors", "coffee", "star", "check", "phone", "mail", "map-pin", "clock", "heart", "leaf", "sparkle", "shield", "truck", "tool", "camera", "home", "car", "paw", "dumbbell", "cake", "flower", "briefcase", "sun", "droplet", "wine", "music", "book", "gift", "key", "smile", "zap", "award", "users", "calendar", "globe", "chef", "pen", "brush", "hammer", "bike"]
    static let labels: [String: String] = ["headline": "Headline", "subheadline": "Supporting text", "eyebrow": "Small label above", "heading": "Heading", "intro": "Intro text", "paragraphs": "Paragraphs", "text": "Text", "items": "Items", "plans": "Plans", "categories": "Categories", "members": "People", "stats": "Numbers", "imageId": "Photo", "imageIds": "Photos", "primaryCta": "Main button", "secondaryCta": "Second button", "button": "Button", "cta": "Button", "variant": "Layout", "showForm": "Show contact form", "showMap": "Show map", "note": "Note", "html": "HTML", "css": "CSS", "title": "Title", "description": "Description", "price": "Price", "icon": "Icon", "quote": "Quote", "author": "Name", "role": "Role or context", "question": "Question", "answer": "Answer", "name": "Name", "period": "Per", "features": "Included", "highlighted": "Highlight this plan", "bio": "Bio", "value": "Number", "label": "Button text", "href": "Link (#section, https://…, tel:…)"]
    static let longFields: Set<String> = ["subheadline", "description", "intro", "answer", "quote", "bio", "text", "html", "css"]
    /// Field order for a pleasant form; unknown keys follow alphabetically.
    static let order = ["variant", "eyebrow", "headline", "heading", "subheadline", "intro", "paragraphs", "text", "imageId", "imageIds", "items", "plans", "categories", "members", "stats", "primaryCta", "secondaryCta", "button", "showForm", "showMap", "note", "html", "css"]
    static let addable = ["about", "services", "gallery", "testimonials", "features", "menu", "pricing", "faq", "team", "hours", "contact", "cta", "text"]

    static func template(_ type: String) -> [String: JSONValue] {
        func s(_ v: String) -> JSONValue { .string(v) }
        switch type {
        case "about": return ["variant": s("text"), "eyebrow": .null, "heading": s("About us"), "paragraphs": .array([s("Tell your story in a few sentences.")]), "imageId": .null, "stats": .array([])]
        case "services": return ["variant": s("cards"), "heading": s("What we offer"), "intro": .null, "items": .array([.object(["title": s("Service"), "description": s("What it is and who it is for."), "price": .null, "imageId": .null, "icon": .null])])]
        case "gallery": return ["variant": s("grid"), "heading": s("Gallery"), "intro": .null, "imageIds": .array([])]
        case "testimonials": return ["variant": s("cards"), "heading": s("What customers say"), "items": .array([.object(["quote": s(""), "author": s(""), "role": .null])])]
        case "features": return ["variant": s("grid"), "heading": s("Why choose us"), "intro": .null, "items": .array([.object(["title": s(""), "description": s(""), "icon": s("star")])])]
        case "menu": return ["variant": s("ruled"), "heading": s("Menu"), "intro": .null, "categories": .array([.object(["name": s("Starters"), "items": .array([.object(["name": s(""), "description": .null, "price": s("")])])])])]
        case "pricing": return ["heading": s("Pricing"), "intro": .null, "plans": .array([.object(["name": s("Basic"), "price": s("€0"), "period": s("per month"), "description": .null, "features": .array([s("")]), "cta": .object(["label": s("Get started"), "href": s("#contact")]), "highlighted": .bool(false)])])]
        case "faq": return ["variant": s("open"), "heading": s("Questions"), "items": .array([.object(["question": s(""), "answer": s("")])])]
        case "team": return ["heading": s("The team"), "intro": .null, "members": .array([.object(["name": s(""), "role": s(""), "bio": .null, "imageId": .null])])]
        case "hours": return ["heading": s("Opening hours"), "note": .null]
        case "contact": return ["variant": s("split"), "heading": s("Get in touch"), "intro": .null, "showForm": .bool(true), "showMap": .bool(true)]
        case "cta": return ["variant": s("banner"), "heading": s("Ready when you are"), "text": .null, "button": .object(["label": s("Contact us"), "href": s("#contact")]), "imageId": .null]
        default: return ["heading": .null, "paragraphs": .array([s("")])]
        }
    }

    static func title(_ s: [String: JSONValue]) -> String {
        s["headline"]?.stringValue ?? s["heading"]?.stringValue ?? (s["type"]?.stringValue == "gallery" ? "\(s["imageIds"]?.arrayValue?.count ?? 0) photos" : "")
    }

    /// A blank copy of an item, used when adding to a list.
    static func blank(like obj: [String: JSONValue]) -> [String: JSONValue] {
        obj.mapValues { v in
            switch v {
            case .string: return .string("")
            case .bool: return .bool(false)
            case .array: return .array([])
            case .object(let o): return .object(blank(like: o))
            default: return .null
            }
        }
    }
}

// MARK: - Sections list

struct SectionsSheet: View {
    var site: Site
    var onSaved: (Site) -> Void
    @Environment(\.dismiss) private var dismiss
    @Environment(AppState.self) private var app
    @State private var sections: [[String: JSONValue]] = []
    @State private var editing: EditTarget?
    @State private var saving = false

    struct EditTarget: Identifiable { var index: Int; var section: [String: JSONValue]; var isNew: Bool; var id: String { "\(index)-\(isNew)" } }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(Array(sections.enumerated()), id: \.offset) { i, s in
                        Button { editing = EditTarget(index: i, section: s, isNew: false) } label: {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(SectionCatalog.names[s["type"]?.stringValue ?? ""] ?? (s["type"]?.stringValue ?? "Section")).font(Theme.body(15, weight: .semibold))
                                Text(SectionCatalog.title(s)).font(Theme.body(13)).foregroundStyle(Theme.muted).lineLimit(1)
                            }
                        }
                        .deleteDisabled(s["type"]?.stringValue == "hero")
                    }
                    .onMove { from, to in sections.move(fromOffsets: from, toOffset: to); Task { await save("Reordered sections") } }
                    .onDelete { at in sections.remove(atOffsets: at); Task { await save("Removed a section") } }
                } header: { Text("Tap to edit text and photos. Drag to reorder. Changes save instantly and never use an AI credit.") }
                Section("Add a section") {
                    ForEach(SectionCatalog.addable, id: \.self) { t in
                        Button(SectionCatalog.names[t] ?? t) { addSection(t) }
                    }
                }
            }
            .environment(\.editMode, .constant(.active))
            .scrollContentBackground(.hidden).background(Theme.paper.ignoresSafeArea())
            .navigationTitle("Sections & text").navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
            .sheet(item: $editing) { target in
                SectionEditorView(site: site, section: target.section) { edited in
                    if target.isNew { sections.insert(edited, at: min(target.index, sections.count)) } else { sections[target.index] = edited }
                    Task { await save("\(target.isNew ? "Added" : "Edited") \(SectionCatalog.names[edited["type"]?.stringValue ?? ""] ?? "section")") }
                }
            }
            .onAppear { sections = site.spec?["sections"]?.arrayValue?.compactMap(\.objectValue) ?? [] }
            .overlay { if saving { LoadingOverlay(text: "Saving") } }
        }
    }

    private func addSection(_ type: String) {
        let ids = Set(sections.compactMap { $0["id"]?.stringValue })
        var id = type
        while ids.contains(id) { id = "\(type)-\(Int.random(in: 100...999))" }
        var s = SectionCatalog.template(type)
        s["id"] = .string(id); s["type"] = .string(type)
        let at = sections.firstIndex { $0["type"]?.stringValue == "contact" } ?? sections.count
        editing = EditTarget(index: at, section: s, isNew: true)
    }

    private func save(_ summary: String) async {
        guard var spec = site.spec else { return }
        spec["sections"] = .array(sections.map { .object($0) })
        saving = true
        do { onSaved(try await APIClient.shared.updateSpec(site.id, spec: spec, summary: summary)) } catch { app.handle(error) }
        saving = false
    }
}

// MARK: - One section

struct SectionEditorView: View {
    var site: Site
    @State var section: [String: JSONValue]
    var onSave: ([String: JSONValue]) -> Void
    @Environment(\.dismiss) private var dismiss

    private var type: String { section["type"]?.stringValue ?? "" }
    private var orderedKeys: [String] {
        let known = SectionCatalog.order.filter { section[$0] != nil }
        let rest = section.keys.filter { !SectionCatalog.order.contains($0) && $0 != "id" && $0 != "type" }.sorted()
        return known + rest
    }

    var body: some View {
        NavigationStack {
            Form {
                ForEach(orderedKeys, id: \.self) { key in
                    FieldRow(key: key, value: binding(key), type: type, images: site.images ?? [], nested: false)
                }
            }
            .scrollContentBackground(.hidden).background(Theme.paper.ignoresSafeArea())
            .navigationTitle(SectionCatalog.names[type] ?? type).navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { onSave(normalized()); dismiss() }.bold() }
            }
        }
    }

    private func binding(_ key: String) -> Binding<JSONValue> {
        Binding(get: { section[key] ?? .null }, set: { section[key] = $0 })
    }

    /// Empty optional text becomes null; an optional button without text is dropped.
    private func normalized() -> [String: JSONValue] {
        var s = section
        for (k, v) in s {
            if case .string(let str) = v, str.trimmingCharacters(in: .whitespaces).isEmpty, ["eyebrow", "intro", "price", "note", "role", "period", "bio", "text"].contains(k) || (k == "heading" && ["gallery", "testimonials", "text"].contains(type)) { s[k] = .null }
        }
        if case .object(let o) = s["secondaryCta"] ?? .null, (o["label"]?.stringValue ?? "").isEmpty { s["secondaryCta"] = .null }
        return s
    }
}

/// Renders one field of a section (or of an item inside a list) from its JSON value.
struct FieldRow: View {
    var key: String
    @Binding var value: JSONValue
    var type: String
    var images: [ImageAsset]
    var nested: Bool

    private var label: String { SectionCatalog.labels[key] ?? key }

    var body: some View {
        switch value {
        case .bool(let b):
            Toggle(label, isOn: Binding(get: { b }, set: { value = .bool($0) })).tint(Theme.green)
        case .array(let arr):
            if arr.first?.objectValue != nil || (arr.isEmpty && ["items", "plans", "categories", "members", "stats"].contains(key)) {
                objectList(arr)
            } else if key == "imageIds" {
                imageMulti(arr.compactMap(\.stringValue))
            } else {
                stringList(arr)
            }
        case .object(let o):
            Section(label) {
                ForEach(o.keys.sorted { ($0 == "label" ? 0 : 1) < ($1 == "label" ? 0 : 1) }, id: \.self) { k in
                    FieldRow(key: k, value: Binding(get: { o[k] ?? .null }, set: { nv in var c = o; c[k] = nv; value = .object(c) }), type: type, images: images, nested: true)
                }
            }
        default:
            scalar
        }
    }

    @ViewBuilder private var scalar: some View {
        let text = Binding<String>(get: { value.stringValue ?? "" }, set: { value = $0.isEmpty && value.isNull ? .null : .string($0) })
        if key == "variant" {
            Picker("Layout", selection: text) { ForEach(SectionCatalog.variants[type] ?? [text.wrappedValue], id: \.self) { Text(SectionCatalog.variantLabel($0)).tag($0) } }
        } else if key == "icon" {
            Picker(label, selection: text) { Text("None").tag(""); ForEach(SectionCatalog.icons, id: \.self) { Text($0).tag($0) } }
        } else if key == "imageId" {
            imagePicker
        } else if ["secondaryCta", "cta", "button"].contains(key), value.isNull {
            Button("Add a button") { value = .object(["label": .string(""), "href": .string("#contact")]) }
        } else if SectionCatalog.longFields.contains(key) {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(Theme.body(13, weight: .semibold)).foregroundStyle(Theme.muted)
                TextEditor(text: text).frame(minHeight: 80)
            }
        } else {
            VStack(alignment: .leading, spacing: 4) {
                Text(label).font(Theme.body(13, weight: .semibold)).foregroundStyle(Theme.muted)
                TextField(label, text: text)
            }
        }
    }

    private var imagePicker: some View {
        VStack(alignment: .leading, spacing: 6) {
            Text(label).font(Theme.body(13, weight: .semibold)).foregroundStyle(Theme.muted)
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    Button { value = .null } label: { Text("None").font(Theme.body(13, weight: .semibold)).frame(width: 56, height: 56).background(value.isNull ? Theme.ink : Theme.card, in: RoundedRectangle(cornerRadius: 10)).foregroundStyle(value.isNull ? .white : Theme.ink).overlay(RoundedRectangle(cornerRadius: 10).stroke(Theme.line)) }
                    ForEach(images) { im in
                        Button { value = .string(im.id) } label: {
                            AsyncImage(url: im.absoluteURL) { $0.resizable().scaledToFill() } placeholder: { Theme.line }
                                .frame(width: 56, height: 56).clipShape(RoundedRectangle(cornerRadius: 10))
                                .overlay(RoundedRectangle(cornerRadius: 10).stroke(value.stringValue == im.id ? Theme.green : .clear, lineWidth: 3))
                        }
                    }
                }
            }
        }
    }

    private func imageMulti(_ selected: [String]) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            Text("\(label) (tap to include)").font(Theme.body(13, weight: .semibold)).foregroundStyle(Theme.muted)
            if images.isEmpty { Text("Upload photos first (⋯ → Photos).").font(Theme.body(13)).foregroundStyle(Theme.muted) }
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 8), count: 4), spacing: 8) {
                ForEach(images) { im in
                    Button {
                        var ids = selected
                        if let i = ids.firstIndex(of: im.id) { ids.remove(at: i) } else { ids.append(im.id) }
                        value = .array(ids.map { .string($0) })
                    } label: {
                        AsyncImage(url: im.absoluteURL) { $0.resizable().scaledToFill() } placeholder: { Theme.line }
                            .frame(height: 64).clipShape(RoundedRectangle(cornerRadius: 10))
                            .overlay(RoundedRectangle(cornerRadius: 10).stroke(selected.contains(im.id) ? Theme.green : .clear, lineWidth: 3))
                    }
                }
            }
        }
    }

    private func stringList(_ arr: [JSONValue]) -> some View {
        Section(label) {
            ForEach(arr.indices, id: \.self) { i in
                HStack(alignment: .top) {
                    TextEditor(text: Binding(get: { arr[i].stringValue ?? "" }, set: { nv in var c = arr; c[i] = .string(nv); value = .array(c) })).frame(minHeight: 44)
                    Button { var c = arr; c.remove(at: i); value = .array(c) } label: { Image(systemName: "minus.circle.fill").foregroundStyle(Theme.muted) }
                }
            }
            Button { value = .array(arr + [.string("")]) } label: { Label("Add", systemImage: "plus") }
        }
    }

    private func objectList(_ arr: [JSONValue]) -> some View {
        Section(label) {
            ForEach(arr.indices, id: \.self) { i in
                if let obj = arr[i].objectValue {
                    DisclosureGroup("\(label.dropLast(label.hasSuffix("s") ? 1 : 0)) \(i + 1): \(obj["title"]?.stringValue ?? obj["name"]?.stringValue ?? obj["question"]?.stringValue ?? obj["author"]?.stringValue ?? "")") {
                        ForEach(obj.keys.sorted { orderIndex($0) < orderIndex($1) }, id: \.self) { k in
                            FieldRow(key: k, value: Binding(get: { obj[k] ?? .null }, set: { nv in var c = arr; var o = obj; o[k] = nv; c[i] = .object(o); value = .array(c) }), type: type, images: images, nested: true)
                        }
                        HStack {
                            Button { if i > 0 { var c = arr; c.swapAt(i, i - 1); value = .array(c) } } label: { Label("Up", systemImage: "arrow.up") }.disabled(i == 0)
                            Button { if i < arr.count - 1 { var c = arr; c.swapAt(i, i + 1); value = .array(c) } } label: { Label("Down", systemImage: "arrow.down") }.disabled(i == arr.count - 1)
                            Spacer()
                            Button(role: .destructive) { var c = arr; c.remove(at: i); value = .array(c) } label: { Label("Remove", systemImage: "trash") }
                        }
                        .font(Theme.body(14, weight: .semibold)).buttonStyle(.borderless)
                    }
                }
            }
            Button {
                let blank: [String: JSONValue] = arr.first?.objectValue.map(SectionCatalog.blank(like:)) ?? (SectionCatalog.template(type)[key]?.arrayValue?.first?.objectValue ?? [:])
                value = .array(arr + [.object(blank)])
            } label: { Label("Add", systemImage: "plus") }
        }
    }

    private func orderIndex(_ k: String) -> Int {
        let order = ["name", "title", "question", "quote", "value", "label", "description", "answer", "author", "role", "price", "period", "href", "features", "cta", "highlighted", "icon", "imageId", "bio", "items"]
        return order.firstIndex(of: k) ?? 99
    }
}
