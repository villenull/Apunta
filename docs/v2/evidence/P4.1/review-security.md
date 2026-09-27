# P4.1 attempt 2 — the security question, in three parts

- **Card:** P4.1, attempt 2 of 3. **Role:** INDEPENDENT IMPLEMENTATION REVIEWER.
- **Base / head reviewed:** `104501d` … `463215b`
- **Node:** the repo's own v24.19.0
- **Method:** every probe below was written for this review and run against
  `installer/dist` (the built `installer/src`). Nothing in the repository was
  edited to produce any of it. One probe, the hop boundary, is reproduced from
  the card's own case names and confirmed independently in
  `review-rows.md` §V1.

The question AM-042 exists to answer is narrow and worth stating precisely
before answering it: a redirect may carry a query whose parameter **names** are
enumerated and whose **values** are never read. A signed-URL signature leaking
into a log, a receipt, an error message or the setup window would be the failure
this design exists to prevent, and **it would be invisible to every verification
row** — V1, V2 and V3 would all stay green. So none of the three rows above is
evidence for this. This file is.

---

## 1. No value is ever read, logged, recorded or compared

### 1a. The extraction cuts at the first `=`, so a value is never materialised

`installer/src/readiness.ts:116-134`, `queryParameterNames`:

```ts
const equals = pair.indexOf('=');
const name = equals === -1 ? pair : pair.slice(0, equals);
let decoded = name;
try { decoded = decodeURIComponent(name); } catch { /* left as it arrived */ }
```

The text after the first `=` of each pair is never read, decoded, stored,
returned or compared. The function's return type is `string[]` of names, so
there is no channel by which a value could travel. Observed:

```
queryParameterNames('?Signature=<32-char secret>')  =  ["Signature"]
```

A pair with **no** `=` contributes its whole text as a name. That is the one
place a value could in principle be mistaken for a name, and it fails closed:
`abc` alone is not on the list, so it is refused. Observed above (`name is a
value` → refused).

### 1b. `URLSearchParams` is used nowhere in the installer

The one API that would hand a parsed **value** to code is
`URLSearchParams`/`searchParams`. It appears in no non-test file in the package:

```
$ grep -rn "searchParams\|URLSearchParams" installer/src/*.ts | grep -v '\.test\.ts'
(no match)
```

The only decoding call in the whole package is the one on a **name**, above.

### 1c. Every URL that can reach a message is rendered through `safeUrl`

`safeUrl` (`readiness.ts:95-105`) keeps scheme, host, port and path — the facts a
refusal has to name — and replaces the query with `?<redacted>`. It also drops
user-info and the fragment, so a password in the authority and a token in the
fragment cannot survive either. It never decodes anything, so a percent-encoded
secret cannot reappear. Observed:

```
safeUrl('https://us.aws.cdn.hf.co/a/b.bin?Signature=<secret>&Expires=1')
  ->  https://us.aws.cdn.hf.co/a/b.bin?<redacted>
safeUrl('https://u:<secret>@hf.co/a?Signature=<secret>#<secret>')
  ->  https://hf.co/a?<redacted>
```

A string that is not a URL at all renders as `(not a URL at all)` rather than
being echoed, so a malformed address cannot smuggle itself out either.

### 1d. Every refusal sentence, with a live secret in the URL, is clean

Each of the nine refusal codes was provoked with a 32-character secret planted
in the query, in the user-info and in the fragment. The secret is
`SUPERSECRETSIGNATUREVALUE0DoNotLeak`. This is the check the card's design turns
on, so it was done against `assertRequestAllowed` directly:

| Refusal provoked | Secret in the message? | The sentence, as it reaches the wire |
| --- | --- | --- |
| `scheme_not_https` | **no** | `Refused the download address http://huggingface.co/a?<redacted>: only https: is allowed, and this one names http:` |
| `port_not_allowed` | **no** | `Refused the download address https://huggingface.co:8443/a?<redacted>: it names port 8443, and only 443 is allowed` |
| `user_info_present` | **no** | `Refused the download address https://huggingface.co/a?<redacted>: it carries a username or password, which Apunta never sends` |
| `fragment_present` | **no** | `Refused the download address https://huggingface.co/a?<redacted>: it carries a fragment, which is never sent to a server anyway` |
| `host_not_allowed` | **no** | `Refused the download address https://evil.example/a?<redacted>: that host is not on this artifact's list (huggingface.co)` |
| `query_not_allowed` | **no** | `Refused the download address https://huggingface.co/a?<redacted>: it carries a query, and this artifact's list allows no query at all` |
| `query_key_not_allowed` | **no** | `…its query carries the parameter "extra", which is not on this artifact's list of allowed parameter names` — the **name** is named, the value is not |
| `host_not_allowed` (redirect) | **no** | `Refused a redirect https://cdn.evil.example/a?<redacted>: that host is not on this artifact's list (us.aws.cdn.hf.co)` |

`too_many_hops` and `redirect_loop` name no URL at all
(`download.ts:141-146`, `download.ts:154-157`).

This matters because `describeFailure` (`errors.ts:108-125`) puts
`error.override` **verbatim** into `SetupFailure.detail`, which `runSetup` emits
as the `failed` event and which is written to stdout as JSON-lines and rendered
in the setup window. The refusal sentence *is* the wire. It carries no value.

### 1e. The one place a signed URL is written to disk is not one

`download.ts` interpolates a URL into an error message in exactly three places
— `download.ts:208`, `:211`, `:214` — and all three use `const url = options.url`
(`download.ts:201`), the **initial, catalogue-pinned** address, never
`current.href`. For A07 the catalogue URL carries no query at all, so those three
sentences cannot contain a signature even in the redirect case. This is also
*why* the sentence names the original address rather than the one that failed: a
`download_failed` after a redirect reports `HTTP 500 for https://huggingface.co/…`
when the 500 came from the CDN. That is a slightly imprecise sentence, and it is
the right trade in the direction that matters. **A reading, not a defect.**

The resume sidecar is written with the same `options.url` (`download.ts:225`,
`:259`, `:270`), and `classifyPart` compares it against `subject.url`. So the
`.part` sidecar on disk can never hold a signed address either. Observed: with a
signed on-list `Location` served, neither the `.part` nor its sidecar contained
the secret (`sidecar/part disk leak: false`).

### 1f. Nothing logs at all

```
$ grep -rn "console\.\|log(\|logger\|pino" installer/src/*.ts | grep -v '\.test\.ts'
(no match)
```

The installer writes NDJSON events to stdout and nothing else. There is no log
file, no logger and no telemetry in the package, so "never logged" is not a
promise about a code path — there is no such path.

### 1g. The repository, end to end

```
$ grep -rnE "(Signature|Expires|Key-Pair-Id|X-Amz-|Policy)=[A-Za-z0-9%._~+/=-]{12,}" . \
    | grep -v node_modules
docs/v2/evidence/P4.1/attempt2-partial.patch:446:+ … '?Signature=never-returned-this' …
installer/src/readiness.test.ts:442:          … '?Signature=never-returned-this' …
web/dist/assets/index-*.js                    (a minified build artefact; not a URL)
```

Three hits. Two are a synthetic fixture string in a test that asserts the value
is *not* returned, and the third is a `web/dist` bundle that matched for reasons
unrelated to any query. **No value from a real signed URL is in the repository,
in the evidence, in the return file or in any event.**

**Ruling on part 1: proven.** No value is read, and every surface that could
carry one is redacted or unreachable.

---

## 2. The check is on the name, and it cannot be widened

The check, `readiness.ts:245-252`, is a single expression:

```ts
for (const name of queryParameterNames(parsed.search)) {
  if (allowedQueryKeys.includes(name)) continue;
  throw new RequestRefusedError('query_key_not_allowed', …);
}
```

`Array.prototype.includes` — exact, case-sensitive, `SameValueZero`. There is no
`startsWith`, no `match`, no `RegExp`, no `toLowerCase`, no `normalize`, no
`trim`, no length or shape test anywhere in the file. `installer/src/readiness.ts`
contains exactly one `decodeURIComponent` and it is applied to a name.

**Thirty-nine adversarial names, all refused.** A name that passes and should
not, constructed:

```
 ok  expires=1                      refused (query_key_not_allowed)   <- case-folded
 ok  EXPIRES=1                      refused
 ok  Signature2=1                   refused                          <- suffix
 ok  Policy-=1                      refused                          <- prefix
 ok  signature=1                    refused                          <- case-folded
 ok  Hash_Algorithm=1               refused                          <- - to _
 ok  Hash-Algorithm-=1              refused
 ok  Signature.=1                   refused
 ok  Signature%00=1                 refused                          <- control char
 ok  =abc                           refused                          <- empty name
 ok  abc                            refused                          <- a value, alone
 ok  %26Signature=1                 refused                          <- & smuggled into a name
 ok  %2553ignature=1                refused                          <- double-encoded
 ok  Signa+ture=1                   refused                          <- + is not a space here
 ok  *=1                            refused                          <- wildcard
 ok  Sig*=1                         refused
 ok  .*=1                           refused
 ok  ../../Signature=1              refused
 ok  a%26Expires=1                  refused
 ok  Signature/=1                   refused
 ok  ==x                            refused
 ok  Signature%3D=1                 refused                          <- encoded '=' in the name
```

**All thirteen legitimate shapes admitted:** the ten names one at a time, all
ten together, the ten plus a repeat of one, and `Expires=1;extra=1`.

### The one normalisation that does exist, and why it is not a widening

`queryParameterNames` percent-decodes the **name** before testing it. So
`%53ignature=1` is admitted. Is that a name outside the list getting in?

No, and the reason is checkable rather than arguable. `URL.searchParams` is what
a server uses to read the name, and for each of these the name it reports is
*identical* to the decoded form the guard tested:

| In the query | The guard admits? | The name a **server** reads |
| --- | --- | --- |
| `%53ignature=1` | admitted | `Signature` |
| `Sign%61ture=1` | admitted | `Signature` |
| `%45xpires=1` | admitted | `Expires` |
| `user%5Fid=1` | admitted | `user_id` |
| `Policy=%2Ffoo` | admitted | `Policy` |

The decode makes the allow-list able to name what the server will actually see.
Without it the guard would be *stricter* than the server, and a real signed URL
whose vendor percent-encoded one name would be refused. The encoded forms that
would genuinely smuggle something through are all refused: `%26Signature` decodes
to `&Signature`, which is not on the list; `%2553ignature` decodes to
`%53ignature`, which is not on the list; and a *percent-encoded* newline,
`Signature%0A`, decodes to `Signature\n`, which is not on the list — verified,
refused. One decode, and the decoded name must equal a listed name exactly.

### Two shapes that look like widenings and are not

- **`Expires=1;extra=1` is admitted.** `;` is not a separator in WHATWG URL
  parsing, so this is *one* parameter named `Expires` whose value happens to
  contain a semicolon. Observed: `searchParams.keys()` → `["Expires"]`. The
  server sees one parameter named `Expires` too. Admitting it is correct;
  refusing it would be a check the vendor's real URL could not pass.
- **`Signature\n=1` and `Signature\t=1` are admitted**, because the URL standard
  strips raw tab, CR and LF *before* parsing, so the name is `Signature` on the
  wire. Observed: `new URL('…?Signature\n=1').search` → `"?Signature=1"`. Again
  the guard and the server agree, which is the only property that matters. Note
  the contrast with the percent-encoded `Signature%0A`, which is **refused** —
  the guard and the server agree in both directions.

**Correction I owe the record.** My first run of this harness reported four
"leaks": `Signature=1`, `Expires=1;extra=1`, `Signature\n=1`, `Signature\t=1`.
All four were errors in my own expectation list, not in the code — one entry
literally contained an allowed name, and the other three are the two shapes
above. I verified each against `new URL(...).searchParams` before drawing any
conclusion, and the table above is the corrected result. No finding in this
review rests on a probe I did not confirm.

**Ruling on part 2: proven.** Set membership against exactly the ten enumerated
names. No prefix, no wildcard, no case-folding, no trimming, no separator
invention, and the single normalisation that exists makes the guard agree with
the server rather than diverge from it.

---

## 3. The check runs before the URL is requested

`download.ts:94-99` guards the initial address before `fetchImpl` is even
resolved (`:101`), let alone called. `download.ts:147-152` guards each `Location`
against `new URL(location, current).href` before `hop += 1` (`:161`) and before
the loop's next `fetchImpl` (`:132`). There is no code path from a `Location` to
a socket that does not pass through the guard.

**Counted, not inferred.** A refusal that happened *after* asking would look
identical from the error alone, so every case below counts the requests an
injected `fetch` received.

**Off-list name on the initial URL** — 0 calls:

```
  off-list name, initial URL         calls=0  query_key_not_allowed  msg-leak=false
```

This is test row 8b's assertion, re-derived independently against
`installer/dist` rather than read out of the test suite.

**Off-list name on a redirect `Location`** — 1 call, the initial one only, and
the offending address in none of them:

```
  off-list name on a Location        calls=1  query_key_not_allowed  msg-leak=false  url-leak=false
```

**On-list signed `Location`, admitted** — 2 calls, and the value is present in
the second request *by necessity*, because that request has to go to the address
the vendor signed. It is present nowhere else:

```
  on-list signed Location admitted   calls=2  completed
      hop 1 url === signed (value present by necessity): true
      hop 1 headers: {}
      error-message leak: false   sidecar/part disk leak: false
```

**The remaining refusals, all at zero contact**, each provoked on the initial
address so that "before contact" is the thing measured:

```
 ok  unlisted host on the INITIAL url       calls=0  host_not_allowed
 ok  lookalike suffix on the INITIAL url    calls=0  host_not_allowed   (…hf.co.evil.test)
 ok  userinfo on the INITIAL url            calls=0  user_info_present
 ok  port 8443 on the INITIAL url           calls=0  port_not_allowed
 ok  fragment on the INITIAL url            calls=0  fragment_present
 ok  http on the INITIAL url                calls=0  scheme_not_https
 ok  any query when keys are empty          calls=0  query_not_allowed
 ok  443 explicit (must be allowed)         calls=1  completed
```

**The host check runs before the query check**, which is the card's own stated
ordering and the right one: a URL on a host Apunta will never contact is refused
without a single thing being learned about what its query says. Confirmed at
`readiness.ts:229-236` (host) before `:238-253` (query), and observed — the
`host_not_allowed` sentence for `https://evil.example/a?Signature=<secret>`
printed the host list and `<redacted>`, never the name or the value.

**Hop semantics, re-derived** (the card's cases 9, 10, 11, 12):

```
 ok  5 hops -> 6 calls, committed.            calls=6  threw=none
 ok  6 hops -> 6 calls then too_many_hops, 6th Location never requested.
                                               calls=6  threw=too_many_hops  sixth-requested=false
 ok  loop -> 2 calls, repeated URL never requested twice.
                                               calls=2  unique=2  threw=redirect_loop
 ok  every hop of 4 sends no header of its own
      header sets: [{},{},{},{}]
```

`Range` goes to the first host alone and a redirect hop re-requests the whole
file; no custom header exists anywhere in `download.ts`.

**Ruling on part 3: proven.** The guard is upstream of the socket on every path,
and the guarantee is asserted by request count rather than by the error alone.

---

## What is left, honestly

One thing in this card's own surface still has a path to a signature, and it is
not in `installer/src/`. It is in the probe — attempt 1's file, not the diff
under review — and it is written up in full, with its reproduction and its
one-line fix, in `review-probe.md`. It did not fire in either recorded run, and
I did not observe it leak; I am reporting a code path, not an incident.
