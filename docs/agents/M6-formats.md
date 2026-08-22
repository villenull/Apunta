# M6 — Format onboarding + skill import

**Depends on:** M3 (run after M3; may be done in any order with M4, M5)

## Goal

Complete the note-format story: detect a format from an uploaded blank
template or example notes, a full format editor, and the mechanism that lets
the owner's Claude skill drive a format's drafting instructions.

Read `docs/skill-porting.md` and research §4 first.

**Also read `docs/research/style-profile-design-2026-08.md` before touching
anything voice-related.** The owner asked for drafts in her established voice
learned from her past notes, and separately forbade the model from stating
conclusions she did not voice. The naive implementation of the first defeats
the second, and that document is the design that resolves it — including two
rules it is easy to get wrong (features may describe a sentence but never a
section, because a section-length target is a content quota; and attribution
and hedging may only be raised, never lowered, because de-hedging is itself a
faithfulness failure even when it is genuinely her voice).

Her past notes must never become prompt content. A gate before any of this
ships: a half-day pre-experiment (§7.1 of that document) testing whether a
12B model follows a descriptive style block at all. If it does not, the whole
design collapses to golden pairs — worth finding out cheaply rather than
after building it.

## Deliverables

1. Text extraction in `server/src/extract/`: `.docx` via `mammoth`
   (raw text), `.pdf` via a maintained pdf-text library (verify current best;
   record choice in decisions.md), `.txt`/`.md` passthrough. Reject other
   types and files > 10MB with clear errors. Unit-test with small checked-in
   fixture files (fabricated content only).
2. `POST /api/formats/detect` (multipart, 1–3 files + `kind`):
   extract → concatenate (labeled per file for `examples`) → 
   `LlmProvider.detectFormat` → `{name, sections[]}`. Fake provider returns
   SOAP for anything containing "Subjective", else a fixed intake shape.
3. Onboarding UI (`onboarding-format.html` + `onboarding-preview.html` to
   parity): all three options live — template upload (dropzone, drag +
   click-to-browse), example notes upload (2–3 files), describe-it-myself
   (M2 built this). Detection → preview screen with editable name and
   section chips (remove ×, add, and now **rename + reorder** — drag or
   up/down buttons, your call). "Start over" and "Looks right, save" per
   prototype. Loading state while detection runs.
4. Format editor reachable from Settings "Edit": same chips UI editing an
   existing format's name/sections, plus an **Instructions** panel — a
   textarea over `note_formats.instructions` with helper copy linking to
   docs/skill-porting.md ("Paste flattened skill instructions here; leave
   blank to use the built-in default"). Editing sections of a format that
   has notes is allowed and only affects future drafts (state this in the
   UI).
5. Skill import affordance: on the Instructions panel, an "Import from
   skill file" button accepting a `SKILL.md` (or .zip containing one) that
   runs the flattening steps from docs/skill-porting.md mechanically: strip
   YAML frontmatter, drop lines referencing scripts/files/tools
   (heuristics documented in code), inline nothing (warn when the body
   references `references/` files so the user pastes those manually), and
   place the result in the textarea for review before save. Unit-test the
   flattener against a fixture skill folder.

## Acceptance criteria

- Integration: detect endpoint with docx fixture returns sections (fake
  mode); oversize and wrong-type rejections; format PATCH persists
  instructions and generation (fake) receives them (assert via prompt
  builder spy or snapshot).
- Unit: extractors on fixtures, skill flattener (frontmatter stripped,
  script lines dropped, reference warning emitted).
- Playwright: template-upload onboarding path (set files on the input) →
  preview chips → save → format usable in capture; settings edit renames a
  section and adds instructions.
- Baseline suite green.
