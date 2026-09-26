# Spoken Mexican Spanish: corrections, fillers, STT accuracy, Piper voices (S1.3)

**Card:** S1.3, role RESEARCH. **Date:** 2026-09-26. **Status:** research only; nothing here is implemented and nothing here is legal advice (§7 lists the questions only a Mexican lawyer can settle).

**What this file is:** evidence for Spanish dictation handling (provisional self-correction markers for D9, filler handling) and for the synthetic-audio tooling (Piper repo/licence/voices and the model-card redistribution positions that decide L-POLICY row 4). It answers the four dispatch questions in §§2–5.

**Method:** public web pages only, no logins, no downloads. Linguistic claims were read through search-result extracts of papers, theses, the RAE grammar/dictionaries, and corpus studies; Piper voice cards and directory listings were read page-by-page on Hugging Face; benchmark numbers come from a published reproducible benchmark and the OpenAI release discussion. Competitor TTS/clinic sites were not used.

**Labels:** `[verified]` = read as verbatim or near-verbatim text on the cited page. `[inferred]` = my reasoning, with the basis stated. `[not found]` = checked the listed sources and could not confirm; flagged for the owner or a lawyer, never filled with a guess.

**No patient material appears here.** Per `CLAUDE.md` hard rule 2 there are no clinical examples, real or fabricated — only isolated marker words and short non-clinical phrases (the dispatch itself names them), plus structure. No transcript that looks like a clinical record appears anywhere in this file.

**Relation to the English pipeline:** `server/src/ai/retractions.ts` keeps its marker list deliberately narrow (scratch that, strike that, forget that, never mind, actually no, no wait, wait no, that's wrong, that was last session/week/time, start over/again, let me start again) on the principle that a miss costs one sentence while a false positive cuts real content — and the list grows only from her real dictations, never from imagination. The same principle applies below: the §2 ranking is **provisional** (D9) and the Spanish list must likewise grow only from her real Spanish dictations once they exist.

---

## 1. Sources used

Reformulation / discourse markers (taxonomy and Spanish-wide evidence):

- Martín Zorraquino & Portolés Lázaro (1999), *Los marcadores del discurso*, via the Universidad de Piura explainer which reproduces the four-way reformulator taxonomy with examples — https://www.udep.edu.pe/castellanoactual/los-reformuladores-en-el-discurso
- *Marcador del discurso*, Spanish Wikipedia, summarising the same taxonomy (rectificativos: *mejor dicho, mejor aún, más bien*, inciso *digo*) — https://es.wikipedia.org/wiki/Marcador_del_discurso
- RAE, *Nueva gramática de la lengua española*, §30.12 (conectores discursivos adverbiales; notes *es decir, esto es, a saber* vs *más bien*, and that *más bien* can appear sentence-finally) — https://www.rae.es/gram%C3%A1tica/sintaxis/conectores-discursivos-adverbiales-i-caracter%C3%ADsticas-fundamentales-clases-sint%C3%A1cticas
- RAE DLE, *o* §3 ("Denota equivalencia, significando 'o sea, o lo que es lo mismo'") — https://dle.rae.es/o ; RAE on «o sea» = «es decir», introduces explanations or precisions — https://www.facebook.com/RAE/posts/1308490104648640 (RAE institutional post)
- *Boletín de Filología* vol. 60 no. 2 (2025), monographic section *Estudios sobre los marcadores discursivos de reformulación en la lengua española con materiales del PRESEEA*, incl. Santana Marrero on rectificativos in PRESEEA-Sevilla ("La autocorrección es una estrategia muy común en la oralidad no planificada") and San Martín Núñez on the most frequent explicative reformulators across varieties — https://boletinfilologia.uchile.cl/index.php/BDF/issue/view/6433
- PRESEEA project presentation (corpus of spoken Spanish representative of the Hispanic world) — https://preseea.uah.es/
- Gil Pérez (2006, UGA MA thesis), *Los marcadores bueno y pues* (frequency/functions; cites Schwenter 1996 on *o sea* from 277 peninsular uses, Cortés Rodríguez 1991, Félix-Brasdefer 2006) — https://openscholar.uga.edu/record/10512/files/gil-perez_omar_200608_ma.pdf

Mexico City spoken evidence:

- Graham (2025), *A Longitudinal Corpus-Based Study of Hesitation Markers in Mexico City Spanish: Este and Eh Then and Now*, Hispanic Studies Review — CDMX corpora: *El habla de la ciudad de México* (Habla Culta / Habla Popular interviews 1967–1975) vs *Corpus sociolingüístico de la Ciudad de México* (CSCM, Martín Butragueño & Lastra 2011–2015, PRESEEA component, interviews 1997–2007); notes *pues, bueno, o sea* are also employed as hesitation markers to fill pauses — https://hispanicstudiesreview.cofc.edu/article/57581-a-longitudinal-corpus-based-study-of-hesitation-markers-in-mexico-city-spanish-_este_-and-_eh_-then-and-now
- Guillén Escamilla (2026), *Hacia una caracterización de de plano como marcador del discurso… en datos del español de Ciudad de México*, RESLA 39(1) — CDMX transcript examples showing *o sea* in natural Mexico City speech — https://matrix.aesla.org.es/RESLA/article/download/838/399

Transcription / note conventions:

- TranscribeMe, *Transcription General Style Guide* (July 2014): clean verbatim is the default; filler words, crutch words, stutters and quickly-corrected false starts are omitted — https://transcribeme.blob.core.windows.net/exams/T104_TranscribeMe%20General%20Style%20Guide%20July%202014.pdf
- GoTranscript, *Mastering Transcription: Clean vs. Full Verbatim*: clean verbatim drops false starts, verbal tics, stutters; "sentences are clean but not paraphrased" — https://gotranscript.com/public/mastering-transcription-clean-vs-full-verbatim-and-essential-guidelines
- Vero (2026), *How to Write a SOAP Note*: "A medical note is not a transcript, memory dump, or billing worksheet" — https://www.veroscribe.com/blog/how-to-write-a-soap-note

STT accuracy:

- ggml-org/whisper.cpp README: "Port of OpenAI's Whisper model in C/C++… High-performance inference of OpenAI's Whisper automatic speech recognition (ASR) model"; models page: "The original Whisper PyTorch models provided by OpenAI are converted to custom ggml format"; build targets include `large-v3`, `large-v3-turbo`; licence MIT — https://github.com/ggml-org/whisper.cpp/blob/master/README.md and https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md
- Apunta pins `https://github.com/ggml-org/whisper.cpp.git` at commit `371b5a7…` — `scripts/build-whisper-candidate.sh` (in-repo, read locally)
- Vocova (July 2026), *Whisper accuracy benchmark 2026*: 1,749 transcriptions, large-v3 / large-v3-turbo / small × 12 languages on the FLEURS test split, fixed seed, published script and raw data; Spanish large-v3 **2.9% WER** (best of 12), turbo 3.3%, small 6.5%; paper large-v2 Spanish 3.0% — https://vocova.app/blog/ai-transcription-accuracy-benchmark-2026
- OpenAI `large-v3` release discussion: 10–20% error reduction vs large-v2 on Common Voice 15 + Fleurs — https://github.com/openai/whisper/discussions/1762
- Koenecke et al. (2024), *Careless Whisper* (hallucination audit, cited via the Vocova benchmark): order of 1% of segments fabricated, concentrated around pauses/disfluent speech — https://arxiv.org/abs/2402.08021

Piper:

- Maintained repo OHF-Voice/piper1-gpl, licence GPL-3.0 (repo tag), `setup.py` declares `GPL-3.0-or-later`, `COPYING` is GPL v3 — https://github.com/OHF-Voice/piper1-gpl and https://github.com/OHF-Voice/piper1-gpl/blob/main/setup.py
- rhasspy/piper archived by the owner 2025-10-06 (read-only); its README says "Development has moved: https://github.com/OHF-Voice/piper1-gpl" — https://github.com/rhasspy/piper
- Voice repo rhasspy/piper-voices on Hugging Face (repo-level licence tag: MIT) — https://huggingface.co/rhasspy/piper-voices ; es_MX listing (2 speakers: ald, claude) — https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX ; ald qualities (medium, x_low) — https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX/ald ; claude quality (high only) — https://huggingface.co/rhasspy/piper-voices/tree/main/es/es_MX/claude ; en_US speakers — https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US ; lessac qualities (high, low, medium) — https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/lessac ; ljspeech qualities (high, medium) — https://huggingface.co/rhasspy/piper-voices/tree/main/en/en_US/ljspeech
- Model cards read in full (each states language, speakers, quality, samplerate, dataset URL/licence, training note; **none states anything about redistributing generated audio**): claude/high — https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/claude/high/MODEL_CARD ; ald/medium — https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/MODEL_CARD ; ald/x_low — https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/x_low/MODEL_CARD ; en_US ljspeech/medium — https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD ; en_US lessac/medium — https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD

---

## 2. Q1 — Spoken self-corrections in Mexican Spanish (provisional markers, D9)

### 2.1 What the literature establishes

Spanish linguistics divides reformulators into explicatives (present the new segment as a clarification: *o sea, es decir, esto es, a saber*) and **rectificatives** (replace the prior segment as wrong or improvable: ***mejor dicho, más bien, digo***, optionally preceded by *o*) `[verified]` (https://www.udep.edu.pe/castellanoactual/los-reformuladores-en-el-discurso ; https://es.wikipedia.org/wiki/Marcador_del_discurso). Self-correction itself is "a very common strategy in unplanned orality" `[verified]` (Santana Marrero, PRESEEA-Sevilla, via https://boletinfilologia.uchile.cl/index.php/BDF/issue/view/6433). For Mexico City specifically, corpus work documents *o sea* (also doubling as a hesitation marker), *pues*, *bueno* in live speech `[verified]` (Graham 2025; Guillén Escamilla 2026), and the RAE equates *o sea* with *es decir* as an introducer of explanations/precisions `[verified]` (https://dle.rae.es/o ; RAE post https://www.facebook.com/RAE/posts/1308490104648640).

What the literature does **not** give: a Mexico-specific frequency ranking of correction markers, nor any corpus counts for the explicit metalinguistic forms (*perdón, me equivoqué, corrijo, borra eso*). The ranking below is therefore provisional by construction: literature-backed at the top, dictation-logic-backed at the bottom, every step labelled.

### 2.2 Ranked provisional markers (D9)

| Rank | Marker | Status | Basis |
| --- | --- | --- | --- |
| 1 | *o sea* | `[verified]` frequent in CDMX speech; precision caveat `[inferred]` | Graham 2025 (CDMX corpora), Guillén 2026 (CDMX examples), RAE equivalence to *es decir*. Caveat: primarily explicative, so as a retraction signal it is broad — the Spanish analogue of English *I mean*. High recall, lower precision; the server-side verbatim-quote check (as in `retractions.ts`) is what keeps it safe. |
| 2 | *mejor dicho* | `[verified]` canonical rectificativo | Every taxonomy (UDEP/Martín Zorraquino & Portolés; Wikipedia; Cassany list). The closest Spanish equivalent of "scratch that / actually no". |
| 3 | *más bien* | `[verified]` canonical rectificativo | Same taxonomies; RAE NGLE notes its positional freedom (§30.12). |
| 4 | *es decir* | `[verified]` explicative; register note `[inferred]` | Taxonomies + RAE. `[inferred]` More formal / written-leaning than *o sea*, so expected less often in hurried dictation — rank below *o sea* for recall, higher precision per hit. |
| 5 | *digo* (inciso) | `[verified]` rectificativo inciso; idiom corroboration | Wikipedia/Martín Zorraquino & Portolés ("digo — como inciso"); the idiom *donde digo digo, digo diego* ("when I said y I actually meant z") confirms the correction function in general usage. Short and informal — expect false positives against the verb *decir*; needs the verbatim-quote gate. |
| 6 | *perdón* | `[not found]` in marker-frequency literature; provisional `[inferred]` | No corpus ranking found (checked PRESEEA 2025 section, Graham 2025, UGA thesis). Pragmatically the natural apology-based correction ("no, perdón, …"); rank mid-list pending her dictations. |
| 7 | *me equivoqué* | `[not found]`; provisional `[inferred]` | Same sources checked. Explicit error admission; unambiguous when present, unknown frequency. |
| 8 | *no, espera* / *espera, no* | `[not found]` as a studied form; provisional `[inferred]` | Direct parallel of English "no, wait / wait, no" in `retractions.ts`; plausible calque in bilingual dictation, but unattested in the checked literature — validate against her audio. |
| 9 | *corrijo* | `[not found]`; provisional, dictation-command style `[inferred]` | RAE DLE confirms *rectificar* = modify one's previously stated opinion (https://dle.rae.es/rectificar), but *corrijo* as a spoken self-marker is unattested in checked sources; metalinguistic and rare in spontaneous speech. Useful only if she adopts it deliberately. |
| 10 | *borra eso* / *bórralo* | `[not found]`; provisional command `[inferred]` | No linguistic source (checked the same set); a dictation-command phrasing, not a natural correction. Keep only as an explicit agreed command, never as an assumed natural marker. |

**Deliberately excluded:** *este* — it is a hesitation marker (filler), not a correction (§3); treating it as a retraction marker would delete contentless pauses at best and real demonstratives at worst.

### 2.3 Consequences for the pipeline

- The English design transfers directly: a narrow marker list + a model-supplied verbatim quote + server-side verification against the transcript `[inferred]` (from `server/src/ai/retractions.ts`, read locally). *O sea* and *digo* are short/common enough that without the quote gate they would false-positive; ranks 6–10 are rare/explicit enough to be high-precision.
- Data not available, flag for the owner: which of ranks 6–10 she actually says. The list must grow only from her real Spanish dictations (same rule as the English list).

---

## 3. Q2 — Fillers and whether notes drop them

### 3.1 The Mexican filler inventory

*Este* and *eh* are hesitation markers in Mexico City Spanish across five decades (1970s Habla Culta/Popular → 2000s CSCM/PRESEEA) `[verified]` (Graham 2025). *Pues*, *bueno* and *o sea* — whose main functions lie elsewhere — are also employed as hesitation markers to fill pauses and hold turns `[verified]` (Graham 2025, citing Cortés Rodríguez 1991, Schwenter 1996, Félix-Brasdefer 2006). The UGA thesis documents frequency/functions of *bueno* and *pues* in detail `[verified]` (https://openscholar.uga.edu/record/10512/files/gil-perez_omar_200608_ma.pdf). Such markers carry stigma (labelled *muletillas*, *bordones*, *disfluencias*; schoolteachers treat them as poor language command, Soler Arechalde 2006 via Graham) `[verified]` — which is itself a reason a clinician would not want them in a signed note.

### 3.2 Notes drop them

- The transcription industry default is **clean verbatim**: filler words, crutch words, stutters and quickly-corrected false starts are omitted; the result is "clear, succinct, and easy to read" while preserving meaning, and "sentences are clean but not paraphrased" `[verified]` (TranscribeMe style guide; GoTranscript guide).
- A clinical note is a further step removed: "A medical note is not a transcript" — it preserves clinically useful information and reasoning, not utterances `[verified]` (Vero SOAP guide). SOAP/E/M documentation guidance stresses succinct, accurate encounter accounts `[verified]` (AAPC, https://www.aapc.com/blog/77962-clean-up-e-m-documentation-with-soap).
- **Recommendation** `[inferred]`: Spanish drafts must drop *este, eh, pues, bueno, o sea-as-hesitation* and false starts, exactly as the English pipeline's tidy/retraction pass does — clean-verbatim-like transcripts feeding written-style drafts. The one exception to preserve: a filler carrying clinical content (e.g. a patient's own quoted speech pattern relevant to mental-state observation) — but that is a quoting decision for the format designer (S5), not a reason to keep fillers in the draft body.

---

## 4. Q3 — Published whisper.cpp Spanish-accuracy evidence

whisper.cpp is a port of OpenAI's Whisper: it runs the original Whisper PyTorch weights converted to ggml format, so published Whisper accuracy figures transfer to it (modulo quantisation, which Apunta does not currently apply — no quantised model is in ACQUISITION.md) `[verified]` (https://github.com/ggml-org/whisper.cpp/blob/master/README.md ; https://github.com/ggml-org/whisper.cpp/blob/master/models/README.md). Apunta builds ggml-org/whisper.cpp pinned at commit `371b5a7…` `[verified]` (`scripts/build-whisper-candidate.sh`). Supported targets include `large-v3` and `large-v3-turbo` `[verified]` (same README). Licence: MIT `[verified]` (same page) — no licence obstacle.

Spanish numbers (all on read speech — see caveat):

| Model | Spanish WER | Source |
| --- | --- | --- |
| large-v3 | **2.9%** (best of 12 languages; 54% of utterances word-perfect, median 0.0%) | `[verified]` Vocova July 2026 reproducible benchmark, FLEURS test split, 50 utterances — https://vocova.app/blog/ai-transcription-accuracy-benchmark-2026 |
| large-v3-turbo | 3.3% | `[verified]` same benchmark |
| small | 6.5% | `[verified]` same benchmark |
| large-v2 | 3.0% | `[verified]` Whisper-paper FLEURS table as compiled in the same benchmark |
| large-v3 vs large-v2 | 10–20% error reduction (all languages, Common Voice 15 + Fleurs) | `[verified]` OpenAI release discussion — https://github.com/openai/whisper/discussions/1762 |

Caveats for S4a: FLEURS is clean single-speaker read speech — a ceiling, not a promise; real dictation (accent, disfluencies, domain terms) scores worse `[verified]` (Vocova methodology section). Whisper-family failures cluster as repetition-loop hallucinations on weaker languages (none observed for Spanish; 4/1,749 overall, all turbo/small on Cantonese/Hindi) and published audits find ~1% fabricated segments concentrated around pauses/disfluent speech `[verified]` (same benchmark §"Finding 4", citing https://arxiv.org/abs/2402.08021) — directly relevant to §2: disfluent self-corrections are exactly where hallucinations concentrate, another reason the quote-verification gate must carry over to Spanish. `[not found]`: no published WER specifically for Mexican-Spanish clinical dictation through whisper.cpp — checked the benchmark, the release discussion and the Open ASR Leaderboard paper extracts; S4a must measure on the synthetic es_MX fixture instead. Data not available, flag for the owner only if she asks for a number before S4a runs.

---

## 5. Q4 — Piper: repo, licence, voices, redistribution positions

### 5.1 Repository and licence

- The maintained repository is **OHF-Voice/piper1-gpl** (Open Home Foundation): "Fast and local neural text-to-speech engine", `pip install piper-tts` `[verified]` (https://github.com/OHF-Voice/piper1-gpl). Licence **GPL-3.0** (repo tag); `setup.py` declares `GPL-3.0-or-later`; `COPYING` is GPL v3 `[verified]` (https://github.com/OHF-Voice/piper1-gpl/blob/main/setup.py ; https://github.com/OHF-Voice/piper1-gpl/blob/main/COPYING).
- **rhasspy/piper is archived** (owner-archived 2025-10-06, read-only); its README redirects development to OHF-Voice/piper1-gpl `[verified]` (https://github.com/rhasspy/piper).
- This matches ACQUISITION.md A09, which already records Piper as dev-only GPL-3.0 — no new finding, confirms the manifest `[verified]` (`docs/v2/ACQUISITION.md` §1, read locally). L-POLICY allows any OSI licence for development-only tools never shipped or linked `[verified]` (same file §3). whisper.cpp's MIT and Piper's GPL-3.0 are both fine under that row since neither ships in the app.

### 5.2 es_MX voices (no es_ES fallback needed — es_MX exists)

| Voice | Quality | Samplerate | Dataset / licence (per card) | Card URL | Generated-audio redistribution position |
| --- | --- | --- | --- | --- | --- |
| es_MX-claude | **high** | 22,050 Hz | HirCoir Piper-TTS-Spanish space, **apache-2.0** | https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/claude/high/MODEL_CARD | `[not found]` — full card text checked (15 lines): language/speakers/quality/samplerate/dataset/Training only; silent on generated audio |
| es_MX-ald | **medium** | 22,050 Hz | `rmcpantoja/Ald_Mexican_Spanish_speech_dataset`, **Unlicense** (http://unlicense.org, public-domain dedication); finetuned from es_ES-davefx medium | https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/medium/MODEL_CARD | `[not found]` — full card text checked (320 bytes); silent on generated audio |
| es_MX-ald | **x-low** | 22,050 Hz | Synthetic dataset generated with es_MX-ald-medium from Tatoeba sentences (~8 h); **no dataset licence stated** | https://huggingface.co/rhasspy/piper-voices/blob/main/es/es_MX/ald/x_low/MODEL_CARD | `[not found]` — full card text checked (589 bytes); silent on generated audio |

Directory listings confirm these are **all** the es_MX voices (speakers: ald, claude; ald qualities: medium + x_low; claude: high only) `[verified]` (§1 listing URLs). So the A10 fallback ("es_ES only if no es_MX voice exists") does not trigger.

### 5.3 en_US voice (one, for P3.5)

| Voice | Quality | Samplerate | Dataset / licence (per card) | Card URL | Generated-audio redistribution position |
| --- | --- | --- | --- | --- | --- |
| en_US-ljspeech (**recommended**) | **medium** | 22,050 Hz | LJ Speech, **public domain**; US English female, single speaker, trained from scratch | https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/ljspeech/medium/MODEL_CARD | `[not found]` — full card text checked (517 bytes); silent on generated audio |
| en_US-lessac (documented alternative) | medium (also high, low) | 22,050 Hz | LESSAC Blizzard 2013, bespoke CSTR licence | https://huggingface.co/rhasspy/piper-voices/blob/main/en/en_US/lessac/medium/MODEL_CARD | `[not found]` — full card text checked (351 bytes); silent on generated audio |

Recommendation `[inferred]`: **en_US-ljspeech-medium** — public-domain training dataset (cleanest downstream position), medium quality (small download, fast synthesis, ample for a 30 s fixture), single female US speaker. lessac-medium is a fine substitute but its dataset carries a bespoke Blizzard licence page, so ljspeech dominates on licence clarity.

### 5.4 L-POLICY row 4 verdict (decides S4a.1 / P3.5)

L-POLICY row 4 (ACQUISITION.md §3): generated fixtures may be committed **only if the voice's model card permits redistribution of generated audio; otherwise generate at test time into the sandbox and never commit** `[verified]` (`docs/v2/ACQUISITION.md`, read locally).

- **None of the five cards checked states any position on redistributing generated audio** — each card covers only language/speakers/quality/samplerate/dataset-licence/training. Verdict per card: `[not found]` (what was checked: the complete card text at each URL in §5.2–5.3).
- Two adjacent facts that are **not** card permission (do not satisfy the row as written): the piper-voices repo carries a repo-level MIT tag `[verified]` (https://huggingface.co/rhasspy/piper-voices) — that tags the repository/voice files, not synthetic outputs; and two datasets are public-domain/Unlicense (ald) or public-domain (ljspeech), one apache-2.0 (claude) `[verified]` (cards above) — dataset licences govern the training recordings, not TTS output.
- **Consequence:** under L-POLICY row 4 as written, P3.5's English fixture and S4a.1's Spanish audio **must be generated at test time into the sandbox and never committed** (P3.5 already makes this conditional; S4a.1's "at most 10 MB committed" cannot be used until a card permits it). The compliant default needs no lawyer; relaxing it does — see §7.4.

---

## 6. What S2 / S4 / S5 take from this

- **S5 (formats + D9 markers):** adopt the §2.2 ranking as provisional; wire the verbatim-quote verification gate from `retractions.ts` into the Spanish retraction path (non-negotiable for *o sea*/*digo*); drop fillers per §3.2; grow the marker list only from her real Spanish dictations.
- **S4a (STT evaluation):** Spanish starts from a strong baseline (2.9% large-v3 on read speech) but must measure Mexican-accented disfluent dictation itself; use es_MX-ald-medium (best quality/cleanest dataset licence: Unlicense) or claude-high for synthesis, generated at test time, never committed (§5.4).
- **P3.5:** en_US-ljspeech-medium, generated at test time into the sandbox.

---

## 7. Not legal advice; open questions for a Mexican lawyer

1. NOM-004 §5.16 flexibility for psychology records is established in S1.1; whether a Spanish AI-drafted *nota de evolución* needs any additional legend or consent is for counsel, not this file.
2. Whether the piper-voices repo-level MIT tag, or the public-domain/Unlicense status of the ald and ljspeech training datasets, already permits committing short synthetic fixture utterances (fabricated John Smith-type text, no donor voice identifiable) — i.e. whether L-POLICY row 4's card-permission requirement is stricter than the law/licences require.
3. Whether the LESSAC Blizzard 2013 licence imposes any condition relevant to lessac-generated fixture audio, if P3.5 ever prefers lessac over ljspeech.
4. Tatoeba sentences carry CC-BY (attribution) for the x_low training data — irrelevant while nothing is committed, but note it if x_low is ever preferred over ald-medium for committed artefacts.
