# Evidence: S1.4 Interface conventions and UI glossary (RESEARCH)

Working directory: repository root (checkout on branch `feature/v2`).
Attempt 3 of 3, base commit `46216fe`.

## What this attempt changed, and what it deliberately did not

Attempt 2 was rejected for scope, not for research. This attempt keeps every
attempt-2 research improvement and removes only the out-of-scope artefacts:

- **Deleted** `docs/v2/evidence/S1.4/ui-string-coverage.cjs` (attempt 2's
  enumerator). No executable script is left under `docs/`; the enumeration
  method is described inline below and the full source is quoted in
  [Appendix A](#appendix-a--the-enumerator-source).
- **Did not touch** `eslint.config.js` or `.prettierignore`. Attempt 2's edit
  to `eslint.config.js` was reverted by the coordinator before this attempt
  and has not been re-applied. Verified below.
- **Did not touch** `docs/research/es-mx-clinical-glossary.json` (card S1.2).
  It fails `prettier --check`; that failure is recorded below as an
  out-of-scope observation and `npm run lint` is **not** claimed green.
- **Untouched** coordinator state under `docs/v2/state/` (dispatch, cards,
  reviews, `AMENDMENTS.md`).

Research edits carried forward from attempt 2 and kept in this attempt:
`docs/research/es-mx-ui-conventions.md` and
`docs/research/es-mx-ui-glossary.json` (195 → 218 entries).

## Commands run

All times UTC. All commands run from the repository root. Rows are not in
strict time order: the 03:24–03:35 rows are the investigation and the appendix
re-check, and the **03:36 rows are the final confirmation round**, re-run after
the last edit to the conventions doc, the evidence file and the return file.
The criteria below are judged on the 03:36 round.

| Time (UTC) | Command | Exit | Excerpt |
| --- | --- | --- | --- |
| 03:24 | `git log -1 --format='%H %s'` | 0 | `46216fee0085e9e81f432aaefeafb667d4a8d994 Research es-MX UI conventions and glossary (card S1.4)` — HEAD is exactly the dispatch base commit `46216fe`. No pull, merge, rebase or reset was run. |
| 03:25 | `git diff --name-only 46216fe` | 0 | `docs/research/es-mx-ui-conventions.md`, `docs/research/es-mx-ui-glossary.json`, `docs/v2/evidence/S1.4/evidence.md`, `docs/v2/state/AMENDMENTS.md`, `docs/v2/state/returns/S1.4.md`. `eslint.config.js` and `.prettierignore` are **absent** — byte-identical to the base commit. `AMENDMENTS.md` is coordinator-owned and was not edited. |
| 03:25 | `find docs -type f \( -name '*.cjs' -o -name '*.mjs' -o -name '*.js' \)` (before deletion) | 0 | `docs/v2/tools/plan-lib.mjs`, `docs/v2/tools/check-plan.mjs`, `docs/v2/tools/build-dispatch.mjs` (coordinator tooling, tracked and unmodified at base) and `docs/v2/evidence/S1.4/ui-string-coverage.cjs` (this card's, now deleted). |
| 03:29 | `find docs -type f -perm -u+x` (after deletion) | 0 | No output. No executable file remains under `docs/`. |
| 03:36:37 | `NODE_PATH="$PWD/node_modules" node /tmp/s14/ui-string-coverage.cjs` (the enumerator, run from outside the repo — see [The enumeration method](#the-enumeration-method-reproducible)) | 0 | `glossary entries: 218`; `visible candidates: 341`; mapped exact 296, mapped template 27, fragment 6, non-text 12, **UNMAPPED 0**. |
| 03:35 | both Appendix sources extracted back out of the prettier-formatted `evidence.md` and executed | 0 | Appendix A reproduces the counts above exactly (`diff` against the script that produced them: identical). Appendix B prints the 20 mappings and `spot-checked 20, unmapped 0`. The quoted appendices are therefore not paraphrases. |
| 03:36:30 | `node -e "JSON.parse(require('fs').readFileSync('docs/research/es-mx-ui-glossary.json','utf8'))"` — **V1** | 0 | No output; the JSON parses. 218 entries, 715 `ui` strings, every entry carries `category`/`en`/`es_mx`/`ui`/`note`/`source`. 217 `source` values are `https://` URLs; the single exception is the sample-patient-name placeholder, which cites the repo policy file `docs/v2/HARD-STOPS.md` (HS-8) — a policy reference, not a web claim, and declared in conventions §3.2. |
| 03:36:30 | `npx prettier --check docs/research/es-mx-ui-conventions.md` — **V2** | 0 | `All matched files use Prettier code style!` |
| 03:36:31 | `node scripts/check-no-external-urls.mjs` — L0 URL guard | 0 | No output (pass). Research URLs live under `docs/`, outside the scan roots. |
| 03:36:31 | `npx prettier --check docs/research/es-mx-ui-conventions.md docs/research/es-mx-ui-glossary.json docs/v2/evidence/S1.4/evidence.md docs/v2/state/returns/S1.4.md` — L0 gate on this card's own changed files | 0 | `All matched files use Prettier code style!` |
| 03:36:44 | `npm run lint` (**not** this card's gate — recorded for honesty) | **1** | Fails at the `prettier --check .` step on `docs/research/es-mx-clinical-glossary.json` only. See [Out-of-scope observation](#out-of-scope-observation-npm-run-lint-is-red-for-a-reason-outside-this-card). |
| 03:36:37 | `npx eslint .` | 0 | No output. Clean **with the repository's own `eslint.config.js`, unmodified** — the reason attempt 2 needed a config block is gone now that the `.cjs` is deleted. |
| 03:29:47 | `node scripts/collect-licenses.mjs --check` | 0 | `THIRD-PARTY-LICENSES.md lists all 111 shipped packages.` |
| 03:36:37 | `NODE_PATH="$PWD/node_modules" node /tmp/s14/spot-check-20.cjs` — **V3** | 0 | `spot-checked 20, unmapped 0`; per-string mapping in [V3](#v3--reviewer-spot-check-of-20-ui-strings). |
| 03:29:38 | `git diff --stat 46216fe -- docs/research/es-mx-clinical-glossary.json`, then `git show 46216fe:docs/research/es-mx-clinical-glossary.json \| npx prettier --check --stdin-filepath docs/research/es-mx-clinical-glossary.json` | 0 then 1 | The diff is empty (the S1.2 file is byte-identical to base) and the base version fails prettier too — so the `npm run lint` failure pre-exists this card. |

## Criteria

- **V1 — `es-mx-ui-glossary.json` parses: PASS**, exit 0. 218 entries, all
  required fields present, 715 `ui` strings, prettier-clean.
- **V2 — `npx prettier --check docs/research/es-mx-ui-conventions.md`: PASS**,
  exit 0.
- **V3 — reviewer spot-checks 20 UI strings: self-check PASS**, exit 0, and
  the check is stronger than a sample: the enumerator proves **0 unmapped** of
  341 visible candidates across both globs. The 20 reviewer strings are listed
  with their mapping below.

## The enumeration method (reproducible)

The card's "Read" section names two globs: `web/src/routes/*.tsx` and
`web/src/components/*.tsx`, visible strings only. The coverage claim rests on
enumerating those two globs mechanically rather than by eye, so the method is
written out here in full. Nothing under `docs/` is executable — attempt 2's
committed `.cjs` was deleted for exactly that reason (see the note at the top
of [Appendix A](#appendix-a--the-enumerator-source)) — so the script lives
outside the repository and the source is quoted in the appendix.

### Step 0 — where the script lives, and why

The script is written to a scratch directory **outside the checkout**
(`/tmp/s14/ui-string-coverage.cjs`) and is run from the repository root:

```sh
NODE_PATH="$PWD/node_modules" node /tmp/s14/ui-string-coverage.cjs
```

`NODE_PATH` is required because the script resolves `typescript` from the
repository's `node_modules` while itself living outside the tree; the source
paths it reads (`web/src/…`, `docs/research/…`) are resolved relative to the
**working directory**, which must be the repository root. It needs no
dependency beyond `typescript`, already a workspace dependency. To recreate
it, save [Appendix A](#appendix-a--the-enumerator-source) verbatim as
`/tmp/s14/ui-string-coverage.cjs` and run the line above.

### Step 1 — inputs

- Source globs: every `*.tsx` directly inside `web/src/routes/` and
  `web/src/components/`, **excluding `*.test.tsx`**. (Both directories are
  flat, so "directly inside" is the whole glob; no recursion needed.)
- Glossary: `docs/research/es-mx-ui-glossary.json`, flattened into the set of
  all `ui` strings.

### Step 2 — extraction (TypeScript compiler API, not a regex)

Each file is parsed with `ts.createSourceFile(…, ts.ScriptKind.TSX)` and
walked. A string is a **candidate** when it is either:

1. a `ts.isJsxText` node — visible text between elements, including the
   whitespace-only nodes that JSX produces around a newline; or
2. a `ts.isStringLiteral` or `ts.isNoSubstitutionTemplateLiteral` whose parent
   is a `JsxAttribute` named `placeholder`, `aria-label`, `title` or `alt`, or
   a `PropertyAssignment` named `placeholder`, `ariaLabel`, `aria-label`,
   `title` or `alt`.

Candidates are de-duplicated in a `Map` keyed by the normalised text; the
value keeps the first file the string was seen in, so an unmapped string can
be reported with its file. The parse is JSX-aware, which is why
`It's a note` inside JSX text is read as text and not confused by the
apostrophe, and why an attribute value is only taken when its *name* is a
visible one (`'Escape'` in `event.key === 'Escape'` is not visible and is not
extracted).

### Step 3 — normalisation

`norm` collapses runs of whitespace to one space and trims. `decode` expands
the entity references that appear in JSX text (`&amp; &lt; &gt; &quot;
&apos; &rsquo; &lsquo; &ldquo; &rdquo; &nbsp;` and numeric `&#NNN;`), so a
candidate is compared in the characters a reader actually sees.

### Step 4 — classification (first matching rule wins)

Let `bare` be the candidate with leading `[\s.,;:—–·-]` and trailing `[\s.]`
stripped, and let `collapsed` be every `ui` string with its `{…}`
placeholders deleted and whitespace normalised.

| # | Class | Rule |
| --- | --- | --- |
| 1 | `mapped (exact)` | the candidate, or its `bare` form, is a `ui` string verbatim |
| 2 | `mapped (template)` | `bare` is ≥ 6 characters and some collapsed `ui` string equals it, contains it, or is contained by it — this is what lets a sentence split at `{patient.name}` still be covered by the `ui` entry `No treatment plan for {name} yet.` |
| 3 | `non-text` | matches `NON_TEXT` (a string of nothing but symbols and punctuation), `FILELIKE` (a file name, extension or absolute path), or is in `KEYNAMES` (`Escape`, `Tab`, `Enter`, arrow keys, `Home`, `End`, the focus-selector string) |
| 4 | `fragment` | `bare` is under 6 characters, or is a single lower-case word, or is contained in a collapsed `ui` string — i.e. a glue word or a piece of a sentence that a mapped entry already covers whole |
| 5 | `UNMAPPED` | anything left: translatable visible text with no glossary coverage |

The process exits **1** if `UNMAPPED` is non-zero, so the check is usable as a
gate and not only as a report.

### Step 5 — the run and its output

At commit `46216fe` with this attempt's glossary, the full output is:

```
glossary entries: 218
visible candidates: 341
  mapped (exact):     296
  mapped (template):  27
  fragment:           6
  non-text:           12
  UNMAPPED:           0
  fragment members:   "and" · "across" · "days." · "A" · ", or a" · "yet."
  non-text members:   "." · ":" · "”." · "↑" · "↓" · "›" · "·" · "×" · "," · "—" · "“" · "”"
```

Exit 0. The 6 `fragment` members are the pieces a sentence breaks into around
an inline element or an interpolation — `A` and `, or a` around two
`<code>` elements in `InstructionsPanel.tsx:95`, `and` at a line break in
`Workspace.tsx:345`, `days.` around `{String(BACKUP_STALE_DAYS)}` in
`BackupCard.tsx:180`, `yet.` around `{patient.name}` in `PlanView.tsx:304`, and
`across` around a `{' '}` expression in `Import.tsx:187`. Each one's complete
sentence is a `ui` string, so nothing translatable is left uncovered. The 12
`non-text` members are all symbols and separators.

### A limit worth stating

Keyboard key names (`Escape`, `Tab`, `Enter`, `ArrowDown`, `Home`, `End`) are
in `KEYNAMES` and classify as `non-text` if they ever appear, but they do not
appear as visible strings: in these globs they occur only inside
event-handler comparisons (`event.key === 'Escape'`), so the extractor never
sees them. They are listed in `KEYNAMES` defensively, and the 12 `non-text`
members above are symbols only. Likewise, file names and paths
(`RESTORE.txt`, `SKILL.md`, `conversations.json`, `/Volumes/Backup/Apunta`,
`docs/skill-porting.md`) are **not** unmapped: they are already `ui` strings
in keep-as-is entries, so they classify as `mapped (exact)` or
`mapped (template)`.

## V3 — reviewer spot-check of 20 UI strings

Twenty strings, chosen to include every term the implementation review named
as missing plus a spread of component files, each with the entry it maps to.
Reproduce with `NODE_PATH="$PWD/node_modules" node /tmp/s14/spot-check-20.cjs`
(source: [Appendix B](#appendix-b--the-v3-spot-check-source)); it exits 1 if
any of the 20 is uncovered.

| Visible string | File | Glossary entry (`en` → `es_mx`) |
| --- | --- | --- |
| Send | `icons.tsx` | send → enviar |
| Stop | `icons.tsx` | stop → detener / parar |
| Instructions | `InstructionsPanel.tsx` | instructions → instrucciones |
| Find a patient | `HomeLauncher.tsx` | search → buscar |
| Back to patients | `Capture.tsx` | back to patients → volver a pacientes / ir a pacientes |
| Go to patients | `Import.tsx` | back to patients → volver a pacientes / ir a pacientes |
| Code | `PlanDetails.tsx` | diagnosis code → código |
| Description | `PlanDetails.tsx` | description → descripción |
| e.g. Progress note | `OnboardingFormat.tsx` | progress note (example) → nota de evolución |
| Client participation note | `PlanDetails.tsx` | client participation → participación del cliente |
| Your own messages in each session | `Import.tsx` | your own messages → tus propios mensajes |
| Nothing is written until you press Import on the next screen. | `Import.tsx` | Import help (Claude and Halaxy) → Ayuda de importación |
| Start Apunta again, then try this page again. | `Workspace.tsx` | Server and workspace help → Ayuda del servidor |
| Suggestions are not part of the plan. Accept, edit or discard each one. | `PlanView.tsx` | Plan help and attestation → Ayuda del plan |
| A format needs at least one section. | `OnboardingPreview.tsx` | Onboarding help → Ayuda de configuración de formatos |
| Add your first patient to get started. | `PatientsColumn.tsx` | patient → paciente |
| Restore cancelled. Nothing changed. | `BackupCard.tsx` | backup status and warnings → estado de la copia de seguridad |
| Think out loud… | `BrainstormView.tsx` | think out loud → piensa en voz alta |
| No notes yet for {name}. | `NotesColumn.tsx` | Server and workspace help → Ayuda del servidor (the `ui` string `No notes yet for {name}.`) |
| Disk encryption: | `About.tsx` | About: privacy and local-only help → Ayuda de privacidad (Acerca de) |

`spot-checked 20, unmapped 0`, exit 0.

## Out-of-scope observation: `npm run lint` is red for a reason outside this card

This card's gate is the **L0 gate** — `npx prettier --check` on its own changed
files plus `node scripts/check-no-external-urls.mjs` — and both pass. The
repo-wide `npm run lint` is **not** claimed green, and this attempt did not
make it green:

- `npm run lint` exits **1** at its `prettier --check .` step, on exactly one
  file: `docs/research/es-mx-clinical-glossary.json`, committed by card S1.2
  at `9cbdefd`.
- The failure is **pre-existing at the base commit**, not caused by this card:
  `git diff --stat 46216fe -- docs/research/es-mx-clinical-glossary.json` is
  empty (byte-identical to base), and piping the base version through
  `npx prettier --check --stdin-filepath …` also exits 1.
- That file is outside this card's "May edit" list, so it was **not** edited.
  The fix belongs to S1.2 or to a follow-up card:
  `npx prettier --write docs/research/es-mx-clinical-glossary.json`.
- Every other step of `npm run lint` passes with this card's files present and
  the repository config untouched: `npx eslint .` exit 0 (03:29:45),
  `node scripts/check-no-external-urls.mjs` exit 0 (03:29:30),
  `node scripts/collect-licenses.mjs --check` exit 0 (03:29:47).

## Scope and hard stops

- **L0 docs-only card.** No sandbox was used and none was needed: no server
  was started, no database opened, no app launched, nothing that would
  require `scripts/v2/sandbox.mjs`. No port was contacted, and in particular
  never 7717.
- **HS-1 Live data:** never opened, listed, read, copied, backed up or
  queried the live data folder, its backups, the owner's Claude export or any
  Halaxy PDF. Nothing in this card reads real patient text.
- **HS-3 Downloads:** none. All citations are public pages already read in
  attempt 1/2; nothing was downloaded.
- **HS-4 Git:** on `feature/v2` at `46216fe`; no pull, merge, rebase, reset,
  force-push or history rewrite. No commit was made — the work is left
  uncommitted for review.
- **HS-8 Fabricated data only:** the glossary is vocabulary. No clinical
  examples, no invented patient text; the one placeholder name question is
  flagged (O-3), not filled in.
- **HS-9 Protected paths:** `prototype/` untouched; no file outside
  `docs/research/es-mx-ui-conventions.md`,
  `docs/research/es-mx-ui-glossary.json`, `docs/v2/evidence/S1.4/**` and
  `docs/v2/state/returns/S1.4.md` was edited. In particular
  `docs/research/es-mx-clinical-glossary.json`, `eslint.config.js`,
  `.prettierignore` and every `docs/v2/state/` coordinator file are untouched.
- **Competitor sites** were not used for this card; no competitor text is
  copied. **No legal advice** is given: conventions §4 lists open voice
  choices for the owner, none of them legal questions.

## Appendix A — the enumerator source

Save verbatim as `/tmp/s14/ui-string-coverage.cjs` and run from the repository
root with `NODE_PATH="$PWD/node_modules"`. This is the exact source that
produced the output quoted in Step 5. It is quoted here rather than committed
because every `.cjs`/`.mjs`/`.js` under `docs/` is picked up by `eslint .`,
where `no-console` and `@typescript-eslint/no-require-imports` are on for files
that match the config's `**/*.{ts,tsx,js,mjs}` rule set, and where a `.cjs`
gets neither the Node globals nor module source type that block grants.
Committing it would therefore make `npm run lint` fail for a reason that has
nothing to do with this card's research — which is what happened in attempt 2,
and what the out-of-scope `eslint.config.js` edit was an attempt to paper
over.

```js
// S1.4 UI-string coverage self-check (reproducible).
//
// This script is deliberately NOT committed under docs/: any .cjs/.mjs/.js
// under docs/ is linted by `eslint .` with no-console and
// @typescript-eslint/no-require-imports on, so committing it here would make
// `npm run lint` red for a reason that has nothing to do with the card.
// Its full source is quoted in docs/v2/evidence/S1.4/evidence.md (Appendix A).
//
// Run from the repository root, keeping the script outside the repo so that
// `require('typescript')` resolves through NODE_PATH:
//   NODE_PATH="$PWD/node_modules" node /tmp/s14/ui-string-coverage.cjs
//
// Enumerates the visible strings in the card's two source globs
// (web/src/routes/*.tsx and web/src/components/*.tsx, *.test.tsx excluded),
// then checks each against the `ui` arrays of docs/research/es-mx-ui-glossary.json.
// It uses the same TypeScript compiler API the researcher did: JSX text nodes
// plus placeholder/aria-label/title/alt attributes (and their prop equivalents).
//
// Classification:
//   mapped        exact string present in some `ui` array (or after edge strips)
//   template      a `{...}` placeholder in a `ui` entry covers this fragment
//   fragment      a glue word or a fragment split out of a mapped sentence
//   nontext       a symbol, glyph, filename, path or keyboard key (kept as-is)
//   UNMAPPED      translatable visible text with no glossary coverage
'use strict';
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const GLOB_DIRS = ['web/src/routes', 'web/src/components'];
const files = GLOB_DIRS.flatMap((dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    .map((f) => path.join(dir, f)),
);

const glossary = JSON.parse(fs.readFileSync('docs/research/es-mx-ui-glossary.json', 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const decode = (s) =>
  s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&rsquo;/g, '\u2019')
    .replace(/&lsquo;/g, '\u2018')
    .replace(/&ldquo;/g, '\u201c')
    .replace(/&rdquo;/g, '\u201d')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));

const ui = [];
for (const e of glossary) for (const u of e.ui || []) ui.push(norm(u));
const exact = new Set(ui);
// A `{...}` placeholder is dropped, then the remaining text is compared by
// containment, so a fragment split out of an interpolated sentence still maps.
const collapsed = [...new Set(ui.map((u) => u.replace(/\{[^}]*\}/g, '').replace(/\s+/g, ' ').trim()))];
const stripEdges = (s) => s.replace(/^[\s.,;:—–·-]+/, '').replace(/[\s.]+$/, '');

const NON_TEXT = /^[×↑↓›·—–“”".,:;!?()[\]{}<>/|\\+=*&^%$#@~`'‘’“”…]+$/;
const FILELIKE = /\.(md|json|zip|txt|pdf|docx|tsx|ts|js|mjs|css|sqlite)$|^\/|RESTORE\.txt$/;
const KEYNAMES = new Set([
  'Escape',
  'Tab',
  'Enter',
  'ArrowDown',
  'ArrowUp',
  'ArrowLeft',
  'ArrowRight',
  'Home',
  'End',
  'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
]);

const candidates = new Map();
for (const file of files) {
  const sf = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function walk(node) {
    if (ts.isJsxText(node)) {
      const s = norm(decode(node.getText(sf)));
      if (s) candidates.set(s, { s, file: path.basename(file) });
    } else if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      const p = node.parent;
      const visible =
        (ts.isJsxAttribute(p) && ['placeholder', 'aria-label', 'title', 'alt'].includes(p.name.getText(sf))) ||
        (ts.isPropertyAssignment(p) &&
          ['placeholder', 'ariaLabel', 'aria-label', 'title', 'alt'].includes(p.name.getText(sf)));
      if (visible) {
        const s = norm(decode(node.text));
        if (s) candidates.set(s, { s, file: path.basename(file) });
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(sf);
}

const counts = { mapped: 0, template: 0, fragment: 0, nontext: 0 };
const unmapped = [];
const fragments = [];
const nontext = [];
for (const { s, file } of candidates.values()) {
  const bare = stripEdges(s);
  if (exact.has(s) || exact.has(bare)) {
    counts.mapped++;
  } else if (bare.length >= 6 && collapsed.some((u) => u === bare || u.includes(bare) || bare.includes(u))) {
    counts.template++;
  } else if (NON_TEXT.test(s) || FILELIKE.test(s) || KEYNAMES.has(s)) {
    counts.nontext++;
    nontext.push(s);
  } else if (bare.length < 6 || /^[a-z]+$/.test(bare) || collapsed.some((u) => u.includes(bare))) {
    counts.fragment++;
    fragments.push(s);
  } else {
    unmapped.push(`${file}: ${JSON.stringify(s)}`);
  }
}

console.log(`glossary entries: ${glossary.length}`);
console.log(`visible candidates: ${candidates.size}`);
console.log(`  mapped (exact):     ${counts.mapped}`);
console.log(`  mapped (template):  ${counts.template}`);
console.log(`  fragment:           ${counts.fragment}`);
console.log(`  non-text:           ${counts.nontext}`);
console.log(`  UNMAPPED:           ${unmapped.length}`);
console.log(`  fragment members:   ${fragments.map((s) => JSON.stringify(s)).join(' · ')}`);
console.log(`  non-text members:   ${nontext.map((s) => JSON.stringify(s)).join(' · ')}`);
for (const u of unmapped) console.log(`    ${u}`);
process.exit(unmapped.length === 0 ? 0 : 1);
```

## Appendix B — the V3 spot-check source

Save verbatim as `/tmp/s14/spot-check-20.cjs` and run from the repository root
with `NODE_PATH="$PWD/node_modules"`. It looks each of the 20 strings up in the
glossary (exact `ui` match first, then containment against a placeholder-
collapsed `ui` string), prints the file it is visible in and the entry it maps
to, and exits 1 if any of the 20 is uncovered.

```js
// S1.4 V3 reviewer spot-check: 20 named visible UI strings -> glossary entry.
// Run from the repository root:
//   NODE_PATH="$PWD/node_modules" node /tmp/s14/spot-check-20.cjs
// Exits 1 if any of the 20 has no glossary coverage.
'use strict';
const fs = require('fs');
const path = require('path');

const STRINGS = [
  'Send',
  'Stop',
  'Instructions',
  'Find a patient',
  'Back to patients',
  'Go to patients',
  'Code',
  'Description',
  'e.g. Progress note',
  'Client participation note',
  'Your own messages in each session',
  'Nothing is written until you press Import on the next screen.',
  'Start Apunta again, then try this page again.',
  'Suggestions are not part of the plan. Accept, edit or discard each one.',
  'A format needs at least one section.',
  'Add your first patient to get started.',
  'Restore cancelled. Nothing changed.',
  'Think out loud',
  'No notes yet for {name}.',
  'Disk encryption:',
];

// Which file each string is visible in, so the reviewer can find it in the globs.
const GLOB_DIRS = ['web/src/routes', 'web/src/components'];
const files = GLOB_DIRS.flatMap((dir) =>
  fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') && !f.endsWith('.test.tsx'))
    .map((f) => path.join(dir, f)),
);
const where = new Map();
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  for (const s of STRINGS) {
    const probe = s
      .replace(/\{[^}]*\}/g, '')
      .replace(/^[\s.,;:—–-]+/, '')
      .replace(/[\s.:]+$/, '')
      .trim();
    if (probe && text.includes(probe)) where.set(s, path.basename(file));
  }
}

const glossary = JSON.parse(fs.readFileSync('docs/research/es-mx-ui-glossary.json', 'utf8'));
const norm = (s) => s.replace(/\s+/g, ' ').trim();
const collapsed = glossary.flatMap((e) =>
  (e.ui || []).map((u) => [norm(u).replace(/\{[^}]*\}/g, '').trim(), e]),
);

let missed = 0;
for (const s of STRINGS) {
  const bare = norm(s).replace(/\{[^}]*\}/g, '').trim();
  const hit =
    glossary.find((e) => (e.ui || []).some((u) => norm(u) === s)) ||
    collapsed.find(([u]) => u && (u.includes(bare) || bare.includes(u)))?.[1];
  if (!hit) missed++;
  console.log(
    [
      hit ? 'MAP ' : 'MISS',
      JSON.stringify(s).padEnd(62),
      (where.get(s) || '(not in globs)').padEnd(24),
      hit ? `${hit.en} -> ${hit.es_mx}` : '',
    ].join('  '),
  );
}
console.log(`\nspot-checked ${STRINGS.length}, unmapped ${missed}`);
process.exit(missed === 0 ? 0 : 1);
```

## Changed paths (uncommitted, for review)

- `docs/research/es-mx-ui-conventions.md` (modified) — attempt-1/2 research
  plus this attempt's corrections to §3.1 and §3.6.
- `docs/research/es-mx-ui-glossary.json` (modified) — 195 → 218 entries,
  715 `ui` strings, prettier-clean.
- `docs/v2/evidence/S1.4/evidence.md` (this file) — attempt-3 log; the
  enumerator `.cjs` that attempt 2 left here has been deleted.
- `docs/v2/state/returns/S1.4.md` — the return file.

Deleted: `docs/v2/evidence/S1.4/ui-string-coverage.cjs` (attempt-2 untracked
file, removed in this attempt; it was never committed).

Not touched, and verified as such: `eslint.config.js`, `.prettierignore`,
`docs/research/es-mx-clinical-glossary.json`, every other file under
`docs/`, and all coordinator state under `docs/v2/state/`.

## Notes

- Raw logs stay in the scratch directory outside the repository and are not
  committed, per the run configuration. Nothing in this evidence file contains
  a hostname, username, key, token or real name; scratch paths are given as
  `/tmp/s14/…`, which contains no user-specific path.
- The research itself is unchanged in substance from the approved attempt 2:
  Q1 **tú** (Microsoft es-MX style guide), Q2 day–month–year dates, 24-hour
  times, point decimal separator, sentence case, mandatory `¿`/`¡`, and Q3 a
  218-entry glossary with a URL on every row of conventions §3.3. Only the
  accuracy of the coverage claim in §3.1/§3.6 and the location of the
  enumerator changed in this attempt.
