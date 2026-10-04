# Guard-probe hygiene repair — replay proof

Scope of this repair: **the reviewer probe artifact only.** It does not touch,
and does not re-open, the acquisition receipt, the downloaded model, the pinned
source or any adapter. `build/eod-model-acquisition/guarded-fetch.ts` is
byte-for-byte the same file the reviewer imported (`sha256
a0febd229b5e9452094ef13c1bd776b2aa58a586be71c5e1359c792d3347afa1`, mtime still
`2026-10-03 17:58:27`); the 13 probe cases, the decisions they reach, the
control flow and the exit code are all unchanged.

## What was wrong

The reviewer was held on proof lint, and `docs/v2/evidence/` is not exempt from
`eslint.config.js`. The reviewer's own probe violated two rules:

- `no-console` at `guard-probe.ts:45` and `:47` — `console.log` is an error
  everywhere `warn`/`error` are the only allowed methods.
- scratch discipline — the probe's redaction log was written to
  `/tmp/opencode/guard-probe-egress.jsonl`, i.e. **outside** the repository,
  where nothing ignores, rotates or cleans it.

The first is the lint blocker. The second is a containment problem: a reviewer
re-running the artifact would write clinical-adjacent egress records to a path
outside the project. Both are fixed here; neither changes what the probe
observes.

## The repair (`docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts`)

Full diff against the reviewer's version — four hunks, nothing else:

```
+import { format } from 'node:util';
+
-const log = '/tmp/opencode/guard-probe-egress.jsonl';
+const log = 'build/eod-model-probe-repair/guard-probe-egress.jsonl';

-  console.log(`${label.padEnd(26)} -> ${outcome.padEnd(60)} fetchReached=${String(socketOpened)}`);
+  const line = `${label.padEnd(26)} -> ${outcome.padEnd(60)} fetchReached=${String(socketOpened)}`;
+  process.stdout.write(format('%s\n', line));

-console.log(`total fetchReached=${String(calls.length)}`);
+process.stdout.write(format('%s\n', `total fetchReached=${String(calls.length)}`));
```

`console.log(x)` writes `x + '\n'`; `process.stdout.write(format('%s\n', x))`
writes the identical bytes. The `%s` specifier is deliberate: `util.format`
interprets `%` in a bare first argument, and a URL can contain one. The
expression statement's value (`undefined` vs `true`) is discarded either way, so
nothing downstream can observe it.

The log path is repo-root relative and the directory is created by the replay
harness **before** any write (`mkdirSync(..., { recursive: true })`), because
`appendFileSync` will not create a parent and inventing a directory inside the
probe would have been a control-flow change. A reviewer re-running the probe
must therefore run it from the repo root with that directory present — which is
exactly what `replay.mjs` does.

## Replay proof (`replay.mjs`, results in `results/`)

`BEFORE` is the reviewer's probe, snapshotted **before** the edit and differing
only in the log-path line (`before-probe.ts`). Adapting only that line is what
keeps the comparison honest: running the reviewer's file verbatim would write
outside the repository again. Both runs use the synthetic `globalThis.fetch`
recorder the probe installs itself, so no socket opens and no model, network,
Ollama, downloader, native or app surface is touched.

| Run | Command | exit | stdout | stderr |
| --- | --- | --- | --- | --- |
| BEFORE | `npx tsx docs/v2/evidence/english-eod-model-probe-repair/before-probe.ts` | 0 | 1601 B | 0 B |
| AFTER | `npx tsx docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts` | 0 | 1601 B | 0 B |

- stdout byte-identical BEFORE ≡ AFTER.
- Both byte-identical to the reviewer's already-recorded
  `guard-probe-output.txt` — so the recorded evidence still describes the
  repaired artifact, and no re-recording was needed.
- 14 lines, still ending `total fetchReached=4`: the four metadata/allow
  decisions and the nine refusals are unchanged, including `/api/pull`,
  `/api/generate` and `/api/chat` failing before a socket.

### Negative controls — each one must be caught

| Control | Mutation | Result |
| --- | --- | --- |
| NC1 channel | `process.stdout.write` → `process.stderr.write` | caught: stdout 0 B, and AFTER's stdout reproduces exactly on stderr |
| NC2 decision | one refused loopback case's path changed so it is allowed | caught: 1581 B, same 14 lines, only that decision and the total moved |
| NC3 containment | static: a probe source naming an outside log path | caught; and the control is never executed, because executing it would write outside the repo |
| NC4 lint | only the two prints reverted, same file otherwise | caught: `no-console` twice, so the "0 remaining" claim above is a measurement, not an absence |

NC1 proves the stdout capture is real (bytes are compared, not a summary).
NC2 proves the comparison is sensitive to the *decisions*, not to a byte count
or a line count. NC3 proves the containment predicate is not vacuous. NC4
proves the lint claim discriminates: `build/**` is ESLint-ignored, so the
control is linted with `--no-ignore` — without that flag it would report
nothing and prove nothing.

### Scope-hygiene controls

- No `*.jsonl` egress log was read, copied, exported or printed. The adapter
  writes them; the harness only asks whether the file exists and asks git
  whether it is ignored.
- `git check-ignore -v` → `.gitignore:55:build/` covers
  `build/eod-model-probe-repair/guard-probe-egress.jsonl`.
- `git status --porcelain` shows no scratch path.
- Nothing outside the repository was created, read, modified or deleted. The
  reviewer's `/tmp/opencode/guard-probe-egress.jsonl` is **left exactly as it
  is** — not deleted, not read, not copied. Deleting it would have been a
  second, silent breach.

### Scoped lint / format

```
npx eslint docs/v2/evidence/english-eod-model-probe-repair/replay.mjs   → exit 0, no findings
npx prettier --check <the three touched files>                          → exit 0
AFTER  lint: {"no-restricted-syntax":7}      (was 9: the 7 below plus no-console x2)
```

The two `no-console` errors the repair targets are gone and nothing else was
introduced (NC4 above re-measures the "before"). `before-probe.ts` — a new file
in this directory, kept as the left side of the replay — carries an
`eslint-disable` header so the recorded before-state is not a second offender
in `eslint .`; it changes no output, and the replay proves that (BEFORE stdout
is byte-identical to the reviewer's recorded output).

## Residual, for the reviewer to decide

Seven `no-restricted-syntax` findings remain in the probe, all of them the
non-loopback URL literals in the **case table** — the hosts the probe exists to
prove are refused (`huggingface.co`, `us.aws.cdn.hf.co`, `evil.example.com`,
plus the port/user-info/fragment variants). Rewriting or dropping them would
delete the evidence, and it is outside this repair's write scope, so they are
reported rather than fixed. If packet integration wants a lint-clean file, the
options are an evidence-scoped ESLint override for
`docs/v2/evidence/**/*.ts` or a reviewer ruling on those seven lines — a
coordinator decision, not a mechanical one.

No acceptance row was touched. Nothing was staged, committed or moved with
`git mv`.

## Files

Written:

- `docs/v2/evidence/english-eod-model-acquisition-ir/guard-probe.ts` (edited:
  the two prints and the log path only)
- `docs/v2/evidence/english-eod-model-probe-repair/before-probe.ts`
- `docs/v2/evidence/english-eod-model-probe-repair/replay.mjs`
- `docs/v2/evidence/english-eod-model-probe-repair/results/*` (synthetic
  stdout/stderr only, no egress log)
- `docs/v2/evidence/english-eod-model-probe-repair/probe-repair-replay.md`
  (this file)

Scratch, git-ignored, never in the commit: `build/eod-model-probe-repair/`.

Untouched: the adapter, the receipt, the model cache, the catalogue, the pinned
source, `docs/v2/state/reviews/english-eod-model-acquisition-ir.md`, and
everything outside the repository.
