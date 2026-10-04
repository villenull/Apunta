Attempt 1 -- V0 interrupted, BLOCKED, no attributable exit
======================================================================

This file preserves attempt 1's outcome as it actually was. Nothing here is
reinterpreted as a pass, and no exit code is invented for a run that was killed
before it could produce one.

  Attempt: 1 of 3
  Row:     V0, from the then-current dispatch
            (docs/v2/state/dispatch/P3.6.md, attempt-1 generation,
             base 62abb28, port 7879; the V0 row decoded from it was
             byte-identical to attempt 2's -- sha256 cdb77a6b26ea2ded0923fd17f85ba1a1ebae75c6ed956d29a19f46a6f54184aa)
  Dispatch sha256 at the time: e1de02ed9753f7bfdf005cb94603f3c46f61da22dd8b8e8528cde8c6e64d5822
  HEAD at the time: 7ea185e
  Working directory: repository root
  V0 start (UTC): 2026-10-04T04:08:41Z
  Interrupted at   : 2026-10-04T04:10:4xZ (see below)
  EXIT CODE: NONE. The process was terminated by a signal from outside the build.
  STATUS : BLOCKED -- interrupted. Not PASS, not FAIL.

--- What actually happened ---------------------------------------------------

V0 ran and got all the way through the producer and the Rust compile:

  node --version -> v24.19.0
  package-linux-resources.sh -> complete
      "manifest lists 4804 files", "== Done ==", output build/linux-resources,
      whisper-cli and 15 shared libraries copied into bin/
  npm run tauri:build:test
      "Finished `release` profile [optimized] target(s) in 28.79s"
      "Built application at: .../src-tauri/target/release/apunta"
      "Info Patching .../apunta with bundle type information: appimage"
      "Bundling Apunta (test)_0.0.0_amd64.AppImage (...)"

and then stopped, mid-bundle. The last line in the captured log is the `Bundling`
line. There is no `Finished 1 bundle at:`, no `ls -1` output, no `V0_EXIT_CODE`
line, and no exit code on disk -- because the shell that would have written one
was itself killed before the chain finished.

Full captured output: attempt-1-interrupted-v0.log (45 lines, unedited).

--- Cause: this session's own harness, not the build ------------------------

The work was launched with `nohup` but WITHOUT `setsid`. `nohup` makes a process
ignore SIGHUP; it does not move the process out of its process group. This
session's shell tool enforces a 120-second timeout and, on expiry, signals the
whole process group. The bundle step ran past 120 seconds of wall clock from
launch, so the tool's kill reached the runner, the runner's child `bash`, and
`tauri build` together.

The attribution matters, so it is stated precisely: this was an execution-harness
defect in the runner I wrote, not a build failure, not a compiler error, not a
missing prerequisite, and not anything the card's Stop conditions describe. Every
diagnostic the builder printed before the kill was normal. Nothing in the
repository was at fault and nothing about the card's rows needed changing.

Two smaller notes on the same runner, recorded because the log shows them:

  * A first launch of that runner aborted even earlier, before V0 was reached at
    all, on an unbound-variable error in one of my own `echo` lines (a `$5` outside
    the command substitution it belonged to, under `set -u`). That run performed
    the scanner copy and the export and then stopped; it never executed the V0
    chain, so it is not a V0 execution. Preserved as
    attempt-1-runner-abort-before-v0.log (2 lines) so the record shows that V0 was
    executed ONCE in attempt 1, not twice.
  * Neither of these consumed a V0 attempt in the sense the card means. Root
    allocated a normal attempt 2 and incremented the checkpoint; this was not a
    silent within-attempt retry, and the regenerated dispatch's header reads
    "Attempt 2 of 3" at base 62abb28 and port 7879.

--- Consequence on disk, recorded rather than tidied away --------------------

The interrupted bundling had already removed the previous `Apunta (test)_0.0.0_amd64.AppImage`
(sha256 d7fb9151...) and left `Apunta (test).AppDir` partially assembled -- two
entries, AppRun and apprun-hooks. Measured immediately after the kill:

  src-tauri/target/release/bundle/appimage/
    Apunta (test).AppDir        mtime 2026-10-03 22:09:29   (partial)

So at the end of attempt 1 the bundle directory held NO AppImage at all.

This loss was not preventable by moving or copying the old file first:
`src-tauri/target/**` is Must not edit, and the dispatch's O5 observation reads
"preserve prior test images by hash" as read-only provenance rather than a licence
to move or delete anything under target/. What was done instead, and all that
could be done: the old artefact's full path, size, exact mtime and sha256 were
recorded BEFORE any build started (they are in
03-prebuild-provenance.txt section 1). That record is what makes the new
artefact's distinct hash meaningful, and it is why "the image V3 will drive is
this run's" is a checkable statement rather than an assertion.

No old evidence file and no shared parent directory was deleted by this session.

--- What attempt 1 did establish, before the interruption --------------------

These are recorded because they were real measurements, not because the attempt
passed:

  * S0: the A06 whisper candidate precondition held (`test -x` exit 0)
  * S1: icons byte-identical across all 17 files; P3.4's V3 invariant clean over
        all four words and four paths; no source drift against the dispatch base
  * the AM-190 scanner preparation succeeded, with a byte-identical copy of the
        host scanner (sha256 743cea66...)
  * the producer runs green end to end, 4804 files
  * the test-identity release compile is warm and fast (28.79s incremental)

Attempt 2 re-verified each of these rather than inheriting them, and the results
are in 01- and 02- of this directory.

--- What this file is not ---------------------------------------------------

It is not a PASS, it is not a FAIL, and it carries no exit code. The bundle step
was interrupted by an external signal at a known point in a known output stream,
and the honest record of that is the log plus this explanation. Attempt 2's V0 is
a separate execution with its own start time, its own exit code (0) and its own
artefact hash, recorded in 05-v0-run.txt.