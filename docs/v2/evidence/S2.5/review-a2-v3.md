# S2.5 implementation review, attempt 2 — row V3 (reviewer's own run)

Reviewer run. Not the implementer's file.

- Working directory: repository root
- Tree: `feature/v2`, clean (see `review-a2-head-discrepancy.md`)
- Start: 2026-09-26T20:14:37Z  End: 2026-09-26T20:14:41Z
- Node: `v24.19.0`, printed by the row

## Command, exactly as the row writes it

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && npx vitest run server/src shared/src
```

## Exit code observed

`npx vitest run server/src shared/src` → **0**

## Counts, from the run's own summary

```
 Test Files  92 passed (92)
      Tests  1340 passed (1340)
   Duration  4.15s (transform 2.22s, setup 0ms, import 10.22s, tests 12.62s, environment 4ms)
effective time zone: America/Mexico_City (TZ=<unset>)
```

The row's floor, measured at this card's base commit, is **90 files / 1304
tests**. Observed **92 / 1340**.

The row says the named figure is a floor and not a ceiling, and that a test file
added after the base commit counts towards it and must pass. The reviewer
checked which two files account for the difference rather than assuming:

- `server/src/http/locale.test.ts` — the one new test file this card creates,
  licensed by name in May edit.
- `server/src/routes/licenses.test.ts` grew cases; it is a file already counted.

That accounts for the file delta without inventing anything. The row also says
"fewer files or tests than the figure, or any `skipped`, is a `FAIL`". Observed
is more, and **zero `skipped`** — the summary line reads `1340 passed (1340)`
with no skipped or todo segment.

## Isolation

Per the dispatch's closing paragraph, this row is the only one that binds a
socket: `server/src/test/real-socket-guard.test.ts:27` listens on **7812**
(`APUNTA_PORT` overrides), inside C-ISO@1's 7800–7889 band. It is in-process
vitest. Nothing launched an Apunta server, no browser was opened, **7717 was
never contacted**, and the only databases are the tests' own
`mkdtempSync(join(tmpdir(), 'apunta-test-'))` directories. HS-1 and HS-2 are
respected, and the card's assigned sandbox port **7835** stayed unused, as the
row requires.

## One thing worth recording, not a failure

The run's output includes pino lines from a deliberate error-path test
(`hostname` and `pid` fields present). They are **not** reproduced here: this
file is committed, and RUN-CONFIG §4 forbids a hostname in committed evidence.
The reviewer read them in the run folder and they say nothing the row turns on.

**Row V3: PASS, exit code 0.**
