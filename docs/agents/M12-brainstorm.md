# M12 — Brainstorm

**Depends on:** M3 (the Ollama provider), M9 (the briefing's note lookback).
**Status:** done (2026-09-21).

## Goal

A **Brainstorm** entry in the patient's notes column, directly above
"Treatment plan". It turns the right-hand pane into a freeform chat, like
Claude or ChatGPT, with the local model about that patient. No task:
open discussion, with that patient's recent notes as context.

It is a thinking aid, never a record. Nothing said in it is written into a
note, a plan or the patient's details, and the model is told to keep what
the notes say apart from general clinical ideas.

## Scope

1. **Placement and UI.** "Brainstorm" styled like the other column actions,
   above "Treatment plan"; `?view=brainstorm` in the URL like plan and prep.
   The pane shows the conversation: her turns and the model's replies
   visually distinct, replies streamed token by token, a composer where
   Enter sends and Shift+Enter breaks the line (disabled while a reply
   streams), a Stop button, auto-scroll that lets go when she scrolls up,
   an empty-state line, and the replies' Markdown rendered safely (no raw
   HTML, ever). A collapsible "Context" line says which notes the model was
   given.
2. **Local model only.** The existing Ollama provider and model. No new
   network destination; the egress guard is untouched.
3. **Context.** The system prompt carries the patient's name and their most
   recent notes, capped by the briefing's lookback setting (default 5). The
   whole prompt (system, notes, conversation) is budgeted to the context
   window. On overflow: oldest conversation turns first, then the oldest
   notes, whole notes only, never a cut mid-note.
   *(2026-09-21, owner: the lookback cap is gone — every note is eligible,
   as many as fit; `docs/decisions.md`.)*
4. **Faithfulness stance.** The prompt separates what the notes say from
   general clinical ideas, and has the model say plainly when something is
   not in the notes rather than invent history. Brainstorm never modifies a
   note, plan, briefing or patient.
5. **Persistence.** One ongoing conversation per patient in SQLite (new
   migration, UUIDv7 ids, UTC timestamps), reloaded when she returns. A
   "New conversation" button clears it after a confirm. Deleting a patient
   deletes it (cascade, like notes); archiving keeps it (like notes); an
   import undo keeps a patient who has a conversation.
6. **Fake mode.** `APUNTA_FAKE_AI=1` streams a canned reply.
7. **Schemas.** Request, response and SSE event shapes as zod schemas in
   `shared/`, event names documented there.

Out of scope: several conversations per patient, search, export, attaching
a conversation to a note, and any path from a reply into the record.

## Acceptance criteria

- [ ] Server: context assembly (name, newest notes first, lookback cap);
      budget truncation (turns first, then notes, whole notes, a note too
      long to fit alone is left out and reported); persistence and reload;
      clear; the never-modifies-the-record guarantee asserted against the
      database; fake-mode stream; a real-socket stream test.
- [ ] Web: send, streamed render, Stop, Enter vs Shift+Enter, the Context
      line, safe Markdown (no HTML injection), New conversation with confirm.
- [ ] Playwright spec in `e2e/` (fake mode). Not run on the partner's PC:
      no Playwright browsers there.
- [ ] Docs: HANDOFF, `docs/decisions.md` row.
- [ ] lint, typecheck, unit/integration, build green.
