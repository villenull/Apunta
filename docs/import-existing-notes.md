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
- Read each imported note before relying on it. Claude imports arrive as
  drafts; an export date is not automatically the date of a clinical
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

### 2. Import it into Apunta

Only after the confidentiality decision is explicit. Apunta imports
automatically: it does not ask you to read each note first. Instead, every
note arrives as a draft you can read and fix at your own pace, and the whole
import can be taken back with one click.

1. **Make sure you have a note format** (Apunta asks for one the first time
   you open it). Imported notes need one to live in.
2. **Open Settings → Import from Claude** and choose the zip Claude sent
   you, or the `conversations.json` file inside it. The file is read on this
   Mac, for that moment only, and is not copied into Apunta.
3. **Check the date.** Apunta imports every patient you have seen since that
   day, with *all* of their notes — the older ones too. It starts at
   1 July 2026; move it earlier to bring in patients you have not seen since.
4. **Optionally, list your patients' names**, one per line. You do not have to:
   without a list, Apunta takes each name from the chat's title. A list helps
   when a title does not name the person, and gives the spelling you want. If
   one of your patients' names is also an ordinary word (Will, Grace, May),
   write it as you would in a note.
5. **Leave "Each note is" on Claude's last reply** — the note you ended up
   with in each session. Choose "Your own messages" only if you want what you
   typed to Claude instead.
6. **Press "Check what will be imported".** You get one short screen: how
   many patients will be created, how many notes, how many chats were
   skipped, and the list of patients, each with a tick. **Untick anyone who
   is obviously not a patient.** It takes a second; there is no note text to
   read here.
7. **Press Import.** The report says what was created for whom, and why the
   other chats were skipped. If anything looks wrong, press **Undo this
   import**.

How Apunta decides a chat is one of your patients — all of these, or it is
left alone:

- you talked in it **on or after the date** you chose;
- you came back to it on **at least two separate occasions** (a pause of more
  than six hours starts a new session, and each session becomes its own
  note);
- in at least two sessions, Claude's reply **looks like a clinical note** —
  it has headings such as Subjective, Assessment, Plan, Risk or
  Interventions, or the section names of your own format;
- a **name** can be told: one of the names on your list clearly stands out
  in the chat, or the chat's title starts with a name. Two names from your
  list with neither standing out means the chat is skipped.

What each imported note looks like:

- It is a **draft**, never finalized. Nothing is signed off for you.
- Its title is **"Imported session"** and the day you talked to Claude. That
  day is when you wrote the note, which may not be the day of the session —
  correct it if you know better.
- Its transcript starts with a line naming the Claude chat, which session of
  it this was, and whether the note came from Claude's reply or your own
  messages.
- If a session had a file attached, the note says so; the file itself stays
  in Claude.

Some patients are named from the chat's title, so check the names in your
patient list. To fix one, hover over the patient, click **Rename**, type the
name and press **Save**. If two chats both start with the same name, Apunta
does not assume they are the same person: you get "Maria (1)" and
"Maria (2)", and you rename them.

Running the import again is safe. Sessions already imported are skipped, so
nothing is doubled — it only adds sessions that are new since last time, on
the same patient as before.

**Undo** removes the notes that import created, and the patients it created
if nothing else is attached to them. It never touches patients or notes you
made yourself, and it keeps any imported note you have finalized since.
Earlier imports can be undone later from the same screen, under
**Earlier imports**.

### What the Claude import does not do

- **It does not read the chats as a person would.** A chat about a friend
  that happens to look like clinical notes could be imported, and a real
  patient's chat with an unusual title could be skipped. The summary and
  a look down your patient list are there to catch the first; move the
  date or add names to your list to catch the second.
- **It does not summarise or rewrite anything.** Each note is Claude's reply,
  or your messages, word for word. Edit it in Apunta like any other draft.
- **Attachments and images are not imported.** They are counted and the
  note says so; they stay in Claude.
- When you edited a message or asked Claude to try again, only the version
  you ended up with is imported.
- The skipped list shows why, when and how long, and never the chat's title
  or words.

Before using a real export, your partner can run this local, shape-only
command, which prints counts and dates and no text, titles or names:

```text
npm run probe:claude -- /path/to/export.zip
```

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

- Claude: after authorization, **Settings → Import from Claude** imports
  every patient seen since a date you choose, one draft per session, and
  can be undone in one click.
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
