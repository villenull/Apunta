# S4a.1 evidence

Two implementation sessions on 2026-09-26, on branch `feature/v2`. Commands ran
from the repository root. All paths are sanitised: a sandbox run folder is `<sandbox>`
and the home folder is `~`.

| Session | Base commit | Outcome |
| --- | --- | --- |
| Attempt 1 | `f790709` | V2, V3, V4 pass; **V1 fails** — Piper 1.8.0 is not byte-deterministic. Reported under the card's Stop conditions, not worked around |
| Attempt 2 (this one) | `810dbb4` | **V1, V2, V3, V4 all pass.** The two pinned determinism settings make all 295 clips byte-identical across two run directories |

| File | What it is |
| --- | --- |
| `verification-attempt-2.log` | **Attempt 2.** V1–V4: working directory, exact command, exit code, start and end time, excerpt |
| `verification.log` | Attempt 1, kept as written: the same four rows, with V1's failure |
| `acquisitions.md` | A09 (Piper) and A10 (`es_MX-ald-medium`): version, URL, size, SHA-256, licence evidence. Unchanged by attempt 2 — nothing was re-fetched |
| `determinism.md` | The V1 failure isolated, why it happened, and, at the end, the attempt-2 repair, what it cost, and what it changed for S4a.2 |
| `reference.json` | The attempt-2 V2 run's `reference.json`, transcribed verbatim (275,244 bytes) |

Attempt 2 re-used the Piper 1.8.0 install and the `es_MX-ald-medium` voice that
attempt 1 acquired, as A09 and A10 require ("only if not already installed"), and
recorded nothing new in `acquisitions.md` because it acquired nothing.

**A note on the base commit.** The card names `810dbb4`, and that commit is this
session's parent: `git log -1` read `f3cff8b` ("Add S4a.1 attempt-2 checkpoint"),
which changes one file, `docs/v2/state/cards/S4a.1.json`, and nothing else. HEAD's
tree is therefore byte-identical to `810dbb4`'s except for that one-line
checkpoint reset, and the checkpoint's own `baseCommit` field reads `810dbb4`. No
pull, merge, rebase or reset was performed. See the return file.

**What is not here, and why.** The 295 WAV files — 398 MB, 3 h 41 m — are not
transcribed. L-POLICY row 4 forbids committing them: no voice's model card
permits redistributing generated audio
(`docs/research/es-mx-speech.md` §5.4), and `e2e/fixtures/audio-es/README.md` is
the corpus's documentation. The clips stay in their sandbox run folders, whose ids
are in the return file, and they can be regenerated with the two commands in that
README.

**Raw logs** stayed in the run folders' `logs/` directories and were never
committed, per the run configuration's §4. The per-file SHA-256 lists of both V1
runs are among them, 295 lines each.

**`reference.json` is transcribed verbatim**, not re-serialised or edited: it is
the record of what the checker accepted. It is safe to commit because every
`file` is relative to the output directory, and it was audited for the four things
this project sanitises — a home path, a `/tmp` path, a username, a loopback or
external URL — with none present.
