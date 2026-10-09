# First run on a Mac (P6.1)

Everything below was prepared on Linux on 2026-10-07 and has **never run on a
Mac**. Status: configured, not runtime-verified. Work through it in order at
an Apple-silicon Mac on macOS 14 or newer, and write down what each step
printed. A failure is useful: it is the first real evidence this path has had.

## What was prepared

- `src-tauri/tauri.macos.conf.json`: the Mac build settings. These are an
  `.app` and a `.dmg`, macOS 14 or newer, ad-hoc signing (`-`), and the
  bundled runtime at `macos-resources/`. Tauri merges this file over
  `tauri.conf.json` only when building on a Mac.
- `src-tauri/Info.plist` and `src-tauri/macos/{en,es}.lproj/InfoPlist.strings`:
  the text macOS shows when Apunta first asks for the microphone, in English
  and Spanish. Recording happens inside the app's own window, so the app asks.
- `src-tauri/src/main.rs`, `launch.rs`: the shell looks for
  `macos-resources/` on a Mac. This branch has not been compiled.
- `scripts/v2/package-macos-resources.sh`: builds `build/macos-resources/`
  with the same layout as Linux. Run with `--dry-run` it prints its plan on
  any machine.
- **Ollama is bundled** (2026-10-08, A19): the packager unpacks the pinned
  Ollama 0.33.3 into `macos-resources/ollama/`. The server starts it on a
  private port (11435, so an Ollama installed separately keeps 11434), with
  its weights in Apunta's data folder, and stops it on quit.
- **First-run setup** (2026-10-08): on a first launch with no models, the app
  opens a setup window listing the speech and writing models, their sizes and
  where they come from. Nothing downloads until **Download** is pressed; the
  shell then runs the bundled installer, which downloads and verifies them.
  This flow was proven on the Linux AppImage; the Mac uses the same code.
- The old v1 path (`scripts/package-mac.sh`, `macos/`) is marked superseded.

## Before you start

You need:

1. Xcode Command Line Tools: `xcode-select --install`.
2. Homebrew, then `brew install cmake git`.
3. Rust: `rustup` from rustup.rs, with the default Apple-silicon toolchain.
4. **Node 24.19.0 for Apple silicon**, row A18 in `docs/v2/ACQUISITION.md`.
   The owner approved this download on 2026-10-08.
   1. Download `node-v24.19.0-darwin-arm64.tar.gz` from
      https://nodejs.org/dist/v24.19.0/.
   2. Check `shasum -a 256` prints
      `8294b7aa9b03997481c06babf1e8b270c859358f27da57a11509afe537ac381d`.
   3. Extract it so that
      `~/.local/share/apunta-node/node-v24.19.0-darwin-arm64/bin/node` exists.
   4. Put that `bin` folder first on `PATH` for the rest of these steps.
5. **Ollama 0.33.3 for macOS**, row A19 in `docs/v2/ACQUISITION.md`. The
   owner approved this download on 2026-10-08.
   1. Download `ollama-darwin.tgz` from
      https://github.com/ollama/ollama/releases/tag/v0.33.3 (159,236,337 bytes).
   2. Check `shasum -a 256` prints
      `342db03df80bb9db84ff64246031bd5f70c09b59ff52fa5cc9aaae3476cc4a9d`.
   3. Save it as `~/.local/share/apunta-ollama/ollama-darwin-v0.33.3.tgz`. Do
      not unpack it; the packager checks it and unpacks it itself.

   Do **not** install Ollama or pull a model with Homebrew for this test. The
   point is to see the app set itself up from nothing.

## Build

Run these from the repository, in order:

```bash
npm install
```

```bash
bash scripts/v2/package-macos-resources.sh
```

The packager is finished when it prints `output: …/build/macos-resources` and
`manifest lists N files`. It refuses rather than guessing if:

- the Node tree is missing;
- the SQLite add-on prebuild is missing;
- `whisper-cli` does not run after copying;
- `whisper-cli` still links a library dynamically;
- the Ollama tarball is missing or its checksum differs;
- the unpacked `ollama` does not report version 0.33.3.

```bash
npm run tauri:build
```

This builds the app with the owner's updater key. The file people download is
the disk image, `src-tauri/target/release/bundle/dmg/Apunta_<version>_aarch64.dmg`.
The `.app` it contains is also left at
`src-tauri/target/release/bundle/macos/Apunta.app`.

## First launch: what to check

1. **Opening.** Open the `.dmg`, drag Apunta to Applications, then right-click
   › Open. It is ad-hoc signed, so macOS warns the first time. Does it open?
2. **Setup window.** It should open by itself over onboarding. It lists the
   speech model (about 78.6 MB, from Hugging Face) and the writing model
   (`qwen3.5:4b-q4_K_M`, about 3.4 GB, from Ollama's model library). Press
   **Download**. Watch the progress, press **Stop** once and then **Try again**
   (it should continue where it stopped), and wait for "Apunta's AI is ready".
   Note the time it took. If it fails, write down the sentence it shows.
3. **Onboarding.** Choose the standard format, add a made-up patient (John
   Smith).
4. **Microphone.** Write a note › Record. macOS should ask for the microphone
   with the text above. Check the Spanish text by setting the Mac's language to
   Spanish and launching again.
5. **Dictation.** Record about 10 seconds, stop and draft. Does a transcript
   appear, and does a draft come back?
6. **Settings › About.** Is the version shown?
7. **Quit and reopen.** Is the note still there, and does the setup window
   stay closed? The data, models included, lives in
   `~/Library/Application Support/Apunta`.
8. **After quitting.** Run `ps aux | grep -i -e apunta -e ollama`. Nothing from
   Apunta, and no `ollama serve`, should be left running.
9. **Signing.** Run `codesign -dv --verbose=2 /Applications/Apunta.app`. It
   should show `Signature=adhoc`.

## Updating (after the first run works)

Mac updating replaces `Apunta.app` in place. It keeps `Apunta.previous.app`
beside it to roll back to, and restarts the new version. Testing it needs two
signed releases:

1. **Build a signed release.** This needs the owner's private key and its
   password (never put them in the repository):

   ```bash
   npm run tauri:build
   ```

   ```bash
   tar -czf src-tauri/target/release/bundle/macos/Apunta.app.tar.gz -C src-tauri/target/release/bundle/macos Apunta.app
   ```

   ```bash
   TAURI_SIGNING_PRIVATE_KEY="$(cat ~/.apunta-signing/apunta-updater.key)" npx tauri signer sign src-tauri/target/release/bundle/macos/Apunta.app.tar.gz
   ```

   The last command asks for the password. The `.tar.gz` and the
   `Apunta.app.tar.gz.sig` it writes are the update and its signature. (The
   bundler's own `createUpdaterArtifacts` is not used: it needs updater
   settings in the build config that this app does not carry.)
2. **Publish two versions.** Publish one as a GitHub release, with a
   `latest.json` whose `platforms` has a `darwin-aarch64` entry naming the
   `.tar.gz` URL and the contents of the `.sig`. Install it. Then raise the
   version and publish a second.
3. **Install the update.** The installed app should offer the update, install
   it, and restart on the new version, with `Apunta.previous.app` left beside
   it in Applications.

## Known risks, in the order they are likely to bite

- **The Mac-only Rust branch has never been compiled.** It only switches two
  constants, but a typo would stop `tauri:build`. The fix is local and quick.
- **Dropping the Linux resource folder.** `tauri.macos.conf.json` removes the
  Linux folder with a JSON merge-patch `null`. If `tauri:build` rejects the
  config over it, change the base `bundle.resources` entry to name each
  platform's folder in its own platform file instead.
- **The bundled Ollama under ad-hoc signing.** Its binaries keep Ollama's own
  signature inside the app. If the setup window says the AI runtime isn't
  running, run
  `"/Applications/Apunta.app/Contents/Resources/macos-resources/ollama/ollama" --version`
  and record what it prints.
- **The microphone inside the app window.** macOS needs the app to grant the
  web view's microphone request. If recording fails with a permission error
  even after you allow it, that is the shell's job, and the next card.
- **Native-module loading.** The bundled `node` is the Node project's own
  signed build, and it loads the ad-hoc SQLite add-on. If the server fails at
  start with a code-signing or library-validation error, record the exact
  message.
- **The updater.** No Mac release exists, so it finds nothing to install. That
  is expected. Once one does, the Mac-only lines (finding the `.app` from the
  running program) have never been compiled. Keep-previous and rollback on a
  bundle were tested on Linux with a stand-in `.app` folder. macOS may also
  refuse to replace an app in `/Applications` for a user who is not an admin.
  If installing fails with a permission error, record it.

Send back what each step printed, and screenshots of anything unexpected. Use
made-up patients only.
