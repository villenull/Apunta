# Evidence: S1.5 Spanish spell-check dictionary and licence

Card: S1.5, role RESEARCH, L0 (Markdown only). Base commit `3855a73` (verified with
`git log -1` before any other action; the tree was not pulled, merged, rebased or
reset). Times are local `CST` (UTC−06:00) with the UTC equivalent beside them. No
sandbox run: nothing was launched, no port was opened, no database was touched.
Home folder appears as `~`; no hostnames, usernames, keys or real names are recorded.

## A. Deliverable

| Path | Note |
| --- | --- |
| `docs/research/es-mx-spellcheck.md` | new — the research deliverable (Q1–Q3) |

Nothing else in the repository was created or modified by this session except the
two dispatch-mandated state outputs (this file and
`docs/v2/state/returns/S1.5.md`, per RUN-CONFIG §4 and AM-017). The uncommitted
coordinator state and other cards' in-flight files present in the working tree
were left untouched. **Nothing was committed** and nothing was staged.

## B. Commands run (all read-only, none launching)

| # | cwd | Command | Start | End | Exit | Result |
| --- | --- | --- | --- | --- | --- | --- |
| B1 | repo root | `git log -1 --format='%H %s'` | 2026-09-25T23:19:xx | same | 0 | `3855a73ed8c0fb936c5382fb1bedfc2c419e4f0b Apply owner-authorised v2 fixes…` — HEAD is the base commit, so the card's stop condition was not hit |
| B2 | repo root | `git status --porcelain` | 2026-09-25T23:19:xx | same | 0 | 6 pre-existing entries: ` M docs/v2/state/AMENDMENTS.md`, ` M docs/v2/state/dispatch/P7a.1-ir.md`, ` M docs/v2/state/dispatch/S1.5-ir.md`, ` M docs/v2/state/reviews/P7a.1-ir.md`, ` M docs/v2/state/reviews/S1.5-ir.md`, `?? docs/v2/state/dispatch/P7a.1.md`, `?? docs/v2/state/dispatch/S1.5.md`. All coordinator/other-card state; left alone |
| B3 | repo root | `grep -n "dictionary-en\|nspell" THIRD-PARTY-LICENSES.md` | 2026-09-25T23:21 | same | 0 | `847:\| dictionary-en \| 4.0.0 \| (MIT AND BSD) \| COPYRIGHT, SOURCES, and CREDITS: \|` and `881:\| nspell \| 2.1.5 \| MIT \| …` |
| B4 | repo root | `sed -n '1,30p' web/package.json` + a `python3` one-liner over `package-lock.json` | 2026-09-25T23:21 | same | 0 | web deps include `dictionary-en ^4.0.0`, `nspell ^2.1.5`; lockfile: `node_modules/dictionary-en 4.0.0 (MIT AND BSD)` (not dev), `node_modules/nspell 2.1.5 MIT`, `@types/nspell 2.1.6 MIT` (dev) |
| B5 | repo root | `sed -n '1,60p' web/src/lib/speller.test.ts` | 2026-09-25T23:22 | same | 0 | the English pair is asserted to load from `/dictionary-en/` on a loopback host only — the pattern §2.2 extrapolates to Spanish |
| B6 | repo root | `grep -rn "S1.5" docs/v2/state/AMENDMENTS.md docs/v2/state/reviews/S1.5-ir.md docs/v2/state/dispatch/S1.5-ir.md` | 2026-09-25T23:24 | same | 0 | AM-014 (owner: markdown prettier V-rows non-binding), AM-017 (return file + evidence are required outputs), and the instruction review at `docs/v2/state/reviews/S1.5-ir.md` reading CLEAR |

## C. Verification rows

| ID | Command | Start | End | Exit | Result |
| --- | --- | --- | --- | --- | --- |
| V1 | `npx prettier --check docs/research/es-mx-spellcheck.md` | 2026-09-25T23:25:59-06:00 | 2026-09-25T23:25:59-06:00 (2026-09-26T05:25:59Z) | 0 | `Checking formatting...` / `All matched files use Prettier code style!` |
| V2 | reviewer reads | — | — | — | NOT RUN — for the reviewer. Self-assessment below |

**V1, honestly.** `.prettierignore` lists `*.md`, and `npx prettier --file-info
docs/research/es-mx-spellcheck.md` reports `{"ignored": true, "inferredParser":
null}`, so the `--check` row is vacuous as AM-014 states. To make the row mean
something anyway, the file was also formatted and compared:

```
npx prettier docs/research/es-mx-spellcheck.md | diff - docs/research/es-mx-spellcheck.md
diff exit: 0     (0 lines of difference)
```

So prettier's own output is byte-identical to what is on disk: the file is clean
under the check whether or not the check ignores it. Control: the same `--check`
on `docs/v2/state/dispatch/S1.5.md` also exits 0, confirming the row's
vacuity rather than a property of this file. Temporary output was written to
`/tmp/opencode/` and deleted; no file was created in the repository.

Second L0 command from RUN-CONFIG §2, run for completeness:

| Command | Exit | Result |
| --- | --- | --- |
| `node scripts/check-no-external-urls.mjs` | 0 | silent pass. Expected: the script scans `web/src`, `web/index.html`, `web/public`, `server/migrations`, `macos` and the built bundle, never `docs/`, so the research file's external citations are outside its scope (hard rule 1 governs *runtime* requests; §5 of the research file is a list of sources read during research) |

## D. The one local evaluation (no package installed, no file created)

To check whether adding `dictionary-es-mx` would break `npm run lint`, the
collector's own regex and helper were evaluated inline against the package's
declared licence string. `scripts/collect-licenses.mjs` is 212 lines and was
read in full first; the exact expression at line 35 and the exact logic of
`isForbidden` at line 51 were reproduced verbatim in the command.

- cwd: repo root
- Command (single quotes, no file written):

```
node -e '
const FORBIDDEN = /\b(GPL|AGPL|LGPL|SSPL|CC-BY-NC|BUSL)\b/i;
const licence = "(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)";
const choice = undefined;
const isForbidden = typeof licence !== "string" ? false : (!FORBIDDEN.test(licence) ? false : choice === undefined || choice.offered !== licence);
console.log("regex matches:", FORBIDDEN.test(licence), "| isForbidden(dictionary-es-mx):", isForbidden);
console.log("en:", FORBIDDEN.test("(MIT AND BSD)"));
'
```

- Start / end: 2026-09-25T23:22-06:00 / 2026-09-25T23:22-06:00
- Exit code: 0
- Output in full:

```
regex matches: true | isForbidden(dictionary-es-mx): true
en: false
```

This is the evidence behind §3.6 of the research file. It evaluates the shipped
guard's logic; it does **not** add the dependency and run `npm run lint`, which
is S6.1's action.

## E. Pages read (public, no login, no download, HS-3)

All on 2026-09-25/26, each a text page read in full. The complete list with the
claim each supports is §5 of `docs/research/es-mx-spellcheck.md`. Grouped:

- npm registry: `dictionary-es-mx` (full document, all 6 versions),
  `dictionary-es` (full document, 15 versions), `dictionary-es-419/latest` (404),
  `@cspell%2Fdict-es_mx` (404), two search endpoints
  (`hunspell es-mx`, `es_MX dictionary spelling`)
- GitHub API (`api.github.com`, unauthenticated public reads):
  `repos/sbosio/rla-es`, `contents/?ref=master`, `contents/ortografia?ref=master`,
  `contents/ortografia/afijos?ref=master`, `contents/ortografia/es_MX?ref=master` (404),
  `repos/wooorm/dictionaries/contents/dictionaries/es-MX?ref=main`,
  `repos/wooorm/dictionaries/commits?path=dictionaries/es-MX`,
  `repos/hunspell/hunspell/contents/es_MX?ref=master` (404),
  `repos/mozilla/dictionaries` (404),
  `repos/streetsidesoftware/cspell-dicts/contents/?ref=main`
- `raw.githubusercontent.com`: `wooorm/dictionaries/main/dictionaries/es-MX/{license,readme.md,package.json}`,
  `sbosio/rla-es/master/{LICENSE.md,README.md,.versiones.cfg}` (the first attempt
  against `sbosio/rla-es/main/LICENSE.md` returned 404 — the default branch is
  `master`, confirmed by the repo metadata)
- `www.mozilla.org/media/MPL/1.1/index.txt` — the full MPL-1.1 text

**Not fetched, deliberately:** every `.tgz`, the GitHub zipball/codeload, the
rla-ES release downloads, and any `npm install` / `npm pack`. Therefore no
SHA-256 of the package or of its data files is claimed anywhere in the
deliverable; the registry `integrity` string is quoted instead, which
`ACQUISITION.md` §1 accepts as the package manager's integrity string.

**Nothing was acquired**, so the return file's Acquisitions section reads
`none`.

## F. Status summary

| Criterion | Status |
| --- | --- |
| V1 `npx prettier --check` | PASS (exit 0; also verified substantive, §C above) |
| V2 reviewer reads | NOT RUN |
| Q1 packages, licence text, size, last update | answered, §2 |
| Q2 election and obligations | answered, §3 — **FITS L-POLICY@1 through the one pre-approved exception, elected MPL-1.1** |
| Q3 "if nothing fits" | answered, §4 — a candidate does fit, so the S6.1 spell-check-off consequence does not fire on licence grounds |
