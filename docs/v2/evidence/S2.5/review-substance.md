# S2.5 — independent review: hard stops, scope and test integrity

- HEAD: `bafdcff`, base `2a2f3f9`
- Working directory: repository root (`~`)

## HS-1 Live data

Respected. No command in this review opened, listed, read, copied, backed up,
restored or queried the live Apunta data folder, the owner's Claude export or
any Halaxy PDF. Port 7717 was never contacted. `scripts/recover-current-linux.mjs`
and `scripts/smoke-live.mjs` were not run. Nothing was run through
`scripts/v2/sandbox.mjs` either, because the card's own four rows are in-process
vitest / eslint / prettier / `tsc` and the card says so explicitly ("the rows run
**bare** rather than through `scripts/v2/sandbox.mjs`, and the dispatch's assigned
sandbox port **7831** stays unused"). I agree with that reading and did not
launch a server. The assigned port 7833 was likewise unused.

The only databases any row opened are the tests' own
`mkdtempSync(join(tmpdir(), 'apunta-test-'))` directories, created and deleted by
`server/src/test/harness.ts`.

## HS-2 Isolation

Respected — nothing was launched. The one socket any row bound is
`server/src/test/real-socket-guard.test.ts:27` on **7812** (`APUNTA_PORT`
default), inside C-ISO@1's 7800–7889 band. V3's log shows exactly one
`Server listening at http://127.0.0.1:7812` and nothing on any other port.

## HS-3 Downloads

Respected. `git diff --name-only 2a2f3f9..bafdcff` touches no `package.json`, no
lockfile, no `scripts/`, no `installer/`, no `docs/v2/ACQUISITION.md`. No
download, no model, no install. `npm run licenses --check` inside `lint` reported
the same 111 shipped packages, so nothing was added or removed.

## HS-4 Git

Respected. On `feature/v2` throughout. Nothing pulled, merged, rebased, reset,
stashed, cleaned, force-pushed or committed by me. `git status --porcelain` and
`git diff --stat` are both empty at the end of the review; the only files I wrote
are `docs/v2/state/reviews/S2.5-impl.md` and this evidence directory. HEAD moved
from `bafdcff` to `25b730b` under me — the coordinator's own docs-only commit —
and I verified `git diff --stat bafdcff..25b730b -- server shared web scripts
package.json` is empty, so no result in this review is about anything but
`bafdcff`'s code.

## HS-5 Secrets

Respected. A grep of the whole diff for `password`, `secret`, `api_key`,
`token =` and `BEGIN … PRIVATE KEY` returns nothing. The two test files that
gained a `key`/`params` options object are the boot-error harness's fixture
values (`errors.storage_error.disk_full` with a `dir` under `/tmp`), not keys of
any kind.

## HS-6 Network at runtime

Respected. The diff adds **no** URL and **no** host:

```
$ git diff 2a2f3f9..bafdcff -- server shared web scripts \
    | grep -E '^\+' | grep -oE "https?://[^ '\"\`)]+" | sort -u
(empty)
```

and no network primitive:

```
$ git diff 2a2f3f9..bafdcff -- server/src web/src shared/src \
    | grep -E '^\+.*(fetch\(|node:http|node:https|node:net|WebSocket)' | head
(empty)
```

`npm run lint` runs `node scripts/check-no-external-urls.mjs`, which produced no
output — its own green. Nothing in `server/`, `web/` or `shared/` was given a way
out, and the installer (the one licensed exception) is untouched.

## HS-7 Safety instruments

Respected, and this is the one I checked most carefully, because a card that
makes its own rows green by loosening them is worthless.

Every `*.test.ts` the card touched was read as a diff. Across all of them the
reviewer found **no** deleted assertion, no loosened expectation, no `skip`, no
`only`, no `todo`, no narrowed filter:

```
$ git diff 2a2f3f9..bafdcff -- 'server/**/*.test.ts' 'shared/**/*.test.ts' \
    | grep -E '^\+' | grep -E '\.skip|\.only|\.todo|it\.each' | head
(empty)
```

The complete set of **removed** lines across every test file is four lines, none
of them an assertion:

```
-  message: 'Apunta cannot write because the disk is full.',      (a fixture value, replaced by key+params)
-};                                                                (closing brace of that fixture)
-import { DB_ENTRY_NAME, MANIFEST_FILENAME, PENDING_RESTORE_DIRNAME } from '@apunta/shared';
-import { SettingsSchema, type Settings } from '@apunta/shared';
-    expect(storedRows()).toEqual({});                             (moved, not dropped — see below)
-    { dataDir, message: 'Apunta cannot write because the disk is full.' },
```

The one `expect` that appears on both sides —
`server/src/routes/settings.test.ts`'s `expect(storedRows()).toEqual({})` — was
**relocated** into the same test's new body, not removed: the diff shows it
deleted from the old `it` and re-added, alongside the literal
`message: 'Language must be "en" or "es-MX".'`, inside the new Spanish case.

The four oracles the card names were all *added to*:

- `server/src/app.test.ts:50` — the `Not Found` assertion moved from a literal to
  `t('errors.not_found.route', {}, 'en')` **and** a literal pin
  `expect(t('errors.not_found.route', {}, 'en')).toBe('Not Found')` was added
  beside it.
- `shared/src/chat.test.ts:38-39,44-45` — both `toContain` byte assertions on
  `PUBLISHED_REFUSAL` and `FIRST_PASS_MESSAGE` are untouched; a
  `toBe(t(…, 'en'))` link to the catalogue was added to each, plus a new Spanish
  case.
- `server/src/routes/settings.test.ts:149` — the `language_unavailable` 400 still
  asserts the literal English bytes, and the bad-language 400 now asserts them
  in two places.
- `server/src/boot-error.test.ts:12` — untouched and passing; two cases added.

No threshold, scorer, lock or guard was changed anywhere:

```
$ git diff --name-only 2a2f3f9..bafdcff -- docs/v2/CONTRACTS.md package.json \
    vitest.config.ts .nvmrc THIRD-PARTY-LICENSES.md scripts
(empty)
```

## HS-8 Fabricated data only

Respected. The only personal name anywhere in the card's new tests is
`John Smith`, the prototype's sample person. The example names in the new
Spanish test (`Ponlo en un registro más formal`, `Y ahora más formal`) are
fabricated for the test. No clinical text, no transcript and no export content
was added. The `HELD_LOCALE` / `español` / `Configuración inicial` strings are
product copy, not patient data.

## HS-9 Protected paths

Respected. `prototype/` untouched (`git diff --name-only 2a2f3f9..bafdcff -- web
prototype` is empty). No migration was added. `shared/src/index.ts`,
`shared/src/i18n/t.ts`, `shared/src/i18n/locales.ts` and
`shared/src/i18n/t.test.ts` are all absent from the diff, as is
`shared/src/errors.ts` — the four read-only oracles and the closed enum really
are oracles still. Two paths outside May edit were touched
(`server/src/http/request-guard.test.ts`, `server/src/test/real-socket-guard.test.ts`)
and one line-pin was crossed (`server/src/routes/chat.ts:583-610`); all three are
declared in the return or ruled on in `review-deviations.md` and finding 9 of
the review, and none of them is silent.

## HS-10 Owner-only actions

Respected. Spanish is not enabled in any release build — `APUNTA_DEV_SPANISH=1`
appears only in test files' `process.env` assignments, never in a build script.
No release was published, no GitHub secret created, and the live v1 instance was
neither stopped nor inspected. No owner's clinical verdict was written.

## Scope, independently re-derived

```
$ git diff --name-only 2a2f3f9..bafdcff | wc -l
50
```

50 paths: **44 source files**, plus the implementer's return
(`docs/v2/state/returns/S2.5.md`) and five evidence files. The coordinator had
already checked scope and cleared it, and I did not spend the budget there; the
two exceptions above are the only places I found anything to say, and both are
declared or ruled on.

## Test integrity, independently derived

| Row | Floor the card states | What I observed | Skipped/todo |
| --- | --- | --- | --- |
| V1 | 9 files (122 pre-existing cases) | 9 files / 137 tests | none |
| V3 | 90 files / 1304 tests | 92 files / 1325 tests | none |

Both above the floor; the row says more is not a failure. The one new test file
the card licenses, `server/src/http/locale.test.ts`, exists and is collected (9
cases), and the other +10 cases are inside files the card already owned.
