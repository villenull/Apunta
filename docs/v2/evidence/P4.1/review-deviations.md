# P4.1 attempt 2 — a ruling on each of the eight deviations, and on the flagged reading

- **Card:** P4.1, attempt 2 of 3. **Role:** INDEPENDENT IMPLEMENTATION REVIEWER.
- **Base / head:** `104501d` … `463215b`
- **The test this review applies, from the brief:** *a deviation that changes
  what the card checks is a FAIL, not a note.* So each ruling below answers one
  question — does this change what the card verifies, or only where the code
  sits / who does it / what it costs? — and not "is it a problem".

---

## The flagged reading first, because it is the one that matters

**Deviation 1 — `allowedQueryKeys` is on the two speech entries, not "empty for
every entry but the six C-STT ones".**

### The card's sentence cannot be implemented as written

Fixed decision 2 says the catalogue gains a per-entry `allowedQueryKeys`, "empty
for every entry but the six C-STT ones". I checked whether there is a sixth
entry to hang a permission on:

```
$ grep -n ": SpeechModelEntry = {" installer/src/catalog.ts
220:export const SPEECH_MODEL: SpeechModelEntry = {
246:export const PREVIEW_SPEECH_MODEL: SpeechModelEntry = {
$ for f in ggml-base.bin ggml-base-q5_1.bin ggml-small.bin …; do grep -rl "$f" installer/src/; done
NOWHERE   (all six)
```

There are exactly **two** `SpeechModelEntry` values in the catalogue, and the six
C-STT candidates are not entries — `S4a.2` chooses one later, which is why the
card names a `C_STT_CANDIDATE_ALLOWANCE` *object* rather than six entries. So
"empty for every entry but the six C-STT ones" resolves, against the only two
entries that exist, to **both entries carrying an empty list** — and an empty
list is `query_not_allowed`, so `downloadWithResume` would refuse the first hop
of every real speech-model download. The card's own `ACQUISITION.md` §1
justification for the ten names settles it the other way: they were "observed
across all six C-STT artifacts **and the one speech artifact**", and the pinned
speech file is a `huggingface.co/ggerganov/whisper.cpp` resolve URL that answers
`302` to a CloudFront signed URL — which my own V2 re-run observed again today,
on all seven artifacts.

The sentence is a drafting slip in the card, not a permission the implementer
took. The code follows the manifest the owner approved.

### Does it change what the card checks? No.

- The check is still membership of the **ten enumerated names** and nothing else.
  `catalog.test.ts` pins `A07_ALLOWED_QUERY_KEYS` element-by-element against
  `ACQUISITION.md` §1's cell, and pins both entries to carry the whole set.
- The **widening surface is exactly two objects.** `grep -n "allowedQueryKeys"
  installer/src/catalog.ts` returns the type declaration and two assignments —
  `SPEECH_MODEL` and `PREVIEW_SPEECH_MODEL`, which are the same file. Nothing
  else in the package carries a query permission of any size.
- Both directions are still asserted by request count: 8b (off-list → zero
  calls, name named, value absent) and 8a (on-list → the URL is requested, the
  query survives admission unchanged, the download completes and verifies
  against the pinned `sha256`). I re-derived both independently against
  `installer/dist` — `review-security.md` §3.
- The change the amendment *did* make — a query is no longer a blanket refusal —
  is the amendment itself, asserted in `catalog.test.ts` as "refuses a fragment
  always, and a query only for a row that admits none".

### Ruling: **a correct call, and the card is what is wrong.**

The implementer flagged it rather than burying it, said the fix would be one
line, and did not pretend the literal reading was available. That is the right
behaviour on an unimplementable instruction. **Not a finding against the code.**

**What the owner/coordinator should do, and it is not a code change:** the card's
Fixed decision 2 sentence should be corrected to say the ten names are attached
to the entries that A07's row actually covers. The card is the coordinator's
document under the plan editor; this review does not edit it and the implementer
could not.

---

## Deviation 2 — the request guard moved out of `catalog.ts` into `readiness.ts`

`assertAllowedHost` and `DisallowedHostError` are gone; `assertRequestAllowed`
replaces them. `ALLOWED_DOWNLOAD_HOSTS` stays in `catalog.ts`, now derived as the
union.

**Does it change what the card checks? No.** Fixed decision 2 puts the refusal
vocabulary in `readiness.ts` in the same breath as the readiness codes — "Request
refusals, same file" — and step 4's order is "the union **and the guard**". A
guard in `catalog.ts` could not speak `readiness.ts`'s words, and the card's Read
section describes `assertAllowedHost` as it is *at the base*, not as a
constraint on the result.

The two properties that could have broken, and did not:

- **`catalog.ts` is still the only file in the package naming a host.** The scan
  at `catalog.test.ts` is **byte-identical to the base** — I diffed it, not just
  read it — and it passes. `readiness.ts` names no host literal; it joins
  whatever list the allowance carries.
- **The union is now arithmetic, not a list someone can forget.** `catalog.test.ts`
  asserts it equals the union of both allowances' `allowedHosts` and
  `allowedRedirectHosts` plus the licence-page hosts, de-duplicated. That is
  *stronger* than the base, which was a literal.

One consequence worth stating because it looks like a loosening and is not: the
two tests that used to call `assertAllowedHost` on each licence URL now assert
`ALLOWED_DOWNLOAD_HOSTS).toContain(hostname)` instead. That is a weaker
*statement* — "on the record" rather than "requestable" — and it had to become
weaker, because a licence page has no allowance and asserting it was requestable
would mean admitting `ollama.com` to a guard it must never reach. The new form
is the honest one: Apunta shows that link and never opens it. Not a check
loosened to make a row green (HS-7) — a check restated to match what the code
now means, with the comment above it saying so.

**Ruling: correct. The card's own Fixed decision 2 requires it.**

---

## Deviation 3 — readiness never writes, so a restored file with no receipt is re-hashed on every probe

Fixed decision 10 ("a run that only probes, such as the one behind the plan,
writes nothing on disk") and C-ACQ@1 rule 5 ("or a fresh hash matches (**then a
receipt is written**)") pull in opposite directions, and the implementer took the
card's explicit instruction over the contract's parenthetical.

**Does it change what the card checks? No**, and the cost is bounded and stated
by the implementer rather than discovered by me: `assessModel` is read-only, and
a file restored from a backup with the right size and digest and no receipt is
hashed once per launch instead of once, roughly a third of a second for 75 MiB.
`readiness.test.ts` asserts it as intended ("assessing a model writes nothing >
leaves the disk exactly as it found it, ready or not"), and I confirmed the
wiring by reading `run.ts`: `probeState` calls `assessModel` and derives three
booleans; the only `writeReceiptFor` call is in `downloadSpeechFile`, which only
runs inside the step loop a Start press began (Fixed decision 10 satisfied).

**Ruling: correct, and Fixed decision 10 is the more specific instrument.** But
this is a real divergence between the card and the contract, and the coordinator
should close it rather than leave it in the code's comments: **rule 5's
parenthetical is not satisfied by this build.** Either the contract sentence gets
an amendment acknowledging that the receipt is written by the repair step and not
by the probe, or the coordinator decides rule 5's letter wins and lets
`probeState` write the receipt it just earned. The implementer stated both halves
of that choice and what each costs. One line either way; the decision is the
coordinator's, not this review's and not the implementer's.

---

## Deviation 4 — `sizeBytes: 77_704_715` is a transcription, and stop condition 5's *second* mismatch is not detected

The number is upstream's own `models/README.md` figure, quoted in the base's
`approxBytes` comment. No machine in this project has measured the file, and this
card is authorised to download nothing.

**This is not a deviation from the card — the card ordered the pin.** Fixed
decision 5 says `SPEECH_MODEL` and `PREVIEW_SPEECH_MODEL` "pin `77_704_715` —
the measured count that survives today only in the `approxBytes` comment". The
implementer pinned exactly that and labelled it honestly as a transcription.

The *second* half — "a **second** mismatch on the same artifact after a repair is
stop condition 5" — is genuinely not implementable inside May edit, and I agree
with the reasoning rather than taking it on trust: `runSetup` throws on the
first mismatch, so within a run there is no second attempt; detecting a second one
needs state that survives a process, which is a write, and the only run allowed
to write is the repair step. There is no in-card mechanism, and inventing one
would mean either persisting a counter to disk (forbidden by Fixed decision 10) or
reaching outside May edit.

**Ruling: correct, and the stop condition stays an observation-level stop as
described.**

**But the owner needs to know the consequence, because it is worse than "an
observation-level stop".** I traced it through the code. If the pin is wrong, the
failure is not a one-off refusal:

1. `downloadSpeechFile` verifies the digest, `commitDownload` renames the file
   into place, the size is compared to `sizeBytes`, and a mismatch throws
   `ModelRefusedError` with `size_mismatch` and no receipt (`run.ts:296-311`).
2. Next launch, `probeState` → `assessModel` sees the committed file's size is
   not `sizeBytes` → `size_mismatch` → not `ready` → `speechModelPresent: false`.
3. `plan.ts` therefore marks the step needed, and the 75 MiB download runs again.
4. Which verifies, commits, and fails on the same comparison. For ever.

So a wrong pin is a **75 MiB re-download on every launch**, not a single
complaint. The refusal is honest and the message is the right one — "the pin is
wrong rather than the download; this is not something trying again can fix" — but
nothing in the product stops the loop, and the loop is what the owner would
actually experience. S4a.2, which actually acquires a C-STT candidate, is where
the number gets checked against a real download; until then this is a known,
unmeasured load-bearing pin on the first-run path. **Not a finding against the
implementer. A finding for the coordinator, and worth the owner's attention
before setup ships.**

---

## Deviation 5 — six pre-existing `run.test.ts` cases changed their fixture, not their assertion

The base's `speechModelPresent: true` wrote 25 arbitrary bytes and the base's
`size > 0` rule called that "the model is installed". Under a pinned size that
fixture is `size_mismatch` by design, so those six now place a **sparse** file
of the pinned length plus a valid receipt.

**Does it change what the card checks? No, and I checked rather than believed
it:**

- `git diff` on `run.test.ts` shows six one-line fixture swaps
  (`speechModelPresent: true` → `speechModelReady: true`) and **no change to any
  `expect`**. Their expectations — `plan.ready`, no download, one pull, no
  internal detail in any event — are byte-identical.
- **No `it(` title was deleted from `run.test.ts`.** I diffed the base's ten
  titles against the head's eighteen: `comm -23` on the two sorted lists is
  empty. Every base case is still there, under its own name.
- `grep -rn "\.only\|\.skip\|\.todo" installer/src/*.test.ts` → no match. Nothing
  was skipped.
- `it(` counts per file, base → head: catalog 10→16, download 10→31, ollama
  10→16, run 10→18, and resume/plan/protocol/errors/containment/bytes/cli all
  unchanged. 130 → 206 with nothing removed.

Using a receipt to stand in for 75 MiB of verified bytes is the right shape: it
is precisely what a receipt is for, and the alternative (a test that hashes
77,704,715 real bytes) is not a trade worth making. The file is created with
`truncate`, so it costs no bytes and no hashing.

**Ruling: correct. A fixture adapted to a new invariant, with the assertion
untouched.**

---

## Deviation 6 — the coordinator reverted and deleted four files mid-flight

Process, not code: `git checkout -- installer/` discarded the four rewired
modules and `rm` deleted the two new ones after a truncated turn was read as a
dead agent. Restored from the implementer's own history, with the saved patch as
a cross-check.

**The risk this creates is that an older variant of a file survived the restore,
so I checked the three post-fix markers the return names against both the patch
and the head, rather than accepting the claim:**

| Marker | in `attempt2-partial.patch` | in `installer/src/readiness.ts` at `463215b` |
| --- | --- | --- |
| `isSafeInteger` | 6 | 6 |
| `readonly readiness` | 1 | 1 |
| `type Stats` | 1 | 1 |

All three present in both, at matching counts. The fourth marker the return
mentions, the `statSync(receiptPathFor(…))` permission assertion, is in the
**test** file rather than the module — `readiness.test.ts:294`, which I read and
which is the right place for it. Nothing older was reintroduced.

The strongest evidence is that the recovered state is not merely plausible but
**green from the first full run**: `typecheck` 0 across every workspace, `lint` 0,
206/206 with no `.only` and no skipped file. A half-restored file does not
typecheck.

**Ruling: correct handling of a real accident, and the recovery is verified
rather than taken on trust.** The implementer's closing advice — commit small and
often on a card this size — is right and is worth the coordinator reading.

---

## Deviation 7 — one extra hash per download

`checksum.ts` is not in May edit and `verifyFile` checks digests without
returning them, so `run.ts` cannot get the value its receipt needs from the call
it already made. It calls `hashFile` once more on the committed file.

**Ruling: correct.** The alternative — weakening the two-digest check, or
reaching outside May edit to change `verifyFile`'s return type — is the wrong
trade, and the implementer said so. One extra 75 MiB hash per *download* (not per
probe) is negligible, and `run.test.ts` counts the hash calls so the cost is
visible rather than folklore.

---

## Deviation 8 — `C_STT_CANDIDATE_ALLOWANCE` is admitted and nothing uses it yet

Fixed decision 1 requires the two allowances to be named in `catalog.ts`, and
this is one of them. Its shape and its union membership are tested
(`catalog.test.ts`) even though no entry references it.

**Ruling: correct, and it is what the card asked for.** Naming the guard now
rather than at the moment `S4a.2` makes its choice is the right order. An unused
export in a catalogue is a record, not dead code.

---

## The implementer's three "still open" items, which are the coordinator's

These are not deviations and not defects; they are things the implementer
correctly declined to decide. I record my view on each so the coordinator has one
place to read them.

1. **Stop condition 4's ruling, asked for a third time.** Does RUN-CONFIG §4's
   "never include hostnames" cover public vendor CDN names? `redirects.md`
   carries `us.aws.cdn.hf.co` as observed, per the card's Egress section and the
   `P1.5` precedent, and AM-042 has since written that same host into
   `ACQUISITION.md` §1 in plain text. The implementer's framing is the right one:
   the wider reading is now easier to defend than it was at attempt 1, but the
   ruling for *evidence files* still has not been given. **This review does not
   think it blocks approval** — nothing P4.1 admits is claimed approved until
   the coordinator acts, and the remedy is a two-minute change to the probe if
   the answer is the narrower one. But it should stop being asked a fourth time:
   the ruling is needed, and it is the coordinator's to give.
2. **`scripts/check-no-external-urls.mjs` carries a comment that is now false.**
   Its hardcoded `DOWNLOAD_HOSTS` comment says it is "kept in step with
   `ALLOWED_DOWNLOAD_HOSTS` by `catalog.test.ts`, which pins the same three
   names". The union has four names now and the test asserts arithmetic rather
   than a literal. The script never scans `installer/`, so it does not fail —
   which is exactly why it is worth saying out loud, and why it is right that the
   implementer said it rather than editing a file outside May edit.
3. **A receipt is a performance record, not a trust boundary.** Rule 5 lets a
   file be trusted on a receipt alone, so anyone who can write the models
   directory can forge one. This is the card's design and not a shortcut in it,
   and it is **not a regression**: the base accepted any non-empty file at that
   path, which is strictly weaker. `S4b.1` should know the property before it
   reads a receipt.

**One more, mine.** The probe's `unparseable` branch pastes a raw `Location`
query and all into a committed evidence file if that `Location` is a relative
reference — see `review-probe.md`. Latent, in attempt 1's file rather than in
this diff, not a row failure, and a one-line fix.
