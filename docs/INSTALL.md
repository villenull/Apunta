# Installing Apunta

This is for the person who is going to use Apunta, not for a programmer. There
are no commands in it. If something here does not match what you see on screen,
that is worth saying out loud rather than working around — the person who gave
you this file wants to know.

**What you need:** a Mac with an Apple chip (M1 or later), macOS 14 or newer,
about 15 GB of free space, and an internet connection for the first hour.
After that, Apunta never uses the internet again.

---

## What Apunta is, in one paragraph

Apunta helps you turn a dictation or a few rough notes into a clinical note in
your own format. Everything it does happens on your Mac: the writing and the
transcription are done by AI models that live on this computer, and nothing you
type or say is ever sent anywhere. It looks like a website, but it is not on
the internet — it is a program on your Mac showing you a page.

---

## 1. Install it

1. Find the file you were given. It is called **Apunta.dmg**, and it is
   probably in your **Downloads** folder.
2. Double-click it. A window opens with the Apunta icon on the left and a
   folder called **Applications** on the right.
3. **Drag the Apunta icon onto the Applications folder.** That is the install.
   It takes a few seconds.
4. Close that window. In Finder's sidebar, click the small **⏏** next to
   "Apunta" to eject it. You can put Apunta.dmg in the Trash now.

---

## 2. The first time you open it, macOS will stop you

This is expected, and it is not a sign that anything is wrong. Apunta is not
registered with Apple — that costs a yearly fee and has not been paid — so
macOS treats it as software it cannot vouch for. It says the same thing about
plenty of perfectly ordinary programs.

Here is what happens and what to do.

1. Open **Applications** in Finder and double-click **Apunta**.
2. A box appears saying macOS **cannot verify** that Apunta is free of malware.
   The only buttons are **Move to Trash** and **Done** (or **Cancel**).
   **Do not click Move to Trash.** Click the other one.
3. Open **System Settings** (the grey gear icon in your Dock, or ⌘-Space and
   type "System Settings").
4. Click **Privacy & Security** in the left-hand list.
5. Scroll down. Past General, past FileVault, past Firewall. Near the bottom
   there is a short paragraph that says **"Apunta" was blocked from use because
   it is not from an identified developer** — it only appeared because of step
   2 — and beside it a button that says **Open Anyway**.
6. Click **Open Anyway**. macOS asks for your login password or Touch ID.
7. One more box appears. Click **Open**.

That is once, ever. From then on Apunta opens normally.

> **If someone tells you to hold Control and click the app instead:** that
> stopped working in macOS Sequoia. The System Settings path above is the only
> one that works now.

> **This page has not been checked against your Mac yet.** The wording of these
> dialogs changes between macOS versions. If what you see does not match, take
> a photo of the screen before clicking anything.

---

## 3. Setting up, once

The first time Apunta runs, it needs to download the two AI models it uses. A
window appears telling you:

- **which writing model it chose and why.** Apunta looks at how much memory
  your Mac has and picks the best model it can run. It says the number, so you
  can check it against your Mac.
- **how much it is about to download** and how much space you have. If there is
  not enough room it says so, with the exact amount you would need to clear,
  and downloads nothing.
- **who made the models and where their terms are.** There is a link. Apunta
  does not host or copy these models — your Mac downloads them from the people
  who made them.

Click **Download**.

**This takes a while.** The two models are between 4 GB and 23 GB depending on
your Mac. On a normal home connection expect **twenty minutes to two hours**.
The bar shows how far along it is and roughly how much time is left.

You can close your laptop or quit Apunta in the middle. Nothing is lost —
when you open it again it picks up where it stopped rather than starting over.

**If it stops with a message**, read the message. Every one of them says what
happened and what to do, and every one has a **Try again** button that is safe
to press. The most common is simply the internet dropping.

When it finishes, Apunta opens by itself in your browser.

---

## 4. Using it, day to day

Apunta lives in the **menu bar** — the strip along the top of your screen, on
the right. Look for a small pencil-and-square icon.

Click it and you get:

| | |
| --- | --- |
| **Open Apunta** | opens the browser tab again if you closed it |
| **Show My Notes Folder in Finder** | opens the folder where your notes are kept |
| **Stop Apunta** | shuts down the AI, without quitting |
| **Quit Apunta** | closes everything |

Closing the browser tab does **not** close Apunta. Quitting from the menu-bar
icon does.

To start it again, open it from Applications like any other app — or add it to
your Dock by dragging it there once.

### How to tell it is working

- The menu-bar icon is there and not greyed out.
- The tab shows your patient list rather than an error.
- Inside Apunta, the **Setup** page shows every row green. It is the honest
  answer to "is anything missing?".

---

## 5. What to do if something goes wrong

**Nothing happens when I open it.** Give it thirty seconds — the first start
after a restart is slow because the AI has to load. If the menu-bar icon never
appears, quit it (⌘-Q with Apunta in front, or Force Quit from the Apple menu)
and open it again.

**The browser tab says it cannot connect.** Apunta is not running. Open it from
Applications.

**A draft never appears.** Open the **Setup** page inside Apunta. It checks
every part and names the one that is missing.

**It says the model is missing after it worked before.** Something deleted the
downloads. Quit Apunta and open it again; the setup window comes back and
downloads what is gone.

**Anything else.** Take a photo of the screen. The message is written to be
useful to whoever helps you, and a photo of it is worth more than a
description.

---

## 6. Updates

Apunta does not check for updates, on purpose. Checking would mean contacting a
server, and the whole point of this app is that it never does. When there is a
new version you will be given a new **Apunta.dmg**; install it the same way,
over the top. Your notes are in a separate folder and are not touched.

---

## 7. Backing up

**Do this early.** Apunta holds your drafting history — the rough notes, the
transcripts, the conversations where you refined a note — and that exists
nowhere else. Your finished notes are in whatever records system you paste them
into; everything before that is only here.

Inside Apunta: **Settings → Back up now**. It writes a single file you can put
on a USB drive or an external disk. It is readable without Apunta — the notes
inside are plain text files you can open in TextEdit — so a backup is useful
even in a future where Apunta is gone.

Two things worth knowing:

- **Do not save backups into Documents or Desktop** if iCloud is syncing them.
  That uploads your patients' notes to Apple. Apunta warns you if you choose
  one of those folders.
- **A backup you have never restored is a hypothesis.** Try it once, early,
  while nothing depends on it.

---

## 8. Removing Apunta

There are two different things you might mean, and they are not the same.

### Remove the app, keep the notes

1. Quit Apunta from the menu-bar icon.
2. Open **Applications** and drag **Apunta** to the Trash.
3. Empty the Trash.

Your notes stay in the folder the menu's **Show My Notes Folder in Finder**
opens. Installing Apunta again picks them up exactly as they were.

The AI models — several gigabytes — are in that same folder, in two
sub-folders called **models** and **ollama**. If you want the space back and do
not intend to re-install, drag those two to the Trash. Everything else in that
folder is your notes.

### Remove everything, including the notes

**This destroys every patient, note, transcript and treatment plan Apunta
holds, and it cannot be undone.** Make a backup first (section 7) and put it
somewhere that is not this Mac.

Then: do the three steps above, and afterwards drag the whole notes folder to
the Trash and empty it.

If the person who set this up for you installed the "start Apunta at login"
helper, there is one more file, and it is easier to ask them than to find it
yourself. There is a script for it — `scripts/uninstall-macos.sh` — which they
will know what to do with.

---

## What Apunta cannot protect you from

Two things, stated here because they are true and the app says so too:

**Someone at your unlocked Mac.** Apunta has no password of its own. Anyone
sitting at this computer while you are logged in can read everything in it.
Locking the screen when you walk away is the real answer.

**A stolen Mac with the disk unencrypted.** FileVault is macOS's disk
encryption and it is what makes a lost laptop a lost laptop rather than a
disclosure of every note you have written. It is not on by default on every
Mac. Apunta's **Setup** page tells you whether it is on, and refuses to call
itself private while it is off.
