# P4.1 — the probe's own soundness, and the one defect found

- **File:** `scripts/v2/probe-redirects.mjs` (400 lines)
- **Not in the diff under review.** It was committed at `b18e03f`, an ancestor of
  the review base `104501d`, so it is attempt 1's file. It is in the card's
  "May edit" list, it is what row V2 executes, and the brief for this review
  says to judge attempt 2 as *new* work and not to assume the earlier state was
  sound. So it was read and run.
- **Reviewed against:** the card's Egress section, stop conditions 1 and 4, and
  the same "no value is ever read" property the whole amendment rests on.

## What the probe gets right

Read line by line against the grant, all of this holds:

- **Seven requests, and the seven the grant names.** One `HEAD` per artifact:
  the two speech entries' one URL (asserted to be one URL at `:73-77`, which
  throws loudly rather than quietly under-collecting if the catalogue ever splits
  them — a genuinely good tripwire) and the six C-STT candidate paths built by
  substituting a filename into `SPEECH_MODEL.url`'s own path (`:80-84`).
- **`HEAD` only, `redirect: 'manual'`, and the `Location` is never followed.**
  `:130-135`. No response body is read anywhere.
- **No retry.** A transport failure is recorded as itself (`:136-137`) rather
  than retried against a host that might answer — the grant covers seven
  requests, not a second attempt.
- **A 30 s timeout per request** (`:59`, `:125-140`).
- **No credential, no query of its own, no fragment, no cookie jar, no custom
  header.** It sends only `method`, `redirect` and `signal`.
- **It holds no URL literal**, and proves it by construction: every URL is read
  out of the built catalogue. Confirmed independently in `review-rows.md` §V3 —
  a literal fed to eslint under this filename fails `no-restricted-syntax` with
  exit 1, and the real file has none.
- **Sanitisation by construction.** No `os.hostname()`, no login, no home or
  sandbox path reaches the output. The only paths written are the
  repository-relative evidence path and the catalogue's own public URLs.
- **The domain rule is the card's mechanical form** — `lower === suffix ||
  lower.endsWith('.' + suffix)` over `['huggingface.co', 'hf.co']` (`:151-154`),
  which is a dot boundary and cannot admit `hf.co.evil.test`.
- **Values are redacted, names are recorded** (`:162-173`, `:209`, `:213`,
  `:222-225`) — the same shape as the guard's, and it did the right thing in the
  run: 14 `<redacted>` occurrences, 7 query lines each carrying the ten names and
  no value.
- **It writes the file itself.** `redirects.md` is the run, and my re-run
  reproduced the committed record byte-for-byte apart from the three timestamps.

None of this is in question. What follows is the one thing that is.

---

## Finding: the `unparseable` branch pastes a raw `Location` into a committed file

**Where:** `scripts/v2/probe-redirects.mjs:249-251`, fed by the `catch` at
`:180-194` which keeps `raw` verbatim.

```js
if (location.unparseable) {
  lines.push(`  - raw: \`${location.raw}\``);
}
```

Every other place the probe writes a `Location` runs it through `redactQuery`
(`:278`) or writes only parsed fields. This one branch writes the raw string
untouched, query included.

**Why it is reachable.** A `Location` is not required by HTTP to be an absolute
URL; a relative reference is legal, and Node's `fetch` hands the header value
back exactly as the origin sent it. `describeLocation` decides how to describe
it with `new URL(raw)`, and a relative reference does not parse:

```
$ node -e 'try { new URL("/ggml/resolve/main/x.bin?Expires=1789&Signature=AbCdEf0123456789&Policy=zzz") }
           catch (e) { console.log("threw", e.code) }'
threw ERR_INVALID_URL
```

So an origin that answered `302` with a same-origin relative `Location` carrying
a signed query would take that branch, and the signature would be written
verbatim into `docs/v2/evidence/P4.1/redirects.md` — a **committed** file, in a
repository whose hard rule 1 and whose whole acquisition design exist to keep
exactly that string out of it. A branch that has never fired is not a guard.

**Severity, stated honestly.** This is a latent defect, not an incident. It did
not fire in my run or in the implementer's: all seven `Location`s parsed, and
the file carries 14 `<redacted>` occurrences and no value. I did **not** observe
a leak and am not claiming one. But the card's own Egress section states the
sanitisation property as *"an observed query string is written `<redacted>`,
never pasted"*, and this branch is the one place where that sentence is false,
and it is false precisely for the input shape (a signed redirect) the card
cares most about.

**Why this is worth fixing rather than noting.** AM-042's entire safety argument
is that the ten *names* are public vocabulary and the *values* are secrets, and
that a signature must never reach the repository, the evidence, a log or an
error message. The installer half of that argument is airtight — see
`review-security.md` §§1a–1g. The probe half has one unguarded door, and the
probe is the program that goes to the network. A guard that is one `catch` away
from writing the secret is not a guard.

**What would make it pass.** One line, in the file's own idiom. The parsed
branch already redacts; the unparseable branch should do the same rather than
echo:

```js
if (location.unparseable) {
  lines.push(`  - raw: \`${redactQuery(location.raw)}\``);
}
```

`redactQuery` (`:222-225`) is already the function the parsed path uses, and
`describeLocation` already computes the names it can when a partial parse is
possible. Better still, the branch should also say *why* the record is
incomplete, so a reviewer can tell "the vendor sent something I could not
describe" from "there was nothing to describe" — the file already has that
vocabulary in the `refusals` array at `:191`.

**A test would keep it fixed.** The probe has no test file today, and this card's
May edit list does not name one, so adding `scripts/v2/probe-redirects.test.ts`
is a coordinator decision rather than this card's. Worth asking for: the branch
is otherwise only reachable against a real origin that happens to answer that
way, which is exactly the kind of thing that regresses silently. If the
coordinator would rather not widen May edit, the alternative is for the *next*
card that touches the probe to carry the assertion.

**Scope note.** This is not in the attempt-2 diff, it is not a row failure, and
it does not on its own make P4.1 unapprovable — nothing this card built leaks.
It is a finding against a file this card owns, reported because the brief asked
me to judge the earlier state rather than assume it, and because it is the one
place where the design's central promise is not kept.
