# S4a.1 evidence

Everything here was produced by one implementation session on 2026-09-26, on
branch `feature/v2`, at base commit `f790709` (verified with `git log -1` before
the first edit; see the note on HEAD in the return file). Commands ran from the
repository root. All paths are sanitised: a sandbox run folder is `<sandbox>` and
the home folder is `~`.

| File | What it is |
| --- | --- |
| `verification.log` | V1–V4: working directory, exact command, exit code, start and end time, excerpt |
| `acquisitions.md` | A09 (Piper) and A10 (`es_MX-ald-medium`): version, URL, size, SHA-256, licence evidence |
| `determinism.md` | The V1 failure, isolated: why Piper 1.8.0 is not byte-deterministic, with the experiments |
| `reference.json` | The V2 run's `reference.json`, transcribed verbatim (275,138 bytes) |

**What is not here, and why.** The 295 WAV files — 407 MB, 3 h 41 m — are not
transcribed. L-POLICY row 4 forbids committing them: no voice's model card
permits redistributing generated audio
(`docs/research/es-mx-speech.md` §5.4), and `e2e/fixtures/audio-es/README.md` is
the corpus's documentation. The clips stay in their sandbox run folders, whose ids
are in the checkpoint and in the return file, and they can be regenerated with the
two commands in that README.

**Raw logs** stay in the sandbox run folders (`<sandbox>/logs/`) and were never
committed, per the run configuration's §4. The `v1-diff.txt` the V1 command wrote
is one of them; its summary is in `verification.log` and `determinism.md`.

**`reference.json` is transcribed verbatim**, not re-serialised or edited: it is
the record of what the checker accepted. It is safe to commit because every
`file` is relative to the output directory, and it was audited for the four things
this project sanitises — a home path, a `/tmp` path, a username, a loopback or
external URL — with none present.
