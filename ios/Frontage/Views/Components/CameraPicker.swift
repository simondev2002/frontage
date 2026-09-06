import SwiftUI
import PhotosUI
import UIKit

// Website photos can come from the photo library (PhotosPicker, no permission prompt)
// or straight from the camera (UIImagePickerController, needs NSCameraUsageDescription).

/// Full-screen camera capture. Calls `onCapture` with the orientation-corrected photo.
struct CameraPicker: UIViewControllerRepresentable {
    var onCapture: (UIImage) -> Void
    @Environment(\.dismiss) private var dismiss

    /// False on the simulator and on devices without a camera; callers hide the option then.
    static var isAvailable: Bool { UIImagePickerController.isSourceTypeAvailable(.camera) }

    func makeUIViewController(context: Context) -> UIImagePickerController {
        let picker = UIImagePickerController()
        picker.sourceType = .camera
        picker.cameraCaptureMode = .photo
        picker.delegate = context.coordinator
        return picker
    }

    func updateUIViewController(_ controller: UIImagePickerController, context: Context) {}

    func makeCoordinator() -> Coordinator { Coordinator(self) }

    final class Coordinator: NSObject, UIImagePickerControllerDelegate, UINavigationControllerDelegate {
        let parent: CameraPicker
        init(_ parent: CameraPicker) { self.parent = parent }

        func imagePickerController(_ picker: UIImagePickerController, didFinishPickingMediaWithInfo info: [UIImagePickerController.InfoKey: Any]) {
            if let image = (info[.editedImage] ?? info[.originalImage]) as? UIImage { parent.onCapture(image) }
            parent.dismiss()
        }

        func imagePickerControllerDidCancel(_ picker: UIImagePickerController) { parent.dismiss() }
    }
}

/// A button that asks "Take photo" or "Choose from library", presents the matching picker
/// and hands every result to `PhotoIntake` (resize + immediate upload).
struct PhotoSourceButton<Label: View>: View {
    var kind: String
    var siteId: String?
    var maxCount: Int
    var allowCamera = true
    @Binding var photos: [PickedPhoto]
    @ViewBuilder var label: () -> Label

    @State private var choosing = false
    @State private var showLibrary = false
    @State private var showCamera = false
    @State private var items: [PhotosPickerItem] = []

    private var cameraOffered: Bool { allowCamera && CameraPicker.isAvailable }

    var body: some View {
        Button {
            if cameraOffered { choosing = true } else { showLibrary = true }
        } label: {
            label()
        }
        .buttonStyle(.plain)
        .confirmationDialog("Add photos", isPresented: $choosing, titleVisibility: .hidden) {
            Button("Take photo") { showCamera = true }
            Button("Choose from library") { showLibrary = true }
        }
        .photosPicker(isPresented: $showLibrary, selection: $items, maxSelectionCount: maxCount, matching: .images)
        .onChange(of: items) { _, new in
            guard !new.isEmpty else { return }
            PhotoIntake.add(items: new, kind: kind, siteId: siteId, to: &photos)
            items = []
        }
        .fullScreenCover(isPresented: $showCamera) {
            CameraPicker { image in
                PhotoIntake.add(image: image, kind: kind, siteId: siteId, to: &photos)
            }
            .ignoresSafeArea()
        }
    }
}
