# Independent review — `71cb8245` proof lint repair

Date: 2026-10-03. Machine: Linux PC, pinned `node v24.19.0`
(`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`).
Reviewer scope: the **proof-cleanup** half of commit
`844ad230b91dd3c8c4c30a55142308c498cf72e9` ("Save bounded proof lint repair and
static completion review"). Commit `844ad23` bundles two workers' deliverables;
this review covers only `71cb8245`'s evidence-output lint repair. The
`b07cc8b3` static-completion-ir artifacts (`docs/v2/evidence/P3.4/attempt-6/
static-completion-ir/**`, `docs/v2/state/reviews/P3.4-static-completion-ir.md`)
are **out of scope and not read for verdict**. No source, card, checkpoint,
contract, config or manifest was edited; nothing staged or committed.

Evidence produced by this review: `docs/v2/evidence/eod-proof-lint-repair-ir/`
(`replay.stdout`, `replay.stderr`, `repro13-eslint.out`, `eslint-dot.out`, the
six captured verifier stdouts, `replay-adapted.mjs`, `SHA256SUMS.txt`). Scratch:
ignored `build/eod-proof-lint-ir/`.

## 0. Boundary

No `/vill`, no workers, no worktrees. The mutable paths of the other active
workers (`e74` P36prep IR, `04340fea` model acquisition) were not read as input
and not touched; only a read-only `eslint .` hygiene pass traversed the tree.
`git status` after the review shows no tracked file modified — only the two
untracked directories `docs/v2/evidence/eod-proof-lint-repair-ir/` (this review)
and `docs/v2/evidence/english-eod-model-acquisition/` (pre-existing, another
worker's).

## 1. Proof subset under review

| path | change at `844ad23` |
|---|---|
| `docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify.mjs` | M — 2 `console.log` → `process.stdout.write(format(...)+'\n')` |
| `docs/v2/evidence/P3.5/silence-completion-ir/verify.mjs` | M — 1 `console.log` → stdout, dead `const r =` dropped, write target `.mjs` → `.mjs.txt` |
| `…/silence-completion-ir/v5-program-own-extraction.mjs` → `.mjs.txt` | `R100` byte-identical rename |
| `docs/v2/evidence/eod-proof-lint-repair/README.md`, `replay.mjs` | A — the packet's own claim + replay proof |

HEAD hashes: final `6290b54c…`, silence `65bbb75e…`, witness `.txt`
`ccf9358e…`. The witness sha256 is unchanged from the pre-rename `.mjs`
(`844ad23^`), and `git diff -M --summary` reports the rename at `100%`
similarity — **byte-identical**.

## 2. Output-only console replacement — CONFIRMED

Independent `diff` of the before blobs (git at `2a0f977` final, `e7ace67`
silence) against the working tree shows the **only** source changes are:

- `import { format } from 'node:util';` added (used);
- every `console.log(EXPR)` → `process.stdout.write(format(EXPR) + '\n')` —
  2 sites in the final verifier, 1 in the silence verifier;
- the `.mjs.txt` write target and its explanatory comment;
- the dead binding removal and its comment.

`grep 'console\.'` on both repaired files: **no matches**. The conversion is
semantically exact for a single string argument (`console.log` is defined as
`process.stdout.write(util.format(...) + '\n')`), and §4's byte-identical replay
is the empirical proof. `node --check` passes on both.

## 3. Dead binding removed, `execFileSync` assertion retained — CONFIRMED

```
-  const r = execFileSync('bash', ['-n', `${OUT}/${f}`], { encoding: 'utf8' });
+  execFileSync('bash', ['-n', `${OUT}/${f}`], { encoding: 'utf8' });
```

The initializer is retained as a bare expression statement, so `bash -n` still
runs and still throws on failure (`execFileSync` throws by default). The old `r`
is genuinely unreferenced: the only other `r`s in the file are block-scoped
(line 69 callback, line 93/99 `filter`, lines 118–122 `for..of`). Dropping the
statement would have silently removed the check while the next line's
`ok(true, 'bash -n … exit 0')` kept printing PASS — the README states this and
it is correct. Repaired verifiers pass `eslint` cleanly, so the bare call
trips no `no-unused-expressions`.

## 4. Replay — independently reproduced

I ran the packet's `replay.mjs` through an independent copy
(`docs/v2/evidence/eod-proof-lint-repair-ir/replay-adapted.mjs`) that differs
from the committed script **only** in the scratch path
(`build/eod-proof-lint` → `build/eod-proof-lint-ir`, two lines). Command:

```
~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
  docs/v2/evidence/eod-proof-lint-repair-ir/replay-adapted.mjs
```

Result: **stdout matches the README transcript, stderr 0 bytes, exit 0.**
I did not rely on the replay's own `ok` lines — I diffed the captured
before/after/control artifacts directly:

| case | before exit | after exit | before/after stdout | before/after stderr | control |
|---|---|---|---|---|---|
| final-completion-ir | 0 | 0 | **identical, 1458 bytes** | identical, 0 | differs (1499 B) |
| silence-completion-ir | 0 | 0 | **identical, 6266 bytes** | identical, 0 | differs (6314 B) |

Negative controls discriminate: mutating only the AFTER side (`'PASS'`→
`'PASSX'`) changes stdout in both cases, so "byte-identical" is not vacuous.
The before bytes come from git (`2a0f977` / `e7ace67`), never a working copy;
each side is run against a fresh `git archive <pin>` snapshot with the one
root-literal rewrite applied identically to both sides and the control, with an
assertion that exactly one literal was rewritten. The write-reference gate
passes: the AFTER OUT holds `v5-program-own-extraction.mjs.txt` and **no `.mjs`**,
and the `.txt` bytes equal the committed witness.

The silence case's recorded `verify-output.txt` differs by exactly one line —
`FAIL` vs `PASS  silence env file exists and is 0 bytes` — because
`/tmp/apunta-v2-p3.5-v4-silence.env` was 0 bytes when recorded and is 292 bytes
now. Both replay sides read the same file and agree; this is the external fact
the README §5.4 discloses. The final case's recorded output **is** reproduced
byte for byte.

## 5. Original 13-error FAIL preserved — CONFIRMED

I extracted the three pre-repair blobs from git into an ignored dir and ran the
repository's own unmodified config:

```
npx eslint --no-ignore build/eod-proof-lint-ir/repro13/    # exit 1
```

Exactly **13 errors, 0 warnings**, at the same three files, same rule names and
same line:column positions as the frozen `docs/v2/evidence/P3.4/attempt-6/
runtime/07-V4.txt` lines 43–72: final `8:3`,`78:1` (no-console); witness
`1:10` (no-require-imports), `1:86`…`1:6472` (8× no-console); silence `161:9`
(no-unused-vars), `183:1` (no-console). The frozen record is untouched.

## 6. No suppression / config / assertion / fixture / control / exit change — CONFIRMED

- Commit touches **no** eslint/prettier/tsconfig/package/ignore/test file.
- No `eslint-disable` directive added anywhere in the diff.
- Assertion sets are unchanged: `check(` 41→41 (final), `ok(` 45→45 (silence),
  same labels in the same order; only line numbers shift from the added
  import/comment lines.
- `process.exit(...)` expressions identical in both files.
- No fixture changed.
- `eslint .` (stock config, whole repository) — the exact command the frozen row
  recorded — now exits **0 with no output** (`eslint-dot.out`, 0 bytes). This is
  a hygiene check, **not** the P3.4 V4 acceptance row, and not `npm run lint`.

## 7. The `.txt` is unlintable, not clean — CONFIRMED, and it matters

```
npx eslint --no-ignore …/v5-program-own-extraction.mjs.txt
  0:0  warning  File ignored because no matching configuration was supplied
✖ 1 problem (0 errors, 1 warning)   exit=0
```

That is "outside the linted extension set", **not** "lint-clean". The same bytes
under `.mjs` still produce the 9 errors. `eslint.config.js`'s only broad JS glob
is `**/*.{ts,tsx,js,mjs}` and the evidence dir is already in `.prettierignore`,
so the rename is a naming/classification change with no config edit. The
README states this honestly (§3, §3.1) and does not claim a fix of the bytes.

## 8. Findings

Non-blocking, documentation only; none affects the proof's soundness.

1. **"1444 stdout bytes" is characters, not bytes.** README §5/§5.1 label the
   final-completion output `1444` (that is `String.length`, UTF-16 code units);
   the recorded file and the captured stdout are **1458 bytes** (14 multibyte
   em-dashes). The equality claim still holds — before, after and
   `verify-output.txt` are byte-identical.
2. **The README §5 transcript is abridged, not byte-exact.** The committed
   `replay.mjs` always prints `note  both sides reached the same last section:
   (no section heading)` for the final case; the README transcript omits that
   line. The behaviour is as the script prints; the transcript is edited for
   length.
3. **Scope caveat for the V3/V4 owner.** `eslint .`'s green now rests partly on
   the raw witness being outside the linted extension set (9 of the 13 errors
   are removed by the rename, 4 by real source fixes). This is disclosed and is
   not a suppression, but "`eslint .` exit 0" must not be read as "the witness
   bytes are lint-clean."

## 9. Verdict

**CLEAR** for the bounded `71cb8245` proof-cleanup deliverable.

Every requested property holds under independent reproduction: output-only
console replacement (2 verifiers), dead binding removed with the `execFileSync`
assertion retained, the raw CJS witness renamed byte-identically with the only
writer now emitting `.mjs.txt` (a rerun cannot recreate a linted `.mjs`), no
suppression/config/assertion/fixture/control/exit change, replay
stdout/stderr/exit byte-identical on pinned snapshots with discriminating
negative controls, and the original 13-error historical FAIL reproduced exactly.
The `.txt` is correctly reported as unlintable, not clean. Findings in §8 are
cosmetic/scope notes, not gate failures.

The root's CLEAR gate for the bounded proof cleanup is satisfied; the bounded
owner may be asked for the static V3/V4 completion.
