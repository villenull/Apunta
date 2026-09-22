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

Apunta can import note text from Halaxy PDFs. The steps are in Checklist B
below; do not rename a Halaxy PDF or zip to make it look like a Claude
export.

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
   The shape-only probe found 45 conversations with two or more sessions,
   which is an upper bound rather than 45 patients: it cannot distinguish
   general or instruction chats, several chats for one patient, or branch
   over-counting. Review the preview carefully: untick anything that is not a
   patient, merge duplicate patients, and check the patient and draft counts
   before pressing Import.
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
  or your messages, word for word. Only Claude's formatting marks go: no
  asterisks, `#` or link addresses, so a copy into Halaxy is clean text.
  A heading or a bold label such as **Location:** becomes a plain
  `Location:` line, and Apunta shows a short label like that at the start of
  a line in bold. Bullets become `- `; numbered lists stay as they were.
  Edit it in Apunta like any other draft.
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

Apunta imports note text from Halaxy PDFs. It does not sign in to Halaxy or
send the records anywhere.

1. In Halaxy, print the patient's clinical notes and save a PDF in the
   local-only folder from Safety first. Choose **one text-based PDF per
   patient**.
2. In Apunta, open **Settings → Import from Halaxy** and choose the PDFs.
   Scanned or image-only PDFs are refused; Apunta does not use OCR.
3. Check the preview carefully: confirm the patient name, check that there is
   one note per session, untick anything wrong, and read every warning.
4. Press **Import** when the preview is right.
5. If anything is wrong, press **Undo** for that import and correct the PDF
   before trying again.

Only note text is imported. Attachments, letters, images, and other files are
not imported and stay in the source PDF or Halaxy.
