import UIKit

enum ImageResizer {
    /// Downscales to `maxPixels` on the longest edge and encodes as JPEG.
    /// Runs the CPU work off the main thread.
    static func jpegForUpload(_ data: Data, maxPixels: CGFloat = AppConfig.maxUploadPixels, quality: CGFloat = 0.85) async -> Data? {
        await Task.detached(priority: .userInitiated) { () -> Data? in
            guard let image = UIImage(data: data) else { return nil }
            let size = image.size
            let scale = min(1, maxPixels / max(size.width, size.height))
            let target = CGSize(width: (size.width * scale).rounded(), height: (size.height * scale).rounded())
            let format = UIGraphicsImageRendererFormat.default()
            format.scale = 1
            format.opaque = true
            let out = UIGraphicsImageRenderer(size: target, format: format).image { _ in
                image.draw(in: CGRect(origin: .zero, size: target))
            }
            return out.jpegData(compressionQuality: quality)
        }.value
    }
}
