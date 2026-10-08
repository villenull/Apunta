//! The updater's side effects: the one endpoint, the verified download, the
//! kept previous AppImage, the install and the relaunch (C-UPD@1, AM-225).
//!
//! The decision of *what happens next* lives in `updater.rs`; this file is what
//! it asks for. Everything here that can be exercised without a window is
//! exercised by the tests below.
//!
//! Network rules, all enforced in this file:
//!
//! - The only endpoint is [`ENDPOINT`]. A build with no `APUNTA_UPDATER_PUBKEY`
//!   at compile time is **not configured** and never opens a connection.
//! - A redirect may only land on [`ALLOWED_HOSTS`], over `https`, on the default
//!   port and with no userinfo. That is the reason `reqwest` is a direct,
//!   pinned dependency: the plugin builds its own client, and the redirect
//!   policy is the one thing it lets us replace.
//! - The plugin verifies the downloaded bytes with minisign against the
//!   compiled-in key; the replacement's own version is checked before health.
//! - Test hooks (`APUNTA_UPDATER_TEST_*`) exist only in a build made with the
//!   `test-updater` feature and refuse anything but loopback ports 7890-7899.

use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::Duration;

use tauri_plugin_updater::{Error as UpdaterError, Update, UpdaterExt};

use crate::updater::{CheckFailure, DownloadFailure};

#[cfg(any(not(feature = "test-updater"), test))]
/// The one production endpoint (the card's fixed decision).
pub const ENDPOINT: &str =
    "https://github.com/villenull/Apunta/releases/latest/download/latest.json";

#[cfg(not(feature = "test-updater"))]
/// The hosts a release download may be redirected through: GitHub's own.
pub const ALLOWED_HOSTS: [&str; 2] = ["github.com", "release-assets.githubusercontent.com"];

/// The kept copy of the version being replaced, beside the new one.
pub const PREVIOUS_NAME: &str = "Apunta.previous.AppImage";

/// The private handoff the relaunched shell passes to its server.
pub const HANDOFF_ENV: &str = "APUNTA_UPDATE_HANDOFF";
const PRIMARY_IMAGE_ENV: &str = "APUNTA_UPDATE_PRIMARY_IMAGE";

/// A request that could take longer than this is a failed request.
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);

/// Redirects followed before the request is refused.
const MAX_REDIRECTS: usize = 5;

/// Where to check and which key may sign what is found there.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Settings {
    pub endpoint: String,
    pub pubkey: String,
}

#[cfg(any(not(feature = "test-updater"), test))]
/// The production settings, or `None` when the build carries no key.
///
/// Pure so that "no key, no network" can be asserted without a build that
/// lacks the variable.
pub fn production_settings(pubkey: Option<&str>) -> Option<Settings> {
    let pubkey = pubkey?.trim();
    if pubkey.is_empty() {
        return None;
    }
    Some(Settings {
        endpoint: ENDPOINT.to_string(),
        pubkey: pubkey.to_string(),
    })
}

/// The settings this build runs with.
#[cfg(not(feature = "test-updater"))]
pub fn settings() -> Option<Settings> {
    production_settings(option_env!("APUNTA_UPDATER_PUBKEY"))
}

/// The settings this build runs with. A `test-updater` build contacts the test
/// endpoint or nothing: it never falls back to production.
#[cfg(feature = "test-updater")]
pub fn settings() -> Option<Settings> {
    test_settings(
        std::env::var("APUNTA_UPDATER_TEST_ENDPOINT")
            .ok()
            .as_deref(),
        std::env::var("APUNTA_UPDATER_TEST_PUBKEY").ok().as_deref(),
    )
}

/// A loopback URL the test updater may use: `http`, `127.0.0.1`, an explicit
/// port in 7890-7899, no userinfo.
#[cfg(any(test, feature = "test-updater"))]
pub fn is_test_url(url: &reqwest::Url) -> bool {
    url.scheme() == "http"
        && url.host_str() == Some("127.0.0.1")
        && url.username().is_empty()
        && url.password().is_none()
        && url.port().is_some_and(|port| (7890..=7899).contains(&port))
}

#[cfg(any(test, feature = "test-updater"))]
pub fn test_settings(endpoint: Option<&str>, pubkey: Option<&str>) -> Option<Settings> {
    let endpoint = endpoint?;
    let pubkey = pubkey?.trim();
    if pubkey.is_empty() {
        return None;
    }
    let parsed: reqwest::Url = endpoint.parse().ok()?;
    if !is_test_url(&parsed) {
        return None;
    }
    Some(Settings {
        endpoint: endpoint.to_string(),
        pubkey: pubkey.to_string(),
    })
}

/// Whether a redirect may be followed. This is the allow-list, as a pure
/// function of the target.
pub fn redirect_allowed(url: &reqwest::Url) -> bool {
    #[cfg(feature = "test-updater")]
    {
        is_test_url(url)
    }
    #[cfg(not(feature = "test-updater"))]
    {
        url.scheme() == "https"
            && url.username().is_empty()
            && url.password().is_none()
            && url.port().is_none()
            && url
                .host_str()
                .is_some_and(|host| ALLOWED_HOSTS.contains(&host))
    }
}

/// The replaceable redirect policy: follow only allow-listed targets, and stop
/// after a handful of hops.
pub fn redirect_policy() -> reqwest::redirect::Policy {
    reqwest::redirect::Policy::custom(|attempt| {
        if attempt.previous().len() >= MAX_REDIRECTS {
            attempt.error("too many redirects")
        } else if redirect_allowed(attempt.url()) {
            attempt.follow()
        } else {
            attempt.error("redirect target is not an approved host")
        }
    })
}

/// Whether an updater error means "these bytes or this release are refused"
/// rather than "the network failed".
fn is_rejection(error: &UpdaterError) -> bool {
    match error {
        UpdaterError::Minisign(_)
        | UpdaterError::Base64(_)
        | UpdaterError::SignatureUtf8(_)
        | UpdaterError::SignedVersionMismatch { .. }
        | UpdaterError::MissingSignedVersion
        | UpdaterError::InvalidUpdaterFormat => true,
        // A redirect the allow-list refused is a refusal, not an outage.
        UpdaterError::Reqwest(error) => error.is_redirect(),
        _ => false,
    }
}

/// Asks the endpoint for a newer release. Any failure is `Offline`: C-UPD@1
/// wants the app fully usable and no notice.
pub async fn check(
    handle: &tauri::AppHandle,
    settings: &Settings,
) -> Result<Option<Update>, CheckFailure> {
    let endpoint: reqwest::Url = settings
        .endpoint
        .parse()
        .map_err(|_| CheckFailure::Offline)?;
    if !redirect_allowed(&endpoint) {
        return Err(CheckFailure::Offline);
    }
    let updater = handle
        .updater_builder()
        .no_proxy()
        .endpoints(vec![endpoint])
        .and_then(|builder| {
            builder
                .timeout(REQUEST_TIMEOUT)
                .configure_client(|client| client.redirect(redirect_policy()))
                .build()
        })
        .map_err(|error| {
            eprintln!("apunta: the updater could not be built: {error}");
            CheckFailure::Offline
        })?;
    updater.check().await.map_err(|error| {
        eprintln!("apunta: the update check failed: {error}");
        CheckFailure::Offline
    })
}

/// Downloads the release and verifies its signature. The returned bytes are
/// the verified ones; nothing is written to disk until install.
pub async fn download(update: &Update) -> Result<Vec<u8>, DownloadFailure> {
    if !redirect_allowed(&update.download_url) {
        return Err(DownloadFailure::Rejected);
    }
    update.download(|_, _| {}, || {}).await.map_err(|error| {
        eprintln!("apunta: the update download failed: {error}");
        if is_rejection(&error) {
            DownloadFailure::Rejected
        } else {
            DownloadFailure::Offline
        }
    })
}

/// The AppImage this process runs from, when it runs from one.
pub fn appimage_path() -> Option<PathBuf> {
    let actual = std::env::var_os("APPIMAGE")
        .filter(|value| !value.is_empty())
        .map(PathBuf::from)?;
    if actual.file_name().is_some_and(|name| name == PREVIOUS_NAME) {
        if let Some(primary) = std::env::var_os(PRIMARY_IMAGE_ENV).map(PathBuf::from) {
            if primary.parent() == actual.parent() {
                return Some(primary);
            }
        }
    }
    Some(actual)
}

/// The kept previous version's name for a Mac app bundle, beside it.
pub const PREVIOUS_BUNDLE_NAME: &str = "Apunta.previous.app";

/// Whether this path is a Mac app bundle (`Apunta.app`), not an AppImage.
fn is_bundle(path: &Path) -> bool {
    path.extension().is_some_and(|extension| extension == "app")
}

/// The `.app` bundle an executable runs from: the nearest ancestor named
/// `*.app` whose `Contents/MacOS` holds it. Pure, so it is tested on Linux.
pub fn bundle_of(executable: &Path) -> Option<PathBuf> {
    executable
        .ancestors()
        .skip(1)
        .find(|candidate| {
            is_bundle(candidate) && executable.starts_with(candidate.join("Contents").join("MacOS"))
        })
        .map(Path::to_path_buf)
}

/// The installed app the updater replaces: the AppImage on Linux, the `.app`
/// bundle on a Mac. `None` means there is nothing safe to replace.
pub fn installed_path() -> Option<PathBuf> {
    #[cfg(target_os = "macos")]
    {
        std::env::current_exe().ok().and_then(|exe| bundle_of(&exe))
    }
    #[cfg(not(target_os = "macos"))]
    {
        appimage_path()
    }
}

/// Where the previous version of `installed` is kept: beside it, under the
/// AppImage or bundle name.
pub fn previous_path(installed: &Path) -> Option<PathBuf> {
    let dir = installed.parent()?;
    Some(dir.join(if is_bundle(installed) {
        PREVIOUS_BUNDLE_NAME
    } else {
        PREVIOUS_NAME
    }))
}

/// The program to run from the kept previous version, for recovery: the same
/// executable inside `Apunta.previous.app` on a Mac, the kept AppImage on Linux.
pub fn previous_executable(target: &Path) -> Option<PathBuf> {
    match bundle_of(target) {
        Some(bundle) => {
            let inside = target.strip_prefix(&bundle).ok()?;
            Some(previous_path(&bundle)?.join(inside))
        }
        None => Some(target.with_file_name(PREVIOUS_NAME)),
    }
}

/// Copies a folder tree, keeping symlinks as symlinks and permissions as they
/// are: a Mac bundle carries framework symlinks and executable bits.
fn copy_tree(from: &Path, to: &Path) -> std::io::Result<()> {
    std::fs::create_dir_all(to)?;
    std::fs::set_permissions(to, std::fs::metadata(from)?.permissions())?;
    for entry in std::fs::read_dir(from)? {
        let entry = entry?;
        let source = entry.path();
        let target = to.join(entry.file_name());
        let kind = entry.file_type()?;
        if kind.is_symlink() {
            #[cfg(unix)]
            std::os::unix::fs::symlink(std::fs::read_link(&source)?, &target)?;
        } else if kind.is_dir() {
            copy_tree(&source, &target)?;
        } else {
            std::fs::copy(&source, &target)?;
        }
    }
    Ok(())
}

/// Copies `from` to `to` through a staging name beside `to`, then renames it
/// into place; a file is synced first. A failed copy leaves `to` untouched.
fn copy_into_place(from: &Path, to: &Path, staging: &Path) -> std::io::Result<()> {
    let dir = to.parent().ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "the app has no folder")
    })?;
    if from.is_dir() {
        let _ = std::fs::remove_dir_all(staging);
        let result = copy_tree(from, staging).and_then(|()| {
            // A folder cannot be renamed over a folder: the old one moves aside
            // first and goes only once the new one is in place.
            let aside = staging.with_extension("old");
            let _ = std::fs::remove_dir_all(&aside);
            let had = to.exists();
            if had {
                std::fs::rename(to, &aside)?;
            }
            match std::fs::rename(staging, to) {
                Ok(()) => {
                    if had {
                        let _ = std::fs::remove_dir_all(&aside);
                    }
                    Ok(())
                }
                Err(error) => {
                    if had {
                        let _ = std::fs::rename(&aside, to);
                    }
                    Err(error)
                }
            }
        });
        if result.is_err() {
            let _ = std::fs::remove_dir_all(staging);
        }
        result.and_then(|()| std::fs::File::open(dir)?.sync_all())
    } else {
        let result = std::fs::copy(from, staging)
            .and_then(|_| std::fs::File::open(staging)?.sync_all())
            .and_then(|_| std::fs::rename(staging, to))
            .and_then(|_| std::fs::File::open(dir)?.sync_all());
        if result.is_err() {
            let _ = std::fs::remove_file(staging);
        }
        result
    }
}

/// Copies the installed app (an AppImage, or a Mac `.app` folder) to its
/// previous name beside it, atomically, and returns the kept path.
pub fn keep_previous(installed: &Path) -> std::io::Result<PathBuf> {
    let kept = previous_path(installed).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "the app has no folder")
    })?;
    let staging = kept.with_file_name(format!(
        "{}.partial",
        kept.file_name().unwrap_or_default().to_string_lossy()
    ));
    copy_into_place(installed, &kept, &staging).map(|()| kept)
}

/// Puts the kept previous version back in place of `installed`, atomically.
pub fn restore_previous(installed: &Path) -> std::io::Result<()> {
    let kept = previous_path(installed).ok_or_else(|| {
        std::io::Error::new(std::io::ErrorKind::InvalidInput, "the app has no folder")
    })?;
    if !kept.exists() {
        return Err(std::io::Error::new(
            std::io::ErrorKind::NotFound,
            "there is no previous version to reinstall",
        ));
    }
    let staging = kept.with_file_name(format!(
        "{}.restoring",
        kept.file_name().unwrap_or_default().to_string_lossy()
    ));
    copy_into_place(&kept, installed, &staging)
}

/// Why an install did not happen.
#[derive(Debug)]
pub enum InstallError {
    /// Not running from an installed app (an AppImage, or a Mac `.app`), so
    /// there is nothing safe to replace.
    NotInstalled,
    /// The previous version could not be kept, so nothing was replaced.
    KeepPrevious(std::io::Error),
    /// The plugin's install failed; the old AppImage is back in place.
    Install(String),
    /// Neither installation nor restoring the kept image succeeded.
    Rollback(std::io::Error),
}

impl std::fmt::Display for InstallError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            InstallError::NotInstalled => {
                write!(
                    f,
                    "not running from an installed app (an AppImage or a Mac .app)"
                )
            }
            InstallError::KeepPrevious(error) => {
                write!(f, "the previous version could not be kept: {error}")
            }
            InstallError::Install(message) => write!(f, "the install failed: {message}"),
            InstallError::Rollback(error) => {
                write!(f, "the kept image could not be restored: {error}")
            }
        }
    }
}

/// Keeps the previous AppImage, then runs `install`. The order is the point:
/// a failed copy means nothing is replaced.
pub fn install_sequence(
    installed: Option<&Path>,
    install: impl FnOnce() -> Result<(), String>,
) -> Result<(), InstallError> {
    let installed = installed.ok_or(InstallError::NotInstalled)?;
    keep_previous(installed).map_err(InstallError::KeepPrevious)?;
    let result = install().and_then(|()| {
        // A file is synced itself; a Mac bundle is a folder the plugin swapped
        // in, so its parent folder is what records the swap.
        let file = if installed.is_dir() {
            Ok(())
        } else {
            std::fs::File::open(installed).and_then(|file| file.sync_all())
        };
        file.and_then(|()| {
            std::fs::File::open(installed.parent().expect("kept app parent"))?.sync_all()
        })
        .map_err(|error| error.to_string())
    });
    match result {
        Ok(()) => Ok(()),
        Err(message) => {
            restore_previous(installed).map_err(InstallError::Rollback)?;
            Err(InstallError::Install(message))
        }
    }
}

/// Installs the verified bytes over the running app: the AppImage on Linux,
/// the `.app` bundle on a Mac (the plugin unpacks the `.app.tar.gz` there).
pub fn install(update: &Update, bytes: &[u8]) -> Result<(), InstallError> {
    let installed = installed_path();
    install_sequence(installed.as_deref(), || {
        update.install(bytes).map_err(|error| error.to_string())
    })
}

/// Spawn the replacement directly; the caller has released single-instance ownership.
pub fn relaunch_command(app: &Path, handoff: Option<&str>, nonce: &str, recovery: bool) -> Command {
    let mut command = Command::new(app);
    command
        .current_dir("/")
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::inherit())
        .env("APUNTA_NATIVE_HANDOFF", nonce)
        .env("APUNTA_UPDATE_RECOVERY", if recovery { "1" } else { "0" });
    if let Some(primary) = appimage_path() {
        command.env(PRIMARY_IMAGE_ENV, primary);
    }
    match handoff {
        Some(id) => {
            command.env(HANDOFF_ENV, id);
        }
        None => {
            command.env_remove(HANDOFF_ENV);
        }
    }
    #[cfg(unix)]
    {
        use std::os::unix::process::CommandExt;
        command.process_group(0);
    }
    command
}

/// Trust only readiness emitted by the actual replacement process we spawned.
pub fn supervise(
    app: &Path,
    handoff: Option<&str>,
    nonce: &str,
    version: &str,
    recovery: bool,
) -> std::io::Result<()> {
    use std::io::{BufRead, BufReader};
    use std::sync::mpsc;
    use std::time::Instant;
    let mut child = relaunch_command(app, handoff, nonce, recovery).spawn()?;
    let stdout = child.stdout.take().expect("piped replacement stdout");
    let (tx, rx) = mpsc::channel();
    let expected_nonce = nonce.to_owned();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            if let Ok(crate::bridge::Message::Ready { version, .. }) =
                crate::bridge::parse_line(&line, &expected_nonce)
            {
                let _ = tx.send(version);
                break;
            }
        }
    });
    let deadline = Instant::now() + Duration::from_secs(60);
    loop {
        match rx.recv_timeout(Duration::from_millis(100)) {
            Ok(actual) => {
                if actual == version && child.try_wait()?.is_none() {
                    return Ok(());
                }
                break;
            }
            Err(mpsc::RecvTimeoutError::Disconnected) => break,
            Err(mpsc::RecvTimeoutError::Timeout) => {}
        }
        if child.try_wait()?.is_some() || Instant::now() >= deadline {
            break;
        }
    }
    // Only this still-owned child is signalled. Its server observes stdin EOF
    // if the shell dies and releases its own data-folder lock.
    if child.try_wait()?.is_none() {
        #[cfg(unix)]
        unsafe {
            crate::signals::kill(child.id() as i32, crate::signals::SIGTERM);
        }
        let deadline = Instant::now() + Duration::from_secs(15);
        while child.try_wait()?.is_none() && Instant::now() < deadline {
            std::thread::sleep(Duration::from_millis(100));
        }
        if child.try_wait()?.is_none() {
            child.kill()?;
        }
    }
    let _ = child.wait();
    Err(std::io::Error::other(
        "replacement did not confirm owned-server health",
    ))
}

/// The program to start again: the AppImage when there is one, else this
/// executable.
pub fn relaunch_target() -> Option<PathBuf> {
    appimage_path().or_else(|| std::env::current_exe().ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::{AtomicU32, Ordering};

    static COUNTER: AtomicU32 = AtomicU32::new(0);

    /// A fresh temp folder, removed on drop.
    struct Scratch(PathBuf);

    impl Scratch {
        fn new() -> Self {
            let dir = std::env::temp_dir().join(format!(
                "apunta-fetch-test-{}-{}",
                std::process::id(),
                COUNTER.fetch_add(1, Ordering::SeqCst)
            ));
            std::fs::create_dir_all(&dir).expect("scratch folder");
            Scratch(dir)
        }
    }

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = std::fs::remove_dir_all(&self.0);
        }
    }

    #[cfg(not(feature = "test-updater"))]
    fn url(text: &str) -> reqwest::Url {
        text.parse().expect("a test URL")
    }

    #[test]
    fn a_build_without_a_key_is_not_configured() {
        assert_eq!(production_settings(None), None);
        assert_eq!(production_settings(Some("")), None);
        assert_eq!(production_settings(Some("   ")), None);
        assert_eq!(
            production_settings(Some(" abc ")),
            Some(Settings {
                endpoint: ENDPOINT.to_string(),
                pubkey: "abc".to_string()
            })
        );
    }

    #[cfg(not(feature = "test-updater"))]
    #[test]
    fn redirects_may_only_reach_the_three_approved_https_hosts() {
        for host in ALLOWED_HOSTS {
            assert!(
                redirect_allowed(&url(&format!("https://{host}/a/b?c=d"))),
                "{host}"
            );
        }
        for refused in [
            "https://evil.example/x",
            "https://github.com.evil.example/x",
            "https://evilgithub.com/x",
            "https://objects.githubusercontent.com.evil.example/x",
            "https://user@github.com/x",
            "https://github.com:8443/x",
            "http://github.com/x",
            "http://objects.githubusercontent.com/x",
            "ftp://github.com/x",
            "https://raw.githubusercontent.com/x",
        ] {
            assert!(
                !redirect_allowed(&url(refused)),
                "{refused} must be refused"
            );
        }
    }

    #[test]
    fn the_test_hooks_accept_only_loopback_ports_7890_to_7899() {
        let key = Some("key");
        for ok in [
            "http://127.0.0.1:7890/latest.json",
            "http://127.0.0.1:7899/x",
        ] {
            assert!(test_settings(Some(ok), key).is_some(), "{ok}");
        }
        for bad in [
            "http://127.0.0.1:7889/x",
            "http://127.0.0.1:7900/x",
            "http://127.0.0.1/x",
            "http://localhost:7890/x",
            "https://127.0.0.1:7890/x",
            "http://127.0.0.1:7890@evil.example/x",
            "http://user@127.0.0.1:7890/x",
            "https://github.com/x",
            "not a url",
        ] {
            assert!(test_settings(Some(bad), key).is_none(), "{bad}");
        }
        assert!(test_settings(Some("http://127.0.0.1:7890/x"), None).is_none());
        assert!(test_settings(Some("http://127.0.0.1:7890/x"), Some(" ")).is_none());
        assert!(test_settings(None, key).is_none());
    }

    #[test]
    fn an_updater_error_is_a_rejection_only_when_the_bytes_are_refused() {
        assert!(is_rejection(&UpdaterError::InvalidUpdaterFormat));
        assert!(is_rejection(&UpdaterError::SignatureUtf8("x".into())));
        assert!(is_rejection(&UpdaterError::MissingSignedVersion));
        assert!(!is_rejection(&UpdaterError::Network("down".into())));
        assert!(!is_rejection(&UpdaterError::ReleaseNotFound));
    }

    #[test]
    fn keep_previous_copies_beside_the_appimage_and_keeps_it_executable() {
        use std::os::unix::fs::PermissionsExt;
        let scratch = Scratch::new();
        let appimage = scratch.0.join("Apunta.AppImage");
        std::fs::write(&appimage, b"old version").unwrap();
        std::fs::set_permissions(&appimage, std::fs::Permissions::from_mode(0o755)).unwrap();

        let kept = keep_previous(&appimage).unwrap();
        assert_eq!(kept, scratch.0.join(PREVIOUS_NAME));
        assert_eq!(std::fs::read(&kept).unwrap(), b"old version");
        assert_eq!(
            std::fs::metadata(&kept).unwrap().permissions().mode() & 0o777,
            0o755
        );
        assert!(!scratch.0.join("Apunta.previous.AppImage.partial").exists());
        // A later update replaces the kept copy rather than refusing.
        std::fs::write(&appimage, b"newer version").unwrap();
        keep_previous(&appimage).unwrap();
        assert_eq!(std::fs::read(&kept).unwrap(), b"newer version");
    }

    #[test]
    fn install_runs_only_after_the_previous_version_is_kept() {
        let scratch = Scratch::new();
        let appimage = scratch.0.join("Apunta.AppImage");
        std::fs::write(&appimage, b"old version").unwrap();
        let mut seen = None;
        install_sequence(Some(&appimage), || {
            seen = std::fs::read(scratch.0.join(PREVIOUS_NAME)).ok();
            Ok(())
        })
        .unwrap();
        assert_eq!(seen.as_deref(), Some(&b"old version"[..]));
    }

    #[test]
    fn a_failed_copy_means_nothing_is_installed() {
        let scratch = Scratch::new();
        let missing = scratch.0.join("gone.AppImage");
        let mut ran = false;
        let result = install_sequence(Some(&missing), || {
            ran = true;
            Ok(())
        });
        assert!(matches!(result, Err(InstallError::KeepPrevious(_))));
        assert!(!ran, "the install must not run when the copy failed");
    }

    #[test]
    fn outside_an_appimage_nothing_is_installed() {
        let mut ran = false;
        let result = install_sequence(None, || {
            ran = true;
            Ok(())
        });
        assert!(matches!(result, Err(InstallError::NotInstalled)));
        assert!(!ran);
    }

    #[test]
    fn a_failed_install_is_reported_and_the_kept_copy_stays() {
        let scratch = Scratch::new();
        let appimage = scratch.0.join("Apunta.AppImage");
        std::fs::write(&appimage, b"old version").unwrap();
        let result = install_sequence(Some(&appimage), || {
            std::fs::write(&appimage, b"partial replacement").unwrap();
            Err("disk full".to_string())
        });
        assert!(matches!(result, Err(InstallError::Install(message)) if message == "disk full"));
        assert_eq!(std::fs::read(&appimage).unwrap(), b"old version");
        assert_eq!(
            std::fs::read(scratch.0.join(PREVIOUS_NAME)).unwrap(),
            b"old version"
        );
    }

    #[test]
    fn restore_previous_puts_the_kept_version_back() {
        let scratch = Scratch::new();
        let appimage = scratch.0.join("Apunta.AppImage");
        std::fs::write(&appimage, b"old version").unwrap();
        keep_previous(&appimage).unwrap();
        std::fs::write(&appimage, b"broken new version").unwrap();

        restore_previous(&appimage).unwrap();
        assert_eq!(std::fs::read(&appimage).unwrap(), b"old version");
        // The kept copy is still there for a second try.
        assert!(scratch.0.join(PREVIOUS_NAME).is_file());
        assert!(!scratch
            .0
            .join("Apunta.previous.AppImage.restoring")
            .exists());
    }

    #[test]
    fn restore_previous_without_a_kept_copy_fails_and_changes_nothing() {
        let scratch = Scratch::new();
        let appimage = scratch.0.join("Apunta.AppImage");
        std::fs::write(&appimage, b"current").unwrap();
        let error = restore_previous(&appimage).unwrap_err();
        assert_eq!(error.kind(), std::io::ErrorKind::NotFound);
        assert_eq!(std::fs::read(&appimage).unwrap(), b"current");
    }

    /// A small Mac-shaped bundle: a nested executable with its exec bit, and a
    /// framework symlink, the two things a naive copy loses.
    #[cfg(unix)]
    fn fake_bundle(dir: &Path, marker: &str) -> PathBuf {
        use std::os::unix::fs::PermissionsExt;
        let bundle = dir.join("Apunta.app");
        let macos = bundle.join("Contents").join("MacOS");
        std::fs::create_dir_all(&macos).unwrap();
        let exe = macos.join("apunta");
        std::fs::write(&exe, marker).unwrap();
        std::fs::set_permissions(&exe, std::fs::Permissions::from_mode(0o755)).unwrap();
        std::os::unix::fs::symlink("MacOS/apunta", bundle.join("Contents").join("Current"))
            .unwrap();
        bundle
    }

    #[test]
    fn bundle_of_finds_the_app_from_its_executable() {
        let exe = Path::new("/Applications/Apunta.app/Contents/MacOS/apunta");
        assert_eq!(
            bundle_of(exe),
            Some(PathBuf::from("/Applications/Apunta.app"))
        );
        assert_eq!(bundle_of(Path::new("/opt/apunta/apunta")), None);
        // A folder that merely ends in .app, without the bundle layout, is not one.
        assert_eq!(bundle_of(Path::new("/srv/data.app/bin/apunta")), None);
    }

    #[test]
    fn the_previous_executable_sits_inside_the_previous_bundle_on_a_mac() {
        assert_eq!(
            previous_executable(Path::new("/Applications/Apunta.app/Contents/MacOS/apunta")),
            Some(PathBuf::from(
                "/Applications/Apunta.previous.app/Contents/MacOS/apunta"
            ))
        );
        assert_eq!(
            previous_executable(Path::new("/home/x/Applications/Apunta.AppImage")),
            Some(PathBuf::from(
                "/home/x/Applications/Apunta.previous.AppImage"
            ))
        );
    }

    #[cfg(unix)]
    #[test]
    fn a_mac_bundle_is_kept_and_restored_whole() {
        use std::os::unix::fs::PermissionsExt;
        let scratch = Scratch::new();
        let bundle = fake_bundle(&scratch.0, "v1");
        let kept = keep_previous(&bundle).unwrap();
        assert_eq!(kept, scratch.0.join(PREVIOUS_BUNDLE_NAME));
        let kept_exe = kept.join("Contents").join("MacOS").join("apunta");
        assert_eq!(std::fs::read(&kept_exe).unwrap(), b"v1");
        assert_eq!(
            std::fs::metadata(&kept_exe).unwrap().permissions().mode() & 0o777,
            0o755
        );
        assert!(
            std::fs::symlink_metadata(kept.join("Contents").join("Current"))
                .unwrap()
                .file_type()
                .is_symlink()
        );

        // The install replaced the bundle; restoring brings v1 back, whole.
        std::fs::write(bundle.join("Contents").join("MacOS").join("apunta"), "v2").unwrap();
        restore_previous(&bundle).unwrap();
        assert_eq!(
            std::fs::read(bundle.join("Contents").join("MacOS").join("apunta")).unwrap(),
            b"v1"
        );
        assert!(kept.is_dir(), "the kept copy stays for a second recovery");
        assert!(!scratch.0.join("Apunta.previous.app.restoring").exists());
    }

    #[cfg(unix)]
    #[test]
    fn a_failed_bundle_install_puts_the_old_bundle_back() {
        let scratch = Scratch::new();
        let bundle = fake_bundle(&scratch.0, "v1");
        let result = install_sequence(Some(&bundle), || {
            std::fs::write(bundle.join("Contents").join("MacOS").join("apunta"), "half").unwrap();
            Err("the plugin failed".to_string())
        });
        assert!(matches!(result, Err(InstallError::Install(_))));
        assert_eq!(
            std::fs::read(bundle.join("Contents").join("MacOS").join("apunta")).unwrap(),
            b"v1"
        );
    }

    #[cfg(unix)]
    #[test]
    fn exited_or_wrong_identity_replacements_never_complete_health() {
        use std::os::unix::fs::PermissionsExt;
        for (nonce, version) in [("foreign", "1.2.3"), ("owned", "0.1.0")] {
            let scratch = Scratch::new();
            let app = scratch.0.join("replacement.sh");
            let line = crate::bridge::native_ready_line(nonce, 7895, version, false);
            std::fs::write(
                &app,
                format!("#!/bin/sh\nprintf '%s' '{}'\nexit 1\n", line.trim()),
            )
            .unwrap();
            std::fs::set_permissions(&app, std::fs::Permissions::from_mode(0o700)).unwrap();
            assert!(supervise(&app, Some("99"), "owned", "1.2.3", false).is_err());
        }
    }

    #[cfg(feature = "test-updater")]
    mod live {
        //! Real HTTP between loopback ports 7890-7899: the redirect policy
        //! driven by an actual client, not just its decision function.
        use super::*;
        use std::io::{Read, Write};
        use std::net::TcpListener;

        /// Serves one canned response per connection until dropped.
        fn serve(port: u16, response: String) -> std::thread::JoinHandle<()> {
            let listener = TcpListener::bind(("127.0.0.1", port)).expect("test port is free");
            std::thread::spawn(move || {
                if let Ok((mut stream, _)) = listener.accept() {
                    let mut buffer = [0u8; 2048];
                    let _ = stream.read(&mut buffer);
                    let _ = stream.write_all(response.as_bytes());
                }
            })
        }

        fn redirect_to(location: &str) -> String {
            format!("HTTP/1.1 302 Found\r\nLocation: {location}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n")
        }

        fn ok(body: &str) -> String {
            format!(
                "HTTP/1.1 200 OK\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{body}",
                body.len()
            )
        }

        async fn get(target: &str) -> Result<String, reqwest::Error> {
            let _ = rustls::crypto::ring::default_provider().install_default();
            let client = reqwest::Client::builder()
                .redirect(redirect_policy())
                .no_proxy()
                .build()?;
            client.get(target).send().await?.text().await
        }

        #[test]
        fn a_redirect_to_an_approved_target_is_followed() {
            let first = serve(7891, redirect_to("http://127.0.0.1:7892/next"));
            let second = serve(7892, ok("arrived"));
            let body = tauri::async_runtime::block_on(get("http://127.0.0.1:7891/start"));
            first.join().unwrap();
            second.join().unwrap();
            assert_eq!(body.expect("the redirect is followed"), "arrived");
        }

        #[test]
        fn a_redirect_to_an_unapproved_host_is_refused_and_never_requested() {
            let first = serve(7893, redirect_to("https://evil.example/payload"));
            let error = tauri::async_runtime::block_on(get("http://127.0.0.1:7893/start"))
                .expect_err("the redirect must be refused");
            first.join().unwrap();
            assert!(error.is_redirect(), "{error}");
            assert!(is_rejection(&UpdaterError::Reqwest(error)));
        }

        #[test]
        fn a_redirect_to_another_loopback_port_outside_the_range_is_refused() {
            let refused =
                TcpListener::bind(("127.0.0.1", 7889)).expect("isolated refused port is free");
            refused.set_nonblocking(true).unwrap();
            let first = serve(7894, redirect_to("http://127.0.0.1:7889/forbidden"));
            let error = tauri::async_runtime::block_on(get("http://127.0.0.1:7894/start"))
                .expect_err("the non-updater port must never be reached");
            first.join().unwrap();
            assert!(error.is_redirect(), "{error}");
            assert!(
                matches!(refused.accept(), Err(error) if error.kind() == std::io::ErrorKind::WouldBlock)
            );
        }
    }
}
