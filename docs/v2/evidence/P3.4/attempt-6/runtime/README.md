# P3.4 attempt 6 — runtime evidence

Owner-authorised by AM-195. One attempt, rows V0→V4 in card order, each row run
at most once, nothing retried, nothing repaired, no seventh attempt, no waiver.

- Base commit `88811af`, branch `main`, HEAD at measurement `0285e4f`.
- Lease: native BUILD, display and port **7835**, this session's alone, now
  released. No build was run.
- Source identity: the four AM-195 shipping files are byte-identical between
  `0e08142` and HEAD; the harness is sha256 `cc733cd0…`, the bytes
  `docs/v2/state/reviews/P3.4-eod-instrument-ir2.md` cleared and
  `P3.4-impl6.md` re-hashed. No threshold, timeout, assertion or predicate was
  changed by this attempt.

## The result, in one table

| ID  | Status                                      | Exit             | Evidence                              |
| --- | ------------------------------------------- | ---------------- | ------------------------------------- |
| S0  | SKIPPED (anchor holds)                      | —                | `01-S0-whisper-candidate-skipped.txt` |
| V0  | **NOT RUN** (Rule B trigger derived, empty) | —                | `03-V0-not-run.txt`                   |
| V1  | **PASS** 12/12, 0 skipped                   | 0                | `04-V1.txt`                           |
| V2  | **PASS 20/20**, 0 FAIL, 0 NOT RUN           | 0                | `05-V2.txt`                           |
| V3  | **BLOCKED** — exit not attributable         | not attributable | `06-V3.txt`                           |
| V4  | **FAIL** at lint, on files outside May edit | 1                | `07-V4.txt`                           |

V0 is `NOT RUN` and that is not a skip assumed — it is the row's own recorded
outcome after its trigger was measured on four axes, all of them reproduced in
`03-V0-not-run.txt`. V3 is `BLOCKED` and that is **not** `PASS`, even though no
guard fired: the row's pass condition is `test "$bad" = 0`, its exit status was
consumed by a command substitution this session created by mistake, and that
status is gone. V4 is `FAIL` at `eslint`, on thirteen errors, every one of them
in `docs/v2/evidence/P3.5/**`, which this card may not edit.

## The two things that changed materially since attempt 5

**V2 passes 20/20.** Attempts 4 and 5 each left V2 with `FAIL`s and `NOT RUN`s.
This run produced **no** `NOT RUN` and **no** `FAIL`:

- **(a)** is now an actual ACL denial read from the page —
  `ipcProbe=rejected`,
  `ipcProbeMsg=Command plugin:event|listen not allowed by ACL` — rather than the
  `typeof` of an always-injected global that attempt 4 called a defect.
- **(d)'s handler half landed both clicks.** `ptrN=6` is the fresh page witness,
  `clickN=2` the exactly-one-click stage completed on each row,
  `clickText=Progress note` the second landing. This is the click that did not
  land in attempt 4 and that made (b) and (c) `NOT RUN` behind it.
- **(b)** and **(c)** both read: `attempt=b:assign-location-href` then
  `c:window-open-external` and `c:window-open-same-origin`, with `href` still on
  the app origin afterwards.
- **(e)** is proved by measurement: `styleComputed=dark` against
  `styleAttr=color-scheme: dark; …`.
- All five containment assertions passed from inside the row, and every one was
  re-measured from outside afterwards.

**V4 is red for a reason that is not P3.4's.** `npm test` is 163 files / 2235
tests, all passing. `eslint .` then fails with 13 errors, all in
`docs/v2/evidence/P3.5/`, all in files this card may not edit, and all in files
that are **committed to `main`**. `prettier --check`, `typecheck` and the whole
cargo half are downstream of a failed `&&` and are `NOT RUN`, not skipped.

## What a reviewer should press on

1. **V0 `NOT RUN`.** The binary V2 exercised is attempt 5's build, not this
   attempt's. It is sound against Rule B — nothing in Rule B's set has changed,
   the image is newer than every Rule B input, and the shipped AppDir carries
   the channel in 1 of 16 bundles with the gate string in 0. But it is a fact
   about provenance and it is stated rather than left to be inferred.
2. **V3's `BLOCKED`.** This session's own extraction error, in §1 of
   `06-V3.txt`, with the evidence for "no guard fired" and the reasoning for why
   that is still not `PASS` in §3, and the no-retry decision in §4.
3. **V4's owner.** P3.5's evidence scripts redden the whole repository's lint
   because the root `lint` script is `eslint .` and `eslint` walks `docs/`.
   That is a finding for P3.5 and for the coordinator.

## Files

| File                                            | What it holds                                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `00-v0-predicates-and-prerequisites.txt`        | the raw measurement: base, both git predicates, working tree, checkpoint `changedFiles`, mtimes, AppDir and `web/dist` marker counts, whisper anchor, ports, ollama |
| `01-S0-whisper-candidate-skipped.txt`           | S0 skipped on its anchor, and the producer's unconditional A06 refetch recorded as **not taken** this attempt                                                       |
| `02-am190-scanner-and-four-dry-inspections.txt` | AM-190 scanner preparation and the four dry bundled-plugin inspections                                                                                              |
| `03-V0-not-run.txt`                             | the four-axis derivation and why the row was not required                                                                                                           |
| `04-V1.txt`                                     | 12/12, 0 skipped, on an unchanged file                                                                                                                              |
| `05-V2.txt`                                     | all 20 assertions verbatim, the fact lines, both click landings, containment                                                                                        |
| `06-V3.txt`                                     | the extraction error, what ran, why `BLOCKED` and not `PASS`, and the no-retry decision                                                                             |
| `07-V4.txt`                                     | 2235 tests green, lint's 13 errors in full, the stop, what was not run                                                                                              |
| `08-containment-cleanup-and-side-effects.txt`   | pids, ports, databases, release invariant, ollama, network, leases, writes, sanitisation                                                                            |

Raw unedited logs stay in the ignored `build/p34-runtime6/` and are not
committed. Every path here is sanitised: `~` for home, `<sandbox>` for the run
folder, `<host>` for the hostname the application's own log lines carry.
