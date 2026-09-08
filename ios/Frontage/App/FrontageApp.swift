import SwiftUI
import UserNotifications

@main
struct FrontageApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var delegate
    @State private var app = AppState()
    @State private var store = StoreService()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(app)
                .environment(store)
                .tint(Theme.green)
                .task {
                    delegate.app = app
                    await app.bootstrap()
                    await store.load()
                    if app.phase == .ready, let e = try? await store.syncEntitlements() { app.entitlement = e }
                }
        }
    }
}

/// Handles push registration and notification taps.
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    weak var app: AppState?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        UNUserNotificationCenter.current().delegate = self
        // Re-register silently if permission was granted earlier.
        UNUserNotificationCenter.current().getNotificationSettings { settings in
            if settings.authorizationStatus == .authorized {
                DispatchQueue.main.async { application.registerForRemoteNotifications() }
            }
        }
        return true
    }

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02x", $0) }.joined()
        Task { @MainActor in
            if APIClient.shared.token != nil {
                try? await APIClient.shared.registerDevice(token: token)
            } else {
                app?.pendingPushToken = token
            }
        }
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        print("Push registration failed: \(error.localizedDescription)")
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification) async -> UNNotificationPresentationOptions {
        [.banner, .sound, .badge]
    }

    func userNotificationCenter(_ center: UNUserNotificationCenter, didReceive response: UNNotificationResponse) async {
        if let siteId = response.notification.request.content.userInfo["siteId"] as? String {
            await MainActor.run { NotificationCenter.default.post(name: .openLeads, object: siteId) }
        }
    }

    /// Ask for permission at a meaningful moment (after the first site exists).
    static func requestPushPermission() {
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { granted, _ in
            guard granted else { return }
            DispatchQueue.main.async { UIApplication.shared.registerForRemoteNotifications() }
        }
    }
}

extension Notification.Name {
    static let openLeads = Notification.Name("frontage.openLeads")
    static let siteChanged = Notification.Name("frontage.siteChanged")
}
