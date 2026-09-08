# Bringing existing notes into Apunta

This guide is for the practice owner. It covers two possible sources: Claude
chat history and Halaxy clinical records. It does not sign in to either
service, request credentials, or send records to an AI/cloud agent.

## Safety first

The notes may contain patient and other private health information. Before
handling a real export:

- Confirm that you are allowed to export and handle these records for this
  migration. Your partner can prepare the local workflow, but this does not
  waive that confidentiality decision.
- Make a local-only folder that is not Desktop, Documents, iCloud Drive,
  Dropbox, Google Drive, OneDrive, or another synchronised location. For
  example, use a folder named `Apunta-local-migration` in a part of the Mac
  that you have checked is not cloud-synchronised.
- Keep the original export unchanged. Make working copies only when needed,
  and keep a written count of the files/records you expect to review.
- Do not email an export, upload it to Claude/ChatGPT or another cloud agent,
  paste its contents into a support chat, or put it in a repository, fixture,
  or commit. Do not send Halaxy credentials or API keys to anyone.
- Review every proposed patient, date, note body, and attachment before it is
  accepted. An export date is not automatically the date of a clinical
  session.

There is no Halaxy importer in Apunta today. Do not rename a Halaxy PDF or
zip to make it look like a Claude export; that cannot make it safe or
compatible.

## Checklist A — Claude

### 1. Request the export in Claude

Anthropic's current public instructions say that individual Free, Pro, and
Max users can export conversation data and account data from Claude on the
web or in Claude Desktop. Team and Enterprise members cannot request this as
ordinary members: only the organization's Primary Owner can access those
exports. Claude for iOS and Android cannot start an export.

In the web app or Claude Desktop:

1. Click your initials in the lower-left corner.
2. Choose **Settings**.
3. Open **Privacy**.
4. Click **Export data**.
5. Wait for the email, then sign in to Claude and use the download link.

The email goes to the address on the account. Anthropic says the link expires
24 hours after delivery; request a new export if it expires. Save the zip in
the local-only folder above. The export contains the account's conversation
history, not just conversations about patients, so expect unrelated personal
material as well.

Source: [Anthropic — Export your Claude data](https://support.claude.com/en/articles/9450526-export-your-claude-data)
(accessed 2026-09-08).

### 2. Review it in Apunta

Only after the confidentiality decision is explicit, open Apunta and choose
**Settings → Import from Claude**. Choose either the Claude zip or the
`conversations.json` file inside it. Apunta reads the selected file locally
for the preview request; the upload is held in memory for that request and
is not copied into Apunta's data directory. Nothing is written by the
preview.

The review screen is deliberately conservative:

- It proposes one possible note per conversation that has readable human
  turns. It uses your human turns in order as the default body. Claude's
  replies are shown only if you open the fold and are never imported by
  default.
- Existing Apunta patients are matched by name first. Other recurring,
  capitalised names are only offered as possible people. You must decide
  whether a name is a patient, correct its spelling, and assign each
  conversation or choose **nobody — skip this one**.
- Edit or trim each body before accepting it. The button states the exact
  number of notes that will be written; nothing is written until you press
  it. Accepted notes are ordinary Apunta drafts and keep a transcript row
  identifying their source conversation.
- The date is labelled **recorded**: it is when the conversation was dated
  in the export, not a guessed clinical-session date. Correct it later only
  when you know the session date.

### What the current Claude import accepts — and does not promise

The importer was built against an inferred schema because no real Claude
export has been used. It currently accepts a zip containing a file named
`conversations.json`, or a JSON file directly. Its tolerant reader recognizes
some top-level wrappers, `sender`/`role`, and text or simple text content
blocks. That is an implementation detail, not a guarantee that every future
Claude export will match it.

Before using a real export, run this local, shape-only command after the
confidentiality decision:

```text
npm run probe:claude -- /path/to/export.zip
```

The probe prints archive file names, keys, roles, counts, text lengths, and
date ranges, but deliberately prints no message text, chat titles, or people
names. Compare
its shape with the M11 packet before opening the import screen. If it reports
an unexpected shape, stop; do not edit the parser by guesswork.

Important limitations:

- A long chat is not split into sessions or summarised. Multiple chats can
  therefore become multiple drafts for the same patient, and one chat can
  contain several sessions. The import does not consolidate them.
- Name matching is a review aid, not identity proof. Similar names, first
  names, aliases, and conversations about someone who is not a patient can
  still be offered or missed.
- There is no general duplicate detector. Repeating an accepted conversation
  can create another draft. Keep the source conversation id and your review
  log, and do not accept the same conversation twice.
- Conversation timestamps are preserved as recorded dates only. Missing or
  malformed dates remain undated; no session date is inferred from prose.
- The current proposal is text-only. Attachments, images, and other archive
  entries are not a supported note body or attachment workflow. Stop and
  report the shape rather than accepting a file if the probe shows them are
  clinically important; they must not be silently dropped.
- Unknown or unreadable conversation rows may be skipped and counted. A
  successful preview is not proof that every item in the archive was read.

## Checklist B — Halaxy

Halaxy documents two different kinds of export, with different permissions.
Your account is understood to be a **practitioner account, not an account
admin**. The public documentation does not establish that your particular
practitioner role can use either export, see every patient, or export every
record. Practice settings, region, patient relationships, note privacy, and
account-owner permissions can change what is available.

### Individual patient clinical-record export (documented, but verify role/region)

Halaxy's United Kingdom help guide documents a per-patient clinical-record
zip containing clinical notes, appointment notes, prescriptions, orders,
patient forms, clinical tools, and attached files:

1. Open the patient's profile, **Clinical Notes**, and any clinical note.
2. Choose **Actions → Print clinical note**.
3. Set **Content** to **All patient notes/files**, then choose **Export**.
4. Open **Actions → Download clinical notes** and wait for the export to
   finish.
5. Use the download icon to save the zip to the local-only folder.

The article does not say that this is available to every practitioner or in
every country edition of Halaxy. It is evidence that this per-patient route
exists in the UK help guide, not confirmation that it appears in your
account. Do not use another person's login to reach it.

For one clinical note, Halaxy also documents **Print** → preview in a new tab
→ save as PDF. Its print preferences can control content, detail, layout, and
letterhead. A PDF preserves the rendered document, but it is not a structured
Apunta import file and may not preserve every underlying field or version.

Sources: [Halaxy UK — Export all clinical records for a patient](https://support-uk.halaxy.com/hc/en-gb/articles/13975393634191-Export-all-clinical-records-for-a-patient) and [Halaxy UK — Print a clinical note](https://support-uk.halaxy.com/hc/en-gb/articles/13975409806991-Print-a-clinical-note) (accessed 2026-09-08).

### Full practice export (admin/permission-gated)

Halaxy's Australia help guide says full practice-data export is available to
account owners and to users whose group's account owner has granted export
permission. The account owner must request that permission by emailing
`community@halaxy.com`. Once enabled, the documented flow is:

1. **Settings → General → Data Export → Export your data now**.
2. Select data types and, optionally, a date range.
3. Choose **Export** and wait for the status to become **Completed**.
4. Download the resulting zip.

The public page does not provide a complete file manifest or field mapping,
does not say which data type contains the clinical-note body in every region,
and does not document how attachments, note versions, drafts, archived
patients, author identity, or appointment dates map in the zip. Treat those
as unknown until the authorized practice admin confirms them. A CSV patient
list is not a clinical-note export: Halaxy says patient-list exports contain
only the current page, filters, and selected columns.

Sources: [Halaxy AU — Export your practice data](https://support.halaxy.com/hc/en-au/articles/6332476795535-Export-your-practice-data) and [Halaxy AU — Manage your Patient List](https://support.halaxy.com/hc/en-au/articles/6447816423695-Manage-your-Patient-List) (accessed 2026-09-08).

Halaxy's public API guide is not a shortcut for this migration: only account
owners can purchase an API subscription, and its capability table marks
Clinical Notes as not retrievable (it shows create access, not retrieve
access). No Apunta runtime connector or API credential flow is authorized.

Source: [Halaxy AU — Guide to Halaxy API](https://support.halaxy.com/hc/en-au/articles/13014722009487-Guide-to-Halaxy-API)
(accessed 2026-09-08).

### Copy-paste request to the practice admin

Send this through the practice's approved channel; do not include a password,
API key, or patient export in the request.

> Subject: Authorized clinical-note export for local Apunta migration
>
> I am the practitioner account holder for [name/practice]. I am preparing a
> local migration to Apunta. Please confirm what I am authorized to export and
> handle under our practice policy and my Halaxy access level. If permitted,
> please enable/request the appropriate Halaxy data-export permission for my
> account, or arrange an authorized export on my behalf.
>
> Please confirm the approved date range and patient scope, and whether the
> export includes clinical-note text, note dates, author/practitioner,
> appointment links, drafts and versions, archived patients, and every file
> attachment. Please provide the exact file format and a way to download it
> directly to a local-only, non-cloud folder. I will keep the original export,
> review each record before creating an Apunta draft, and will not upload it to
> an AI/cloud service. Please tell me how to verify the record/file count and
> how to dispose of working copies under practice policy.

Until the admin confirms those points, there is no safe Halaxy import to run.

## What can happen in Apunta today

- Claude: after authorization, the existing **Settings → Import from Claude**
  flow can preview a supported zip/JSON shape and turn individually accepted
  human-authored conversation text into Apunta drafts.
- Halaxy: Apunta has no Halaxy-specific importer. A Halaxy PDF, individual
  clinical-record zip, practice-export zip, CSV, or image cannot be selected
  as a supported Apunta import today. Keep it as the source record and wait
  for an authorized, format-verified plan; never build a guessed parser.

## Smallest safe next implementation (not started)

Only after the practice admin authorizes the export and the exact format shape
is known should development begin. The first implementation artifact should
be a synthetic fixture that has the same file names/metadata structure but no
real patient text. It must settle, before parsing code is written:

1. how patient identity is represented and matched;
2. which date is the clinical-note date versus export/created/updated dates;
3. whether one file contains multiple notes, multiple files represent one
   patient, and how duplicate source ids are represented;
4. how note versions, drafts, signed/published notes, and archived patients
   are represented; and
5. how PDFs and attached files are retained, surfaced for review, and blocked
   from silent loss.

Then add a local preview/accept flow and tests for identity, dates, multiple
notes, duplicate handling, malformed records, and attachment preservation
using only synthetic fixtures. If the verified format cannot preserve an
attachment, the importer must stop or show an explicit excluded-item
decision; it must not quietly discard it. No outbound runtime calls,
account scraping, permission bypass, or cloud upload is part of this work.
