# M13 — Halaxy PDF import

**Depends on:** M1 (patients, notes), M6 (formats), M11's import-batch and
undo mechanism. Independent of the model.
**Status:** in progress (2026-09-22). The owner's existing notes also live in
Halaxy, but no real sample is available and her account is practitioner-level;
implement against a fabricated, text-based PDF only.

## Goal

Let the owner bring existing Halaxy history into Apunta without giving the app
(or an agent) access to Halaxy. She supplies one text-based PDF per patient;
Apunta parses that file locally into one note per detected session, shows a
preview she can correct and trim, and then writes the selected notes as one
published-history batch that can be undone with the existing import-batch undo
route.

The importer is deliberately conservative. It carries text and dates/headings
from the PDF, never asks a model to summarize or identify a patient, and makes
no network request. A scanned or otherwise imageless PDF is rejected with a
clear message rather than silently producing an empty record.

## Scope

1. **Local PDF parsing.** Accept multipart `files` uploads, one or more PDFs.
   Read text locally with a bundled dependency and no CDN, network, Halaxy
   client or external service. Detect the patient name and session boundaries
   from the text's dates and headings; produce one note per detected session.
   Preserve the session text as plain text and expose a warning when the parser
   cannot confidently identify a date or heading.
2. **Synthetic fixture first.** Author a text-based synthetic PDF containing a
   fake patient (for example John Smith), multiple dated sessions, headings and
   ordinary note text. Include a scanned/imageless fixture or equivalent test
   input so the rejection path is exercised without real patient material.
3. **Preview endpoint.** `POST /api/import/halaxy/preview` accepts multipart
   field `files` with 1..n PDFs and returns the preview contract below. It does
   not create patients, notes, batches, files or other persistent state.
   Rejected files include a clear reason.
4. **Preview UI.** Add the Halaxy import flow alongside the existing Claude
   import. Show each patient/file, parsed patient name, dates, titles and note
   text, warnings and rejected files. Let the owner edit the patient name and
   untick individual notes before saving.
5. **Batch import.** `POST /api/import/halaxy` accepts the selected preview
   data as JSON. Create the patient and selected notes in one transaction and
   return the same batch shape used by Claude import. Notes are saved as
   published history, not drafts. One import is one undoable batch through the
   existing import-batch undo route.
6. **Privacy and fake mode.** Keep runtime egress loopback-only and retain
   `APUNTA_FAKE_AI=1` compatibility. No AI is involved in parsing or import.
7. **Schemas and tests.** Put the zod API schemas in `shared/` as the single
   source of truth. Add colocated server/web tests and synthetic-only browser
   coverage for parsing, preview, selection, published notes and undo.

## Contract

The shared schemas are:

```ts
HalaxyPreviewNote {
  key: string,
  date: string,       // ISO date
  title?: string,
  text: string
}

HalaxyPreviewPatient {
  fileName: string,
  patientName: string,
  notes: HalaxyPreviewNote[],
  warnings: string[]
}

HalaxyPreviewResponse {
  patients: HalaxyPreviewPatient[],
  rejected: { fileName: string, reason: string }[]
}

HalaxyImportRequest {
  patients: {
    fileName: string,
    patientName: string,
    notes: { date: string, title?: string, text: string }[]
  }[]
}

HalaxyImportResponse = the same batch shape returned by Claude import;
reuse its batch/undo mechanism rather than introducing a second one.
```

`POST /api/import/halaxy/preview` is multipart, uses field `files`, accepts
1..n PDFs, and persists nothing. `POST /api/import/halaxy` is JSON and writes
only the selected patients/notes as one batch. The importer must not accept
arbitrary paths or read from the live data directory.

## Implementation notes (2026-09-22)

The server/shared slice and Settings flow are implemented against the
synthetic John Smith PDF. Migration 006 preserves pre-existing Claude batch
links under foreign-key enforcement and rolls back transactionally; focused
coverage asserts that legacy undo still works. Fixture extraction is
egress-guarded, the bundled `unpdf` dependency has no worker or CMap URLs
configured, and parsing remains a static server dependency. Focused
Playwright verification passed three repeated runs (**3 passed, 9.5s**) in
fake AI on disposable port `7800`, covering patient-name click, published
history import and undo. The integrated project gate then passed at
`690853b`: build:shared, typecheck, lint (including 111 licenses), 108 test
files/1,390 tests, production build, 40 e2e tests and 60 fake-eval runs all
exited 0.

## Acceptance criteria

- [ ] A fabricated text-based PDF with a fake patient and multiple dated
      sessions parses locally into the expected patient, dates, headings and
      plain-text note bodies.
- [ ] The parser splits one patient's file into one preview note per detected
      session and reports ambiguous/missing date or heading information as a
      warning rather than inventing it.
- [ ] Scanned/image-only or otherwise imageless PDFs are rejected with a clear
      reason; no empty patient or note is persisted.
- [ ] Preview accepts multiple files, returns the exact shared response shape,
      persists nothing, and reports rejected files without exposing file
      contents in logs.
- [ ] The UI lets the owner edit each patient name and untick notes before the
      import request; the selected preview is what gets written.
- [ ] Import creates the patient and notes in one transaction, stores notes as
      published history (not drafts), and returns the existing Claude batch
      response shape.
- [ ] One Halaxy import is undoable through the existing import-batch undo
      route, including removal of patients created by that batch when no later
      data depends on them.
- [ ] Synthetic server and web tests cover parsing, rejection, preview
      non-persistence, selection, published status and undo; fake mode remains
      runnable and no runtime network destination is added.
- [ ] The packet's focused tests, typecheck and build pass; no real Halaxy or
      patient export is opened, imported, or committed.

## Non-goals

- OCR, image recognition, or any scanned-PDF fallback.
- Preserving or importing attachments, letters, images, or other non-text
  material; these are dropped with an explicit warning where detectable.
- A Halaxy API client, login, browser automation, practice export integration,
  or any outbound request to Halaxy.
- Reading a real Halaxy account/export or inferring its private file format.
- Model summarisation, model-based patient identification, or clinical
  rewriting of imported text.
- Per-note draft review, multiple independent import batches for one submit,
  or a new undo implementation separate from Claude's existing mechanism.
