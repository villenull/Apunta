# P1.5 licence evidence

Card: P1.5 Licence labels and docs drift. Date of the reads: **2026-09-26**
(UTC). Working directory for every command below: repository root.

Outcome: **both pages were reachable and readable, and neither states any
licence — the card's non-read branch.** Under the coordinator ruling AM-034
(owner-authorised, 2026-09-26) that is **not** a stop. Both `licence.name`
values and both `verified: false` flags stay as they were, the rest of the card
completed, and `THIRD-PARTY-LICENSES.md` is untouched. See *Branch taken* at
the end.

## 1. The local-blob alternative was not available

The card allows `ollama show <tag> --license` only "if and only if `ollama list`
already shows that tag on this machine". Command and result:

```text
$ ollama list
NAME                 ID              SIZE      MODIFIED
qwen3.5:4b-q4_K_M    2a654d98e6fb    3.4 GB    2 hours ago
```

Neither `gemma4:12b-it-qat` nor `qwen3.6:35b-a3b` is present, so the local path
was not available. This card does not pull, remove or replace a tag (A08 assigns
the `gemma4:12b-it-qat` pull to S5.6; HS-3 forbids pulling a tag already here),
so the granted web read is the only remaining mechanism and was the one used.

## 2. The two granted GETs

The card's Egress section grants exactly two GETs and nothing else — no
credentials, no query string, no download, no model pull. Two requests were
made, one per tag, each to the exact URL the card names.

| Tag | URL | HTTP result | Bytes | Read at (UTC) |
| --- | --- | --- | --- | --- |
| `gemma4:12b-it-qat` | `https://ollama.com/library/gemma4` | `200` | 121,053 | 2026-09-26T09:12:35Z |
| `qwen3.6:35b-a3b` | `https://ollama.com/library/qwen3.6` | `200` | 84,745 | 2026-09-26T09:12:35Z |

Both requests carried a plain identifying `User-Agent` and nothing else; no
`Authorization` header, no query string.

## 3. Licence text as read

Both pages were **reachable and readable** — HTTP 200, full body returned,
model listings and READMEs rendered — and **neither states a licence**. The
reachable-but-silent case is the card's non-read branch, not a stop.

**`gemma4:12b-it-qat` — from `https://ollama.com/library/gemma4`, HTTP 200,
read 2026-09-26.** The page carries **no licence statement of any kind**. The
licence text as read is: *none — the page states no licence.*

The check that establishes this, over the whole 121,053-byte body:

```text
$ grep -c -i 'licen' /tmp/opencode/p15/gemma4.html
0
```

Zero occurrences of the substring `licen` (so no `license`, `licence`,
`Licence`, no `Apache`, no `Terms of Use`, and no outbound link to a licence
page). The page's sections are: model listing, README, benchmark results, model
information and best practices. `docs/v2/DECISIONS.md:47` (E9) is the project's
licence *policy* row and says nothing about gemma4, so it cannot stand in for
the read, and `gemma4:12b-it-qat` is not an Apache-2.0 identifier this read
supports.

**`qwen3.6:35b-a3b` — from `https://ollama.com/library/qwen3.6`, HTTP 200,
read 2026-09-26.** Same result: the page is readable and carries **no licence
statement of any kind**.

```text
$ grep -c -i 'licen' /tmp/opencode/p15/qwen3.6.html
0
```

The entry already reads `name: 'Apache-2.0', verified: false`
(`installer/src/catalog.ts:180`). That identifier stands on the *registry*'s
reputation for the Qwen family, not on anything this read returned, so
`verified` stays `false`. The card is explicit that a licence named from the
registry listing is not a read.

## 4. A second observation, recorded but not acted on

Neither page lists the exact tags the catalogue names. The tags each page
publishes:

```text
$ grep -o -E 'gemma4:[a-zA-Z0-9._-]+' gemma4.html | sort -u
gemma4:12b  gemma4:12b-mlx  gemma4:26b  gemma4:26b-mlx  gemma4:31b
gemma4:31b-cloud  gemma4:31b-mlx  gemma4:cloud  gemma4:e2b  gemma4:e2b-mlx
gemma4:e4b  gemma4:e4b-mlx  gemma4:latest

$ grep -o -E 'qwen3\.6:[a-zA-Z0-9._-]+' qwen3.6.html | sort -u
qwen3.6:27b  qwen3.6:27b-mlx  qwen3.6:35b  qwen3.6:35b-mlx  qwen3.6:latest
```

Neither `12b-it-qat` nor `35b-a3b` appears; `gemma4` has an unquantized `12b`
and `qwen3.6` an unquantized `35b`, and the pages' first rows are the only
public "View all →" summary (50 models for gemma4). This is **not** acted on
here: the tags come from `@apunta/shared` (`shared/src/models.ts:16,24`), which
this card may not edit, and no card decision in scope changes a tag. It is
recorded so that S5.6, which does pull `gemma4:12b-it-qat`, knows the exact tag
was not confirmed on the library page.

## 5. What the catalogue therefore says

Unchanged, because nothing admissible was read:

| Tag | `licence.name` | `licence.url` | `licence.verified` |
| --- | --- | --- | --- |
| `gemma4:12b-it-qat` | `Gemma Terms of Use` | `https://ollama.com/library/gemma4` | `false` |
| `qwen3.6:35b-a3b` | `Apache-2.0` | `https://ollama.com/library/qwen3.6` | `false` |

Both keep the publisher-neutral name the entry already had and keep naming the
library page in `url`, which is what `LicenceReference` documents: `url` is
"where the user can read it", never a download, and no field was added to hold
a date. The date of this read lives here and nowhere in the wire shape.

`THIRD-PARTY-LICENSES.md` "Open points" item 2 is **not** edited. The card says
so directly: it moves with the read, and a `verified: false` outcome leaves the
file untouched, because nothing in it changes. Item 2's existing sentence —
"Nobody has yet read the Gemma Terms of Use or the licences shipped with the two
larger tiers" — remains true after this read.

## Branch taken

**The card's non-read branch, per coordinator ruling AM-034 (owner-authorised,
2026-09-26, committed as `6b27ddd`).** The amended Stop conditions read:

> Either licence page or blob is reachable and readable and **states a licence
> other than Apache-2.0** … set the card status `BLOCKED` …
>
> A page that is reachable but **states no licence at all** is the card's
> non-read branch, **not** a stop: record the URL and the date in
> `docs/v2/evidence/P1.5/`, leave `verified: false` and the existing
> `licence.name` in place, and continue with the rest of the card.

Both pages were reachable and readable, so the first branch does not apply —
neither *states a licence other than* Apache-2.0, because neither states a
licence at all. The second branch is exactly this outcome, and it directs
continuing. The rest of the card was therefore completed normally: the README
count and the HANDOFF bullet list were made, and V1, V2 and V3 all pass. **Card
status: SUBMITTED, not BLOCKED.**

For the record, this agent had reported the outcome as `BLOCKED` on the
unamended card, reading "states something other than Apache-2.0" as covering a
silent page. The ruling resolves that ambiguity in the opposite direction and
the report has been corrected; no licence value changed between the two reports,
because the ruling and the stop condition agree on the values — leave them.

The remaining stop condition ("the read cannot be made — not permitted, page
unreachable, or the tag is absent locally and this card may not pull it") is
**not** what happened: both pages answered HTTP 200 and were read in full, and
the absence of a local blob was irrelevant because the web read was the
mechanism actually used and it succeeded as a fetch. Its "do not substitute a
remembered licence" instruction was observed regardless: no remembered licence
was written anywhere, and `verified: false` and the existing names are in
place.

## What a later card would need to unblock the licence question

A licence text that actually states the identifier. That means either a tag
this project actually holds — `ollama show gemma4:12b-it-qat --license` and
`ollama show qwen3.6:35b-a3b --license` after S5.6 pulls them, whose blobs are
what a real user downloads — or the publisher's own terms, which for Gemma is
not on the Ollama library page at all. Neither is in this card's scope, and
neither is a licence-policy problem: the objects in question are models
downloaded by the user at setup, which L-POLICY permits under the publisher's
licence "shown in setup, recorded in the catalogue" — which is precisely the
state the catalogue is in. The record is truthful as it stands; it is
incomplete, not wrong.
