# P0.4 — the eight invocations

Every row is one separate process: one `npm run eval` invocation, `--runs 1`,
all fixtures of one corpus, nothing shared between invocations except the model
in Ollama's cache. C-EVAL@1 §6 asks for 4 separate invocations per
configuration and treats them as repeatability evidence, not as independent
samples; the numbers land in `../../BASELINE.md`.

Identity for all eight — commit, model digest, inference options, prompt-set and
corpus hashes, hardware — is in `environment.md`.

## Exit codes, and why V1 is 1

The card's verification table expects exit 0. The eval CLI's own contract is
that in a **real** run a gating failure *is* the finding, and the exit status
says so (`server/src/eval/cli.ts`: `process.exit(gated ? 1 : 0)`), while in fake
mode it is the harness sensitivity check that decides. So:

| Corpus | Exit | Reading |
| --- | --- | --- |
| V1 `e2e/fixtures/eval` | **1** on all four invocations | 4 of 20 runs gated (F1 banned string ×3, F6 unsupported conclusion ×1). The run worked; the measurement found fabrication. |
| V2 `e2e/fixtures/eval-owner` | **0** on all four invocations | 0 of 4 runs gated. |

This is a finding, not a failure of the command, and no threshold was touched to
change it (HS-7). Every invocation wrote its report, which is the card's actual
requirement.

## One addition to the literal command

The card's command has no `--out`. `--out docs/v2/evidence/P0.4/reports/<file>.md`
was added so the report is captured as evidence instead of only scrolling past in
a terminal. It changes no measurement: `cli.ts` writes the same `result.markdown`
to stdout and, when `--out` is given, writes that identical string to the file
(`cli.ts:230-237`). The content of the eight reports is byte-for-byte what the
card's command prints.

## Raw logs

Full stdout and stderr, including the npm lifecycle noise, stay in the driver's
temporary folder and are not committed. The excerpts below are the parts that
carry evidence.

## Summary

| # | Corpus | Corpus dir | Start (UTC) | End (UTC) | Elapsed | Exit | Report |
| --- | --- | --- | --- | --- | --- | --- | --- |
| V1-1 | V1 · SOAP + intake | `e2e/fixtures/eval` | 2026-09-26T07:58:33Z | 2026-09-26T07:59:33Z | 60s | 1 | [`reports/v1-invocation-1.md`](reports/v1-invocation-1.md) |
| V1-2 | V1 · SOAP + intake | `e2e/fixtures/eval` | 2026-09-26T07:59:33Z | 2026-09-26T08:00:28Z | 55s | 1 | [`reports/v1-invocation-2.md`](reports/v1-invocation-2.md) |
| V1-3 | V1 · SOAP + intake | `e2e/fixtures/eval` | 2026-09-26T08:00:28Z | 2026-09-26T08:01:18Z | 50s | 1 | [`reports/v1-invocation-3.md`](reports/v1-invocation-3.md) |
| V1-4 | V1 · SOAP + intake | `e2e/fixtures/eval` | 2026-09-26T08:02:58Z | 2026-09-26T08:03:53Z | 55s | 1 | [`reports/v1-invocation-4.md`](reports/v1-invocation-4.md) |
| V2-1 | V2 · owner format | `e2e/fixtures/eval-owner` | 2026-09-26T08:03:53Z | 2026-09-26T08:04:02Z | 9s | 0 | [`reports/v2-invocation-1.md`](reports/v2-invocation-1.md) |
| V2-2 | V2 · owner format | `e2e/fixtures/eval-owner` | 2026-09-26T08:04:02Z | 2026-09-26T08:04:12Z | 10s | 0 | [`reports/v2-invocation-2.md`](reports/v2-invocation-2.md) |
| V2-3 | V2 · owner format | `e2e/fixtures/eval-owner` | 2026-09-26T08:04:12Z | 2026-09-26T08:04:21Z | 9s | 0 | [`reports/v2-invocation-3.md`](reports/v2-invocation-3.md) |
| V2-4 | V2 · owner format | `e2e/fixtures/eval-owner` | 2026-09-26T08:04:21Z | 2026-09-26T08:04:30Z | 9s | 0 | [`reports/v2-invocation-4.md`](reports/v2-invocation-4.md) |

Working directory for every row: the repository root, written `~/Projects/Apunta`.
Node v24.19.0 from `~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin`, first
on `PATH`.

Exact commands (the first eight lines of each are `npm run build:shared`, which
`npm run eval` always runs first; it is elided here and included in the excerpts):

```sh
# V1, run four times, once per invocation
npm run eval -- --models qwen3.5:4b-q4_K_M --corpus e2e/fixtures/eval \
  --runs 1 --ollama-url http://127.0.0.1:11434 \
  --out docs/v2/evidence/P0.4/reports/v1-invocation-N.md

# V2, run four times, once per invocation
npm run eval -- --models qwen3.5:4b-q4_K_M --corpus e2e/fixtures/eval-owner \
  --runs 1 --ollama-url http://127.0.0.1:11434 \
  --out docs/v2/evidence/P0.4/reports/v2-invocation-N.md
```

`--models` was passed explicitly on every invocation, never inferred: with the
flag omitted the CLI falls back to the machine's memory picker (`cli.ts:175`),
which is a different model on a different machine and would not be this baseline.
No model was pulled, removed or replaced (HS-3); `ollama list` was run first and
showed the tag already present.

## A note on V1 invocation 3

The first driver's process group was killed by the tool session after V1
invocation 2 (60s of work per invocation does not fit one tool call). V1
invocation 3 had already been started and completed normally — its report holds
all 20 fixtures and the closing fixture list — but the driver died before it could
write its own end timestamp. The report's own header supplies the start
(`Run 2026-09-26T08:00:28.973Z`) and elapsed (50.0s), the report's mtime gives
the write time, and the log ends in `npm error code 1`, so start, end, elapsed
and exit code for that row are reconstructed rather than driver-written. Its exit
code is 1 for the same reason as the other three V1 rows: 4 gated runs. The
remaining five invocations ran under a second, fully detached driver and are
driver-recorded. Nothing was re-run to obtain uniform bookkeeping; the
measurement stands as it happened.

## V1 invocation 1

- Corpus: `e2e/fixtures/eval`
- Command: as above, with `--out docs/v2/evidence/P0.4/reports/v1-invocation-1.md`
- Working directory: `~/Projects/Apunta`
- Start: 2026-09-26T07:58:33Z · End: 2026-09-26T07:59:33Z · Elapsed: 60s · Exit code: 1
- Report: [`reports/v1-invocation-1.md`](reports/v1-invocation-1.md) (7254 bytes)

Excerpt:

```
Run 2026-09-26T07:58:34.118Z · 20 fixtures · qwen3.5:4b-q4_K_M x1 · 59.2s

| qwen3.5:4b-q4_K_M | **20.0%** (4/20) | 4/20 | 3 | 1 | 0 |
| qwen3.5:4b-q4_K_M | 84.8% (n=283) | 85.0% (n=20) | 100.0% (n=9) | 0.69x |
| qwen3.5:4b-q4_K_M | 3.0s | 2444 | 212 | 89.2 | 0 | 0 |
```

## V1 invocation 2

- Corpus: `e2e/fixtures/eval`
- Command: as above, with `--out docs/v2/evidence/P0.4/reports/v1-invocation-2.md`
- Working directory: `~/Projects/Apunta`
- Start: 2026-09-26T07:59:33Z · End: 2026-09-26T08:00:28Z · Elapsed: 55s · Exit code: 1
- Report: [`reports/v1-invocation-2.md`](reports/v1-invocation-2.md) (7252 bytes)

Excerpt:

```
Run 2026-09-26T07:59:34.130Z · 20 fixtures · qwen3.5:4b-q4_K_M x1 · 54.1s

| qwen3.5:4b-q4_K_M | **20.0%** (4/20) | 4/20 | 3 | 1 | 0 |
| qwen3.5:4b-q4_K_M | 84.5% (n=283) | 85.0% (n=20) | 88.9% (n=9) | 0.69x |
| qwen3.5:4b-q4_K_M | 2.7s | 2444 | 208 | 91.7 | 0 | 0 |
```

## V1 invocation 3

- Corpus: `e2e/fixtures/eval`
- Command: as above, with `--out docs/v2/evidence/P0.4/reports/v1-invocation-3.md`
- Working directory: `~/Projects/Apunta`
- Start: 2026-09-26T08:00:28Z · End: 2026-09-26T08:01:18Z · Elapsed: 50s · Exit code: 1 (reconstructed, see above)
- Report: [`reports/v1-invocation-3.md`](reports/v1-invocation-3.md) (7252 bytes)

Excerpt:

```
Run 2026-09-26T08:00:28.973Z · 20 fixtures · qwen3.5:4b-q4_K_M x1 · 50.0s

| qwen3.5:4b-q4_K_M | **20.0%** (4/20) | 4/20 | 3 | 1 | 0 |
| qwen3.5:4b-q4_K_M | 84.5% (n=283) | 85.0% (n=20) | 88.9% (n=9) | 0.69x |
| qwen3.5:4b-q4_K_M | 2.5s | 2444 | 208 | 97.5 | 0 | 0 |
```

## V1 invocation 4

- Corpus: `e2e/fixtures/eval`
- Command: as above, with `--out docs/v2/evidence/P0.4/reports/v1-invocation-4.md`
- Working directory: `~/Projects/Apunta`
- Start: 2026-09-26T08:02:58Z · End: 2026-09-26T08:03:53Z · Elapsed: 55s · Exit code: 1
- Report: [`reports/v1-invocation-4.md`](reports/v1-invocation-4.md) (7252 bytes)

Excerpt:

```
Run 2026-09-26T08:02:59.815Z · 20 fixtures · qwen3.5:4b-q4_K_M x1 · 53.3s

| qwen3.5:4b-q4_K_M | **20.0%** (4/20) | 4/20 | 3 | 1 | 0 |
| qwen3.5:4b-q4_K_M | 84.5% (n=283) | 85.0% (n=20) | 88.9% (n=9) | 0.69x |
| qwen3.5:4b-q4_K_M | 2.7s | 2444 | 208 | 91.4 | 0 | 0 |
```

## V2 invocation 1

- Corpus: `e2e/fixtures/eval-owner`
- Command: as above, with `--out docs/v2/evidence/P0.4/reports/v2-invocation-1.md`
- Working directory: `~/Projects/Apunta`
- Start: 2026-09-26T08:03:53Z · End: 2026-09-26T08:04:02Z · Elapsed: 9s · Exit code: 0
- Report: [`reports/v2-invocation-1.md`](reports/v2-invocation-1.md) (5005 bytes)

Excerpt:

```
Run 2026-09-26T08:03:54.254Z · 4 fixtures · qwen3.5:4b-q4_K_M x1 · 8.4s

| qwen3.5:4b-q4_K_M | **0.0%** (0/4) | 0/4 | 0 | 0 | 0 |
| qwen3.5:4b-q4_K_M | 90.0% (n=20) | 100.0% (n=4) | n/a (n=0) | 1.21x |
| qwen3.5:4b-q4_K_M | 2.1s | 3586 | 149 | 92.9 | 0 | 0 |
```

## V2 invocation 2

- Corpus: `e2e/fixtures/eval-owner`
- Command: as above, with `--out docs/v2/evidence/P0.4/reports/v2-invocation-2.md`
- Working directory: `~/Projects/Apunta`
- Start: 2026-09-26T08:04:02Z · End: 2026-09-26T08:04:12Z · Elapsed: 10s · Exit code: 0
- Report: [`reports/v2-invocation-2.md`](reports/v2-invocation-2.md) (5005 bytes)

Excerpt:

```
Run 2026-09-26T08:04:03.729Z · 4 fixtures · qwen3.5:4b-q4_K_M x1 · 8.2s

| qwen3.5:4b-q4_K_M | **0.0%** (0/4) | 0/4 | 0 | 0 | 0 |
| qwen3.5:4b-q4_K_M | 90.0% (n=20) | 100.0% (n=4) | n/a (n=0) | 1.21x |
| qwen3.5:4b-q4_K_M | 2.1s | 3586 | 149 | 89.0 | 0 | 0 |
```

## V2 invocation 3

- Corpus: `e2e/fixtures/eval-owner`
- Command: as above, with `--out docs/v2/evidence/P0.4/reports/v2-invocation-3.md`
- Working directory: `~/Projects/Apunta`
- Start: 2026-09-26T08:04:12Z · End: 2026-09-26T08:04:21Z · Elapsed: 9s · Exit code: 0
- Report: [`reports/v2-invocation-3.md`](reports/v2-invocation-3.md) (5005 bytes)

Excerpt:

```
Run 2026-09-26T08:04:12.942Z · 4 fixtures · qwen3.5:4b-q4_K_M x1 · 8.3s

| qwen3.5:4b-q4_K_M | **0.0%** (0/4) | 0/4 | 0 | 0 | 0 |
| qwen3.5:4b-q4_K_M | 90.0% (n=20) | 100.0% (n=4) | n/a (n=0) | 1.21x |
| qwen3.5:4b-q4_K_M | 2.1s | 3586 | 149 | 86.6 | 0 | 0 |
```

## V2 invocation 4

- Corpus: `e2e/fixtures/eval-owner`
- Command: as above, with `--out docs/v2/evidence/P0.4/reports/v2-invocation-4.md`
- Working directory: `~/Projects/Apunta`
- Start: 2026-09-26T08:04:21Z · End: 2026-09-26T08:04:30Z · Elapsed: 9s · Exit code: 0
- Report: [`reports/v2-invocation-4.md`](reports/v2-invocation-4.md) (5005 bytes)

Excerpt:

```
Run 2026-09-26T08:04:22.837Z · 4 fixtures · qwen3.5:4b-q4_K_M x1 · 7.6s

| qwen3.5:4b-q4_K_M | **0.0%** (0/4) | 0/4 | 0 | 0 | 0 |
| qwen3.5:4b-q4_K_M | 90.0% (n=20) | 100.0% (n=4) | n/a (n=0) | 1.21x |
| qwen3.5:4b-q4_K_M | 1.9s | 3586 | 149 | 95.5 | 0 | 0 |
```
