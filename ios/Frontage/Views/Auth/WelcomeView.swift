import SwiftUI
import AuthenticationServices
import CryptoKit

struct WelcomeView: View {
    @Environment(AppState.self) private var app
    @State private var showEmail = false
    @State private var nonce = WelcomeView.randomNonce()
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        ZStack {
            Theme.paper.ignoresSafeArea()
            VStack(alignment: .leading, spacing: 0) {
                Spacer(minLength: 24)
                HStack(spacing: 12) {
                    BrandMark(size: 44)
                    Text(AppConfig.brand).font(Theme.display(26))
                }
                .padding(.bottom, 36)

                // The free first site is the whole pitch for a new download, so it leads.
                Text("Your first website is free")
                    .font(Theme.body(13, weight: .bold))
                    .foregroundStyle(Theme.green)
                    .padding(.horizontal, 12).padding(.vertical, 6)
                    .background(Theme.green.opacity(0.1), in: Capsule())
                    .padding(.bottom, 14)
                Text("A flawless website for your business.")
                    .font(Theme.display(40))
                    .foregroundStyle(Theme.ink)
                    .padding(.bottom, 14)
                Text("Answer a few questions, add your photos, and see your finished site in minutes. No card needed. Subscribe only when you want to make changes or go live.")
                    .font(Theme.body(17))
                    .foregroundStyle(Theme.muted)

                VStack(alignment: .leading, spacing: 10) {
                    bullet("Built and written for your business, not a template")
                    bullet("Live at yourbusiness.\(AppConfig.sitesDomain) or your own domain")
                    bullet("Change anything by simply asking")
                }
                .padding(.top, 26)

                Spacer()

                VStack(spacing: 12) {
                    SignInWithAppleButton(.continue) { request in
                        nonce = WelcomeView.randomNonce()
                        request.requestedScopes = [.fullName, .email]
                        request.nonce = WelcomeView.sha256(nonce)
                    } onCompletion: { result in
                        handleApple(result)
                    }
                    .signInWithAppleButtonStyle(.black)
                    .frame(height: 54)
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))

                    Button { showEmail = true } label: { Text("Continue with email") }
                        .buttonStyle(SecondaryButtonStyle())

                    if let error { Text(error).font(Theme.body(14)).foregroundStyle(Theme.coral) }

                    Text("By continuing you agree to our [Terms](\(AppConfig.termsURL.absoluteString)) and [Privacy Policy](\(AppConfig.privacyURL.absoluteString)).")
                        .font(Theme.body(12))
                        .foregroundStyle(Theme.muted)
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
            }
            .padding(24)
            if busy { LoadingOverlay(text: "Signing you in") }
        }
        .sheet(isPresented: $showEmail) { EmailSignInView() }
    }

    private func bullet(_ text: String) -> some View {
        HStack(alignment: .top, spacing: 10) {
            Image(systemName: "checkmark.circle.fill").foregroundStyle(Theme.green).padding(.top, 2)
            Text(text).font(Theme.body(15)).foregroundStyle(Theme.ink)
        }
    }

    private func handleApple(_ result: Result<ASAuthorization, Error>) {
        switch result {
        case .failure(let e):
            if (e as? ASAuthorizationError)?.code != .canceled { error = "Sign in with Apple didn't work. Try email instead." }
        case .success(let auth):
            guard let cred = auth.credential as? ASAuthorizationAppleIDCredential,
                  let tokenData = cred.identityToken, let token = String(data: tokenData, encoding: .utf8) else {
                error = "Apple didn't return a valid sign-in. Try again."; return
            }
            let code = cred.authorizationCode.flatMap { String(data: $0, encoding: .utf8) }
            busy = true
            Task {
                do {
                    let auth = try await APIClient.shared.signInWithApple(identityToken: token, authorizationCode: code, givenName: cred.fullName?.givenName, familyName: cred.fullName?.familyName, nonce: nonce)
                    await app.signedIn(auth)
                } catch {
                    self.error = (error as? LocalizedError)?.errorDescription ?? "Could not sign in."
                }
                busy = false
            }
        }
    }

    static func randomNonce(length: Int = 32) -> String {
        let chars = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        var out = ""
        var bytes = [UInt8](repeating: 0, count: length)
        _ = SecRandomCopyBytes(kSecRandomDefault, length, &bytes)
        for b in bytes { out.append(chars[Int(b) % chars.count]) }
        return out
    }
    static func sha256(_ s: String) -> String {
        SHA256.hash(data: Data(s.utf8)).map { String(format: "%02x", $0) }.joined()
    }
}

struct EmailSignInView: View {
    @Environment(AppState.self) private var app
    @Environment(\.dismiss) private var dismiss
    @State private var email = ""
    @State private var code = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error: String?
    @State private var devCode: String?
    @FocusState private var focus: Bool

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                StepHeader(eyebrow: "Sign in", title: sent ? "Check your email" : "What's your email?",
                           subtitle: sent ? "We sent a 6-digit code to \(email)." : "We'll send you a one-time code. No password to remember.")
                if !sent {
                    InputField(title: "Email", placeholder: "you@business.com", text: $email, keyboard: .emailAddress, capitalization: .never)
                        .focused($focus)
                } else {
                    InputField(title: "Code", placeholder: "123456", text: $code, keyboard: .numberPad)
                        .focused($focus)
                    if let devCode { Text("Dev server code: \(devCode)").font(Theme.body(13)).foregroundStyle(Theme.muted) }
                }
                if let error { Text(error).font(Theme.body(14)).foregroundStyle(Theme.coral) }
                AsyncButton {
                    await submit()
                } label: { Text(sent ? "Sign in" : "Send code") }
                .buttonStyle(PrimaryButtonStyle())
                .disabled(sent ? code.count < 6 : !email.contains("@"))
                if sent {
                    Button("Use a different email") { sent = false; code = ""; error = nil }
                        .font(Theme.body(15)).foregroundStyle(Theme.muted)
                }
                Spacer()
            }
            .padding(24)
            .background(Theme.paper.ignoresSafeArea())
            .toolbar { ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } } }
            .onAppear { focus = true }
        }
    }

    private func submit() async {
        error = nil
        do {
            if !sent {
                let r = try await APIClient.shared.startEmailSignIn(email: email.trimmingCharacters(in: .whitespaces))
                devCode = r.devCode
                sent = true
                focus = true
            } else {
                let auth = try await APIClient.shared.verifyEmailCode(email: email.trimmingCharacters(in: .whitespaces), code: code)
                dismiss()
                await app.signedIn(auth)
            }
        } catch {
            self.error = (error as? LocalizedError)?.errorDescription ?? "Something went wrong."
        }
    }
}
