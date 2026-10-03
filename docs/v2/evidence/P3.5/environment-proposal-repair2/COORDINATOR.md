# Coordinator proposal preparation checks (repair 2, IR2-01)

Bounded documentation repair of the second independent review's single finding,
IR2-01: the prepared step-0 prerequisite read was fail-open, so it could not stop
the run on a missing prerequisite and did not match §7 step 0's own acceptance.

Writes, and nothing else: `docs/v2/state/P3.5-ENVIRONMENT-PROPOSAL.md` (250
lines, one clause in §7 step 0 plus the header/§9 evidence pointers; both owner
choices, every acceptance row, duration and threshold unchanged) and this new
family `docs/v2/evidence/P3.5/environment-proposal-repair2/`. Scratch is
git-ignored `build/p3.5-env-repair2/`. Nothing is staged or committed.

`verify.mjs` here is a byte-for-byte copy of the first family's
`environment-proposal-repair/verify.mjs` with the `step 0 prereq read` snippet
made fail-closed (every check asserts its own exit and stops the read; the
scanner is asserted with `test -x`). The first family, the IR-2 reviewer's family
and the IR-2 review itself are read-only inputs and verify byte-identical under
`sha256sum -c`.

- `verify.mjs`, pinned Node 24.19.0: exit 0, `ALL CHECKS PASS`; output
  byte-identical to the first family's recorded `verify-output.txt`.
- `ir2-01-checks.mjs`, pinned Node 24.19.0: exit 0, 51 checks, `ALL CHECKS PASS`.
  It extracts the command from the prepared source instead of restating it,
  `bash -n`s both extractions, and runs it over eight synthetic fake-`PATH`
  branches: all present → 0; `patchelf` absent, each of the four elements absent,
  the scanner absent and the scanner non-executable → non-zero, each naming the
  missing prerequisite; the unchanged first-family command exits 0 on five of
  those branches. On this host the extracted command exits 1 with
  `FAIL: patchelf absent`, so the current missing prerequisite remains the
  expected FAIL.

No app, server, build, database, model, audio, microphone, input, display,
network, download, install or port 7717 was used; the only subprocesses are
`bash`, `chmod` on scratch, and the stub shims this family writes into
git-ignored scratch. The proposal now requires the same read to be re-run after
the owner-authorised install and to exit 0 (PASS) before step 1.

**No owner question is raised here, and no grant is claimed.** IR2-N1, IR2-N2 and
IR2-N3 are not addressed and remain open notes. A fresh independent review
follows before any owner question.