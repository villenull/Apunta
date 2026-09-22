# M4 — Refine chat

**Depends on:** M3 (run after M3; may be done in any order with M5, M6)

## Goal

The "Refine with AI" column comes alive: streaming chat that can rewrite the
note, highlight-to-reference, quick actions, and published-lock semantics —
matching `prototype/patients.html` behavior exactly.

## Deliverables

1. `POST /api/notes/:id/chat` (SSE): body `{message, refQuote?}`. Server
   loads note + format + recent chat history (last ~10 turns), persists the
   user message, calls `LlmProvider.refineNote` with the note's **current
   text**, streams `token` events for the reply, then final events:
   `message` (persisted assistant row) and, when `updatedSections` is
   non-null and the note is a draft, `note-updated` with the re-serialized
   content (persisted, `updated_at` bumped).
   - **Published-lock is server-side**: if the note is published, discard
     any `updatedSections` and reply with the prototype's canned line ("This
     note is published, so I won't change it…") unless the message is a pure
     question, which gets answered normally. Never mutate a published note.
2. Chat UI in the workspace right column (replace M2 placeholder):
   - thread rendering with user/ai bubbles, ref-quote block inside bubbles,
     empty-state line, auto-scroll — per prototype markup/styles.
   - input row with Enter-to-send and send button; disabled while streaming;
     streamed assistant text renders live.
   - quick actions: `Shorter`, `More clinical`, `Expand plan`,
     `What's missing?` — inject the prototype's exact phrases and send.
     *(Removed 2026-09-21 at the owner's request; `docs/decisions.md`.)*
   - highlight-reference: selecting text in the note textarea shows the ref
     chip (truncated at 70 chars, dismissible ×); sending attaches it as
     `refQuote`; chip clears after send. Selection via
     `selectionStart/selectionEnd` on the textarea.
3. When `note-updated` arrives, the editor content and notes-list preview
   update in place; a subtle flash/highlight on the editor signals the
   change.
4. Chat history loads with the note (`GET /api/notes/:id` includes messages
   or a subresource — your call, record it in decisions.md) and survives
   reload. The auto-first message after generation ("Here's a first pass
   based on your dictation…") is created by /api/generate — add it there if
   M3 didn't.

## Acceptance criteria

- Integration tests: draft note + "make the plan shorter" → note content
  changes and both messages persisted; question → reply without
  note-updated; published note + edit request → canned refusal, content
  untouched; published note + question → answered; refQuote persisted and
  echoed.
- Playwright (fake mode): full refine flow — select text in the note, chip
  appears, quick action rewrites the note visibly, published note refuses
  edits, unlock then edit succeeds; chat survives page reload.
- Baseline suite green.
