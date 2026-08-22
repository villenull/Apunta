# Porting a Claude skill into Practice Notes

The owner's spouse has a Claude skill she uses to write her clinical notes.
Practice Notes does **not** run a skills engine — instead, each note format
has an `instructions` field (see Settings → format → Instructions), and that
text becomes the system prompt for local-model drafting. This doc is the
recipe for turning the skill into that text. Research backing:
`docs/research/local-ai-stack-2026-08.md` §4.

## What a skill is

A folder with `SKILL.md` (YAML frontmatter + markdown body) and optional
`references/`, `scripts/`, `assets/`. Only the markdown matters here.

## Flattening recipe

1. **Strip the YAML frontmatter** (name/description/allowed-tools etc.) —
   the app routes explicitly, so triggering metadata is dead weight.
2. **Keep**: the instruction body — workflow steps, section definitions,
   style/tone rules, terminology, do/don't lists, inline examples, output
   templates.
3. **Delete or replace every file/tool reference**: lines like "read
   `references/FORMS.md`" or "run `scripts/x.py`" mean nothing to a chat
   completion. If a referenced file contains needed content (a section
   spec, terminology), paste that content inline instead.
4. **Drop Claude-specific mechanics**: tool-use expectations, XML-tag
   conventions, extended-thinking instructions.
5. **Don't restate the output format as prose formatting rules** — the app
   enforces structure with a JSON schema (one field per section) and renders
   the text itself. The instructions should say what belongs *in* each
   section, not how to format headings.
6. **Add 1–2 few-shot pairs** (dictation → finished note) using fabricated
   patients. These do more for a small local model than any amount of rules.
7. **Budget: keep the result under ~4–5K tokens.** Small (4–12B) models
   drift on longer instruction blocks. Cut duplicated guidance first.

The M6 "Import from skill file" button automates steps 1, 3 (line-level
heuristics), and 4, then leaves the result for human review — steps 3
(content inlining), 6, and 7 are judgment calls done by hand.

## Why this works

- Structured output is grammar-enforced at sampling time (Ollama `format` /
  llama.cpp JSON-schema → GBNF), so the model *cannot* return a
  wrong-shaped note; the instructions only have to win on content quality.
- The schema parameter is invisible to the model, so the app's prompt
  builder always restates the section names and their meaning — the
  flattened instructions should describe sections in the same names the
  format defines.
- Every request is stateless (full system prompt each call), which avoids
  the known drift where skill instructions "wear off" over a long chat.

## When the skill arrives

1. Open Settings → the relevant format → Instructions.
2. Use Import from skill file (or paste manually), apply the recipe above.
3. Run `npm run eval` before/after to confirm the instructions improved
   structural fidelity, and spot-check a few drafts in the app.
