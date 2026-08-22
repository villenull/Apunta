# Patience — Practice Notes

A local-first app for a solo practice that turns dictated or typed session
summaries into structured clinical notes. The UI runs in a browser tab; all
AI processing (transcription and note drafting) runs on the local PC with
free, open-weight models — nothing leaves the machine.

**Status: planning.** Architecture and implementation plan are being drafted.

## Repository layout

| Path | What it is |
| --- | --- |
| `prototype/` | Click-through HTML/CSS prototype used as the design reference. Open `prototype/index.html` in a browser to walk it. No build step, no real data — every interaction is mocked. |

## The prototype flow

1. `index.html` — login / create account
2. `onboarding-format.html` → `onboarding-preview.html` — define a note format (upload a blank template, upload example notes, or describe sections) and confirm the detected sections
3. `add-patient.html` — minimal patient record (name + optional identifier)
4. `patients.html` — the main three-column workspace: patients list, notes list, and a note editor with an AI "Refine" chat (highlight-to-reference, quick actions, publish/copy)
5. `capture.html` — new note capture: record audio or type a summary
6. `settings.html` — manage note formats
