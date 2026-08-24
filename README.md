# Apunta

Apunta turns what you say or type after a session into a structured clinical
note, on your own Mac. You dictate or write a few rough lines, it drafts the
note in your format, you correct it in a chat beside the text, and you copy the
finished note into whatever records system you actually use.

**Nothing you write in it leaves the machine.** The AI runs on your Mac. There
is no account, no server, no analytics, and no update check. The program is not
permitted to make an outbound connection at all — if some future change tried,
it would fail rather than succeed quietly. The one exception is the first run,
which downloads the AI models once, from the people who made them, and then
never uses the internet again.

---

## What it is, and what it is not

It **is** a drafting tool. It saves you the twenty minutes after each session
spent turning notes into prose.

It **is not** your clinical record. The finished note goes into your records
system by copy and paste; Apunta keeps the drafts, the transcripts and the
conversations you had with it about them. That material exists nowhere else,
which is what the backups are for.

It has no password of its own. Anyone sitting at your unlocked Mac can open it.
That is a deliberate trade — see *Privacy* below — and the answer to it is a
locked screen and, if the Mac is shared with anyone, a separate macOS account
for the practice.

---

## Privacy, in plain language

| | |
| --- | --- |
| **Where the notes are** | One folder on your Mac: `~/Library/Application Support/Apunta` |
| **Who else has a copy** | Nobody, unless you put one somewhere |
| **What the AI is** | Two programs downloaded onto your Mac — one writes, one listens. Neither sends anything anywhere |
| **Transcription** | Your recording is read on this Mac. Apunta deliberately does not use the browser's built-in speech recognition, because on most browsers that uploads the audio to Google |
| **Analytics, crash reports, update checks** | None |
| **What protects the notes if the Mac is stolen** | FileVault, macOS's disk encryption — and it is not on by default on every Mac. Apunta checks and tells you |
| **What protects them from someone at your unlocked Mac** | Nothing in Apunta. Lock the screen |

The *About* page inside the app says all of this too, including what it does
not protect you from.

---

## Setting it up on a Mac

> **If someone gave you an `Apunta.dmg`, none of this applies to you.** Read
> [`docs/INSTALL.md`](docs/INSTALL.md) instead: double-click, drag, follow a
> progress bar, no Terminal. What follows is the developer path — cloning the
> repository and running it from source.

Three steps. The first one is a download that takes a while; the other two are
quick.

**1. Get the code and install its dependencies.** In Terminal:

```sh
git clone https://github.com/villenull/Apunta.git
cd Apunta
npm install
```

You need [Homebrew](https://brew.sh) and Node 22 or newer. If `node -v` says
nothing or says something older, the setup script in step 2 installs it.

**2. Install the AI, and get the models.**

```sh
bash scripts/setup-macos.sh
```

It installs Ollama and whisper.cpp, starts Ollama, picks a writing model sized
to your Mac's memory, downloads it, downloads the speech model into Apunta's
own folder and checks it arrived intact. It is safe to run again as many times
as you like, and `--dry-run` shows you everything it would do without doing any
of it.

> **This script has never been run on a Mac.** It was written in a Linux
> container that has no Homebrew in it. See
> [`docs/MANUAL-VERIFICATION.md`](docs/MANUAL-VERIFICATION.md), which is the
> checklist for the first real run.

**3. Start it.**

```sh
npm start
```

It builds, serves the app at <http://127.0.0.1:7717>, and opens your browser
there.

**Then, before real notes go in**, run the read-only check:

```sh
bash scripts/preflight-macos.sh
```

It looks at the things Apunta cannot fix for you — whether your disk is
encrypted, whether iCloud is quietly syncing the folders you would naturally
save a backup into, whether you have a Time Machine backup at all — and prints
what to do in the order to do it.
[`docs/PREFLIGHT.md`](docs/PREFLIGHT.md) explains every check in it.

### Optional: start it automatically

```sh
bash scripts/install-launchagent.sh
```

Apunta then starts when you log in and is simply there at
<http://127.0.0.1:7717>. Remove it with `--uninstall`; the command is printed
at the end of the install so you never have to look it up.

---

## Using it day to day

1. **Add a note format** the first time — the sections your notes have. Upload
   a blank template, upload two or three notes you have already written, or
   type the section names.
2. **Add a patient.** A name, and an identifier if you use one.
3. **New note.** Record yourself talking about the session, or type the rough
   version. Say things in any order; that is what it is for.
4. **Read the draft.** It appears section by section. Where the recording was
   unclear it writes `[unclear in dictation]` rather than guessing. Where you
   said nothing about a section it leaves it blank rather than inventing
   something to fill it.
5. **Fix it in the chat** on the right. Highlight a sentence to talk about that
   sentence. "Shorter." "Move that to Objective." "I never said she was
   sleeping better."
6. **Publish and copy.** Publishing locks the text and puts it on your
   clipboard, ready to paste into your records system.

A **treatment plan** and a **session briefing** live beside the notes for each
patient. The model can draft goals from recent notes, but a suggestion is not
part of the plan until you accept it, and each one arrives quoting the note it
came from.

**Read every draft before you publish it.** A model can write a sentence that
sounds clinically right and was never said. That is the whole reason the drafts
are yours to correct rather than yours to approve.

---

## Backing it up

**Settings → Back up and restore.** Apunta backs up once a day on its own, and
"Back up now" does it immediately. Each backup is one zip holding:

- `apunta.db` — the database, checked before the backup is called done. This is
  what a restore uses.
- `notes/` — every note as a plain text file, one folder per patient. Opens in
  TextEdit in twenty years with no software at all.
- `plans/` — each treatment plan version as the document it would be printed as.
- `data.json` — the same information as structured data.
- `RESTORE.txt` — how to get your notes back, written for someone who no longer
  has Apunta.

Three things worth knowing:

- **The default folder is inside Apunta's own folder.** That protects you from a
  mistake in the app, which is the common case, and Time Machine picks it up for
  free. It does **not** protect you from losing the Mac. A second copy on an
  encrypted external disk is what covers that.
- **Do not save backups into Desktop or Documents.** Those are the two folders
  iCloud syncs by default, so a backup there is uploaded to Apple — and with
  "Optimize Mac Storage" on, macOS can replace one you never open with an empty
  placeholder. Apunta warns you if you point it at one.
- **Set a passphrase for anything leaving the Mac**, or better, put it on an
  encrypted disk and let macOS hold the key. If you set a passphrase and lose
  it, nobody can open that backup — including us.

**Try a restore once.** Follow `RESTORE.txt` on a spare copy and watch the notes
come back. A backup nobody has restored is a guess, and Settings will ask you
once whether you have.

---

## When something is wrong

| What you see | What to do |
| --- | --- |
| "Apunta can't reach the local AI" | Ollama is not running. `brew services start ollama`, or open **Setup** in the app, which lists everything and gives the command for each |
| "Apunta can't find the AI model" | It has not been downloaded. `ollama pull <the tag Setup names>` |
| Recording says whisper is missing | `brew install whisper-cpp` |
| Recording says the speech model is missing | `bash scripts/setup-macos.sh` — it downloads it and checks the file |
| The draft repeats a word over and over | A known failure of small models under constrained decoding. Try again; if it keeps happening, switch models in Settings and tell whoever maintains this |
| The draft ignores your note format | The model is in the wrong weight format. Setup checks this; the fix is `ollama rm <name>` and pulling the tag Setup names |
| Drafting is very slow | Check no other large program is holding memory. On a 32 GB Mac the middle tier is the honest choice, not the large one |
| The page will not load at all | The server is not running. `npm start` in the Apunta folder |
| Nothing saved and you saw a red message | It really did not save. The message says why; nothing is written until it succeeds |
| Setup says FileVault is off | System Settings → Privacy & Security → FileVault → Turn On. Keep the recovery key somewhere that is not this Mac. Do it before real notes go in |

---

## Development

A TypeScript monorepo: a Fastify server bound to `127.0.0.1` serves a React SPA
and a JSON/SSE API over SQLite, and talks only to local AI — Ollama for
drafting and refining (schema-enforced structured output) and whisper.cpp for
transcription (16 kHz WAV recorded in the browser, so nothing has to transcode
it). Fake providers make the whole app runnable and CI-testable with no AI
tooling installed.

Node 22+ (`.nvmrc` pins the major). `npm install` once at the root — five
workspaces install together.

| Command | What it does |
| --- | --- |
| `npm run dev` | API on :7717 (tsx watch) + Vite on :5173 proxying `/api` |
| `npm run dev:fake` | The same with `APUNTA_FAKE_AI=1`, so no AI is needed |
| `npm start` | Build everything and serve the app from :7717 |
| `npm run seed` | Load the prototype's sample practice (`-- --reset` replaces) |
| `npm run lint` | ESLint + Prettier + the non-loopback-URL scanner |
| `npm run typecheck` | tsc across every workspace |
| `npm test` | Vitest, all workspaces |
| `npm run e2e` | Playwright, against the built app in fake mode on :7788 |
| `npm run eval` | The model-quality harness. `-- --fake` is the CI self-check |
| `npm run smoke:live` | A real dictation through a real Ollama. Manual |
| `npm run package:mac` | Build `Apunta.app` and `Apunta.dmg`. macOS only; it refuses elsewhere |
| `npm run licenses` | Regenerate the npm half of `THIRD-PARTY-LICENSES.md` |

Useful env: `APUNTA_PORT`, `APUNTA_DATA_DIR`, `APUNTA_FAKE_AI=1`,
`APUNTA_NO_OPEN=1` (do not open a browser on start), and
`PLAYWRIGHT_CHROMIUM_EXECUTABLE` when a sandbox already has a browser that
`playwright install` should not replace.

### Where the project stands

| Packet | State |
| --- | --- |
| M0 scaffold | done — monorepo, toolchain, CI, egress guard |
| M1 data + API | done — migrations, SQLite, every non-AI endpoint, seed script |
| M2 web shell | done — the prototype ported to React |
| M3 AI providers | done — provider layer, fakes, Ollama drafting with an enforced schema |
| M4 refine chat | done — streaming chat that rewrites the note, highlight-refs, publish lock |
| M5 audio | done — record 16 kHz WAV in the tab → whisper.cpp → transcript → draft |
| M6 formats | done — format onboarding, detection from templates and examples, skill import |
| M9 treatment plan + prep | done — versioned payer-facing plan, model-drafted goals she accepts or discards, session briefings |
| M7 setup, polish, eval | done here — setup script, first-run wizard, FileVault check, backup and restore, polish, eval harness |
| M8 installer | built here, **none of it ever run** — a double-clickable `.dmg`, bundled Node + Ollama + whisper-cli, a Swift menu-bar shell, first-run model download. Everything macOS-specific awaits the Mac: see `docs/MANUAL-VERIFICATION.md` §7 |

### The two things automated tests cannot tell you

**The model.** Everything in CI runs against fake providers. That proves the
plumbing and nothing whatever about model quality. `npm run smoke:live -- --runs 5`
is the first real evidence, and `npm run eval` is the measured version:

```sh
npm run eval -- --runs 3 --out eval-report.md
```

It puts all twenty fixtures in `e2e/fixtures/eval/` through the real model and
scores each note against `rubric.md`. The report **leads with fabrication
rate** — an omission is recoverable in the refine chat; a fabrication looks
finished and gets published.

**The Mac.** This project has been built entirely in a Linux container.
[`docs/MANUAL-VERIFICATION.md`](docs/MANUAL-VERIFICATION.md) is the list of
everything macOS-specific that has been written and never run, with the command
to settle each one.

### Repository layout

| Path | What it is |
| --- | --- |
| `shared/` | zod schemas and types shared by server and web (built to `dist/` first) |
| `server/` | Fastify API on `127.0.0.1:7717`; serves `web/dist` in production |
| `server/src/backup/` | The archive: `VACUUM INTO`, manifest, RESTORE.txt, staged restore |
| `server/src/eval/` | The model-quality harness behind `npm run eval` |
| `web/` | React + Vite SPA |
| `e2e/` | Playwright specs, and the eval corpus in `e2e/fixtures/eval/` |
| `installer/` | First-run setup logic — disk check, model tier, resumable download, checksum. Runs under the bundled `node`, speaks NDJSON to the app shell, never imported by the running app |
| `macos/` | The `Apunta.app` shell: a status item, one child process, a progress window and `open`. Swift/AppKit, ~700 lines, no arithmetic |
| `scripts/` | Allowed to assume macOS, with `macos/`: setup, preflight, LaunchAgent, packaging, uninstall |
| `docs/INSTALL.md` | The install guide for the therapist. No commands in it |
| `THIRD-PARTY-LICENSES.md` | Every licence Apunta ships, in full, and what has not been read |
| `docs/PLAN.md` | Master plan: architecture, data model, API, AI pipeline, milestones |
| `docs/agents/` | Self-contained work packets for coding agents, with acceptance criteria |
| `docs/research/` | The verified research behind the stack, privacy and packaging choices |
| `docs/decisions.md` | Append-only decisions log |
| `CLAUDE.md` | Conventions, commands, and hard rules for agents working here |
| `prototype/` | The click-through HTML/CSS design reference. No build step, no real data |

### Picking this up with a coding agent

> **Read [`docs/dev-notes/README.md`](docs/dev-notes/README.md) first.** It
> explains a Stop-hook false alarm that fires while background agents are
> working, why acting on it damages commit history, and the protocol that
> avoids it.

Everything lives on one branch, which is also the default branch. Give a new
session:

> Read docs/PLAN.md, CLAUDE.md, and docs/agents/<packet>.md, then implement
> that packet exactly. All work stays on the current branch — no feature
> branch, no PR. Keep commits small and stop when every acceptance criterion
> passes locally (lint, typecheck, tests, build, e2e), then push.

Every packet M0–M9 has landed. What is left is not a packet: it is a Mac.
`docs/MANUAL-VERIFICATION.md` is the list, and its §7 is the installer.

CI is GitHub Actions on ubuntu-latest, everything in fake mode:
lint → typecheck → tests → build → the eval harness self-check → Playwright.
