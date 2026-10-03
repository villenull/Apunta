# P3.4 attempt 5 — §I tooling grant, applied

Owner amendment **AM-189** authorises §I of
`docs/v2/state/P3.4-REPAIR-PROPOSAL-v5.md`: the bounded P3.4-only attempt-5
exception in `docs/v2/tools/build-dispatch.mjs`, its tests in
`docs/v2/tools/build-dispatch.test.mjs`, the attempt-4 sentence preserved byte
for byte, `>= 6` refused for every card, and the dependency gate untouched.

Role: **tooling preparation only.** This is the coordinator-side grant the
proposal §G reserved and §J required before dispatch generation. It applies the
guard; it does **not** generate, save or run P3.4 attempt 5, and it touches
nothing in `web/`, `scripts/`, `src-tauri/`, the P3.4 card, its checkpoint, its
attempt-4 evidence, or `PROGRESS.json`.

- Base: `375d3c1` (`Close independently verified evidence lint cleanup`), `main`.
  While this work ran, a background agent committed `b077d1a` and `6974943`
  (P3.4/P3.5 cards, checkpoints, `AMENDMENTS.md`, `ACQUISITION.md`). **No file
  this packet touched was touched by those two commits** —
  `git diff --stat 375d3c1..HEAD` names none of `docs/v2/tools/**`.
- Node: pinned **v24.19.0** (`~/.local/share/mise/installs/node/24.19.0`).
- Nothing staged, nothing committed.
- No app, build, server, database, model, audio, download, install or network
  call; port 7717 never contacted; no live data folder opened; no runtime attempt
  spent.

## Files written

| Path | What |
| --- | --- |
| `docs/v2/tools/build-dispatch.mjs` | §I.1 the guard at `:151-183`, §I.2 the attempt line at `:360-370` |
| `docs/v2/tools/build-dispatch.test.mjs` | `makePlan`/`card` take a defaulted card id; 14 keyed-guard cases appended |
| `docs/v2/evidence/P3.4/attempt-5/tooling/guard-matrix.mjs` | standalone replay of the whole guard matrix (read-only, `--print`, temp plans) |
| `docs/v2/evidence/P3.4/attempt-5/tooling/README.md` | this file |

Scratch, git-ignored, and the only other thing written:
`build/p3.4-attempt5-tool/` (copies of the three tool files **as they were
before** this change, used for the baseline probe). `build/p3.4-spec-v5-repair2/`
and `build/p3.4-spec-v5/` were read only, never modified.

## §I applied exactly

The two code edits are the proposal's, character for character. The independent
proof of that is the previously proven patched copy at
`build/p3.4-spec-v5-repair2/tool/build-dispatch.mjs`: with comments stripped,
the shipped tool differs from it in exactly one line's worth of surface —

1. `// AM-189; changes only with another owner amendment` appended to the
   `FIFTH_ATTEMPT_CARD` declaration (a comment naming the amendment, which the
   proposal left as `AM-nnn` in its own listing and AM-189 fills in);
2. Prettier's line wrap of the attempt-5 concatenation
   (`… authorised by ' + exception + ' — there is no attempt 6'` across three
   lines instead of one). Same operator, same operand order, same resulting
   string — asserted byte for byte by the `extra: attempt 5 line…` case and by
   the matrix.

Nothing else. Every other difference between that copy and the shipped file is
comment text.

**Guard (`build-dispatch.mjs:151-183`).** `--attempt-exception` is read once;
`FIFTH_ATTEMPT_CARD = 'P3.4'`; attempt 4 or 5 requires an `AM-\d{3}`-shaped
exception, attempt 5 additionally requires `id === 'P3.4'`, `>= 6` is refused for
every card, and anything outside 1–5 is refused as before. The order matters and
is preserved: the malformed-amendment refusal fires before the keyed-card
refusal, so `--attempt 5 --attempt-exception AM-99` on another card reports the
missing amendment, not the wrong card.

**Attempt line (`build-dispatch.mjs:360-370`).** One branch per attempt, not
arithmetic. The reason is in the code comment and is worth repeating here,
because it is the whole reason this line cannot be "simplified" later:
`attempt - 3` renders attempt 4's `one corrective attempt` as `1 corrective
attempt`, which changes three **shipped** dispatches by a byte each.

## Tests

`makePlan(cardText, reviewRow, id = 'T1')` and `card(command, expected,
id = 'T1')` take the id as a defaulted parameter and the H1 follows it. That is
§I.3's one test-side change and it is the whole of it: `plan-lib.mjs:215` keys a
card by file name and throws `file name must be <id>.md`, so a fixture written
as `P3.4.md` whose H1 still reads `# T1 Test card` never reaches the guard. Every
call that does not pass an id is byte-identical to before — with the default,
`makePlan` writes the same `PROGRESS.json`, the same `T1.md` and `card()`
produces the same `# T1 Test card`.

The 14 cases are the reviewed probe
`docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs` ported with its case
names and its assertions intact; only the fixture plumbing differs (the probe
took its tool directory from `APUNTA_TOOL_DIR` and found `docs/v2` by walking
up, both of which existed only because the patched tool then lived in a scratch
copy). The probe file itself is **not** modified and still passes unmodified
against the shipped tool, below.

New cases, in the order they run:

| Case | Asserts |
| --- | --- |
| `T1` | `--attempt 5` with no exception → exit 2, message names `--attempt-exception` |
| `T2` | `--attempt 5` + well-formed `AM-nnn` on another card → exit 2, "refused", "no attempt 6", "only P3.4 may carry it" |
| `T3` | `P3.4 --attempt 5 --attempt-exception AM-999` → exit 0, the amendment and "no attempt 6" in the output, card title present |
| `T4` | `--attempt 6` on P3.4 itself → exit 2, "beyond any authorised budget" |
| `T5` | attempt-4 line byte-identical to the shipped literal (`AM-049`, "no attempt 5") |
| `T5b` | attempt-4 **failure message** byte-identical to the shipped one |
| `extra` | attempt-5 line reads "plus two corrective attempts … there is no attempt 6" |
| `extra` | attempts 1–3 unchanged, `of 3.` with no exception |
| `extra` | `--attempt 7`/`12` refused; `0`, `x`, `-1`, `4.5` refused |
| `extra` | `--review` mode: same keyed refusal for another card, permitted for P3.4, `--attempt 6` refused |
| `extra` | `--ir` mode: refused for another card, permitted for P3.4 |
| `extra` | attempt 5 refused for P3.4 on `AM-99`, `am-999`, `AM-9999`, `X-999` |
| `extra` | dependency gate still exits 3 with the exception supplied (no PASS on exit 3) |
| `extra` | the shipped attempt-4 lines in `S2.5.md`, `P3.4.md`, `P4.1.md`, `P4.1-ir.md` regenerate byte for byte, amendment id and card id extracted from each shipped line rather than hardcoded here |

`T5`/`T5b` are the pair that would catch the arithmetic rewrite: `T5b` pins the
refusal text to the byte, so even the message cannot drift silently.

## Commands, exits and counts

All on pinned Node v24.19.0.

| Command | Exit | Count |
| --- | --- | --- |
| `node --test docs/v2/tools/plan-lib.test.mjs` | 0 | 9 tests, 9 pass, 0 fail |
| `node --test docs/v2/tools/check-plan.test.mjs` | 0 | 4 tests, 4 pass, 0 fail |
| `node --test docs/v2/tools/build-dispatch.test.mjs` | 0 | **26 tests, 26 pass, 0 fail** (12 existing + 14 new) |
| — the three together | 0 | **39 tests, 39 pass, 0 fail**; the 25 pre-existing (9 + 4 + 12) still pass, none deleted or weakened |
| `APUNTA_TOOL_DIR=$PWD/docs/v2/tools node --test docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs` | 0 | **14 tests, 14 pass, 0 fail** — the reviewed probe, unmodified, against the shipped tool |
| the same probe against the pre-change tool in `build/p3.4-attempt5-tool/` | 1 | 14 tests, 8 pass, **6 fail** — recorded so the probe is not vacuous; see below |
| `node docs/v2/evidence/P3.4/attempt-5/tooling/guard-matrix.mjs` | 0 | **113/113 rows as expected, 0 mismatches** |
| `npx eslint docs/v2/tools/build-dispatch.mjs docs/v2/tools/build-dispatch.test.mjs` | 0 | clean |
| `npx prettier --check` on the same two files | 0 | clean (the baseline was clean too; `--write` was needed, so the check is meaningful) |
| `node docs/v2/tools/build-dispatch.mjs P3.4 --base 6974943 --port 7841 --attempt 5 --attempt-exception AM-189 --print` | 0 | exit 0; line 8 reads `- Attempt 5 of 3, plus two corrective attempts the owner authorised by AM-189 — there is no attempt 6. Checkpoint: `docs/v2/state/cards/P3.4.json`.`; **nothing written** |
| `sha256sum -c` on the four shipped attempt-4 dispatches, before vs after | 0 | all four OK; `git status --porcelain docs/v2/state/dispatch/` empty |
| `git diff --stat 375d3c1..HEAD` and `git status --porcelain` | 0 | no overlap with the background agent's two commits |

The 6 baseline failures are the probe earning its keep. Against the **unpatched**
tool, `T2`, `T3`, `extra: attempt 5 line…`, `extra: --review mode`,
`extra: --ir mode` and `extra: dependency gate` all fail, because attempt 5 is
refused for every card — including the dependency-gate case, which is refused at
exit 2 before it can reach exit 3. (The reviewed ir4 write-up records "3 fail"
for the older §T.2 wording; against **this** baseline the observed number is 6,
and this is what was observed, not what the earlier review reported.)

## The guard matrix, read

`guard-matrix.mjs` prints every case it runs. The parts a reviewer should read:

- **Attempt 5, 20 refusal rows and 3 permitted rows.** Refused: `T1`, `S3.2`,
  `S3.3a`, `P3.5`, `T0.R` (a *parent review* id — it is not `P3.4`, so it is
  refused too), each with no exception and with `AM-189`, in `implement`,
  `review` and `ir` modes. Permitted: `P3.4` with a well-formed amendment, in all
  three modes. Also refused for `P3.4`: `AM-18`, `am-189`, `AM-9990`, `X-189`,
  and `AM-189 ` with a trailing space.
- **`>= 6`: 60 rows, 60 refusals**, across six card ids (`T1`, `P3.4`, `S3.2`,
  `S3.3a`, `P3.5`, `T0.R`) × four values (`6`, `7`, `12`, `999`) × with and
  without an exception, in all three modes. **There is no attempt 6 for any
  card, including the one that holds the fifth.**
- **Non-integers** (`0`, `-1`, `4.5`, `x`, empty) refused at exit 2 before
  generation, as before.
- **Dependency gate**: `P3.4 --attempt 5 --attempt-exception AM-189` with
  `S2.5` absent from `PROGRESS.json` stops at **exit 3**, not 0. The grant is
  about the attempt counter and moved nothing else (HS-7: no threshold moved).
- **Attempt 4**: all four shipped lines regenerate byte for byte.

## What this does not prove, and what is not claimed

- **No attempt 5 was run and none is dispatched.** The `--print` invocation above
  proves the generator's guard accepts the keyed invocation and writes nothing;
  it is not an implementation attempt, spends none of the single authorised
  attempt, and touches no card row.
- **No dispatch was generated.** `docs/v2/state/dispatch/P3.4.md` is still
  attempt 4's file, byte for byte; attempt-4 evidence under
  `docs/v2/evidence/P3.4/` is retained untouched (AM-189).
- **The guard is not the card's work.** §C/§D/§F contracts, the model and the
  attempt-4 findings are unchanged; nothing here speaks to whether attempt 5 will
  pass V0–V4.
- **The optional A06 producer guard remains PARKED and ungranted** (proposal
  §J Decision 3). Not implemented, not partially implemented, not requested.
- **Independent review not yet done.** This is the implementer's own report. The
  coordinator still owes `docs/v2/state/reviews/` a separate review, and the
  integration commit.
- **A P3.4 attempt-5 dispatch has a Rule B consequence** that the generator does
  not decide and this packet does not touch: the card's V0 row condition. Not
  asserted, not checked, recorded so it is not discovered by surprise.