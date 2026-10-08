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
- **Ollama is not bundled**, the same as on Linux: the app talks to the
  installed Ollama. The card asked for a bundled one; that would need the shell
  to start and stop it, which nothing does on Linux and nothing could test.
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
5. Ollama and the writing model:
   1. `bash scripts/setup-macos.sh --dry-run` to see the plan.
   2. `bash scripts/setup-macos.sh` to install them. It is the v1 setup script
      and has also never run on a Mac, so note anything it gets wrong.

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
- `whisper-cli` still links a library dynamically.

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
2. **Onboarding.** Choose the standard format, add a made-up patient (John
   Smith).
3. **Microphone.** Write a note › Record. macOS should ask for the microphone
   with the text above. Check the Spanish text by setting the Mac's language to
   Spanish and launching again.
4. **Dictation.** Record about 10 seconds, stop and draft. Does a transcript
   appear, and does a draft come back?
5. **Settings › About.** Is the version shown?
6. **Quit and reopen.** Is the note still there? The data lives in
   `~/Library/Application Support/Apunta`.
7. **After quitting.** Run `ps aux | grep -i apunta`. Nothing from Apunta should
   be left running.
8. **Signing.** Run `codesign -dv --verbose=2 /Applications/Apunta.app`. It
   should show `Signature=adhoc`.

## Known risks, in the order they are likely to bite

- **The Mac-only Rust branch has never been compiled.** It only switches two
  constants, but a typo would stop `tauri:build`. The fix is local and quick.
- **Dropping the Linux resource folder.** `tauri.macos.conf.json` removes the
  Linux folder with a JSON merge-patch `null`. If `tauri:build` rejects the
  config over it, change the base `bundle.resources` entry to name each
  platform's folder in its own platform file instead.
- **The microphone inside the app window.** macOS needs the app to grant the
  web view's microphone request. If recording fails with a permission error
  even after you allow it, that is the shell's job, and the next card.
- **Native-module loading.** The bundled `node` is the Node project's own
  signed build, and it loads the ad-hoc SQLite add-on. If the server fails at
  start with a code-signing or library-validation error, record the exact
  message.
- **The updater.** No Mac release exists, so it finds nothing to install. That
  is expected.

Send back what each step printed, and screenshots of anything unexpected. Use
made-up patients only.
