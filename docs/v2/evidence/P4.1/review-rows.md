# P4.1 attempt 2 — implementation review, rows re-run

- **Card:** P4.1 Acquisition hardening and model readiness, attempt 2 of 3
- **Role:** INDEPENDENT IMPLEMENTATION REVIEWER
- **Base / head reviewed:** `104501d` … `463215b`
- **Node used:** the repo's own — `export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`, `node -v` → `v24.19.0`, `npm -v` → `11.17.0`
- **Working directory for every row:** repository root
- **No sandbox run folder was needed** (AM-025): nothing in any row launches
  anything, opens a database or binds a port. Port 7840 was never bound and 7717
  was never contacted.

## Where the tip was, and what that means for these rows

`git log -1` at the start of this review was `6eff28f` ("Dim the settings
backdrop to black and colour the modal like Claude's"), **not** `463215b`.
`463215b` is an **ancestor** of the current tip, and `104501d` is too
(`git merge-base --is-ancestor`, both exit 0). The tip had moved past the head
this dispatch was generated for, which is expected: an owner-run UI agent had
been committing in `web/**` (`a7e8197`, `4fefa30`) and S2.5's final attempt in
`server/` and `shared/`. All three rows below were re-run **at the current tip**,
and the diff reviewed is the implementer's own, isolated below.

## The implementer's own commits, isolated

`104501d..463215b` also contains four commits that are not this card's
(`18d5d8f`, `5a4b79b`, `cbb7bbd`, `f1a8bba` — the coordinator's; `a7e8197`,
`4fefa30` — the `web/**` agent's). The implementer's work is exactly three
commits, `47bc96b` + `c2eb638` + `463215b`, whose combined parent range
`4fefa30..463215b` is:

```
M docs/v2/evidence/P4.1/redirects.md
M docs/v2/evidence/P4.1/v1.md
M docs/v2/evidence/P4.1/v2.md
M docs/v2/evidence/P4.1/v3.md
M installer/src/catalog.test.ts
M installer/src/catalog.ts
M installer/src/download.test.ts
M installer/src/download.ts
M installer/src/ollama.test.ts
M installer/src/ollama.ts
A installer/src/readiness.test.ts
A installer/src/readiness.ts
M installer/src/run.test.ts
M installer/src/run.ts
```

Ten files in `installer/src/**` and four evidence records, which is what the
coordinator had already verified. `scripts/v2/probe-redirects.mjs` is **not** in
it: it was committed at `b18e03f`, an ancestor of the base `104501d`, so it is
attempt 1's file. It is nonetheless a file this card owns and it is what row V2
runs, so it was reviewed too (see `review-probe.md`).

## No environment collision occurred

No row was red at the current tip, in `installer/` or anywhere else, so the
one-re-run rule never had to be used. `npm run lint` and `npm run typecheck`
were both green over the `web/**` and `server/` commits sitting in the tree, and
`web/src/lib/appearance.test.ts` was not in any row's path.

---

## V1 — installer suite, with the collection tripwire

**Command (verbatim from the card):**

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run build:shared && npx vitest run installer/src --reporter=verbose
```

- **Start (UTC):** 2026-09-27T00:44:24Z
- **End (UTC):** 2026-09-27T00:44:25Z
- **Exit code:** `npm run build:shared` **0**; `npx vitest run installer/src --reporter=verbose` **0**
- **Status: PASS**

**My own numbers, from my own run:**

```
 Test Files  13 passed (13)
      Tests  206 passed (206)
```

`readiness.test.ts` is among the thirteen, and the tripwire is satisfied in the
direction that matters: 13 files / 206 tests, where the base collects 12 / 130.
The thirteen files are `bytes`, `catalog`, `cli`, `containment`, `download`,
`errors`, `ollama`, `package-script`, `plan`, `protocol`, `readiness`,
`resume`, `run`.

**The 23 cases of Steps 3's table, each mapped to a named, passing test I read
in the verbose output or the test source:**

| # | Case | The test that carries it |
| --- | --- | --- |
| 1 | approved direct download | `download.test.ts` "downloads to a .part file…" — `expect(calls).toHaveLength(1)`, `calls[0].url === URL`, `headers {}`; plus "leaves a receipt for the committed file and no receipt for the part" |
| 2 | approved redirect | "follows an admitted redirect, byte for byte, carrying no header of its own" — `calls.map(url) === [URL, signed]`, query string unchanged, `calls[1].headers` `{}` |
| 3 | redirect to an unlisted host | "refuses a redirect to an unlisted host, and never requests it" — `calls` length 1, the unlisted URL in none |
| 4 | `http:` redirect | "refuses an http: redirect and puts the exact Location in the message" — `calls` length 1 |
| 5 | user-info URL | "refuses a user-info URL with no request at all" — `expect(calls).toEqual([])` |
| 6 | port 8443 | "refuses port 8443 with no request at all" — `expect(calls).toEqual([])` |
| 7 | fragment | "refuses a fragment in the URL with no request at all" — `expect(calls).toEqual([])` |
| 8 | query on a row admitting none | "refuses any query on an artifact that admits none, with no request at all" — `expect(calls).toEqual([])` |
| 8a | names all on the cell | `run.test.ts` "admits the enumerated query on a redirect, and completes the download" |
| 8b | one name outside the cell | "refuses a query carrying one name outside the list, naming it and not its value" — `refusal: 'query_key_not_allowed'`, message contains `extra`, **not** `never-shown`, `expect(calls).toEqual([])` |
| 9 | redirect loop | "refuses a redirect loop and never requests the repeated URL twice" — `calls` length 2 |
| 10 | 5 hops | "follows five hops and commits the file" — `expect(calls).toHaveLength(6)` |
| 11 | 6 hops | "refuses a sixth hop and never requests the address it named" — 6 calls, `hops[5]` requested `false` |
| 12 | no custom headers | "sends Range to the first host only, and re-requests the whole file at the new one" — `calls[0].headers === { range: 'bytes=100-' }`, `calls[1].headers === {}` |
| 13 | checksum mismatch | "leaves neither a part file nor a receipt behind after a discard" + `run.test.ts` "leaves no file and no receipt when the bytes do not match" |
| 14 | interrupted `.part` resume | "asks for the rest, gets 206, appends, verifies, commits and records a receipt" |
| 15 | 11-byte file | `readiness.test.ts` "calls an 11-byte file at the model path a size_mismatch" + `run.test.ts` "treats a file at the model path that is not the model as absent, and repairs nothing" |
| 16 | zero-byte file | "calls a zero-byte file a size_mismatch rather than missing" |
| 17 | directory / symlink to one | "calls a directory at the path not_a_regular_file", "calls a symlink to a directory the same, and does not follow it" |
| 18 | stale receipt | "re-hashes a file whose mtime moved since its receipt was written", "…whose inode changed…", "treats a receipt whose digest disagrees with the pin as no receipt at all" |
| 19 | valid receipt | "believes a receipt that matches the file it describes, and hashes nothing" + `run.test.ts` "does nothing and reports ready when both models are already there" |
| 20 | `sha256: null` | "falls back to the SHA-1 when the SHA-256 is null, and records algorithm sha1", "is no_pinned_hash, and never hashed" + `run.test.ts` "records the SHA-1 when the entry pins no SHA-256", "issues no request at all for an entry that pins no digest" |
| 21 | dangling `.part` | "is a dangling_part when nothing records it" |
| 22 | sidecar pinning an older file | "is a stale_pin when the sidecar names an address the catalogue no longer pins", "…a checksum…" |
| 23 | rule 7's digest | `ollama.test.ts` "reads one /api/show after a successful pull, and reports the digest", "never removes, replaces or re-pulls anything" + `run.test.ts` "issues no pull at all for a tag the runtime already reports", "names the pulled tag and the digest the runtime reports for it" |

**Nothing was skipped to make this green.** `grep -rn "\.only\|\.skip\|\.todo"
installer/src/*.test.ts` → no match. Comparing `it(` titles between base and
head per file, three titles disappeared and each is accounted for in
`review-deviations.md` §6 — none of them is a deleted check.

---

## V2 — the redirect probe

**Command (verbatim from the card):**

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run build:shared && npm run build --workspace @apunta/installer && node scripts/v2/probe-redirects.mjs
```

- **Start (UTC):** 2026-09-27T00:44:38Z
- **End (UTC):** 2026-09-27T00:44:40Z
- **Exit codes:** `build:shared` **0**; `build --workspace @apunta/installer` **0**; `node scripts/v2/probe-redirects.mjs` **0**
- **Status: PASS**

Console output, in full:

```
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.en.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base-q5_1.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small-q5_1.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q5_0.bin
HEAD https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo-q8_0.bin

wrote 7 artifacts to docs/v2/evidence/P4.1/redirects.md
redirect hosts observed: us.aws.cdn.hf.co
transport failures: 0
```

**Seven requests, one host contacted, one host observed, 0 hops followed, 0
bytes, 0 redirects followed, 0 transport failures.** Seven artifacts, six
distinct files, all present whether or not they redirected — all seven answered
`302`.

**The script wrote the file, and my run reproduces the committed record.** This
is the strongest form the row allows. Normalising timestamps out of both and
diffing:

```
$ sed -E 's/2026-09-2[0-9]T[0-9:.]+Z/<TS>/g' <committed> > a.norm
$ sed -E 's/2026-09-2[0-9]T[0-9:.]+Z/<TS>/g' <my run>   > b.norm
$ diff a.norm b.norm
IDENTICAL apart from timestamps
```

Only the three date lines differ, and they differ only because the run is a
different run. My copy of the file as my run produced it is kept outside the
tree; the committed `docs/v2/evidence/P4.1/redirects.md` was **restored to the
implementer's record** afterwards and `git status -- docs/v2/evidence/P4.1/` is
clean, so the record of record is still the implementer's V2 run and not a
reviewer's re-run.

**The file is not a list of bare hostnames.** Per artifact it carries: the
method, the request URL, the response status, the `Location` host in hop order
with scheme, port, query verdict, user-info, fragment, the domain-rule verdict,
the exact `Location` with its query redacted, the hop count, the date, the
attribution to a single artifact, and `ACQUISITION.md` §1's item fields written
`not acquired — HEAD only, no bytes` with no size and no SHA-256 invented.

**Sanitisation, checked rather than assumed:** 14 occurrences of `<redacted>`;
no `os.hostname()`, no login name, no `~`, no `<sandbox>` path; the only paths in
the file are the repository-relative evidence path and the catalogue's own public
URLs.

**No query value is in it.** Per artifact the file records the parameter
**names** and nothing else:

```
  - query key names (values never read): `Expires`, `Hash-Algorithm`,
    `Key-Pair-Id`, `Policy`, `Signature`, `X-Xet-Cas-Uid`,
    `response-content-disposition`, `response-content-type`, `user_id`, `xip`
```

A repository-wide scan for a signed-parameter token
(`grep -rnE "(Signature|Expires|Key-Pair-Id|X-Amz-|Policy)=[A-Za-z0-9%._~+/=-]{12,}"`)
returns only three hits, all of them synthetic test fixtures
(`?Signature=never-shown`, `?Signature=abc`, `?Signature=never-returned-this`)
and one of those three is inside the *expected output* of a `safeUrl` test that
asserts the signature is **absent**. No value from a real signed URL exists
anywhere in the repository.

**One thing V2's own output did not catch** — the `unparseable` branch of the
probe pastes a raw `Location` verbatim, query and all, if that `Location` is not
parseable as a URL. A relative `Location` carrying a signature is exactly that
case, and `new URL('/ggml/resolve/main/x.bin?Expires=1789&Signature=AbCd…')`
throws `ERR_INVALID_URL`, which I observed. It did not fire in this run or in
the implementer's, and I did not observe it leak; it is a finding, not a row
failure. Detail and the one-line fix are in `review-probe.md`.

---

## V3 — lint and typecheck, and the row that also proves the probe holds no literal

**Command (verbatim from the card):**

```sh
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && npm run lint && npm run typecheck
```

- **Start (UTC):** 2026-09-27T00:45:02Z
- **End (UTC):** 2026-09-27T00:45:15Z
- **Exit codes:** `npm run lint` **0**; `npm run typecheck` **0**
- **Status: PASS**

`npm run lint` is five commands; all five ran, and the tail of the log is
their own output:

```
Checking formatting...
All matched files use Prettier code style!
THIRD-PARTY-LICENSES.md lists all 111 shipped packages.
TOTAL 0
```

`TOTAL 0` is `check-ui-strings.mjs`, green at the current tip over the
`web/**` commits in the tree. `npm run typecheck` printed no diagnostic in any
workspace — installer, shared, server, web, tools, e2e. In particular there is
no error from widening `ProbedState` or `PlanInput`, which is the failure Fixed
decision 3 exists to prevent: `ProbedState` still has its three booleans and
gained no member, and `installer/src/plan.ts` and `installer/src/protocol.ts`
are byte-identical to the base (`git diff --name-only 104501d..463215b` returns
nothing for either).

**The row's second job, proved independently rather than taken on trust.** The
card says a URL literal in `scripts/v2/probe-redirects.mjs` must fail
`no-restricted-syntax` here, and that a failure there is a defect in the script
rather than a reason to touch `eslint.config.js`. I proved both halves without
editing anything in the repository, by feeding eslint the file on stdin under the
probe's own filename:

```
$ printf 'const u = "https://huggingface.co/x/y.bin";\nexport default u;\n' \
    | npx eslint --stdin --stdin-filename scripts/v2/probe-redirects.mjs
  1:11  error  No outbound URLs: Apunta may only talk to 127.0.0.1/localhost/::1
             (CLAUDE.md hard rule 1)  no-restricted-syntax
✖ 1 problem (1 error, 0 warnings)
eslint exit 1
```

So the selector really does cover the probe, and the guard is live rather than
merely configured. The real file carries no literal
(`grep -nE 'https?://' scripts/v2/probe-redirects.mjs` → no match, grep exit 1),
and `git diff 104501d..463215b -- eslint.config.js` is empty, so "the one
exemption" is still one file and still `installer/src/catalog.ts`.

---

## Files this review wrote

- `docs/v2/evidence/P4.1/review-rows.md` — this file
- `docs/v2/evidence/P4.1/review-security.md` — the three security questions
- `docs/v2/evidence/P4.1/review-probe.md` — the probe's own soundness, including
  the one defect found
- `docs/v2/evidence/P4.1/review-deviations.md` — a ruling on each of the eight
  deviations and the one flagged reading
- `docs/v2/state/reviews/P4.1-impl.md` — the review

No code was edited. Nothing was committed.
