# P3.6 attempt 7 — return note (CODE/UNIT pass, AM-212 A1–A3)

| Field | Value |
| --- | --- |
| Card | P3.6 Linux AppImage integration |
| Attempt | 7, under **AM-212** (owner-approved, bounded to A1–A3 of `docs/v2/state/returns/P3.6-attempt6-runtime.md`) |
| Role | CODE/UNIT repair worker. **Nothing was run natively**: no harness run, no AppImage, no Tauri, no `cargo`, no build, no display, no `pactl`, no audio, no inference, no network, no port 7717. No V0, no V3. |
| Git | **nothing staged, committed or pushed.** No `git add`, no commit, no branch, no pull/rebase/reset. HEAD `5033cd9` before and after. |
| Written | `scripts/v2/tauri-e2e-smoke.test.mjs`, `docs/v2/cards/P3.6.md` (V3 row's command only), `docs/v2/evidence/P3.6/attempt-7/implementation/**` |
| Harness sha256 | `ddd3c03eba1f0d97393937a1b7b3a957f61113ffb79c65366f8db2fb048ea0e2` (was `1d4bbf88…c6c3` at attempt 6) |

## A1 — `compare -metric AE` is now parsed in the forms the tool prints

**Harness:** `scripts/v2/tauri-e2e-smoke.test.mjs:725` (`parseCompareMetric`,
new, exported), called at `:769` from `measureFrameClient`. The two lines that
were the defect are gone:

```
-  const differing = Number(String(compared.stderr).trim());
-  if (!Number.isInteger(differing)) return null;
+  const differing = parseCompareMetric(compared.stderr);
+  if (differing === null) return null;
```

**What the installed tool actually prints** (`03-imagemagick-probe.txt`,
ImageMagick 7.1.2-31 Q16-HDRI): `0 (0)` for a perfect match (exit 0),
`0.666667 (0.0104167)` for one differing pixel of 64 (exit 1),
`2.66667 (0.0416667)` for four. The shipped page beside the binary
(`/usr/share/doc/ImageMagick-7/www/compare/index.html`) prints the same shape
for every metric — `28.0142 (0.233452)`, `0 (0) @ 417,44 [0]` — so the
parenthesised pair is the tool's form, not an accident of one image. IM6's
bare-integer form is accepted too, and the first number may be printed in
scientific notation.

**Two things the fix had to get right beyond the parens.** The metric is a
**float** on this build (`AE` = `0.666667`, not `1`), so the old
`Number.isInteger` guard would have rejected a real comparison even after the
parse; only finiteness and non-negativity are required now. And the metric is
read from the **last** non-empty stderr line, because that is where `compare`
puts it — a diagnostic line before it cannot turn a parseable metric into an
unparseable one, while anything that is not the metric still returns `null`,
which stops the run instead of grounding a click on an unmeasured frame.

**Same defect class, other call sites.** `imageSize` (`:681`) is the only other
place this harness reads ImageMagick output; its anchored
`/^(\d+)\s+(\d+)$/` against `identify -format '%w %h'` is already correct
(`8 8`, verified) and was **not** touched — the helper test asserts the line is
still there and that it returns `null` for a non-image and for a missing file.
`identify` concatenates with no separator when given two files (`8 88 8`), which
that anchored form also refuses.

## A2 — the history arm compares against the commit the AppImage was built from

**Harness:** `resolveBuildCommit` at `:2080` (new, exported), `ruleBFreshness`
at `:2157`, the verdict split out as `ruleBHistoryVerdict` at `:2199`, the check
at `:2301`, and `newestRuleBInput(root = repoRoot)` at `:2236`. `RULE_B_BASE`
(`'62abb28'`, `:154`) is **kept, exported and reported** — it is now named in
the row's detail as the recorded dispatch base that was deliberately *not*
compared against.

**Where the build commit comes from, and why this source.** AM-212 offers three
sources and asks for the one V0 already produces. V0's recorded output
(`docs/v2/evidence/P3.6/attempt-6/runtime/01-v0-run.txt`) is the producer log,
the cargo/tauri log and the artefact itself — **the bundler sets the AppImage's
mtime to the moment it wrote the file** (`2026-10-04 16:20:48 -0600`, and that
file records the run ending at `2026-10-04T22:20:48Z`), and
`git log -1 --before=<that moment> HEAD` is the newest commit that existed at
it. On this repository it resolves the attempt-6 AppImage to **`74cc340`**,
which is exactly the commit the attempt-6 return records as HEAD when V0
finished. So the only inputs are the artefact V0 already builds and the
repository it already builds in: **no sidecar file, no env var, and no edit to
V0's command or to any other row** — which is why the repair fits inside this
worker's write scope at all.

**Fail-closed, in every direction, with no fallback.** `resolveBuildCommit`
returns `{ commit: null, error }` — and `ruleBHistoryVerdict` returns
`ok: false` — for an artefact with no readable mtime, a `git` that cannot
answer, a commit older than the repository's first commit (git's own empty
answer), and a resolved commit that is **not an ancestor of `HEAD`**. The
dispatch base is never substituted for an unknown build commit, and the test
for that case asserts the substitution would in fact be a vacuous pass
(`git diff --name-only 62abb28...HEAD` exits non-zero in a fresh tree).

**The arms AM-212 requires to keep failing still do.** A **dirty** Rule B input
is still caught by the untouched `git status --porcelain` arm, and an
**AppImage older than its newest input** is still caught by the untouched
`artifactNewer` arm — both asserted over throwaway repositories where the
answer is deterministic.

**Seam.** `ruleBFreshness(appImagePath, { cwd, root })` and
`newestRuleBInput(root)` take the repository root so the tests can drive *this
predicate* over a synthetic repo built from the real Rule B path names. Both
default to this repository, so the row's own call is unchanged
(`ruleBFreshness(appImage.path)`).

## A3 — the V3 command no longer pre-empts the harness's own display

**Card:** `docs/v2/cards/P3.6.md`, V3 row's command, one clause:

```
-  then xvfb-run -a env APUNTA_FAKE_AI=1 node scripts/v2/tauri-e2e-smoke.test.mjs smoke; else
+  then xvfb-run -a -s "-screen 0 1400x1000x24" env APUNTA_FAKE_AI=1 node scripts/v2/tauri-e2e-smoke.test.mjs smoke; else
```

The smallest change that makes the harness's intended display apply: the row
keeps choosing the display (its `command -v` branch and its desktop-session
fallback are untouched), and now hands over the geometry the harness's own
re-exec uses — `scripts/v2/tauri-e2e-smoke.test.mjs:482`, the same
`'-screen 0 1400x1000x24'` string. With `DISPLAY` inherited, `ensureDisplay`
takes its inherited branch (`:463`), which is correct: the app and every
`xdotool` probe share one display, and it is now 1400x1000 rather than
`xvfb-run`'s default 640x480. Before/after, both decoded commands, their
sha256s and `bash -n` are in `04-v3-command-diff.txt`; the "before" decode is
byte-identical (`2e631655…822`) to the attempt-6 runtime worker's own decode of
this row, so the diff is measured against what actually ran.

## Verification (pinned Node v24.19.0)

| Command | Exit |
| --- | --- |
| `node --check scripts/v2/tauri-e2e-smoke.test.mjs` | **0** |
| `npx prettier --check` on the harness, the helper tests and the card | **0** |
| `npx eslint` on the harness and the helper tests | **0** |
| `node docs/v2/evidence/P3.6/attempt-7/implementation/helper-tests.mjs` | **1** — 65/72; see below |
| `node docs/v2/evidence/P3.6/attempt-6/implementation/helper-tests.mjs` (untouched, for comparison) | **1** — 50/57, the **same seven** tests |
| `node docs/v2/tools/check-plan.mjs` | **0** — "Plan consistent: 71 cards, 12 parent reviews, 14 contracts, R01-R20 covered, no cycles." |

**The seven failures are the parallel worker's, not this pass's.** They are
`F1`, `F2`, `F3`, `F4/F5`, `F6/D1` (two) and "every grounded label in the
harness exists in `en.ts`", they fail **identically on attempt 6's untouched
file**, and the cause is that those tests locate each label by line number in
`shared/src/i18n/en.ts`, which a parallel worker has 10 uncommitted lines
further along than when those numbers were recorded (`'plan.title'` at `:1845`
where the test expects `:1233`). Card Stop 7: a red check in a file outside May
edit is reported, not fixed. **Every one of this attempt's 15 new tests passes**
(5 for A1, 9 for A2, 1 for A3), including two mutation checks that prove the
repairs load-bearing — narrowing `parseCompareMetric` to IM6's form makes IM7's
output unreadable, and dropping the unknown-build-commit guard makes that case
PASS.

## For the coordinator

1. **The V3 row's Expected cell still describes the dispatch-base predicate.**
   The paragraph beginning "**Freshness:** the AppImage's mtime is newer than
   … the primary predicate is `git diff --name-only <base>...HEAD -- <Rule B
   set>` … where `<base>` is the literal hash on this dispatch's `- Base
   commit:` header line" (`docs/v2/cards/P3.6.md:395`) now contradicts the
   harness, which compares against the artefact's build commit. AM-212 gave this
   worker the **command** only, so the prose was left alone deliberately rather
   than half-edited; re-pinning that paragraph is a coordinator edit.
2. **The F-series helper tests are line-pinned to `shared/src/i18n/en.ts`** and
   will stay red on this machine until whoever owns that file finishes (or the
   tests are made line-independent). Nothing in this card can fix them: the file
   is Must not edit here.
3. **Nothing here needs a re-review of anything outside A1–A3.** F1–F5, D1/D2,
   the AM-209 exemptions, `measureFrameClient`'s semantics, the eleven flows,
   all five containment assertions and both other freshness arms are
   byte-unchanged. `git diff --numstat` over the harness is `231` added and
   `34` removed, and every removed line is inside `parseCompareMetric`'s call
   site, `ruleBFreshness`, `newestRuleBInput`'s signature or the history check's
   name and condition.

## What was not done, and is not claimed

No row ran. No AppImage was built, launched or extracted. No display was opened,
no audio module loaded, no port bound, no network call made, no model invoked,
no source outside the two files named above touched, no coordinator state
written, nothing committed or pushed. V0, V1, V2, V3, V4 and V5 have no new
result from this pass, and no approval is claimed for any of them.