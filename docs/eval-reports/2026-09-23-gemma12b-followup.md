# Gemma 4 12B follow-up — 2026-09-23

**Verdict: close-but-no.** `gemma4:12b` is a credible candidate for a later, deliberately re-tuned experiment, but it is not a replacement for the shipped `qwen3.5:4b-q4_K_M` today. The first audit removes the alarming interpretation of its 33 quote flags: all 33 are repetitions of source words with punctuation changed, not invented patient speech. A one-line aside rule improved the automatic SOAP headline by one fixture, and a one-line quotation rule cut the quote flags, but neither is a resolved product win. The margin is at the corpus's one-fixture resolution limit, and the 12B still needs the same full format/refine acceptance work before a model swap could be considered.

## Isolation and provenance

- Synthetic fixtures only: `e2e/fixtures/eval` (20 SOAP/intake fixtures) and `e2e/fixtures/eval-owner` (4 owner-format fixtures). No patient database, Claude export, or live recording was opened.
- Disposable Ollama: `127.0.0.1:11443`, `OLLAMA_NO_CLOUD=1`, `OLLAMA_KEEP_ALIVE=20s`, shared model store. The live Ollama at `11434` was read-only for residency checks and never evicted or written.
- Disposable Apunta: `127.0.0.1:7743`, `APUNTA_DATA_DIR=/tmp/apunta-gemma12b-data`, `APUNTA_OLLAMA_URL=http://127.0.0.1:11443`. Its only model setting was `llm_model=gemma4:12b`.
- Every GPU arm used `/tmp/apunta-gpu.lock`, waited for foreign residency on `11434`, `11440`, `11441`, and `11442`, required `size_vram == size`, and unloaded before releasing the lock. The model was pulled with `ollama pull gemma4:12b`; it is removed from the shared store after this report is written.
- Measurement artifacts were written under `/tmp/gemma12b-followup/` (reports, logs, and the hand-audit note dumps).

## 1. Audit of the 33 non-source quoted spans

I regenerated every SOAP fixture once through the shipped prompt and read the note against its source. The report scorer counts 33 F2 violations over 60 runs (11 distinct spans repeated identically in each of the three invocations). The scorer's check is literal after whitespace normalisation; terminal punctuation inside the model's quote means `"fine."` does not equal source `"fine"`, for example.

**Result: 33/33 are harmless quotation marks around real source content. 0/33 are invented quotes. 0/33 are paraphrases wrongly presented as quotes.** The source has the same words in every case; the differences are sentence punctuation and, where relevant, the note's attribution prose. The audit list below shows each distinct span; each occurred in three runs.

| Fixture | Note's quoted span | Source evidence and category |
| --- | --- | --- |
| `07-out-of-order-grief` | `"i'd rather be sad than nothing."` | Source says `"i'd rather be sad than nothing,"`; same words, terminal punctuation changed. **Real content, harmless.** |
| `10-intake-messy-mixed` | `"didn't do anything,"` | Source says the antidepressant `"didn't do anything"`; same words, comma moved inside the note quote. **Real content, harmless.** |
| `11-terse-observations-no-read` | `"just didn't get to it."` | Source says `"just didn't get to it"`; same words, period added. **Real content, harmless.** |
| `12-dictated-observation-only` | `"fine."` | Source explicitly says sleep was, quote, `fine`, unquote. **Real content, harmless.** |
| `14-intake-long-no-formulation` | `"wrecking him."` | Source says tiredness is the part that's `"wrecking him,"`; same words, punctuation changed. **Real content, harmless.** |
| `16-intake-partial-no-plan` | `"the anger thing,"` | Source explicitly labels the presenting problem `"the anger thing"`; same words. **Real content, harmless.** |
| `16-intake-partial-no-plan` | `"stress,"` | Source explicitly quotes prior therapy being for `"stress"`; same word. **Real content, harmless.** |
| `17-nothing-changed-phrase-bait` | `"same week as last week and the week before."` | Source explicitly quotes the same phrase; period added. **Real content, harmless.** |
| `18-long-dictation-no-read` | `"just stopped mattering."` | Source explicitly quotes `"just stopped mattering"`; period added. **Real content, harmless.** |
| `19-intake-dictated-no-formulation` | `"had rituals too."` | Source explicitly quotes the mother's words `"had rituals too"`; period added. **Real content, harmless.** |
| `20-two-topics-no-synthesis` | `"i'm fine, i just keep replaying it."` | Source explicitly quotes the same sentence; period added. **Real content, harmless.** |

The flags therefore identify a scorer-normalisation limitation for this model's output, not 33 instances of fabricated patient speech. The model did not put unsupported words in quotation marks in this audit. This does not make the model a pass: its shipped SOAP failure set still includes the carried-aside cases `03` and `18`, and it misses safety facts on `03`, `06`, `16`, and `19`.

## 2. One-change-at-a-time prompt probe

Each variant started from the shipped owner instructions and changed one bullet only. Each arm used three separate invocations, three runs per SOAP fixture, and three runs per owner fixture. The shipped 4B control was measured in the same session on the same disposable Ollama. The owner corpus denominator is 12 runs (4 fixtures × 3 runs); the SOAP denominator is 60 (20 × 3).

### Changes

- **Quote-only:** replaced the existing quotation bullet with: “Never use quotation marks for a client's words unless the source explicitly quotes those exact words; paraphrases stay unquoted.”
- **Aside-only:** replaced the aside bullet with: “Anything she flags as an aside, with words like ‘not clinically relevant’ or ‘just noting it’, stays out of every section; do not restate or quote a flagged aside.”
- No combined variant was used, so the effects are attributable one change at a time.

### Headline results

| Arm | SOAP fabrication | SOAP safety facts | SOAP F2 quote flags | SOAP novel content /100w | Mean SOAP draft | Owner fabrication | Owner safety facts |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 4B shipped control | 10.0% (6/60) | 85.0% | 3 | 57.3 | 2.2 s | 0.0% (0/12) | 100% |
| Gemma shipped | 15.0% (9/60) | 80.0% | 33 | 46.9 | 4.5 s | 0.0% (0/12) | 100% |
| Gemma quote-only | 10.0% (6/60) | 85.0% | 13 | 38.0 | 4.2 s | 0.0% (0/12) | 100% |
| Gemma aside-only | **8.3% (5/60)** | **86.7%** | 19 | 37.1 | 4.1 s | 0.0% (0/12) | 100% |

All three invocations of every arm returned the same headline rates. The aside-only improvement is one fixture against a 20-fixture corpus, so it is not enough to call a quality win. It also changed the failure set rather than eliminating the model's underlying hard cases: its remaining SOAP gates were fixture 09 plus fixture 15 in the recorded invocation, and its safety misses included fixture 03, fixture 06, and fixture 10. The quote-only arm tied the 4B headline and reduced the literal F2 count, but the audited shipped 12B quotes were already source-grounded; the lower F2 count is therefore not evidence of a corresponding clinical improvement. Both variants remained slower than the 4B and neither improved the owner corpus beyond its existing 0%/100% tie.

The realistic path to a replacement would be: retain the 12B only as a candidate; settle the quotation and aside wording on a larger synthetic corpus; remeasure all automatic and human criteria; rerun `check:format`; rerun all refine guards; and repeat the 3-invocation comparison after any guard or provider change. It would not be a safe model-setting swap based on this corpus.

## 3. Refine guards with Gemma 12B

Command, against the disposable instance:

```text
APUNTA_CHECK_URL=http://127.0.0.1:7743 npm run check:refine
```

Observed health line: `Model: gemma4:12b`. The command exited 0 and exercised 13 scenarios. Summary: 1 harness-reported problem, in `shorten-twice`: Gemma caused the fact lock to hold the original section but then claimed it had shortened it, so the script correctly reported that the note did not change and the reply did not say so. The other 12 scenarios passed.

The four server-side protections behaved as follows:

- **Published lock:** additionally probed manually on a synthetic published note; a shortening request returned “This note is published, so I won’t change it…” and did not rewrite the record.
- **Boilerplate lock:** fired 2 times, holding back an attempted unsupported observation while the model's reply claimed the edit had happened.
- **Fact lock:** fired 1 time, preserving “four in June” when Gemma's shortening dropped it. The script's one harness problem is the stale success wording, not a fact loss.
- **Prior-note lock:** fired 3 times, blocking content Gemma tried to bring from another session. Explicit bring-over still passed.

This is a useful result, not a pass claim: the locks continue to protect the record against the 12B, but one response-status mismatch remains visible, and the model was not demonstrated to behave safely without those locks.

## Final decision

**Close-but-no.** Gemma 4 12B is the first candidate worth keeping on a shortlist for a larger, separately consented experiment: its shipped failure set differs from the 4B's, it clears the withdrawn-number fixture, and the alarming quote count is entirely source-grounded on inspection. Its stronger prompt variants are promising but only one fixture apart from the control, while its runtime is about 1.9× slower and its safety/failure set is still different rather than uniformly better. Keep `qwen3.5:4b-q4_K_M` as the production drafting model. A future replacement would require a larger corpus, a combined prompt/guard retune, full format/refine acceptance, and a fresh control comparison; no production change is made here.
