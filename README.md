<p align="center">
  <img src="web/public/favicon.svg" width="72" alt="Apunta icon">
</p>

<h1 align="center">Apunta</h1>

<p align="center">
  <strong>Local-first clinical note drafting for therapists.</strong><br>
  Dictate or type the rough version, review the draft, refine it beside the text, and use <strong>Finish &amp; copy</strong> to put the finished note into the records system you already use.
</p>

<p align="center">
  <a href="https://github.com/villenull/Apunta/actions/workflows/ci.yml"><img src="https://img.shields.io/badge/CI-GitHub%20Actions-1f6f63?style=flat-square" alt="CI: GitHub Actions"></a>
  <img src="https://img.shields.io/badge/platform-macOS%2014%2B%20%7C%20Apple%20silicon-1f6f63?style=flat-square" alt="Platform: macOS 14 or newer on Apple silicon">
  <img src="https://img.shields.io/badge/runtime-local%20AI-1f6f63?style=flat-square" alt="AI runs locally">
  <img src="https://img.shields.io/badge/status-pre--release-bb8f3d?style=flat-square" alt="Status: pre-release">
</p>

> **Read this as a pre-release project.** Apunta has been exercised in Linux
> development and fake-AI CI. The macOS installer, menu-bar shell and setup
> path still need their first real Mac verification. See
> [`docs/MANUAL-VERIFICATION.md`](docs/MANUAL-VERIFICATION.md).

## The short version

Apunta is a drafting tool, not a clinical record system. It keeps drafts,
transcripts and refinement conversations on the Mac, then puts the note on your
clipboard when you choose **Finish & copy**. Read every draft before you use it: a local
model can still write a sentence that was never said.

<p align="center">
  <img src="docs/assets/readme/hero.png" alt="Apunta note workspace" width="1100">
</p>

## What it feels like

<table>
<tr>
<td width="35%" valign="middle">

<p><strong>01 · Speak or type the session</strong></p>

Record a session summary or write rough notes in any order. Local `whisper.cpp`
transcription shows a live, provisional preview and turns the stopped recording
into editable source text.

</td>
<td width="65%">
  <picture>
    <source srcset="docs/assets/readme/feature-01-mobile.gif" type="image/gif" media="(prefers-reduced-motion: no-preference)">
    <source srcset="docs/assets/readme/feature-01-mobile.png" type="image/png">
    <img src="docs/assets/readme/feature-01-mobile.png" alt="Recording a session summary with a live transcription preview" width="100%">
  </picture>
</td>
</tr>
<tr>
<td width="35%" valign="middle">

<p><strong>02 · Review the draft</strong></p>

Apunta drafts into your chosen note format. Unclear speech stays marked;
sections you did not cover stay blank instead of being filled with plausible
fiction.

</td>
<td width="65%">
  <picture>
    <source srcset="docs/assets/readme/feature-02-mobile.gif" type="image/gif" media="(prefers-reduced-motion: no-preference)">
    <source srcset="docs/assets/readme/feature-02-mobile.png" type="image/png">
    <img src="docs/assets/readme/feature-02-mobile.png" alt="Reviewing a structured draft in the note editor" width="100%">
  </picture>
</td>
</tr>
<tr>
<td width="35%" valign="middle">

<p><strong>03 · Refine beside the note</strong></p>

Ask for a shorter sentence, a moved section or another concrete edit in the
chat beside the draft. The note remains yours to inspect before you finish and copy it.

</td>
<td width="65%">
  <picture>
    <source srcset="docs/assets/readme/feature-03-mobile.gif" type="image/gif" media="(prefers-reduced-motion: no-preference)">
    <source srcset="docs/assets/readme/feature-03-mobile.png" type="image/png">
    <img src="docs/assets/readme/feature-03-mobile.png" alt="Refining a note in the chat beside the text" width="100%">
  </picture>
</td>
</tr>
<tr>
<td width="35%" valign="middle">

<p><strong>04 · Keep patients and sessions together</strong></p>

Organize notes by patient, with treatment plans, session briefings, backups and
an optional per-patient brainstorm kept in the same local practice.

</td>
<td width="65%">
  <picture>
    <source srcset="docs/assets/readme/feature-04-mobile.gif" type="image/gif" media="(prefers-reduced-motion: no-preference)">
    <source srcset="docs/assets/readme/feature-04-mobile.png" type="image/png">
    <img src="docs/assets/readme/feature-04-mobile.png" alt="Organizing patients, notes and session tools in the workspace" width="100%">
  </picture>
</td>
</tr>
<tr>
<td width="35%" valign="middle">

<p><strong>05 · Reuse your note formats</strong></p>

Start with the bundled progress-note format, or add your own sections from a
blank template, examples or typed names. Change formats later in Settings.

</td>
<td width="65%">
  <picture>
    <source srcset="docs/assets/readme/feature-05-mobile.gif" type="image/gif" media="(prefers-reduced-motion: no-preference)">
    <source srcset="docs/assets/readme/feature-05-mobile.png" type="image/png">
    <img src="docs/assets/readme/feature-05-mobile.png" alt="Choosing and customizing a reusable note format" width="100%">
  </picture>
</td>
</tr>
</table>

## Privacy is a product decision

- The running app talks only to `127.0.0.1` / `localhost`.
- Writing and transcription use models stored on the Mac.
- There is no account, analytics, crash reporting or update check.
- The one network exception is explicit first-run model acquisition. The
  installer downloads pinned model files from its allow-list, verifies their
  checksums, and is not part of the running server or browser app.
- Apunta has no password of its own. Lock the screen, use a separate macOS
  account on a shared Mac, and enable FileVault before real notes go in.
- Backups can contain patient data. Keep them encrypted and do not put them in
  iCloud-synced Desktop or Documents folders.

See [`docs/INSTALL.md`](docs/INSTALL.md) for the plain-language limits and the
backup/restore procedure. The app's own Settings › Advanced has one row,
**Read more about Apunta**, that opens this repository — licence notices live in
[`THIRD-PARTY-LICENSES.md`](THIRD-PARTY-LICENSES.md) there.

## Getting started

### For the person using Apunta

If you were given an `Apunta.dmg`, start with
[`docs/INSTALL.md`](docs/INSTALL.md). It describes the double-click install,
the first-run model download and macOS's warning for an ad-hoc-signed,
unnotarized pre-release build. It requires an Apple-silicon Mac running
macOS 14 or newer, 4–23 GB of free space depending on the selected model,
and an internet connection for the first setup. Apunta has not yet been run
through that guide on a Mac.

### For development

```sh
git clone https://github.com/villenull/Apunta.git
cd Apunta
npm install
npm run dev:fake
```

Open <http://127.0.0.1:5173>. Fake mode keeps the whole app runnable without
Ollama, whisper.cpp or any model weights. For the production-shaped local
server:

```sh
npm start
```

The source path needs Node 24.19.0+. Real model setup is macOS-specific:

```sh
bash scripts/setup-macos.sh
```

That script has not been run on a Mac yet. It is the explicit model-acquisition
exception described above; `--dry-run` is safe off macOS. Before real notes,
run the read-only checks in [`docs/PREFLIGHT.md`](docs/PREFLIGHT.md).

To reconstruct the exact sanitized Linux reference configuration after a
machine reset, including model digests, runtime versions, note instructions
and safe verification commands, start with
[`docs/RECOVERY.md`](docs/RECOVERY.md). It uses the existing installer and
`config/recovery/current-linux.json`; model acquisition remains an explicit
user action.

## Development status

All planned work packets M0–M13 are built, including local drafting,
transcription, formats, refine chat, backups, installer logic and Claude
conversation import. The remaining release gate is evidence on a real Mac:
the setup scripts, packaged app, menu-bar shell, FileVault checks, backup
round-trip and uninstall path. Model quality is measured separately; CI's
fake-AI run proves plumbing, not clinical faithfulness.

Read [`docs/HANDOFF.md`](docs/HANDOFF.md) for current open work,
[`docs/MANUAL-VERIFICATION.md`](docs/MANUAL-VERIFICATION.md) for the Mac
checklist, and [`docs/decisions.md`](docs/decisions.md) for decisions that
change the product's boundaries.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev:fake` | Vite + Fastify development loop without AI tooling |
| `npm run lint` | Lint, format, URL and license checks |
| `npm run typecheck` | TypeScript checks across workspaces |
| `npm test` | Unit and integration tests |
| `npm run build` | Production build |
| `npm run e2e` | Playwright against the built app in fake mode |
| `npm run eval -- --fake` | Eval harness positive-control self-check |
| `npm run package:mac` | Build the macOS app and DMG; macOS only |

## Repository map

| Path | Role |
| --- | --- |
| `web/` | React + Vite browser UI |
| `server/` | Fastify API, SQLite and local AI providers |
| `shared/` | Zod schemas and types shared by server and web |
| `installer/` | First-run model download and checksum verification |
| `macos/` | Swift/AppKit menu-bar shell |
| `e2e/` | Playwright specs and synthetic evaluation fixtures |
| `docs/` | Installation, verification, decisions and handoff |

## License and status

This repository is a pre-release, private project and is currently marked
`UNLICENSED` in `package.json`. No permission to redistribute the source or
packaged application is granted by this README. Do not put real patient text,
audio or exports in issues, fixtures, screenshots or commits.
