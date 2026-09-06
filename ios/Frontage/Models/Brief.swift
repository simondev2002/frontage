import SwiftUI
import PhotosUI

/// What the server's generation prompt consumes. Mirrors `cleanBrief` on the server.
struct BriefPayload: Codable, Equatable {
    struct Hours: Codable, Equatable { var days: String; var hours: String }
    struct Social: Codable, Equatable { var platform: String; var url: String }
    struct Testimonial: Codable, Equatable { var quote: String; var author: String; var role: String }

    var businessName = ""
    var category = ""
    var description = ""
    var location = ""
    var audience = ""
    var services: [String] = []
    var differentiators = ""
    var primaryAction = ""
    var language = ""
    var phone = ""
    var email = ""
    var address = ""
    var bookingUrl = ""
    var hours: [Hours] = []
    var socials: [Social] = []
    var colors: [String] = []
    var mood: [String] = []
    var styleNotes = ""
    var testimonials: [Testimonial] = []
}

/// A photo the owner picked, with its upload state. Uploads start immediately
/// so the site can be generated the moment the owner taps "Create".
@Observable
final class PickedPhoto: Identifiable {
    let id = UUID()
    var thumbnail: UIImage?
    var jpeg: Data?
    var caption = ""
    var kind: String            // featured | reference | logo
    var uploadedId: String?
    var failed = false
    var uploading = false

    init(kind: String) { self.kind = kind }
}

/// Mutable draft that the onboarding steps bind to.
@Observable
final class BriefDraft {
    var businessName = ""
    var language = "en"
    var category = ""
    var description = ""
    var location = ""
    var services: [String] = []
    var differentiators = ""
    var primaryAction = "Send a message"
    var phone = ""
    var email = ""
    var address = ""
    var bookingUrl = ""
    var instagram = ""
    var facebook = ""
    var otherLink = ""
    var hoursRows: [BriefPayload.Hours] = [.init(days: "Mon – Fri", hours: "9:00 – 18:00")]
    var colors: [String] = []          // named or hex, e.g. "deep green" or "#1f4d3a"
    var mood: [String] = []
    var styleNotes = ""
    var letAIChooseColors = true
    var photos: [PickedPhoto] = []
    var references: [PickedPhoto] = []
    var logo: PickedPhoto?

    static let categories = ["Restaurant or café", "Barber or salon", "Trades and repairs", "Cleaning", "Fitness and wellness", "Beauty and spa", "Shop or boutique", "Professional services", "Photography or creative", "Real estate", "Health and clinics", "Events and weddings", "Automotive", "Education and tutoring", "Other"]
    static let moods = ["Warm", "Bold", "Minimal", "Luxury", "Playful", "Classic", "Modern", "Editorial"]
    static let actions = ["Send a message", "Call us", "Book online", "Order online", "Visit us", "Get a quote"]
    static let languages: [(code: String, name: String)] = [("en", "English"), ("el", "Greek"), ("sv", "Swedish"), ("de", "German"), ("fr", "French"), ("es", "Spanish"), ("it", "Italian"), ("nl", "Dutch"), ("pt", "Portuguese"), ("da", "Danish"), ("no", "Norwegian"), ("fi", "Finnish"), ("pl", "Polish"), ("tr", "Turkish"), ("ru", "Russian"), ("ar", "Arabic")]
    static let colorOptions: [(name: String, hex: String)] = [
        ("Deep green", "#1f4d3a"), ("Terracotta", "#9a3b1f"), ("Navy", "#1b2a49"), ("Black", "#151515"), ("Burgundy", "#6b1d2a"),
        ("Ocean blue", "#1f6fa8"), ("Coral", "#e0623d"), ("Mustard", "#d9a028"), ("Sage", "#7a9b76"), ("Lavender", "#7c6bb3"),
        ("Charcoal", "#2f3437"), ("Cream", "#f4efe4"), ("Blush", "#e9c1c1"), ("Sand", "#d8c3a5"), ("Teal", "#127c7c"),
    ]

    var allPhotos: [PickedPhoto] { photos + references + (logo.map { [$0] } ?? []) }
    var pendingUploads: Bool { allPhotos.contains { $0.uploading || ($0.uploadedId == nil && !$0.failed) } }
    var uploadedImageIds: [String] { allPhotos.compactMap(\.uploadedId) }

    var canContinueFromName: Bool { businessName.trimmingCharacters(in: .whitespaces).count >= 2 }
    var canContinueFromAbout: Bool { !category.isEmpty && description.trimmingCharacters(in: .whitespaces).count >= 10 }

    func payload() -> BriefPayload {
        var p = BriefPayload()
        p.businessName = businessName.trimmingCharacters(in: .whitespaces)
        p.category = category
        p.description = description
        p.location = location
        p.services = services.filter { !$0.isEmpty }
        p.differentiators = differentiators
        p.primaryAction = primaryAction
        // The owner picks the site language in step 1 (English by default). Never
        // derive it from the device locale: that produced Swedish sites from English briefs.
        p.language = language
        p.phone = phone; p.email = email; p.address = address; p.bookingUrl = bookingUrl
        p.hours = hoursRows.filter { !$0.days.isEmpty && !$0.hours.isEmpty }
        var socials: [BriefPayload.Social] = []
        if !instagram.isEmpty { socials.append(.init(platform: "instagram", url: normalizeSocial(instagram, host: "instagram.com"))) }
        if !facebook.isEmpty { socials.append(.init(platform: "facebook", url: normalizeSocial(facebook, host: "facebook.com"))) }
        if !otherLink.isEmpty { socials.append(.init(platform: "other", url: otherLink.hasPrefix("http") ? otherLink : "https://" + otherLink)) }
        p.socials = socials
        p.colors = letAIChooseColors ? [] : colors
        p.mood = mood
        p.styleNotes = styleNotes
        return p
    }

    private func normalizeSocial(_ raw: String, host: String) -> String {
        let s = raw.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("http") { return s }
        return "https://\(host)/\(s.replacingOccurrences(of: "@", with: ""))"
    }
}

// MARK: - Photo picking + immediate upload

@MainActor
enum PhotoIntake {
    static func add(items: [PhotosPickerItem], kind: String, siteId: String?, to list: inout [PickedPhoto]) {
        for item in items {
            let photo = PickedPhoto(kind: kind)
            list.append(photo)
            Task { await load(item: item, into: photo, siteId: siteId) }
        }
    }

    static func load(item: PhotosPickerItem, into photo: PickedPhoto, siteId: String?) async {
        photo.uploading = true
        defer { photo.uploading = false }
        guard let data = try? await item.loadTransferable(type: Data.self),
              let jpeg = await ImageResizer.jpegForUpload(data) else { photo.failed = true; return }
        photo.jpeg = jpeg
        photo.thumbnail = UIImage(data: jpeg)
        await upload(photo, siteId: siteId)
    }

    /// A photo just taken with the camera (see `CameraPicker`).
    static func add(image: UIImage, kind: String, siteId: String?, to list: inout [PickedPhoto]) {
        let photo = PickedPhoto(kind: kind)
        list.append(photo)
        Task { await load(image: image, into: photo, siteId: siteId) }
    }

    static func load(image: UIImage, into photo: PickedPhoto, siteId: String?) async {
        photo.uploading = true
        defer { photo.uploading = false }
        // Encoding once at high quality bakes in the camera orientation before the resizer runs.
        guard let raw = image.jpegData(compressionQuality: 0.95),
              let jpeg = await ImageResizer.jpegForUpload(raw) else { photo.failed = true; return }
        photo.jpeg = jpeg
        photo.thumbnail = UIImage(data: jpeg)
        await upload(photo, siteId: siteId)
    }

    static func upload(_ photo: PickedPhoto, siteId: String?) async {
        guard let jpeg = photo.jpeg else { return }
        photo.uploading = true
        photo.failed = false
        defer { photo.uploading = false }
        do {
            let asset = try await APIClient.shared.uploadImage(jpeg: jpeg, siteId: siteId, kind: photo.kind, caption: photo.caption)
            photo.uploadedId = asset.id
        } catch {
            photo.failed = true
        }
    }
}
