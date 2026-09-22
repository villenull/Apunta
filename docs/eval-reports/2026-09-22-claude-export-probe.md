# Claude export shape probe — 2026-09-22

## Result

**GO for `docs/import-existing-notes.md`, Checklist A step 2.** The real export's shape matches the M11 importer's inferred schema. No importer change is required before the owner uses the Settings import flow.

This report contains shape, keys, counts, and dates only. It contains no conversation titles, names, message text, attachment names, or extracted content.

## Probe and archive shape

Command run once, against the export in place:

```text
npm run probe:claude -- /home/villenull/apunta-migration/conversations-000.zip
```

The archive contains one file:

- `conversations.json` — 33,469 KB

`conversations.json` is an array with **508** top-level conversation objects.

Conversation keys observed (key × items):

- `uuid` × 400
- `name` × 400
- `summary` × 400
- `created_at` × 400
- `updated_at` × 400
- `account` × 400
- `chat_messages` × 400

The probe samples up to 400 objects when reporting key presence; the top-level count is the complete count.

## Message shape

- **2,800** `chat_messages` across **508** conversations
- Message keys (each × 2,000 sampled items): `uuid`, `text`, `content`, `sender`, `created_at`, `updated_at`, `attachments`, `files`, `parent_message_uuid`
- Sender roles: `human` × **1,414**; `assistant` × **1,386**
- Message text length: median **1,886** characters; longest **34,608** characters
- Messages per conversation: 1 = **14**; 2–5 = **359**; 6–10 = **81**; 11–25 = **37**; 26–50 = **8**; 51–100 = **5**; 101–200 = **0**; 201+ = **0**

## Per-conversation/session shape

Using the importer's six-hour session gap:

- 0 sessions = **4** conversations
- 1 session = **422**
- 2–5 sessions = **66**
- 6–20 sessions = **15**
- 21+ sessions = **1**

The export has **85** conversations active on or after **2026-07-01**; **45** of those have at least two sessions. This is in the expected range for the owner's roughly 25 patients after the importer's additional clinical-note and confident-name filters. The probe cannot determine those filters' outcomes without exposing content, so the Settings preview remains the required final check.

Branch metadata: **21** branch points across **15** conversations.

Date ranges:

- `created_at`: **2025-01-31 → 2026-09-17**
- `updated_at`: **2025-01-31 → 2026-09-18**

## Attachments and compatibility

- Messages with attachments: **126**, containing **141** attachments
- Attachments with non-empty extracted content: **141**
- Messages with files: **258**, containing **327** files

These fields are present in the inferred schema. The existing importer counts attached items, excludes them from imported note bodies, and reports them in the preview/provenance rather than silently treating them as note text. No importer change is required from this probe.

## Comparison with M11's inferred schema

Confirmed by the probe:

- one ZIP containing `conversations.json`;
- top-level conversation array;
- `chat_messages` message arrays;
- `sender` values limited to `human` and `assistant`;
- message IDs and `parent_message_uuid` links for live-thread selection;
- `text`/`content` fields and ISO date fields;
- attachment/file collections that the importer explicitly counts and excludes;
- enough timestamp data to apply the six-hour session split and the 2026-07-01 cutoff.

The owner can proceed with step 2: select the export in Settings, review the shape-based preview, untick any obvious non-patients, and import only after checking the patient list. The import remains drafts-only, idempotent, and undoable as documented.
