# S2.6 — not-May-edit defects found while fixing the 15 es-MX literal assertions

Five findings, all reached by following the card's own acceptance rows rather than
by looking for them. None is suppressed, none is worked around by loosening a
check, and none is edited: each names the file, the line and what a fix would
have to touch, so the coordinator can scope it. Per the dispatch, the
implementation reported these and continued its independent checks.

---

## F1 — the More-menu `LanguageDialog` prints an English string on the Spanish screen

**Where:** `shared/src/i18n/en.ts` and `shared/src/i18n/es-MX.ts`, the keys
`language.en.endonym` and `language.en.english`; rendered by
`web/src/components/LanguageDialog.tsx:83-88`.

**What happens.** In Spanish the dialog shows, for the English option:

```
English (United States)
Inglés (Estados Unidos)
```

and `expectNoEnglishUi` reports it:

```
Error: English catalogue text on the Spanish the Language dialog with nothing in flight screen
+   "language.en.english [text]: \"English (United States)\" (es-MX: \"Inglés (Estados Unidos)\")"
```

**Why it is a finding and not noise.** The chooser writes each language's own
name for itself and, under it, the name in English, so a user who landed in
Spanish can still find their language from the English line — the component says
so in its own comment, and the design is the owner's (2026-09-27). For Spanish
both lines are byte-identical in the two catalogues and the identical-value rule
passes them:

| key | en | es-MX | |
| --- | --- | --- | --- |
| `language.es-MX.endonym` | `Español (México)` | `Español (México)` | identical |
| `language.es-MX.english` | `Spanish (Mexico)` | `Spanish (Mexico)` | identical |
| `language.en.endonym` | `English (United States)` | `English (United States)` | identical |
| `language.en.english` | `English (United States)` | `Inglés (Estados Unidos)` | **differs** |

So the string the dialog prints is reported against the one key whose Spanish
differs. **The report is true: the two catalogues do disagree about
"English (United States)".** The endonym line is correctly untranslated — an
endonym is a proper noun — but the *same string* is also the English value of
`language.en.english`, and that key is translated. The catalogues are internally
inconsistent: `language.en.english` is the only one of the four left translated
where its endonym is the language's own name.

**What a fix would touch.** One value: make `language.en.english` in
`es-MX.ts` byte-identical to `language.en.endonym`, which is what its three
siblings already do and which would also make the component's own "drop the
second line when they are equal" rule do its intended job in Spanish. No other
surface renders these keys, so there is no second call site.

**An `ALLOWED` entry is not among the options and is struck from this record.**
An earlier draft offered it as the alternative. AM-059 forbids adding a
no-English allow-list entry, HS-7 forbids loosening a guard to make a result
pass, and it would have hidden the catalogue disagreement rather than repaired
it. A later card will read this file; the option must not be there for it to
find.

**Why this card did neither.** `en.ts`/`es-MX.ts` are licensed here for the single
`plan.attestationStatement` key and the five `settings.language*` keys, and
`LanguageDialog.tsx` is not licensed at all — `language.en.english` is neither,
so the value cannot be changed from this attempt. This card's own instruction is
also explicit that a check tuned until it is quiet is worse than no check.

**How the row was left.** The dialog is checked, on both its in-flight and its
idle state, and the idle one **fails**. That is the single failure in V1.

---

## F2 — an in-flight reading of the dialog found fewer strings than the idle
## one. Cause unknown; the explanation this file first gave is withdrawn

> **Correction, 2026-09-27, after independent review.** The finding as originally
> written here was **defective in its cause**, and it has been corrected rather
> than deleted so the record is not quietly improved. The observation is kept;
> the mechanism is not. Do not scope an amendment from F2.

**Observed.** The in-flight check on the same dialog reports **0 English** while
the idle check on it fails, and the check's own annotations read **54 strings in
flight, 62 idle**.

**Withdrawn: the opacity cause.** This section previously claimed that
`web/src/styles/app.css:5092` (`.language-option:disabled { opacity: 0.7 }`),
read through `e2e/support/no-english.ts:129-131`, makes
`checkVisibility({checkOpacity: true, checkVisibilityCSS: true})` return
`false`, so the walker reads none of a disabled control's text, and offered an
"isolated probe" in which a bare `<button disabled>` returned `true` and the
`opacity: 0.7` option returned `false`. **None of that is reproducible.** An
independent re-probe on this box's own Chromium
(`docs/v2/state/reviews/S2.6-AM059-implementation.md` §6), against a DOM carrying
the app's exact class names, a real `disabled` attribute and the real
`opacity: 0.7` rule, returned:

```
disabledOption: true   endonymInDisabled: true
englishInDisabled: true
h2: true   displayNone: false   visibilityHidden: false   opacityZero: false
walker output: ["English (United States)","Inglés (Estados Unidos)",
                "English (United States)","Inglés (Estados Unidos)",
                "Elige tu idioma","reason"]
```

Exit 0. Only `display:none`, `visibility:hidden` and `opacity: 0` return false.
**A sub-1 opacity does not hide an element from `checkVisibility`**, the walker
reads every string of the disabled control, and the bare `<button disabled>` and
the app's dimmed option both return `true`.

Two further reasons the original finding could not stand, independent of the
probe:

1. It was inconsistent with its own evidence. The five strings it listed as
   unreadable included `Elige tu idioma` — the dialog's `<h2>`, rendered outside
   any `.language-option` — which no rule on the button can hide.
2. The arithmetic did not reconcile. 62 − 54 = 8, and the finding accounted for
   5. And the in-flight state *adds* a string the idle state does not have,
   `settings.languageChangeBlocked` in `language-busy`, so in flight should read
   **more**, not fewer. The two counts are of two different page states, so
   "54 in flight against 62 idle" is a comparison across states dressed up as a
   measurement of one.

**What survives, and what does not.** The counts are a real observation and are
preserved as one. The conclusion drawn from them — that a disabled control is
invisible to the check, "a blind spot in the instrument on **every** screen" —
does not survive, and with it the claim that the walker's silence about a whole
class of UI means nothing. **No cause is known.** Nothing here supports a change
to `no-english.ts` or to `app.css`; in particular the originally proposed repair
("stop letting a sub-1 opacity hide a control's text") would be a **no-op** and
must not be carried into an amendment. This goes back for re-diagnosis.

**Effect on V1: none on the verdict.** Had the option lines genuinely been
unreadable in flight, the in-flight check would not have reported F1 either —
but the idle check fails on the catalogue disagreement on its own, so V1 stays
**FAIL** with the same single failure regardless of what caused the in-flight
reading. The screen is checked in both states and neither was removed.

---

## F3 — three `aria-label` templates in `PatientMenu.tsx` are English in every language

**Where:** `web/src/components/PatientMenu.tsx:437` (`Tools for {name}`), `:593`
(`Delete {name}`), `:606` (`Archive {name}`).

**What happens.** The row menu's accessible names are English templates built in
the component, while the visible text behind them is translated
(`patients.renameAction`, `common.archive`, `patients.delete`). The consequence
for a Spanish screen is that the *only* way to name those three menu items is in
English — which is why `e2e/tests/workspace.spec.ts` keeps three English literals,
with a comment at each:

```ts
await page.getByLabel(`Tools for ${patientName}`).click();
await page.getByLabel(`Archive ${patientName}`).click();
await page.getByLabel(`Delete ${patientName}`).click();
```

Note what this costs: the assertions name the item by its English `aria-label`
rather than by its translated visible text, so they are *weaker* in Spanish than
in English. They are kept because the same English appears in both projects, so
they hold either way — and the weakness is recorded here rather than hidden.

**What a fix would touch.** Three template literals in one component, and a
catalogue key per label with `{name}` in it. `PatientMenu.tsx` is not in this
card's May edit, and `es-MX.ts` is not licensed for new keys here.

**Not reachable by `expectNoEnglishUi`,** which reads text nodes and
`placeholder`s, not `aria-label`s. A screen reader does. That is worth stating
plainly: the check cannot see this class of defect at all.

---

## F4 — the extractor's refusals are literals, so the scan refusal is English on a Spanish screen

**Where:** `server/src/extract/pdf.ts:58` and `server/src/extract/index.ts:27`.

**What happens.** Uploading a scanned PDF answers with a hardcoded English
sentence — "This PDF looks like a scan — the pages are pictures, not text, and
Apunta can't read text out of a picture." — and no catalogue key carries it. So
`e2e/tests/formats.spec.ts` keeps `toContainText('scan')` as an English literal,
with the reason in a comment at the assertion: there is no Spanish to assert
instead. AM-045 gave S2.5 the sentences some `extract` functions return; these two
are outside that licence and outside this one.

**What a fix would touch.** Two literals in `server/src/extract/`, a catalogue key
per sentence, and the callers that must switch from a message to a key. The card
already notes the shape of that work in AM-045's "not widened, deliberately"
paragraph, for the neighbouring `extract/types.ts` case.

---

## F5 — the standard note format is English in a Spanish UI (C-LANG@1 rule 8)

**Where:** `server/src/routes/formats.ts:59-60`.

**What happens.** The onboarding option "My standard progress note" creates
`STANDARD_PROGRESS_FORMAT` — the name, the seven section names and the drafting
instructions — with no `locale`, so it is `en` in both projects. C-LANG@1 rule 8
says "The **Spanish** standard format is created as a **separate** format with
`locale: 'es-MX'`; English formats are untouched." The Spanish one is not created.

**How it is asserted.** `e2e/tests/formats.spec.ts` keeps its three English
assertions on the created format's `name`, `sections` and `instructions`, with a
comment saying why: making them locale-aware would assert behaviour that does not
exist. The option card's own subtitle is language-aware already
(`format.standardSubtitle`), and it is the *section names* that stay English —
they are the shared constant's own words, passed as data.

**What a fix would touch.** `server/src/routes/formats.ts` (choose the locale at
creation, and a Spanish `STANDARD_PROGRESS_FORMAT` equivalent with its own
section names and instructions). Not in this card's May edit. The e2e spec already
carries the comment that says which three assertions to revisit when it is fixed.

---

## F6 — `brand.spec.ts` rewrites committed P2.2 evidence on every e2e run

**Where:** `e2e/tests/brand.spec.ts:267`, writing through `screenshotPath()`
(`:150-152`) into `docs/v2/evidence/P2.2/screenshots/`.

**What happens.** `await page.screenshot({ path: screenshotPath(slug) })` runs
**unconditionally**, with no `existsSync` guard and no `UPDATE_SCREENSHOTS` check.
So every `npm run e2e` overwrites four committed P2.2 evidence PNGs
(`light-default-accent`, `light-accent-7c3aed`, `dark-default-accent`,
`dark-accent-7c3aed`). PNG encoding is not byte-stable, so the files differ on
every run and the working tree is dirty afterwards — the exact noise that
`workspace.spec.ts:9-20` says the Stop hook exists to catch, and that file guards
against deliberately:

```ts
const shouldWriteScreenshot = () => process.env.UPDATE_SCREENSHOTS === '1' || !existsSync(SCREENSHOT);
```

AM-056 had to repair this once already ("Four generated historical screenshots
were restored to preserve P2.2 evidence"), and it has recurred.

**What happened in this session, and the repair.** The V1 run at
2026-09-27T16:57:58-06:00 rewrote all four. That is four files of another card's
evidence that this card does not own and did not mean to touch.
`git checkout -- docs/v2/evidence/P2.2/screenshots/` restored them, and
`git status --porcelain -- docs/v2/evidence/P2.2/` is now empty — verified, not
assumed. The screenshots are back to the committed bytes.

**What a fix would touch.** The guard `workspace.spec.ts` already uses, copied
across: write only when the file is missing, or when `UPDATE_SCREENSHOTS=1`. Or
better, write to a sandbox run folder and copy deliberately. Either way
`e2e/tests/brand.spec.ts` is not in this card's May edit, so the guard was not
added here — the four files were restored and the recurrence is reported.

**Why it is worth reporting rather than shrugging at:** an evidence file that any
test run silently rewrites is not evidence. It is a screenshot of whatever the
last run happened to paint, wearing a card's name.

---

## What was **not** reported, because it is correct


Worth recording, because three of them looked like the same class of bug:

- **`chat.firstPass` and `chat.publishedRefusal` in English on a Spanish screen.**
  Converted to `tr()` first, and the browser run then failed — correctly. The
  replies come from the server under `msg(locale, …)` with
  `locale = capture(db, noteId)`, i.e. **the note's** locale, and those notes were
  made from a format with no locale, so they are `en` (C-LANG@1 rule 4, and the
  contract's own rejection example: "UI switched to Español, user refines an
  existing English note → the note stays English"). Reverted to English literals,
  with a comment at each saying so. The Spanish screen around an English thread
  is the rule working.
- **The plan document's English headings** on the Spanish screen
  (`TREATMENT PLAN`, `Service frequency:`, `Signatures:`). AM-059 puts this
  outside the attestation fix explicitly; `planDocumentText` carries the stored
  values verbatim and its headings are a separate surface.
- **The AI banner's shape.** It is `ai.unreachable` + a link + `ai.bannerTail`,
  not the single `ai.unreachable_banner` key — which nothing renders. Asserted as
  the joined shape with `trRe()` on both halves rather than against the unused
  key.
