//! The microphone permission decision, and only that (P3.5).
//!
//! WebKitGTK asks the shell whether the page may use a device. On Linux the
//! platform's own default is `Deny`
//! (`tauri-runtime-2.12.1/src/webview_permissions.rs:132-149`), which is why the
//! app's own origin has to be granted explicitly rather than left to the
//! default — an unregistered handler means the owner's dictation never starts.
//!
//! Three facts shape this module, and none of them is a preference:
//!
//! - **The handler is handed no URL.** The pinned callback is
//!   `Fn(Webview<R>, PermissionKind) -> PermissionResponse`
//!   (`tauri-2.12.1/src/webview/webview_window.rs:475-486`), so the requesting
//!   origin is read from `webview.url()`
//!   (`tauri-2.12.1/src/webview/mod.rs:1869`) and from nowhere else.
//! - **The origin is compared, never string-matched.** The check is the shell's
//!   own `is_allowed_origin`, the same function the navigation guard uses, so
//!   the microphone and the navigation cannot disagree about which origins are
//!   the app's. That function refuses a userinfo form such as
//!   `http://127.0.0.1:<port>@evil.example/`, a trailing-digit port and a
//!   different scheme, and its own tests cover each.
//! - **An unreadable origin fails closed.** `webview.url()` returns
//!   `crate::Result<Url>`; an `Err` — a URL that cannot be read or parsed — is
//!   `Deny`. Never `Allow`, never `Default`, never a panic: a request whose
//!   origin this shell cannot establish is a request from nobody it knows.
//!
//! Nothing else is granted, ever. Every other `PermissionKind` is `Deny`, so
//! this module cannot become a general capability grant by accident, and no
//! Tauri capability is involved at any point (`tauri.conf.json` carries
//! `"capabilities": []` and the app already works with none).

use tauri::webview::{PermissionKind, PermissionResponse};
use tauri::Runtime;

/// The decision, as a pure function of the kind and of what `webview.url()` said.
///
/// It takes the **result**, not a `Webview`, so every arm below is decidable in
/// a unit test with no display, no window and no child process — which is the
/// only way the `Err` arm can be asserted at all, since a `Webview` cannot be
/// conjured on a test machine.
pub(crate) fn decide(
    kind: PermissionKind,
    url: &tauri::Result<tauri::Url>,
    allowed: &str,
) -> PermissionResponse {
    if kind != PermissionKind::Microphone {
        return PermissionResponse::Deny;
    }
    match url {
        Ok(target) if crate::is_allowed_origin(target, allowed) => PermissionResponse::Allow,
        // Any other origin, and any origin this shell could not read.
        _ => PermissionResponse::Deny,
    }
}

/// The same decision, from the callback Tauri's builder hands to the shell.
pub(crate) fn decide_for_webview<R: Runtime>(
    webview: &tauri::Webview<R>,
    kind: PermissionKind,
    allowed: &str,
) -> PermissionResponse {
    decide(kind, &webview.url(), allowed)
}

#[cfg(test)]
mod tests {
    use super::*;

    const ALLOWED: &str = "http://127.0.0.1:7837";

    fn allowed(url: &str) -> tauri::Result<tauri::Url> {
        Ok(url.parse().expect("a URL"))
    }

    /// Arm one: the app's own origin asks for the microphone, and it is granted.
    #[test]
    fn the_apps_own_origin_is_granted_the_microphone() {
        for target in [
            "http://127.0.0.1:7837/",
            "http://127.0.0.1:7837/capture/018f0000-0000-7000-8000-000000000000",
            "http://127.0.0.1:7837/?a=1#b",
        ] {
            assert_eq!(
                decide(PermissionKind::Microphone, &allowed(target), ALLOWED),
                PermissionResponse::Allow,
                "{target} is this app's own origin and must be granted"
            );
        }
    }

    /// Arm two: the microphone from **any other** origin is refused.
    ///
    /// The userinfo form is in the list because it shares the allowed string as a
    /// prefix — it is the case `is_allowed_origin` exists for, and a prefix check
    /// here would admit it.
    #[test]
    fn the_microphone_from_any_other_origin_is_refused() {
        let mut parsed = 0;
        for target in [
            "http://127.0.0.1:7839/",
            "http://127.0.0.1:7717/",
            "http://127.0.0.1:78370/",
            "http://127.0.0.1/",
            "https://127.0.0.1:7837/",
            "http://localhost:7837/",
            "http://evil.example/",
            "http://127.0.0.1:7837@evil.example/",
            "file:///etc/passwd",
        ] {
            if let Ok(url) = target.parse::<tauri::Url>() {
                parsed += 1;
                assert_eq!(
                    decide(PermissionKind::Microphone, &Ok(url), ALLOWED),
                    PermissionResponse::Deny,
                    "{target} is not this app's origin and must be refused"
                );
            }
        }
        assert!(
            parsed >= 8,
            "only {parsed} of the nine refusal cases parsed, so this test would not \
             prove the decision refuses anything"
        );
    }

    /// Arm three: **every other** permission kind is refused, microphone or not.
    ///
    /// `PermissionKind` is `#[non_exhaustive]`, so this cannot be an exhaustive
    /// match in the other direction; it enumerates every variant the pinned
    /// `tauri` 2.12.1 declares, which is what makes "nothing else is granted"
    /// checkable rather than aspirational.
    #[test]
    fn every_other_permission_kind_is_refused() {
        let own_origin = allowed("http://127.0.0.1:7837/");
        for kind in [
            PermissionKind::Camera,
            PermissionKind::Geolocation,
            PermissionKind::Notifications,
            PermissionKind::ClipboardRead,
            PermissionKind::DisplayCapture,
            PermissionKind::Midi,
            PermissionKind::Sensors,
            PermissionKind::MediaKeySystemAccess,
            PermissionKind::LocalFonts,
            PermissionKind::WindowManagement,
            PermissionKind::PointerLock,
            PermissionKind::AutomaticDownloads,
            PermissionKind::FileSystemAccess,
            PermissionKind::Autoplay,
            PermissionKind::Other,
        ] {
            assert_eq!(
                decide(kind, &own_origin, ALLOWED),
                PermissionResponse::Deny,
                "{kind} must be refused even from this app's own origin"
            );
        }
    }

    /// The fourth shape, and the one that is easy to leave out: an origin the
    /// shell **cannot read**. `webview.url()` returns a `Result`, and an `Err` is
    /// not a missing answer to be defaulted — it is a refusal.
    #[test]
    fn an_origin_the_shell_cannot_read_fails_closed() {
        let parse_error = ""
            .parse::<tauri::Url>()
            .expect_err("an empty string is not a URL");
        let unreadable: tauri::Result<tauri::Url> = Err(tauri::Error::InvalidUrl(parse_error));
        assert_eq!(
            decide(PermissionKind::Microphone, &unreadable, ALLOWED),
            PermissionResponse::Deny,
            "a microphone request whose origin could not be read must be refused"
        );
        // And the same for every other kind, so the `Err` arm is not a
        // microphone-only accident.
        assert_eq!(
            decide(PermissionKind::Camera, &unreadable, ALLOWED),
            PermissionResponse::Deny
        );
    }

    /// An allowed origin this shell cannot parse is refused too, which is
    /// `is_allowed_origin`'s own failing-closed behaviour reached from here. A
    /// bug that configured the shell with a nonsense origin must not invert the
    /// guard into permitting everything.
    #[test]
    fn an_allowed_origin_that_does_not_parse_refuses_rather_than_allows() {
        assert_eq!(
            decide(
                PermissionKind::Microphone,
                &allowed("http://127.0.0.1:7837/"),
                "not a url"
            ),
            PermissionResponse::Deny
        );
    }
}
