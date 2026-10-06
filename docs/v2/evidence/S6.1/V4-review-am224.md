# S6.1 — V4 licence review run (AM-224), review attempt 1

Independent implementation review, fresh run. AM-224 authorizes **exactly one**
additional network-free `npm run licenses`, reserved for this reviewer; the
original acquisition (A11) and generation already happened and are **not**
repeated. This file records that one invocation's actual side effect and
timestamps; the historical stale-block pre-check failure lives in
`docs/v2/evidence/S6.1/V4-licence.md` and is not recreated here.

- Working directory: the repository root
- Node: pinned A01 toolchain (`node --version` → `v24.19.0`), exported via
  `PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`
- Review attempt: 1 (AM-224)

## Part 1 — actual fresh pre-check (read-only) and the single generation

### 1a. Pre-check

- Command: `node scripts/collect-licenses.mjs --check; echo "pre-check exit=$?"`
- Start: 2026-10-06T18:02:17Z · End: 2026-10-06T18:02:17Z
- Exit code: **0**

```
THIRD-PARTY-LICENSES.md lists all 112 shipped packages.
pre-check exit=0
```

Observed status: **0** (fresh — the generated block already matches the
dependency tree). The historical stale-block `--check` failure is preserved
verbatim in `V4-licence.md` and is **not** re-manufactured; this row records
the real status of this run, which is 0.

Pre-generation file state: size 253144 bytes, mtime
`2026-10-06 11:19:03 -0600`, `git diff --numstat -- THIRD-PARTY-LICENSES.md`
→ `650  0  THIRD-PARTY-LICENSES.md`.

### 1b. The single `npm run licenses` invocation (AM-224)

- Command: `npm run licenses`
- Start: **2026-10-06T18:02:24Z** · End: **2026-10-06T18:02:24Z**
- Exit code: **0**

```
> apunta@0.0.0 licenses
> node scripts/collect-licenses.mjs

Wrote 112 packages into THIRD-PARTY-LICENSES.md
```

### 1c. Actual side effect, recorded immediately after the invocation

Recorded at 2026-10-06T18:03:01Z, before any further verification work:

| Property | Before (18:02:17Z) | After (18:02:24Z) | Changed? |
| --- | --- | --- | --- |
| size | 253144 bytes | 253144 bytes | no |
| mtime | 2026-10-06 11:19:03 -0600 | 2026-10-06 12:02:24 -0600 | **yes** (the write) |
| `git diff --numstat` vs HEAD | `650 0` | `650 0` | no |
| sha256 | not captured pre-run | `65db0bc093ba59ef06ad3ed440aa072d75ede0c9bc918ec81a43e645e840ef58` | — |
| line count | — | 4664 | — |

Side effect: the generator rewrote the file's generated region **with
byte-identical result** — the working-tree diff shape is unchanged
(650 insertions, 0 deletions, all of it the uncommitted notice candidate plus
the generated region), and the post-run `--check` (Part 2) recomputes the
block from the lockfile and finds it equal. No file outside
`THIRD-PARTY-LICENSES.md` was written by the generator.

**Invocation count: exactly one `npm run licenses` (this run).** A second
invocation will not be made even if a later gate fails.

Part 2 (rest of row V4) follows below.

## Part 2 — rest of row V4

### 2a. Read-only post-generation consistency

- `node scripts/collect-licenses.mjs --check` (read-only — never writes, exits
  1 when stale): 2026-10-06T18:04:46Z, **exit 0**
  (`THIRD-PARTY-LICENSES.md lists all 112 shipped packages.`). Combined with 1c,
  the single AM-224 invocation rewrote the generated region to the same bytes
  the collector computes now; content is unchanged by generation.
- `npm run lint` (18:04:46Z–18:04:55Z): **exit 0** — Prettier clean, licenses
  check clean, `TOTAL 0`.
- `git diff -- scripts/collect-licenses.mjs`: **empty** (0 changed lines). The
  resumed review changed nothing in the collector; the original
  map/comment/two-call-site diff is preserved in `V4-licence.md` (historical).

### 2b. Integrity and three-copies probes

- Lockfile (`package-lock.json:2816-2820`):

  ```
  "node_modules/dictionary-es-mx": {
    "version": "2.0.0",
    "resolved": "https://registry.npmjs.org/dictionary-es-mx/-/dictionary-es-mx-2.0.0.tgz",
    "integrity": "sha512-EkRPJAgPhY55oMiHqwEBavOpokkvXlOO5jOdwZJmV/B6w9pGpJxlm7YorgHjiB2HqyPGW0FRcOoJRBTspTXUEA==",
    "license": "(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)",
  ```

  The lockfile `integrity` equals S1.5 §2.2's string **byte for byte**. The
  recorded tarball SHA-1 is `30fb094031481fff76cf0fd40bcfd9163149bc00` (kept in
  `docs/v2/evidence/S6.1/acquisition.md`); npm no longer stores `shasum` in the
  lockfile, so it is verified at acquisition time, not re-written here.
- Installed package (`node_modules/dictionary-es-mx/package.json`): `name`
  `dictionary-es-mx`, `version` `2.0.0`, `license` `(GPL-3.0 OR LGPL-3.0 OR
  MPL-1.1)`.
- Pinned version, **exactly `2.0.0`, no caret**, in all three places:
  `shared/src/i18n/locales.ts:74` and its test `locales.test.ts:58`
  (`dictionary: 'dictionary-es-mx@2.0.0'`); resolved lockfile `:2817`; installed
  `package.json` — plus `web/package.json:15` and the lockfile web block
  `:5702`, both `"2.0.0"`.

### 2c. Generated-region proof

The working-tree diff of `THIRD-PARTY-LICENSES.md` (vs HEAD) has **three hunks
only**: the component row (new lines 39-45), the data-prose block (48-64), and
the MPL section (806-1449, notice + full licence). **No hunk touches the
generated region** (`<!-- npm-dependencies:start -->` at 1457 through
`<!-- npm-dependencies:end -->` at 1578): the AM-224 regeneration left the
generated block **byte-identical** to the committed state, so the current
generated-region diff is the empty one the card allows. Over the two markers:

- Summary line (1461): `112 packages ship inside Apunta: MIT (88), BSD-3-Clause
  (5), … **MPL-1.1 (offered as (GPL-3.0 OR LGPL-3.0 OR MPL-1.1)) (1)**, …` —
  the MPL count is 1.
- The elected row (1498), exactly:

  ```
  | `dictionary-es-mx` | 2.0.0 | MPL-1.1 (offered as (GPL-3.0 OR LGPL-3.0 OR MPL-1.1)) | Author: Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) |
  ```

- `jszip` row (1522) unchanged; markers unchanged; no other added/changed row
  inside the markers. No manual edits to generated rows: the committed
  one-row + summary-change diff is preserved verbatim in `V4-licence.md`
  (historical) and matches the current bytes.

### 2d. Collector confinement (current file)

- `FORBIDDEN` (`collect-licenses.mjs:35`) unchanged
  (`/\b(GPL|AGPL|LGPL|SSPL|CC-BY-NC|BUSL)\b/i`).
- `DUAL_LICENSED_CHOICES` (`:48`) still only `jszip` (MIT taken).
- `DATA_LICENCE_CHOICES` (`:60-62`) the resumed data choice, exact offered/taken:
  `dictionary-es-mx` → `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)` / `MPL-1.1`.
- Fail-closed defaults unchanged: `isForbidden` (`:65-70`) refuses anything not
  recorded by name or not matching the exact `offered` string; `reportedLicense`
  (`:73-79`) consults both maps.
- Exactly three `process.exit(1)` sites (`:154`, `:206`, `:217`), all
  unchanged: error path, non-write `--check` stale path, write-path failure.
- Call sites for the two new helpers are the two documented ones.

### 2e. Notice and full elected licence (outside the markers)

- **All four AM-220 fields are resolved and sourced** (each with its upstream
  support) at `THIRD-PARTY-LICENSES.md`: **Original Code** = the Mexican Spanish
  (`es_MX`) Hunspell orthographic dictionary as released by the RLA-ES project
  (`sbosio/rla-es`) at v2.8 in `es_MX.aff`/`es_MX.dic` (845-848, sourced from
  the data licence file); **Initial Developer** = Santiago Bosio (850);
  **Portions created** = `Copyright (C) 2004-2020 Santiago Bosio y otros`
  transposed (851-852); **Contributor(s)** = `Titus Wormer, Thomas Beverley`
  (854, from the package's `contributors` under AM-220's conservative
  interpretation). No unresolved value and no `{{OWNER: …}}` placeholder
  anywhere in the file (`rg` returns nothing).
- The completed notice (834-868) carries the standard Exhibit A licence and
  warranty preamble and the **complete** alternative-licence paragraph, whose
  full standard tail is present: "If you do not delete the provisions above, a
  recipient may use your version of this file under either the MPL or one of
  those alternative licenses." — the completed form of the official Exhibit A
  template's tail (`mpl11.txt` lines 455-465).
- **Full elected licence, verified byte for byte:** the reproduced MPL-1.1 text
  (`THIRD-PARTY-LICENSES.md` lines 976-1444, 469 lines) was extracted and diffed against
  `/tmp/opencode/mpl11.txt` — **exit 0, zero differing lines**. The cached file
  itself is SHA-256 `f849fc26a7a99981611a3a370e83078deb617d12a45776d6c4cada4d338be469`,
  25755 bytes, 469 lines, matching the digest the file's own § states
  (`THIRD-PARTY-LICENSES.md:813-814`), so the reproduced text is the official
  one, unmodified. The official Exhibit A template retains its original blanks
  (file lines 1422-1434); those belong to the licence text, not the notice.
- Legal questions (conspicuity under MPL-1.1 §3.6; whether a word list is
  Source Code; Commercial Use and later-version questions) are recorded as
  un-answered, with no legal conclusion offered — the file does not declare
  compliance.

### 2f. Summary line / marker / jszip / no-hand-edit

Covered in 2c. `rg -n "dictionary-es-mx" THIRD-PARTY-LICENSES.md` prints five
lines only (component row 42, data prose 54, package table 820, source-prose
938-939, generated row 1498); the notice checklist now points at those
structural locations rather than a brittle match count.

## V4 verdict

**PASS for this fresh review scope (AM-224).** The generator ran exactly once
and did not unmute the block; the generated region is the elected row embedded
in an otherwise unchanged table; the notice specifies all four AM-220 fields
with sources; the reproduced licence is byte-identical to the official text.
Legal compliance is not declared — the two file-stated licence questions and the
research-report questions remain recorded and unanswered, as this file requires.
