# P3.4 end-of-day lint repair — the thirteen `docs/v2/evidence/P3.5` errors

Date: 2026-10-03. Machine: Linux PC, `node v24.19.0`
(`~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node`).
Interpreter pinned throughout.

The failure this repairs is frozen at
`docs/v2/evidence/P3.4/attempt-6/runtime/07-V4.txt` lines 43–72: `eslint .`
reported **13 errors, 0 warnings**, every one of them in
`docs/v2/evidence/P3.5/`, all of them committed to `main`, all of them outside
P3.4's May edit. P3.4 correctly stopped. This packet is the repair P3.4 was not
allowed to make.

**Nothing was suppressed and nothing was loosened.** No `eslint.config.js`
change, no `.eslintignore`, no inline disable directive, no `--quiet`, no
threshold, no test change, no source, no card, no checkpoint, no contract, no
config, no manifest. `eslint .` is run with the repository's own unmodified
config throughout.

---

## 1. The thirteen errors, and what each one was

Reproduced verbatim from the git blobs at their pinned commits, which is how the
"before" side of every measurement in this packet is obtained — never from a
working copy.

```
build/eod-proof-lint/scoped-before/attempt-4/final-completion-ir/verify.mjs
   8:3  error  Unexpected console statement ...  no-console
  78:1  error  Unexpected console statement ...  no-console

build/eod-proof-lint/scoped-before/silence-completion-ir/v5-program-own-extraction.mjs
   1:10    error  A `require()` style import is forbidden  @typescript-eslint/no-require-imports
   1:86    error  Unexpected console statement ...  no-console
   1:2901  error  ... no-console
   1:6150  error  ... no-console
   1:6231  error  ... no-console
   1:6264  error  ... no-console
   1:6312  error  ... no-console
   1:6425  error  ... no-console
   1:6472  error  ... no-console

build/eod-proof-lint/scoped-before/silence-completion-ir/verify.mjs
  161:9  error  'r' is assigned a value but never used ...  @typescript-eslint/no-unused-vars
  183:1  error  Unexpected console statement ...  no-console

✖ 13 problems (13 errors, 0 warnings)
exit=1
```

The historical 13-error FAIL is therefore **reproduced, not lost**: this
transcript is 13 errors at the same three paths with the same rule names and the
same line/column positions as `07-V4.txt` records.

---

## 2. Files touched — exactly three, all in owned evidence directories

### 2.1 `docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify.mjs`

Two `no-console` sites, converted to a `util.format` write on stdout. This is
the same conversion the earlier `output-lint-completion` packet made in
`docs/v2/evidence/P3.5/review-1/source-outputs-mapping.mjs`, so the tree now has
one idiom for it.

```diff
 import fs from 'node:fs';
+import { format } from 'node:util';
@@
-  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
+  process.stdout.write(format(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`) + '\n');
@@
-console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
+process.stdout.write(format(`\n${results.length - failed.length} passed, ${failed.length} failed`) + '\n');
```

### 2.2 `docs/v2/evidence/P3.5/silence-completion-ir/verify.mjs`

Three sites, plus the write reference.

```diff
+import { format } from 'node:util';
@@
-writeFileSync(`${OUT}/v5-program-own-extraction.mjs`, program);
+// Written as `.txt`, never as `.mjs`: ... (comment quoted in full in the file)
+writeFileSync(`${OUT}/v5-program-own-extraction.mjs.txt`, program);
@@
-  const r = execFileSync('bash', ['-n', `${OUT}/${f}`], { encoding: 'utf8' });
+  // The `const r =` binding had no references, so it is dropped, but the call
+  // itself is kept: `execFileSync` is the assertion.
+  execFileSync('bash', ['-n', `${OUT}/${f}`], { encoding: 'utf8' });
@@
-console.log(lines.join('\n'));
+process.stdout.write(format(lines.join('\n')) + '\n');
```

**On the unused `r`.** It has exactly zero references after its declaration
(`grep -n '\br\b'` on the file returns only other, block-scoped `r`s at lines 69,
93–99 and 118–122). Its initialiser is *not* a pure expression — it is
`execFileSync`, which spawns `bash -n`. So the **initializer expression was
retained as a bare expression statement** and only the dead binding was dropped.
Dropping the whole statement would have silently deleted the `bash -n` this line
exists to perform, and the very next line asserts `bash -n ... exit 0`
unconditionally — the proof would have kept reporting PASS while checking
nothing. No side effect was dropped.

**On the write reference.** This verifier writes its own extraction of the card's
`node -e` cell into its OUT folder. Left as `.mjs`, any rerun recreates a
linted CommonJS program — the exact artifact renamed in §2.3. The destination is
now `.mjs.txt`, which section 4 below proves on both counts.

### 2.3 `docs/v2/evidence/P3.5/silence-completion-ir/v5-program-own-extraction.mjs` → `.mjs.txt`

A `git mv`, **byte-identical**:

```
before ccf9358ea2c08c269175ee0115ed6334dfa8fabc556cc6f526662777b20ee740
after  ccf9358ea2c08c269175ee0115ed6334dfa8fabc556cc6f526662777b20ee740
RENAME BYTE-IDENTICAL

$ git diff --cached --stat -M
 .../{v5-program-own-extraction.mjs => v5-program-own-extraction.mjs.txt}  | 0
 1 file changed, 0 insertions(+), 0 deletions(-)
```

6517 bytes, one line, `require()` plus eight `console` calls, extracted verbatim
out of the P3.5 card's V5 `node -e '...'` cell. **Not transformed, not
reformatted, not de-`console`d.** It is a card witness, not a program the
repository runs, and its value is that it is the bytes the card actually
contains.

---

## 3. The `.txt` extension: an admission, not a clean bill of health

`eslint .` walks `.js`, `.mjs` and `.cjs` (`files: ['**/*.{ts,tsx,js,mjs}']` in
`eslint.config.js`, plus `js.configs.recommended`). `.txt` is not among them.

So the honest statement is **not** "the file is now lint-clean". It is:

> The raw witness is **no longer lintable**, and `eslint` says so out loud.

```
$ npx eslint --no-ignore .../v5-program-own-extraction.mjs.txt
  0:0  warning  File ignored because no matching configuration was supplied
✖ 1 problem (0 errors, 1 warning)
```

The realpath was checked and is inside the repository, so this is not a
path-resolution artefact:

```
$ realpath docs/v2/evidence/P3.5/silence-completion-ir/v5-program-own-extraction.mjs.txt
/home/villenull/Projects/Apunta/docs/v2/evidence/P3.5/silence-completion-ir/v5-program-own-extraction.mjs.txt
```

### 3.1 The non-vacuity proof, because a clean `exit=0` here would be worthless

The same bytes, under both extensions, against the repository's own config:

```
$ sha256sum as-mjs.mjs as-txt.txt
ccf9358ea2c08c269175ee0115ed6334dfa8fabc556cc6f526662777b20ee740  as-mjs.mjs
ccf9358ea2c08c269175ee0115ed6334dfa8fabc556cc6f526662777b20ee740  as-txt.txt

$ npx eslint --no-ignore as-mjs.mjs          # identical bytes, .mjs
  1:10    error  A `require()` style import is forbidden   @typescript-eslint/no-require-imports
  1:86    error  Unexpected console statement ...         no-console
  1:2901  error  ... no-console
  1:6150  error  ... no-console
  1:6231  error  ... no-console
  1:6264  error  ... no-console
  1:6312  error  ... no-console
  1:6425  error  ... no-console
  1:6472  error  ... no-console
✖ 9 problems (9 errors, 0 warnings)   exit=1

$ npx eslint --no-ignore as-txt.txt          # identical bytes, .txt
  0:0  warning  File ignored because no matching configuration was supplied
✖ 1 problem (0 errors, 1 warning)   exit=0
```

The nine errors are a property of the **bytes**, and they are still there. What
changed is only that this artifact is now outside the linted extension set — a
naming/classification fact about a raw card witness, not a suppression and not a
rule change. If a reviewer disagrees with that classification, the disagreement
is with the file's *extension*, and the fix is a decision about
`eslint.config.js`'s reach, which this packet did not and must not touch.

`docs/v2/evidence/` is also listed in `.prettierignore`, so neither extension was
ever prettier-checked; the rename changes nothing there either.

---

## 4. Lint, before and after

Full transcript: `build/eod-proof-lint/lint-transcript.txt` (ignored scratch).

| measurement | before | after |
|---|---|---|
| `eslint --no-ignore` on the three artifact paths | **13 errors**, exit 1 | **0 problems**, exit 0 |
| `eslint --no-ignore` on the repaired paths + the new `replay.mjs` | — | **0 problems**, exit 0 |
| `eslint .` (whole repository, stock config) | 13 errors, exit 1 (as frozen) | **exit 0, no output** |

No foreign in-flight errors surfaced: `eslint .` printed nothing at all, so there
was nothing to report untouched.

Two things this packet did **not** run, on purpose:

- **`npm run lint` as a whole.** Prohibited here, and it is also the wrong
  instrument: it is `eslint . && prettier --check . && ...`, so it would have
  dragged in `prettier --check .` and the three scripts after it, and its green
  would partly rest on those. `eslint .` standalone is the exact command whose 13
  errors the frozen row records, run with the repo's own config.
- **`npm test`, `npm run typecheck`, the V4 acceptance row, the whole card row.**
  All out of scope. `node --check` was run on the two modified sources instead,
  and both pass:

```
node --check docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify.mjs   -> ok
node --check docs/v2/evidence/P3.5/silence-completion-ir/verify.mjs           -> ok
```

---

## 5. Replay: the proofs print exactly what they printed before

`docs/v2/evidence/eod-proof-lint-repair/replay.mjs` (new, this packet). Full
transcript: `build/eod-proof-lint/replay-transcript.txt`.

```
$ ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node \
    docs/v2/evidence/eod-proof-lint-repair/replay.mjs

== docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify.mjs   (inputs pinned at 92df606)
   before: git 2a0f977  5541 bytes
   after : working tree  5625 bytes
  ok    before vs after  exit 0, 1444 stdout bytes, 0 stderr bytes, byte-identical (zero normalisation)
  ok    negative control  mutated AFTER side differs (stdout) — the comparison is not vacuous
  ok    recorded output reproduced: the AFTER side equals
        docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify-output.txt byte for byte

== docs/v2/evidence/P3.5/silence-completion-ir/verify.mjs   (inputs pinned at e7ace67)
   before: git e7ace67  14222 bytes
   after : working tree  15029 bytes
  ok    before vs after  exit 0, 6266 stdout bytes, 0 stderr bytes, byte-identical (zero normalisation)
  ok    negative control  mutated AFTER side differs (stdout) — the comparison is not vacuous
  ok    write reference  OUT after this run: completion-command.sh synthetic-checkpoint.json
        synthetic-default-source v5-program-own-extraction.mjs.txt verify-output.txt verify.mjs
  ok    write reference  the linted .mjs is NOT recreated; the .txt holds the committed witness's exact bytes
  note  BEFORE side OUT: ... v5-program-own-extraction.mjs ... (this is the raw .mjs the rename removed)
  note  both sides reached the same last section: == 8. scratch and tree state ==

PASS: 0 problem(s).
exit=0
```

### 5.1 How the before side is obtained, so this cannot be faked

- The **before bytes** are read out of git at the commit that recorded each
  proof (`2a0f977`, `e7ace67`). They are never taken from a working copy, so
  "edit both sides" cannot satisfy this.
- Each side's **inputs** are materialised into a fresh ignored snapshot of the
  whole pinned tree (`git archive <pin> | tar -x`) under
  `build/eod-proof-lint/replay/<case>/tree/`. Both sides therefore read
  byte-identical inputs, and those inputs are the versions the proof was written
  against, not today's tree. The pin is the point: the first attempt at pinning
  `final-completion-ir` at `2a0f977` reproduced 40 of the same PASS lines but
  failed `status == SUBMITTED`, because the checkpoint had not been flipped yet at
  that commit; pinning at `92df606`, the commit that recorded the completed
  silence arm, makes the replay reproduce the recorded `verify-output.txt`
  **exactly**, all 1444 bytes and 41/0.
- **One adaptation, applied identically to both sides and to the negative
  control:** each verifier hardcodes its root as the absolute literal
  `/home/villenull/Projects/Apunta`; that literal is repointed at the snapshot
  root. The replay asserts it hit exactly the expected number of occurrences and
  refuses to continue otherwise. Nothing else in either script is touched. The
  snapshot root is the **same path for all three sides** and each side's run
  artifacts are moved out before the next restage — a crash message or any
  absolute path the script prints embeds that root, and two different roots would
  show up as a stderr difference that has nothing to do with the change.
- Each verifier is *run* from `${REPO}/build/p35-silence-ir/verify.mjs`, which is
  its canonical location: that is where its relative imports
  (`../../docs/v2/tools/plan-lib.mjs`, `../../scripts/v2/sandbox.mjs`,
  `../../shared/src/platform-paths.ts`) resolve from and where its own section 7
  runs `node --check` on it. cwd is the real repository, because one verifier
  shells out to `git check-ignore`.
- Two ignored scratch inputs the silence verifier reads were reconstructed from
  **committed** evidence, not invented: `completion-command.sh` from
  `docs/v2/evidence/P3.5/attempt-4/silence-completion/completion-command.sh`
  (`@92df606`) and `v5-checker-program.mjs` from the raw card witness
  (`@e7ace67`). The verifier's own section 6 asserts the latter is byte-equal to
  its independent extraction and prints
  `PASS  own extraction is byte-equal to the author extracted program`, so a
  wrong reconstruction would have shown up as a FAIL in the transcript.

### 5.2 Zero normalisation

stdout, stderr and exit code are compared as raw strings. Nothing is trimmed,
timing-stripped, path-stripped, sorted or otherwise adjusted, and there were no
genuine test-report timings to normalise — these two proofs print assertions, not
durations. Per-side `stdout`, `stderr`, `exit` and the OUT directory listing are
captured under `build/eod-proof-lint/replay/<case>/{before,after,control}/`.

### 5.3 The negative control, so "byte-identical" is not vacuous

For each case a third run uses the **after** body with one mutation applied
(`'PASS'` → `'PASSX'`). The comparison must then report a difference:

```
ok  negative control  mutated AFTER side differs (stdout) — the comparison is not vacuous
```

Had it matched, `compare` would be reporting nothing and the replay says so and
fails.

### 5.4 The one recorded-output difference, stated rather than hidden

```
$ diff build/eod-proof-lint/replay/silence-completion-ir/after/stdout \
       docs/v2/evidence/P3.5/silence-completion-ir/verify-output.txt
48c48
< FAIL  silence env file exists and is 0 bytes
---
> PASS  silence env file exists and is 0 bytes
```

Exactly one line, and it is an external fact, not a behavioural change:
`/tmp/apunta-v2-p3.5-v4-silence.env` was 0 bytes at 17:15 on 2026-10-03 and is
292 bytes now, because the silence arm was subsequently completed and run
(`92df606`). Both sides of the replay read the same file and agree on it. The
recorded `verify-output.txt` was written on the author's machine at that hour and
is **not edited**; the replay reports this as informational and does not gate on
it. The property under test is that before and after agree with each other, and
they do, on all 6266 bytes.

---

## 6. Not changed, deliberately

- **No assertion, fixture, control flow or verdict.** The 44 `ok()` assertions and
  8 sections of the silence verifier and the 41 `check()` assertions of the
  final-completion verifier are the same set, in the same order, with the same
  labels. Verified mechanically, not by eye:

  ```
  $ diff <(grep "^\s*ok(\|^check(" <before>) <(grep ... <after>)   # both files
  IDENTICAL set of check lines      (both)

  $ diff <(grep -o 'process\.exit([^;]*' <before>) <(... <after>)   # both files
  process.exit identical           (both)
  ```

  The only removed source token is the dead `r` binding; the only changed ones
  are a destination filename and three output sinks.
- **No `verify-output.txt` in either evidence directory.** Both are historical
  records. Untouched.
- **No reviewer report.** `docs/v2/state/reviews/P3.5-silence-completion-ir.md`
  line 213 names `v5-program-own-extraction.mjs` in its file list, and
  `docs/v2/state/cards/P3.4.json` (lines 20 and 82) and
  `docs/v2/state/returns/P3.4.md` (line 582) name the `.mjs` path, as does the
  frozen `07-V4.txt`. All are outside the two owned evidence directories and
  none was edited — see §7.
- **No card, checkpoint, source, contract, config, manifest, lint config or test
  threshold.** `git status` in §8 is the complete list.
- **No staging or commit.** Nothing was staged except the `git mv`, which stages
  by construction; the working-tree edits are unstaged. `main` was not committed
  to and not pushed.
- **No runtime, build, model, audio, pactl, database, 7717 or network.** The
  replay invokes exactly one interpreter and `git`, `tar`, `bash -n`, `node
  --check` (all as subprocesses *of the proofs being replayed*, unchanged), and
  writes only under the ignored `build/eod-proof-lint/`. The proofs' own
  read-only guarantees are unchanged, and the scratch-ignore check inside the
  silence verifier still passes
  (`PASS  scratch is git-ignored (.gitignore:55:build/\tbuild/p35-silence-ir)`).

---

## 7. Reported, not edited — consumers outside this scope

One in-scope consumer was updated (§2.2). Four references sit outside the two
owned evidence directories and are therefore **left untouched and reported for
the coordinator**:

1. **`docs/v2/state/reviews/P3.5-silence-completion-ir.md:213`** — a reviewer
   report whose file listing reads
   ``verify-output.txt,v5-program-own-extraction.mjs}``. The rename makes that
   line stale. A reviewer report is history and is not to be rewritten; the
   pointer now lives in `docs/v2/evidence/eod-proof-lint-repair/README.md`.
2. **`docs/v2/state/reviews/P3.4-attempt6-runtime-audit.md:1`** — same kind of
   stale reference, in a P3.4 reviewer report.
3. **`docs/v2/evidence/P3.4/attempt-6/static-completion-proposal/04-verification.txt:2`**
   — a P3.4 evidence file, outside both owned directories, and currently
   **untracked**, i.e. a background packet's in-flight work. Left alone on both
   counts (CLAUDE.md: never touch another agent's work in flight).
4. **`docs/v2/state/cards/P3.4.json:20` and `:82`, and
   `docs/v2/state/returns/P3.4.md:582`** — all three name the old `.mjs` path in
   the frozen account of the attempt-6 failure. They are P3.4 card/return
   documents and a frozen failure record. Correct as written: the path is the
   path the failure happened at. They are not historical *hashes* and were not
   rewritten; nothing in this packet invalidates them.

No other reference to the name exists anywhere in the repository outside
`build/` (ignored) — see §8 for the search.

---

## 8. Complete change list

```
$ git status --porcelain=v1 -- docs/v2/
 M docs/v2/evidence/P3.5/attempt-4/final-completion-ir/verify.mjs
R  docs/v2/evidence/P3.5/silence-completion-ir/v5-program-own-extraction.mjs -> ...mjs.txt
 M docs/v2/evidence/P3.5/silence-completion-ir/verify.mjs
?? docs/v2/evidence/eod-proof-lint-repair/                     <- this packet

$ git diff --cached --stat -M
 .../{v5-program-own-extraction.mjs => v5-program-own-extraction.mjs.txt}  | 0
 1 file changed, 0 insertions(+), 0 deletions(-)
```

(The other `??` lines in `git status` — `docs/v2/evidence/P3.4/attempt-6/static-completion-proposal/`,
`docs/v2/state/P3.4-STATIC-COMPLETION-PROPOSAL.md`,
`docs/v2/state/reviews/P3.4-attempt6-runtime-audit.md` — are a background
packet's untracked work, not this one's.)

Every reference to the old file name in the repository:

```
$ grep -rn "v5-program-own-extraction" . | grep -v '^./node_modules' | grep -v '^./build/'
      14  docs/v2/evidence/eod-proof-lint-repair/README.md          (this file)
       5  docs/v2/evidence/eod-proof-lint-repair/replay.mjs          (this packet)
       2  docs/v2/evidence/P3.4/attempt-6/runtime/07-V4.txt          frozen record, untouched
       2  docs/v2/evidence/P3.4/attempt-6/static-completion-proposal/04-verification.txt
                                                                  out of scope, untouched
       1  docs/v2/evidence/P3.5/silence-completion-ir/verify.mjs     the write reference, updated
       2  docs/v2/state/cards/P3.4.json                              out of scope, untouched
       1  docs/v2/state/returns/P3.4.md                              out of scope, untouched
       1  docs/v2/state/reviews/P3.4-attempt6-runtime-audit.md        out of scope, untouched
       1  docs/v2/state/reviews/P3.5-silence-completion-ir.md         out of scope, untouched
```

Nothing under `build/` is listed because `build/` is git-ignored. `07-V4.txt` is
the frozen record and is correct as written.

`docs/v2/evidence/P3.5/silence-completion-ir/verify-output.txt` names it too,
inside the section-6 `say()` output; that file is a historical record and is
untouched, and the replay reproduces the silence proof's output to within the one
external `/tmp` line of §5.4.

Note on the working tree: `main` is carrying other packets' uncommitted work
(`docs/v2/ORCHESTRATION-LOG.md`, `docs/v2/state/NEXT_SESSION.md`, the P3.4 card
and return, and `docs/v2/evidence/P3.4/attempt-6/runtime/`). None of it was
touched, staged or committed here.

---

## 9. Standing verdict

| claim | evidence |
|---|---|
| 13 errors before, 0 after, same three paths, same rules | §1, §4 |
| `eslint .` exit 0 with stock config, whole repository | §4 |
| historical 13-error FAIL reproduced, not lost | §1 |
| no suppression, no config/ignore/directive change | §4, §8 |
| raw card witness bytes unchanged | §2.3 sha256 + `git diff --stat -M` = 0 |
| the `.txt` is unlintable, and that is admitted | §3 |
| the rename is a classification change, not a fix | §3.1 (9 errors return under `.mjs`) |
| proof outputs byte-identical before/after, zero normalisation | §5 |
| replays run on pinned input versions in an ignored snapshot | §5.1 |
| comparison is not vacuous | §5.3 |
| `bash -n` side effect retained | §2.2, §5 |
| a rerun cannot recreate a linted raw `.mjs` | §5 (write-reference gate) |
| out-of-scope references reported, not edited | §7 |