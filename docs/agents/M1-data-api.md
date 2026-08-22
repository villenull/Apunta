# M1 — Data layer + CRUD API

**Depends on:** M0

## Goal

The full persistence layer and every non-AI endpoint, integration-tested.
No UI changes beyond keeping the placeholder green.

## Deliverables

1. SQLite via `better-sqlite3`. DB file `practice-notes.db` inside
   `PATIENCE_DATA_DIR` (default `~/Library/Application Support/Practice
   Notes/`, created on boot). Numbered SQL migrations in
   `server/migrations/` applied at startup inside a transaction, tracked in
   a `schema_migrations` table.
2. Schema exactly as `docs/PLAN.md` §3 (patients, note_formats, notes,
   transcripts, chat_messages, settings). UUIDv7 ids generated server-side;
   UTC ISO timestamps.
3. Repository modules in `server/src/db/` (plain functions over the
   database handle — no ORM). Foreign keys ON; deleting a patient cascades
   notes/transcripts/chat; deleting a note cascades transcripts/chat.
4. Zod schemas in `shared/` for every entity + request/response body, reused
   for Fastify validation (parse in a preHandler or route wrapper).
5. Routes (see PLAN §4): patients CRUD (+ archive via PATCH), notes CRUD,
   `GET /api/patients/:id/notes` (newest first), publish/unpublish, formats
   CRUD, settings GET/PUT. Sensible errors: 404 unknown id, 400 validation,
   409 publishing an already-published note.
   - `POST /api/notes` accepts `{patient_id, format_id, content?}` for a
     manually created note (AI drafting arrives in M3).
   - Publish sets `status='published'`, `published_at`; editing content via
     PATCH on a published note is rejected with 409 (unlock first) — the
     chat-based rules come later, this is the API-level invariant.
6. `GET /api/health` extended: reports db path + migration level (AI checks
   remain stubs).
7. Seed script `npm run seed` (dev-only): inserts the prototype's sample
   patients, formats (Progress note: Subjective/Objective/Assessment/Plan;
   Intake note: Presenting problem/History/Formulation/Plan) and sample
   notes from `prototype/patients.html`.

## Acceptance criteria

- Integration tests (fastify.inject + temp data dir) cover every route:
  happy path, 404s, validation failures, cascade deletes, publish/unpublish
  invariants, archived-patient filtering.
- Restarting the server against an existing db is a no-op (migrations
  idempotent); a unit test proves migration tracking.
- `npm run seed && npm run dev` lets you `curl` the seeded patients.
- Baseline suite (lint/typecheck/test/build/e2e) green.
