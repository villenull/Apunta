# S6.1 — implementation review evidence, attempt 1 (AM-224)

Independent implementation review, run under AM-224. Reviewer: READ-ONLY.
Checked rows V0–V9 of `docs/v2/cards/S6.1.md` on the frozen source at committed
HEAD `d5b0d52721e3a0a058277e6ea85b4093dbfa5eca` plus the uncommitted notice
candidate, on this Linux PC with the pinned A01 Node toolchain (`node --version`
→ `v24.19.0`, fake AI, Playwright `PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium`).

## What was verified, physically

- **Licence bytes** — the MPL-1.1 text reproduced in `THIRD-PARTY-LICENSES.md`
  (lines 976-1444, 469 lines) was extracted and diffed against the cached
  official text (`/tmp/opencode/mpl11.txt`): **diff exit 0, zero differing
  lines**. The cache is 469 lines / 25755 bytes / SHA-256
  `f849fc26a7a99981611a3a370e83078deb617d12a45776d6c4cada4d338be469`, which is
  the digest the file itself cites (`THIRD-PARTY-LICENSES.md:813-814`). The
  official Exhibit A blanks remain inside the licence text only; the completed
  notice has none.
- **Lockfile integrity** — `package-lock.json:2816-2820` carries integrity
  `sha512-EkRPJAgPhY55oMiHqwEBavOpokkvXlOO5jOdwZJmV/B6w9pGpJxlm7YorgHjiB2HqyPGW0FRcOoJRBTspTXUEA==`,
  byte-for-byte S1.5 §2.2's string; recorded tarball SHA-1
  `30fb094031481fff76cf0fd40bcfd9163149bc00` lives in the acquisition record.
  Version `2.0.0` (exact, no caret) in shared locales metadata + test,
  resolved lockfile, installed `package.json`, plus `web/package.json:15` and
  the lockfile web workspace block.
- **Generated region** — the elected row
  `| dictionary-es-mx | 2.0.0 | MPL-1.1 (offered as (GPL-3.0 OR LGPL-3.0 OR
  MPL-1.1)) | Author: Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) |`
  sits unchanged inside the markers; the summary line counts MPL-1.1 as 1; no
  other row, `jszip`, marker or summary differs from the committed block.
- **Collector confinement** — `FORBIDDEN`, the `jszip` dual-licence choice, the
  two fail-closed defaults (exact-`offered` match required) and the three
  `process.exit(1)` sites are unchanged; `scripts/collect-licenses.mjs` has
  **zero** working-tree diff in this review.
- **No placeholders** — `rg` for `{{`, `OWNER:`, `[unknown]`, `TBD` returns
  nothing in `THIRD-PARTY-LICENSES.md`; the only underscores/bracketed blanks
  are inside the licence's own Exhibit A template lines.
- **Asset identity (V3+V6+V9)** — same-origin requests only; es-MX observes
  exactly `index-DlpzEtDK.aff` + `index-HxP415V3.dic`, chromium observes exactly
  `index-CdfGWZcu.aff` + `index-CmfKht-g.dic`; the independent set difference
  is the Spanish pair, both present in `web/dist/assets` and in V3's emitted
  list (`difference-lines=2`, `emitted-matches=2`, chain exit 0).

## Generator record (AM-224's single allowance)

- `node scripts/collect-licenses.mjs --check` (read-only) 18:02:17Z: exit 0,
  fresh — the historical stale-block failure from the original run is preserved
  in `docs/v2/evidence/S6.1/V4-licence.md`, not re-manufactured.
- `npm run licenses` 18:02:24Z: **the one and only invocation**, exit 0,
  "Wrote 112 packages into THIRD-PARTY-LICENSES.md".
- Side effect: size unchanged (253144), mtime 11:19:03 → 12:02:24 (-0600),
  numstat unchanged (650/0), post SHA-256
  `65db0bc093ba59ef06ad3ed440aa072d75ede0c9bc918ec81a43e645e840ef58`; post-run
  `--check` exit 0. The regen wrote identical bytes; the notice candidate is
  untouched by generation. A second invocation is not made.

## The two residual doc fixes (witnessed in the working tree)

1. `docs/v2/evidence/S6.1/notice-checklist.md:78-80` — the completed notice
   "carries the standard Exhibit A licence and warranty preamble and the
   alternative-licence paragraph, including its complete standard tail"; `:86-87`
   — "These structural locations, rather than a brittle match count or
   line-number list, identify the corrected file's notice and generated regions".
2. `docs/v2/state/returns/S6.1.md` § "Original notice-writer snapshot — before
   source-review corrections" — the 632-insertion measurement is labelled
   historical: "the initial count and line references are historical, not
   current-file claims".

## Environment notes

- Node exactly `v24.19.0`; ports 7884/7885 (V2/V3, one `sandbox.mjs env`) and
  7886/7887 (V6, its own fresh `env`) were free before use; both browser rows
  used sandbox-isolated run folders under `/tmp/apunta-v2/`, synthetic fixtures
  only. No outbound calls occurred (dictionary assets are served from this
  app's own origin, verified by the asset-request rows). No Claude export,
  no live data, no port 7717.
- A pre-existing `tsx server` from an earlier session (listening on
  127.0.0.1:7831, ~12 h idle) was observed and left untouched; it is not owned
  by this review.

## Naming of reviewers and their machine

Run on this Linux PC; the raw sandbox working paths, home directory and hostname
have been redacted from the evidence prose. Public attribution for the shipped
notice — Santiago Bosio, Titus Wormer, Thomas Beverley — and the upstream
repository URLs are retained in the notice itself as required credits; those are
data, not reviewer secrets.