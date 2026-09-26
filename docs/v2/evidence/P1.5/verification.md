# P1.5 verification evidence

Card: P1.5 Licence labels and docs drift. Base commit `974c97e`; the criterion
runs below are at HEAD `6b27ddd`. All commands run from the repository root.
Node **24.19.0** first on `PATH` (`/tmp/opencode/n24/bin`), taken from the A01
tarball already present at `/tmp/apunta-node-dl/` and checksum-verified against
that folder's `SHASUMS256.txt` before extraction — no new download was made for
this card:

```text
$ node --version
v24.19.0
```

No server was started, no database opened and no app launched, so HS-2's
non-launching allowance covers every command here. Port 7717 was never
contacted. No sandbox run folder was used, so none is recorded.

## Coordinator ruling AM-034 — the branch this card took

The ruling is owner-authorised and is committed into the card as `6b27ddd`,
"Disambiguate P1.5 licence stop condition (AM-034)". It rewrote the card's
first stop condition and added the branch this card actually took:

> Either licence page or blob is reachable and readable and **states a licence
> other than Apache-2.0** … set the card status `BLOCKED` …
>
> A page that is reachable but **states no licence at all** is the card's
> non-read branch, **not** a stop: record the URL and the date in
> `docs/v2/evidence/P1.5/`, leave `verified: false` and the existing
> `licence.name` in place, and continue with the rest of the card.

Both library pages were reachable and readable (HTTP 200, full body) and
**neither states any licence**, so the reachable-but-silent branch governs, the
card is **not** blocked, and the rest of the card was completed. This agent had
reported `BLOCKED` on the unamended card; that report is corrected to
**SUBMITTED** here and in the return file. No licence value changed between the
two reports, because the ruling and the old stop condition agreed on the values.

## Base-commit check, and the HEAD drift that was reported

At the start of this session `git log -1` was the card's base commit:

```text
$ git log -1 --format='%H %s'
974c97e08430bc321bc6a4451064dfc785a1f5cf Repair P1.3 card text per IR round 1 (AM-024)
```

**Reported, as the card requires: HEAD moved twice during this session, both
times by someone else.**

```text
$ git log --oneline 974c97e..HEAD
6b27ddd Disambiguate P1.5 licence stop condition (AM-034)
285283c Fix P1.1 Known-facts line ref (IR note)
$ git diff --name-only 974c97e..HEAD
docs/v2/cards/P1.1.md
docs/v2/cards/P1.5.md
```

This agent did not pull, merge, rebase, reset or commit at any point — the only
git commands run were `log`, `diff`, `status`, `show` and, at the end, `add` of
this card's explicit paths. Both drifted commits touch only `docs/v2/cards/`
files: `P1.1.md` (P1.1's IR fix) and `P1.5.md` (the AM-034 ruling itself).
Neither is in this card's May-edit list, and neither overlaps any path this card
edits. The work below was performed against the correct base `974c97e` and is
staged, uncommitted working-tree state that applies on top of every commit
above.

The first drift (`285283c`) prompted a re-run of V1 and V2, which passed. The
second drift (`6b27ddd`, the ruling) prompted a full re-run of all three
criteria at the new HEAD, and those are the runs recorded below. A third drift
(`00d5941`, P1.3/P1.4 card-text repairs) landed during the final checks; see
*Final confirmation at the current HEAD*.

## Final confirmation at the current HEAD

HEAD moved a third time while this card was being finalised, again to a
coordinator card-text repair and again touching only `docs/v2/cards/`:

```text
$ git log -1 --format='%h %s'
00d5941 Repair P1.4 card text round 2 per IR (AM-024)
$ git diff --name-only 6b27ddd..HEAD
docs/v2/cards/P1.3.md
docs/v2/cards/P1.4.md
```

No overlap with any of this card's six paths. All three criteria were therefore
run once more at the actual current HEAD, and all three pass:

| Criterion | Command | Exit | Time (UTC) |
| --- | --- | --- | --- |
| V1 | `npm run build:shared && npx vitest run installer/src` | **0** (12 files, 123 tests) | 09:18:11Z–09:18:12Z |
| V2 | `npm run lint` | **0** | 09:18:12Z–09:18:17Z |
| V3 | the three `rg` invocations | **0**, all three matched | 09:18:17Z |

V3 re-confirmed each leg by name: `M0–M13` in `README.md`, the bold backlog line
in `docs/HANDOFF.md`, and item 2 in `THIRD-PARTY-LICENSES.md`. So V1, V2 and V3
have passed at every HEAD this session reached: `974c97e`, `285283c`, `6b27ddd`
and `00d5941`. None of the drift touched a source, test, licence or doc file
this card edits, which is why no criterion moved. Should HEAD advance again
before the coordinator commits, the criterion set is unaffected for the same
reason — the drifted files are all `docs/v2/cards/` text.

## V1 — `npm run build:shared && npx vitest run installer/src`

| | |
| --- | --- |
| Command | `npm run build:shared && npx vitest run installer/src` |
| Exit code | **0** |
| Start / end (UTC) | 2026-09-26T09:16:13Z / 2026-09-26T09:16:15Z |
| Run at | HEAD `6b27ddd` (post-ruling), re-confirmed at `00d5941` — see *Final confirmation at the current HEAD* |
| Criterion | **PASS** |
```text
> build:shared
 RUN  v4.1.11 /home/villenull/Projects/Apunta

 Test Files  12 passed (12)
      Tests  123 passed (123)
   Start at  03:16:14
   Duration  335ms (transform 521ms, setup 0ms, import 1.01s, tests 164ms, environment 1ms)
```

`build:shared` exited 0 on its own; `vitest` exited 0. 12 files, 123 tests.

For completeness, the pre-ruling run at `974c97e` was also exit 0
(2026-09-26T09:13:33Z–09:13:34Z, 12 files / 123 tests), as was the mid-session
re-run at `285283c` (09:14:56Z). V1 has never failed at any HEAD in this
session.

`build:shared` exited 0 on its own; `vitest` exited 0.

### The assertion V1 asks for

`installer/src/catalog.test.ts` gained one test inside the existing
`describe('the writing models')` block, pinning both writing-model licence
records field by field, as V1 specifies:

```ts
it('pins the licence record of each writing model whose terms were read', () => {
  expect(WRITING_MODELS['gemma4:12b-it-qat'].licence).toEqual({
    name: 'Gemma Terms of Use',
    url: 'https://ollama.com/library/gemma4',
    verified: false,
  });
  expect(WRITING_MODELS['qwen3.6:35b-a3b'].licence).toEqual({
    name: 'Apache-2.0',
    url: 'https://ollama.com/library/qwen3.6',
    verified: false,
  });
});
```

Both records are pinned, and the names pinned are the **unchanged** ones. The
card's non-read branch directs leaving `verified: false` and the existing names
in place, so the pinning assertion locks the current, deliberately-unverified
state. See `licence-evidence.md` in this directory for why the read supports no
change.

### The assertion is a real tripwire, not decoration

A temporary edit flipping the `gemma4` record to `Apache-2.0` / `verified: true`
— simulating a later card that moves the record without updating the test —
makes V1 fail:

```text
  × pins the licence record of each writing model whose terms were read 3ms
 FAIL  |installer| src/catalog.test.ts > the writing models > pins the licence record …
AssertionError: expected { name: 'Apache-2.0', …(2) } to deeply equal { name: 'Gemma Terms of Use', …(2) }
      Tests  1 failed | 9 passed (10)
```

`installer/src/catalog.ts` was restored immediately afterwards and is byte for
byte the base-commit version — `git diff --stat installer/src/catalog.ts` is
empty. This tripwire was the whole point of V1's wording, and it holds on the
`verified: false` path too: a licence record can no longer move silently.

## V2 — `npm run lint`

| | |
| --- | --- |
| Command | `npm run lint` |
| Exit code | **0** |
| Start / end (UTC) | 2026-09-26T09:16:20Z / 2026-09-26T09:16:25Z |
| Run at | HEAD `6b27ddd` (post-ruling), re-confirmed at `00d5941` — see *Final confirmation at the current HEAD* |
| Criterion | **PASS** |

```text
> eslint . && prettier --check . && node scripts/check-no-external-urls.mjs && node scripts/collect-licenses.mjs --check

Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
```

All four legs passed, including the generated `npm-dependencies` block check
(111 packages) and the no-external-URLs guard — so the two new `ollama.com`
references added to a test file's expectations raised no guard trip, and the
licences file is neither stale nor copyleft-flagged. The pre-ruling runs at
`974c97e` (09:13:48Z) and `285283c` (09:14:56Z) were also exit 0.

## V3 — the three documentation greps

| | |
| --- | --- |
| Command | the three `rg` invocations below, as one shell line |
| Exit code | **0** (all three matched) |
| Start / end (UTC) | 2026-09-26T09:16:28Z / 2026-09-26T09:16:28Z |
| Run at | HEAD `6b27ddd` (post-ruling), re-confirmed at `00d5941` — see *Final confirmation at the current HEAD* |
| Criterion | **PASS** |

**1. `rg -n 'M0.{0,3}M13' README.md` — matched, exit 0.**

```text
191:All planned work packets M0–M13 are built, including local drafting,
```

The count changed and the en dash did not — confirmed by codepoint, not by eye.
`M0` is followed by `342 200 223`, which is `E2 80 93` = U+2013 EN DASH, the same
character the line already used. Nothing else in the sentence was touched. The
superseded `M0–M12` no longer appears in `README.md` (`rg` exit 1).

**2. `rg -n 'Explicitly removed from the active backlog' -A 8 docs/HANDOFF.md`
— matched, exit 0.** The bold line is still there at 466, still bold, still not
converted to a heading, and is now followed by its bullet list:

```text
466:**Explicitly removed from the active backlog (owner decision 2026-09-22):**
467-
468:- Complex-medical-vocabulary acquisition, and a Settings UI for managing
469-  dictionary words. The existing `stt_vocabulary` and `spelling_words` settings,
470-  the inline spell-check add behavior, the clinical safety checks and the
471-  historical measurements all stay.
472:- A/B experiments and optimization.
473:- The Tailscale invite and remote-testing setup.
474:- The Quick/Thorough model switch. No Thorough default ships: `qwen3.5:4b-q4_K_M`
```

Six bullets, one per removed or declined 2026-09-22 item. The full list runs to
`docs/HANDOFF.md:486`, past the `-A 8` window and visible in full below; the
grep is truncated only by its own `-A 8` flag:

```text
- is retained as the sole/default Quick path with no model control shown, to be
  revisited only after prompt re-tuning and a new fabrication/safety gate.
- The wider local-model candidate set. Model comparison is limited to exactly
  four authorized LLM arms (4B control, Qwen 2B, Bonsai 8B, Bonsai 4B);
  `qwen3.5:9b`, `qwen3:8b` and `qwen3:14b` were rejected and no candidate or
  gate is presumed passed.
- Mac acceptance work, paused for the coming months. The Linux PC remains the
  machine running the local AI server; resume the Mac-only checklist only when
  the owner reopens that work.

### Recently completed
```

**Selection filter applied.** Every bullet traces to a 2026-09-22
`docs/decisions.md` row that removes or declines work, and nothing else was
included:

| Bullet | Source row | Kind |
| --- | --- | --- |
| Vocabulary acquisition + a dictionary-word Settings UI | `:225` | removed |
| A/B experiments and optimization | `:225` | removed |
| Tailscale invite / remote-testing setup | `:225` | removed |
| Quick/Thorough switch, no Thorough default | `:231`, `:232` | declined |
| Wider candidate set, limited to four authorized arms | `:231`–`:234` | declined |
| Mac acceptance work paused | `:227` | paused |

Deliberately **excluded**, because those same-day rows *add* work rather than
remove it: Halaxy as M13 (`:228`), the Claude-export probe being GO with an
instruction (`:226`, `:230`), Keep mine / Take theirs (`:241`), Inter bundled
(`:240`), the capitalized Discussion labels (`:236`, `:237`), the fixed three
columns (`:244`), session-date listing with no search (`:245`), the disk-error
screen (`:246`), name matching at import (`:243`) and honest refine progress
(`:242`). Also excluded: the 2026-09-23 rows, which are a different day.

**3. `rg -n "writing models' terms" -A 8 THIRD-PARTY-LICENSES.md` — matched,
exit 0, file unchanged.** The card states that the "Open points" item 2 edit
happens "only when this card actually sets a writing model's `verified` to
`true`", and that on the `verified: false` path the file is not touched because
nothing in it changes. No `verified` moved, so
`git diff --stat THIRD-PARTY-LICENSES.md` is empty. Item 2 therefore still
reads:

```text
4000:2. **The writing models' terms** — partly settled. On 2026-08-26 all three
4001:   tags were checked against the live registry and exist, and the licence blob
4002:   shipped with `qwen3.5:4b-q4_K_M` — the tier the owner's Mac runs — was read
4003:   via `ollama show --license`: it is the Apache License 2.0 text. Nobody has
4004:   yet read the Gemma Terms of Use or the licences shipped with the two larger
4005:   tiers, which no machine in this project has pulled.
```

**No drift remains — which is the point of R17.** The catalogue says
`verified: false` for `gemma4:12b-it-qat` and `qwen3.6:35b-a3b`; this file says
nobody has read the Gemma Terms of Use or the licences of the two larger tiers.
Both assertions are true after today's reads, and V3's own acceptance text allows
this file to be "unchanged when no read happened". The clause that would now be
slightly stale is "which no machine in this project has pulled" — still true,
since this card pulled nothing and both tags are absent locally.

## Egress log

Two GETs, the two the card grants, both to library pages, no credentials, no
query string, no download, no model pull. Detail and licence text as read:
`licence-evidence.md` in this directory.

| URL | HTTP | Bytes | Read on |
| --- | --- | --- | --- |
| `https://ollama.com/library/gemma4` | 200 | 121,053 | 2026-09-26 (09:12:35Z) |
| `https://ollama.com/library/qwen3.6` | 200 | 84,745 | 2026-09-26 (09:12:35Z) |

Both URLs and the read date are recorded here and in `licence-evidence.md`, as
the card's non-read branch requires.

## Paths changed by this card

```text
 M README.md
 M docs/HANDOFF.md
 M installer/src/catalog.test.ts
?? docs/v2/evidence/P1.5/licence-evidence.md
?? docs/v2/evidence/P1.5/verification.md
?? docs/v2/state/returns/P1.5.md
```

`installer/src/catalog.ts` is **not** in that list: both licence records keep
the names and the `verified: false` flags they already had, as the card's
non-read branch requires. `THIRD-PARTY-LICENSES.md` is **not** in that list
either, for the same reason. Other modified and untracked paths in the working
tree (`docs/v2/state/dispatch/*.md`, `docs/v2/state/reviews/*.md`) belong to
other cards in flight and were neither read into this evidence nor touched;
only the six paths above were staged, by explicit path.

## Card status

**SUBMITTED.** All three criteria pass at HEAD `6b27ddd`: V1 exit 0 (12 files,
123 tests), V2 exit 0, V3 all three greps matched. Both documentation
corrections are made and the licence question is settled as far as this card
can settle it: both pages were reachable and readable, neither states a
licence, so per coordinator ruling AM-034 that is the non-read branch rather
than a stop, and `verified: false` plus both existing `licence.name` values stay
in place with `installer/src/catalog.ts` and `THIRD-PARTY-LICENSES.md`
untouched. Nothing is left half-done and no criterion is unmet; what remains
unread is recorded, not concealed, and is a fact about the publishers' pages
rather than an open action for this card.
