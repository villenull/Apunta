# P3.5 environment proposal — AUTHOR repair 2 evidence (IR2-01 only)

The second independent review, `docs/v2/state/reviews/P3.5-environment-proposal-ir2.md`,
reported one bounded defect and three non-blocking notes. This family repairs
**IR2-01 only**. IR2-N1, IR2-N2 and IR2-N3 are untouched, and no owner question is
raised here.

Read-only preparation. Nothing was adopted: no source, card, config, manifest,
checkpoint, acceptance row or owner-action file was edited; no install,
acquisition, build, runtime, audio or network was used. The owner package is
preparation only, not permission. The first family
`../environment-proposal-repair/` and the reviewer's
`../environment-proposal-ir2/` are **read-only inputs and are byte-identical**;
`sha256sum -c` of all of them is in `COORDINATOR.md`.

- `verify.mjs` — a byte-for-byte copy of the first family's `verify.mjs`
  (sha256 `2c6d0c0c87e289ee0c07025376e536fd8d37a40cbe6024e3c97e1561a26abdee`)
  with exactly one functional change: the `step 0 prereq read` snippet is
  fail-closed. A header note records that. Nothing else changed.
- `verify-output.txt` — its verbatim output: exit 0, `ALL CHECKS PASS`. It is
  byte-identical to the first family's `verify-output.txt`, which is itself the
  evidence that the inherited checks (config schema, both variants, negative
  controls, installed `AppImageConfig`, `GSTREAMER_HELPERS_DIR`, host scanner,
  the four other prepared snippets) behave the same.
- `ir2-01-checks.mjs` / `output.txt` — the proof that the step-0 read is
  fail-closed, on synthetic branches. Pinned Node 24.19.0, 51 checks, exit 0,
  `ALL CHECKS PASS`. `process.stdout.write` only.

## IR2-01 — the step-0 prerequisite read could not fail

**Before** (`environment-proposal-repair/verify.mjs`, `'step 0 prereq read'`):

```sh
command -v patchelf || echo "FAIL: patchelf absent"
for e in appsink autoaudiosrc alsasrc pulsesrc; do
  gst-inspect-1.0 "$e" >/dev/null 2>&1 && echo "OK $e" || echo "MISSING $e"
done
test -f /usr/lib/gstreamer-1.0/gst-plugin-scanner && echo "scanner present"
```

Every check ends in `|| echo`, so the script's status is always 0. It printed
`FAIL: patchelf absent` on this host and then would have gone on to step 1, the
build. The scanner was only echoed, and with `test -f` a non-executable scanner
read as present.

**After** (this family's `verify.mjs`, same key):

```sh
command -v patchelf >/dev/null 2>&1 || { echo "FAIL: patchelf absent"; exit 1; }
for e in appsink autoaudiosrc alsasrc pulsesrc; do
  gst-inspect-1.0 "$e" >/dev/null 2>&1 || { echo "FAIL: $e not visible"; exit 1; }
  echo "OK $e"
done
test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner || { echo "FAIL: scanner missing or not executable"; exit 1; }
echo "STEP-0 PASS: prerequisites satisfied"
```

`set -e` stays as the outer guard, and every check now asserts its own exit, so
the read stops at the first missing prerequisite. Four separate
`gst-inspect-1.0` invocations are kept, one per element. The scanner is asserted
executable.

The proposal's §7 step 0 was corrected to match, in one clause: the read is
fail-closed, and **the same read is re-run after the owner-authorised install
and must exit 0 (PASS) before step 1**. The proposal stays at 250 lines, keeps
both owner choices, and no duration, threshold, acceptance row or assertion was
changed.

## The proof, and why it is not vacuous

`ir2-01-checks.mjs` extracts the command **out of the prepared source** (the text
between the backticks of the `'step 0 prereq read'` key in `verify.mjs`) rather
than restating it, `bash -n`s both extractions (exit 0), and asserts that
`verify.mjs` in this family differs from the first family's **only** in its
header note and the step-0 snippet — so the proof cannot silently pass against a
differently repaired command.

It then runs that command over eight synthetic branches. Each branch is a fresh
scratch `PATH` under `build/p3.5-env-repair2/fakepath/` holding stub
`gst-inspect-1.0` and `patchelf` shims and one fake scanner file; the stub
`gst-inspect-1.0` logs every element it is asked for. The only edit to the
extracted command is the absolute host scanner path, replaced by the branch's
fake path, and the harness asserts that path occurs **exactly once** in each
snippet. Everything else runs byte-for-byte as prepared.

| Branch (synthetic) | repaired | prepared (first family, unchanged) |
| --- | --- | --- |
| all present, scanner `0755` | **exit 0**, prints `STEP-0 PASS` | exit 0 |
| `patchelf` absent | **exit 1**, `FAIL: patchelf absent` | **exit 0** — the defect |
| `appsink` absent | **exit 1**, `FAIL: appsink not visible` | **exit 0** — the defect |
| `autoaudiosrc` absent | **exit 1**, `FAIL: autoaudiosrc not visible` | **exit 0** — the defect |
| `alsasrc` absent | **exit 1**, `FAIL: alsasrc not visible` | **exit 0** — the defect |
| `pulsesrc` absent | **exit 1**, `FAIL: pulsesrc not visible` | **exit 0** — the defect |
| scanner absent | **exit 1**, `FAIL: scanner missing or not executable` | exit 1 only because its last statement was the failed `test -f`, after all four elements had already run |
| scanner present, mode `0644` | **exit 1**, `FAIL: scanner missing or not executable` | **exit 0** — the defect |

Each failing branch is checked three ways, so a branch cannot pass for the wrong
reason: the exit is non-zero, **the printed failure names the missing
prerequisite**, and (for the fail-open contrast) the unchanged first-family
command still exits 0 on the same branch.

The healthy branch is the positive control: it must exit 0, print the PASS
marker, and produce **exactly four** `gst-inspect-1.0` invocations —
`appsink`, `autoaudiosrc`, `alsasrc`, `pulsesrc`, in that order, read from the
stub's own log.

**This host, unstubbed, verbatim.** The extracted command run against the real
`PATH` exits **1** with `FAIL: patchelf absent` and stops there, before any
element read: the current missing prerequisite stays the expected FAIL. Only
`node --version` and `command -v` actually ran; no `gst-inspect-1.0`, no scanner
read, no install.

## Commands run (exact) and exits

| Command | Exit | Purpose |
| --- | --- | --- |
| `…/node-v24.19.0-linux-x64/bin/node docs/v2/evidence/P3.5/environment-proposal-repair2/verify.mjs` | 0 | inherited checks plus the five `bash -n` syntax checks; `ALL CHECKS PASS` |
| `…/node-v24.19.0-linux-x64/bin/node docs/v2/evidence/P3.5/environment-proposal-repair2/ir2-01-checks.mjs` | 0 | 51 checks, `ALL CHECKS PASS` |
| `…/node-v24.19.0-linux-x64/bin/node docs/v2/evidence/P3.5/environment-proposal-repair/verify.mjs` | 0 | the first family still reproduces; its output is byte-identical to its recorded `verify-output.txt` |
| `bash -n` on the extracted step-0 snippet, both families | 0 | syntax only, nothing executed |
| the extracted step-0 command, this host, unstubbed | 1 | `FAIL: patchelf absent` — the expected FAIL is preserved |
| `sha256sum -c` over the first family, the IR-2 family and the IR-2 review | 0 | every prior artefact byte-identical |

## Limits, stated rather than guessed

- The proof uses **stubs and a fake scanner**, so it establishes that the
  command is fail-closed and names the right missing prerequisite. It does not
  establish what the read prints after the real install; that remains unobserved,
  because no install was run and none is authorised.
- The scanner path is the one substituted token, so the scanner branches test
  `test -x` semantics on a file this harness created, not on the host's
  `/usr/lib/gstreamer-1.0/gst-plugin-scanner` (which does exist and is
  executable — asserted by the inherited check in `verify.mjs`, section 4).
- Nothing here proves step 1, the build, or any capture row, and no attempt was
  spent. IR2-N1 (the four plugin-path variables in §7 step 2's prose),
  IR2-N2 (naming the V0 *Expected* clarification in Decision 1) and IR2-N3 (V1's
  `ffprobe` records rather than asserts the duration) are **not addressed here**
  and remain open notes for whoever repairs them.