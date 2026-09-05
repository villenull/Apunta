# M11 — importing her Claude conversations

**Depends on:** M1 (patients, notes), M6 (formats). Independent of the model.
**Status:** built 2026-09-05 — server, screen and tests, against the
*inferred* export schema below. Running it on her real export stays gated on
the confidentiality decision (see *Before any of this runs*), and the probe
should be run on the real export first, because the schema is a guess until
it is not.

## What was asked for

The practice owner has months of Claude conversations in which she has talked
through her work: many separate chats that between them amount to a log of
every time she has thought about, say, Bob. She would like those people to
arrive in Apunta as patients, with the history attached.

## Why this packet is mostly a set of refusals

The plumbing is easy. Everything that makes this hard is about what a clinical
record *is*, and the obvious implementation fabricates one.

**Her words are the record. Claude's are not.** A conversation is a dialogue:
her account of a session, and a model's replies about it. Importing the
assistant's text as note history would put sentences into her record that she
never wrote and may never have agreed with — the same failure this project
spent M10 measuring and fighting, arriving through a side door. **Default: a
proposed note is built from `human` messages only.** Assistant text may be
shown beside a proposal, marked as such, for her to pull from deliberately.
It is never the default body.

**A conversation date is not a session date.** The timestamp says when she
talked to Claude, which may be days after the session, or about three sessions
at once. Every imported note carries the conversation's date labelled as
*recorded*, never as the session date, and she can correct it. Guessing a
session date from prose is exactly the kind of inference that produces a
confident wrong record.

**No model summarisation in v1.** Asking the 4B to condense a long chat into a
note is the highest-fabrication-risk operation in this whole app: long input,
no source discipline, and an output that looks finished. The import carries
her own words across verbatim. If she wants them shaped, the refine chat
already exists and she drives it, one note at a time, seeing the result.

**Nothing lands unreviewed.** Every patient and every note is a *proposal* she
accepts, edits or discards individually. There is no "import all". This is
slower and it is the point: the alternative is a practice whose records were
assembled by a script from chat logs.

**Identification is not the model's job.** Deciding that a conversation is
about a patient called Bob, from free text, is a judgement with clinical
consequences. See stage 2 for the ordering: match what she has already told
us, then *offer* candidates, never assert them.

## Before any of this runs

The export contains **everything she has ever discussed with Claude** — not
only patients. Personal material, other people's names, things that are
nobody's business. The owner's partner named the gate himself: this waits
until the confidentiality question is settled, not until the code works.

Two properties the implementation must have regardless:

- The archive is **read where it lies** and never copied into Apunta's data
  directory. Nothing survives the run except what she accepted.
- The whole pipeline is **offline**. Hard rule 1 is not relaxed: the app must
  not call Claude's API to fetch conversations, and the importer must not
  either. The export is her action, taken in her account, out of band.

## The pipeline

### Stage 0 — the export (hers, not ours)

Claude → Settings → Privacy → Export data. It arrives by email as a zip.
No code in this repository participates in this step, by design.

### Stage 1 — probe the archive

`scripts/probe-claude-export.mjs` (**built, in this commit**) reports the
archive's *shape* — how many conversations, message counts, sender roles,
date range, field names — and no content whatsoever. Run it first. Its
purpose is to replace an assumption with a fact: this repository has never
seen a real Claude export, and the schema below is inferred rather than
known. Everything downstream depends on it being right.

### Stage 2 — candidate people, in order of trustworthiness

1. **Names she has already entered.** If a patient exists in Apunta, match
   conversations that mention that name. Highest precision, and it needs no
   inference at all. Start here; for the first pass she may simply add the
   handful of names she wants and re-run.
2. **Recurring proper nouns**, offered as a list of *possible* people with
   their conversation counts, for her to promote or ignore. Cheap, noisy,
   and honest about being noisy.
3. **Nothing else.** In particular, not the model.

### Stage 3 — note proposals

Per matched conversation: one proposal, body assembled from her `human`
messages in order, with the assistant's turns available but excluded. Carry
the conversation id and date as provenance so the origin of an imported note
is always answerable.

### Stage 4 — review

A queue she works through: proposed patient, proposed date (labelled
*recorded*), source conversation, draft body. Accept / edit / discard.
Prioritise by recency and by how often a name appears, because the realistic
failure of this feature is not a bad import but hundreds of proposals nobody
has time to read.

### Stage 5 — write

Only accepted proposals. Imported notes are marked as imported — a note whose
words came from a chat log is a different thing from one she dictated after a
session, and in five years that difference will matter to whoever reads the
record.

## Open questions, to answer with a real export in hand

- The archive's actual schema. The probe exists to answer this; the guesses
  in it (`conversations.json`, `chat_messages`, `sender`, `text`,
  `created_at`) are guesses.
- Whether attachments or images appear, and what to do with them (v1: ignore,
  and say so in the report rather than silently dropping them).
- How many conversations there actually are, which decides whether stage 4 is
  an afternoon or a month.
- Whether she ever had Claude draft notes she then used as-is. If so, some
  assistant text *is* her record, and stage 3's default needs a per-note
  escape hatch rather than a global one.

## What was built (2026-09-05)

- `server/src/import/zip.ts` — a minimal ZIP reader on `node:zlib`, so the
  export is opened by ~80 lines of our own code rather than a dependency.
- `server/src/import/claude.ts` — the tolerant reader (top-level array or a
  wrapper key; `sender` or `role`; `text` or content blocks), proposals from
  `human` turns only, candidate people from her existing patients first and
  recurring proper nouns second, and nothing from a model.
- `POST /api/import/claude` — the upload, read in memory and kept nowhere;
  answers proposals. `POST /api/import/claude/accept` — writes only what she
  accepted, one transaction, each note a draft dated when she talked to
  Claude with a transcript row of source `import` whose first line names
  the source conversation (migration 003 widened the CHECK).
- `Settings → Import from Claude` (`web/src/routes/Import.tsx`) — choose the
  file; tick which recurring names are patients and fix their spelling;
  assign each conversation to a person or skip it; trim her words; press
  the one button that says how many notes it will write. Claude's replies
  are behind a fold marked *never imported*.
- Fixture: `e2e/fixtures/claude-export/` — five fabricated conversations in
  the inferred shape, including a recipe, so a test can prove personal
  material never becomes a patient.

Still open, and only a real export can close it: the schema itself.
`npm run probe:claude -- <export.zip>` prints its shape and nothing else.

## Acceptance

The probe runs on her real export and its report matches what she expects to
be in there · no proposal is written without her accepting it · no imported
note contains assistant text she did not choose · every imported note names
its source conversation · the archive is untouched and uncopied · the whole
run works with the network off.
