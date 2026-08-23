# M6 — format onboarding and detection: design

**Status:** design proposal for the M6 agent. Nothing in `/home/user/Patience` was
modified; no git command was run.
**Packet:** `docs/agents/M6-formats.md`.
**Constraint set:** `CLAUDE.md` hard rules 1–4; `docs/research/style-profile-design-2026-08.md`
(binding on anything voice-related); `docs/research/m3-preflight-2026-08.md` §2–§5
(model constraints); `docs/research/privacy-audit-2026-08.md` H1 (note text in an
error `detail`); `docs/skill-porting.md`; `docs/feedback/2026-08-22-owner-answers.md`;
`prototype/onboarding-format.html`, `prototype/onboarding-preview.html`.

**Evidence tags**, same convention as the other research docs:

- **[P]** read today from a primary source I fetched (npm registry metadata, upstream
  source files on `raw.githubusercontent.com`, or files in this repository).
- **[I]** inference — my reasoning from a [P] fact, not itself observed.
- **[U]** unverified. A gap, with the experiment that closes it named in §8.

**Every clinical fragment below is fabricated.** Patients are John Smith and Maria
Ruiz, per the prototype. I have never seen the practice owner's notes or her
templates; where I describe "her template" I am describing a plausible artefact,
not a known one.

---

## 0. Decision summary

| # | Sub-problem | Recommendation, one line |
| --- | --- | --- |
| 1 | `.docx` | `mammoth` (BSD-2-Clause) — but read its **document AST via `transformDocument`**, not `extractRawText`, because raw text throws away the heading signal that detection lives on. |
| 1 | `.pdf` | `unpdf` (MIT, zero runtime deps, bundles a serverless pdf.js) — `extractTextItems` for font size and line geometry, `extractText` as the plain fallback. Not `pdf-parse`: it now depends on the native `@napi-rs/canvas`. |
| 1 | `.txt` / `.md` | Passthrough with BOM strip and UTF-8 validation. No library. |
| 1 | `.rtf` / `.doc` / `.pages` | **Reject with instructions**, do not support. Every RTF library is a liability for one rare case, and Word/Pages both export `.docx` in two clicks. |
| 1 | Scans, encrypted PDFs, empty extractions | No OCR, ever. Detect and fail with copy that tells her what to do instead. |
| 1 | Type detection | **Sniff magic bytes**, never trust the extension or the browser's MIME type. |
| 2 | Core method | **Deterministic first.** Structure recovery (heading styles, bold runs, font size, table labels, colon-terminated line prefixes) produces a candidate list; cross-document agreement filters it for the `examples` path. The model does not run at all in the common case. |
| 2 | Where the model earns its place | Naming the format; ambiguous ordering; and the fallback when deterministic parsing finds fewer than two candidates. |
| 2 | How the model is constrained | When candidates exist, `sections` is an **array of `enum(candidates)`** — the model *selects and orders*, it cannot invent a string. When they don't, free strings are post-validated for **verbatim membership** in the extracted text. |
| 2 | Confidently wrong | Handled structurally (enum constraint, never-drop rule, membership check, line-terminal rule), because the confirmation screen is the last line of defence, not the first. |
| 2 | Offline | The deterministic path needs no model, so format onboarding works before Ollama is installed. That is a requirement, not a bonus. |
| 3 | Confirmation screen | Every chip carries **evidence** (which signal, which notes, the source line for templates); partial-coverage sections are included but badged; unmatched material is summarised; and a **blank-note preview** is shown, because she recognises the shape of her own note faster than she audits a list of chips. |
| 4 | Uploaded file lifetime | Memory only, one request, never a path, never the DB, never a log. The **file name is stripped in the browser before upload** so the server cannot leak what it never receives. |
| 4 | Retained | `{name, sections, source}` only, and only after she presses save. `/api/formats/detect` must not touch `db`. |
| 4 | Never logged | Text, candidates, section names, skeletons, file names, mammoth `messages[]` verbatim, pdf.js console output (`verbosity: 0`). Errors carry counts and slot names only. |
| 5 | Skill flattener | Mechanical for frontmatter, path/tool references, Claude mechanics, and emptied headings; **warns** rather than inlines for `references/`; never touches the mapping onto sections. |
| 5 | Skill ↔ sections mismatch | Show three lists (matched / skill-only / format-only), explain that the schema forces the format's names regardless, and offer explicit one-click actions. Never auto-apply. |
| 5 | Skill privacy | A working therapist's `SKILL.md` plausibly contains real examples, and `instructions` is persisted *and* prompted forever. Warn on import and flag likely identifiers. |
| 6 | Style profile | Section detection and voice are **two different uses of one upload**. Consent is a checkbox on the upload screen, default off; derivation is enums-only with phrase mining hard-disabled; and the whole thing is gated on the §7.1 pre-experiment in the style-profile design. |

---

## 1. File handling

### 1.1 What she will actually upload

Ranked by my estimate of likelihood, given a solo practice on a MacBook whose record
system is something else (owner answer 3) and whose format came from a workplace:

| Likelihood | Format | Where it comes from |
| --- | --- | --- |
| Near-certain | `.docx` | The workplace template, or her own note in Word/Pages exported to Word. |
| Likely | `.pdf` | A template a supervisor or an agency sent; a note printed to PDF out of the records system. **The dangerous case: it is a scan or a print-to-image.** |
| Possible | `.txt` / `.md` | A note copied out of the records system into TextEdit. |
| Possible | `.rtf` | TextEdit's own default for a styled document, and a common EHR export. |
| Occasional | `.pages` | She is on a Mac. Pages is the default word processor on a Mac with no Office licence. |
| Occasional | `.doc` | An old workplace template that has never been re-saved. |
| Occasional | A screenshot (`.png`) | People do this. It must fail politely. |

Two shapes matter more than the file type, and both are common in real clinical
templates:

- **A table.** Label in the left cell, blank cell on the right. This is how half of
  the note templates I would expect to see are laid out, and it destroys any
  line-based parser working on raw text.
- **Styles rather than text.** The headings are "Heading 2" or a custom style called
  `SectionHead`, with nothing in the text that marks them out — no colon, no capitals,
  no bold applied to the run. Raw-text extraction erases this completely.

### 1.2 Library choices

All figures below are **[P]**, read from `https://registry.npmjs.org/<pkg>/latest`
today. `unpacked` is the npm tarball's unpacked size, which is an upper bound on what
reaches a bundle — it includes tests, browser builds, maps and types.

| Need | Package | Version | Licence | Deps | Unpacked | Verdict |
| --- | --- | --- | --- | --- | --- | --- |
| `.docx` | `mammoth` | 1.12.1 | BSD-2-Clause | `lop`, `jszip`, `argparse`, `bluebird`, `base64-js`, `underscore`, `xmlbuilder`, `@xmldom/xmldom`, `path-is-absolute`, `dingbat-to-unicode` | 2.07 MiB | **Adopt.** Pure JS, no native code, no network. The packet already names it. |
| `.pdf` | `unpdf` | 1.8.1 | MIT | **none** | 2.04 MiB | **Adopt.** Zero runtime deps; embeds a serverless build of pdf.js v5.6.205 with the worker inlined; `engines.node >= 22`, which matches ours. |
| `.pdf` (rejected) | `pdf-parse` | 2.4.5 | Apache-2.0 | `pdfjs-dist`, **`@napi-rs/canvas`** | 21.3 MiB | **Reject.** v2 pulls a native canvas addon. M8 already fights one native addon (`better-sqlite3`); a second one for text extraction is unacceptable. The widely-cited "pdf-parse is the light option" advice is out of date. |
| `.pdf` (rejected) | `pdfjs-dist` direct | 6.2.108 | Apache-2.0 | none | 34.5 MiB | Rejected as a direct dependency: `unpdf` is the same engine pre-trimmed for a server, and taking pdf.js raw means owning the worker/canvas/font-resolution setup ourselves. |
| `.pdf` (rejected) | `pdf2json` | 4.0.3 | Apache-2.0 | none | 8.2 MiB | Viable second choice — zero deps, ESM. Rejected only because its output model is a proprietary page/text-run JSON that we would have to learn, where `unpdf` hands back pdf.js's well-documented `TextItem`s. |
| Office (rejected) | `officeparser` | 7.8.0 | MIT | includes **`tesseract.js`** | 12.5 MiB | **Reject.** It would drag an OCR engine into the bundle. See §1.5 on OCR. |
| Multipart | `@fastify/multipart` | 10.1.1 | MIT | 5 first-party | 188 KiB | **Adopt.** M5 needs it for `POST /api/transcribe` anyway (`docs/agents/M5-audio.md` §3), so whichever packet lands first pays. |
| Zip (skill `.zip`) | `fflate` | 0.8.3 | MIT | none | 797 KiB | **Adopt.** `unzipSync` with a `filter` that sees `originalSize` **before** decompressing — the zip-bomb guard for free. (`jszip` is already in the tree via mammoth; depending on a transitive dep directly is worse than declaring 797 KiB.) |
| `.doc` (not adopted) | `word-extractor` | 1.0.4 | MIT | `saxes`, `yauzl` | 74 KiB | Named so it is not rediscovered. See §1.5 — the answer to `.doc` is "Save As .docx", not a second parser. |

URLs and licence sources are in §10.

**Bundle cost for M8.** `docs/research/m8-bundling-2026-08.md` §6.1 settles the shape:
the server's JS is bundled by esbuild into one file in `Contents/Resources/`, and the
Node runtime alone is 37.3 MiB of the ~100 MB installer budget **[P]**. Against that,
mammoth + unpdf + fflate + multipart minified is on the order of **2–4 MB** **[I]** —
noise. The measurement that settles it is one command in M8:
`esbuild --bundle --minify --analyze` on the server entry, comparing before and after.
Do not guess it in a decisions row; measure it.

**The real M8 risk is not size, it is the dynamic import.** `unpdf` resolves its engine
with `await import('unpdf/pdfjs')` **[P]**, and separately calls
`import.meta.resolve('pdfjs-dist/package.json')` inside a `try`/`catch` to locate
standard fonts and CMaps **[P]**. Under esbuild the static specifier bundles fine
**[I]**, and the `import.meta.resolve` throws and is caught **[I]** — but "fine" and
"throws harmlessly" are both [I], and the failure mode is a packaged app that cannot
read PDFs. **M8 must run a bundled smoke test that extracts text from a fixture PDF**,
not just a unit test against `node_modules`. Failing that, mark `unpdf` external and
ship it unbundled.

### 1.3 The `.docx` extractor — read the AST, not the raw text

The packet says "`.docx` via `mammoth` (raw text)". **I recommend deviating from that,
and recording the deviation in `docs/decisions.md`.** The reason is one sentence from
mammoth's own README, quoted verbatim **[P]**:

> `mammoth.extractRawText(input)` — Extract the raw text of the document. **This will
> ignore all formatting in the document.** Each paragraph is followed by two newlines.

The formatting *is* the signal. A template whose sections are "Heading 2" paragraphs
comes out of `extractRawText` as bare lines, indistinguishable from body text; a
template laid out as a two-column table comes out as an undifferentiated run of cell
contents. Detection then has nothing to work with, and the model gets handed the job
that deterministic code should have done — which is exactly the trade this design is
trying to avoid.

Mammoth exposes the parsed document through `transformDocument`, and the AST carries
everything needed. Read from `lib/documents.js` today **[P]**:

```js
function Paragraph(children, properties) {
    return { type: "paragraph", children, styleId, styleName, numbering, alignment, indent };
}
function Run(children, properties) {
    return { type: "run", children, styleId, styleName, isBold, isUnderline, isItalic,
             isStrikethrough, isAllCaps, isSmallCaps, verticalAlignment, font, fontSize, highlight };
}
// types also include: table, tableRow, tableCell, checkbox, break, bookmarkStart, hyperlink
```

And from `lib/docx/body-reader.js` **[P]**, with its own comment:

```js
// w:sz gives the font size in half points, so halve the value to get the size in points
var fontSize = /^[0-9]+$/.test(fontSizeString) ? parseInt(fontSizeString, 10) / 2 : null;
```

So `Run.fontSize` is **points**, and `Run.font` is the `w:rFonts/@w:ascii` name.

**The non-obvious consequence, and it drives the algorithm.** `isBold`, `fontSize` and
`font` are only populated when the property is applied *directly to the run*. A
paragraph styled "Heading 1" has `isBold: false` on every run and carries its identity
on `Paragraph.styleName`. A paragraph using a workplace style called `SectionHead`,
bold by virtue of the style definition, has **neither** — only `Paragraph.styleId`.
That is precisely the packet's "a `.docx` whose structure lives in styles rather than
text", and the answer is style *clustering*: any `styleId` used by three or more short
top-level paragraphs is a heading style, whatever it is called.

Shape of the extractor (`server/src/extract/docx.ts`):

```ts
import mammoth from 'mammoth';
import type { Block } from './types.js';

/**
 * `transformDocument` is documented as unstable, so we use it as a read-only
 * *tap*: record what we see, return the element untouched. If mammoth's AST
 * shape ever changes, the worst case is fewer candidates — never a crash.
 * The fixture tests below are what make that change loud.
 */
export async function extractDocx(buffer: Buffer): Promise<Extracted> {
  const blocks: Block[] = [];
  const result = await mammoth.convertToHtml(
    { buffer },
    { transformDocument: tap(blocks) },   // we discard result.value
  );
  return {
    kind: 'docx',
    blocks,
    // NEVER log or return result.messages verbatim — see §4.3.
    warnings: result.messages.length,
  };
}
```

`Block` is the extractor's common currency across all three source types:

```ts
export interface Block {
  readonly text: string;            // paragraph or cell text, whitespace-collapsed
  readonly styleId: string | null;  // docx only
  readonly styleName: string | null;
  readonly bold: boolean;           // every run bold, or an all-bold ascii font name
  readonly allCaps: boolean;
  readonly fontSize: number | null; // points (docx) / derived from the matrix (pdf)
  readonly numbered: boolean;
  readonly inTable: boolean;
  readonly cellIndex: number | null;   // 0 = first cell of a row
  readonly rowCells: number | null;    // how many cells the row has
  readonly nextIsEmpty: boolean;       // followed by an empty paragraph / empty cell
  readonly page: number | null;        // pdf only
  readonly y: number | null;           // pdf only, PDF coordinate space
  readonly docIndex: number;           // which uploaded file (0-based), never a name
  readonly order: number;              // position within that file
}
```

### 1.4 The `.pdf` extractor

`unpdf` gives two functions and we want both. From `src/text.ts` today **[P]**:

- `extractTextItems(data)` → per page, items carrying `str`, `x`, `y`, `width`,
  `height`, `fontSize` (`Math.hypot(c, d)` from the transform matrix), `fontFamily`
  (resolved from the page's style table), `dir`, `hasEOL`.
- `extractText(data, { mergePages: true })` → a string, and — importantly — the
  implementation joins with `item.str + (item.hasEOL ? '\n' : '')` and then collapses
  whitespace *without destroying line structure* **[P]**. So line-based heuristics
  work on unpdf output, which is not true of every pdf.js wrapper.

Use `extractTextItems`, group items into lines by `y`, and keep `extractText` as a
sanity cross-check on total character count.

Two options must be set explicitly, and neither is unpdf's default:

```ts
import { extractTextItems, getDocumentProxy } from 'unpdf';

const pdf = await getDocumentProxy(new Uint8Array(buffer), {
  // pdf.js logs to the console at WARNINGS by default; font and structure
  // warnings can name fonts and objects from the document. 0 === ERRORS.
  verbosity: 0,
  // No password prompting path exists in this UI, so fail fast and cleanly.
  password: undefined,
});
```

`verbosity` is a documented `getDocument` parameter and pdf.js calls
`setVerbosityLevel(verbosity)` on the main thread **[P]**, with
`VerbosityLevel = { ERRORS: 0, WARNINGS: 1, INFOS: 5 }` **[P]**.

**Egress.** `unpdf`'s `getDocumentProxy` sets `standardFontDataUrl` and `cMapUrl` from
`import.meta.resolve('pdfjs-dist/package.json')` — a `file://` URL — and *skips them
entirely* when `pdfjs-dist` is not installed, which is our case **[P]**. So no network
call. But `server/src/egress-guard.ts` patches global `fetch` and throws
`EgressBlockedError` on anything non-loopback, and if pdf.js ever did reach for a CMap
over HTTP the whole extraction would die with an error that looks nothing like a PDF
problem. **Make it an acceptance test:** extract a fixture PDF *with the egress guard
installed*. That test is simultaneously the hard-rule-1 proof and the regression guard
on a dependency bump.

**The CMap consequence, stated honestly.** Because the CMap directory is absent, a PDF
using CID-keyed fonts (CJK, and some ligature-heavy embedded subsets) may extract as
mojibake rather than failing **[I]**. Latin-1/WinAnsi text — English and Spanish — is
unaffected **[I]**. Detect it rather than fix it: if the extracted text has a high
ratio of U+FFFD or of characters outside a Latin+punctuation set, treat the extraction
as failed. Do **not** install `pdfjs-dist` (34.5 MiB) to get CMaps for a case that may
never occur.

Also handle, by name: `PasswordException` and `InvalidPDFException`, both of which
pdf.js exports as classes **[P]**.

### 1.5 `.txt` / `.md`, and the formats to reject

**`.txt` / `.md`** — decode as UTF-8 with `fatal: true`, strip a BOM, normalise
CRLF/CR to LF, NFKC-normalise. If decoding throws, try `latin1` **only** if the byte
histogram looks like single-byte text; otherwise reject. Markdown is *not* parsed:
`# Subjective` is just a line that the candidate rules already score well.

**`.rtf` — reject.** `rtf-parser` (ISC, 27 KiB, deps `iconv-lite` + `readable-stream`)
and `rtf-stream-parser` (MIT, zero deps, 139 KiB) both exist **[P]** and both would
work. I still recommend rejecting, for three reasons: RTF's destination groups,
`\'hh` hex escapes and `\uN?` surrogates make a hand-rolled stripper a quiet
correctness hazard; a parsed RTF gives us *less* structure than a `.docx` does, so it
is the worst input for detection even when it works; and the user-side fix is two
clicks in TextEdit or Word (Save As → .docx). Copy: *"Apunta can't read .rtf. Open it
in Word or TextEdit and choose File → Save As → Word (.docx), then try again."*

**Explicitly rejected escape hatch:** macOS ships `textutil -convert txt`, which would
handle `.rtf`, `.doc` and more in one line. It is off the table because `CLAUDE.md`
hard rule 4 keeps server logic OS-portable and confines macOS assumptions to
`scripts/`. Naming it here so the next agent does not have to rediscover why.

**`.doc` — reject.** Sniffable by its OLE compound-document magic (`D0 CF 11 E0`).
Copy names the fix. `word-extractor` would do it; the cost/benefit does not clear.

**`.pages` — reject.** A `.pages` file is a zip of IWA protobuf streams; there is no
cheap reader. It sniffs as a zip, so the extractor must look *inside* before assuming
docx: a `.docx` zip contains `word/document.xml`, a `.pages` zip contains `Index/`.
Copy: *"That's an Apple Pages document. In Pages, choose File → Export To → Word."*

**Images and scanned PDFs — no OCR, ever.** `tesseract.js` is ~12 MB plus a WASM
runtime, is slow on a page of text, and would put a second inference engine in an
installer that already fights for its 100 MB **[P: officeparser's dep tree; I: the
rest]**. The design instead *detects* the case (§1.7) and says so plainly.

### 1.6 Sniffing, limits, and the multipart configuration

**Sniff, do not trust.** The browser's `File.type` comes from the OS's extension
mapping and is trivially wrong; the extension is user-controlled. Read the first 8
bytes of the buffer:

| Magic | Meaning | Then |
| --- | --- | --- |
| `50 4B 03 04` (`PK..`) | Zip container | Look for `word/document.xml` → docx; `Index/` → Pages (reject); else reject |
| `25 50 44 46 2D` (`%PDF-`) | PDF | pdf path |
| `D0 CF 11 E0 A1 B1 1A E1` | OLE compound | `.doc`/`.xls` → reject with the Save-As copy |
| `7B 5C 72 74 66` (`{\rtf`) | RTF | reject with the Save-As copy |
| `89 50 4E 47` / `FF D8 FF` | PNG / JPEG | reject: *"That's a picture. Apunta can't read text out of an image."* |
| none of the above | Assume text | UTF-8 decode with `fatal: true`; reject on failure |

15 lines, no `file-type` dependency.

**Multipart registration** (`server/src/app.ts`):

```ts
await app.register(multipart, {
  attachFieldsToBody: false,          // we iterate parts ourselves
  limits: {
    fileSize: 10 * 1024 * 1024,       // the packet's 10MB
    files: 3,                         // the packet's 1–3
    fields: 2,                        // `kind`, and the style-consent flag (§6)
    parts: 6,
    fieldSize: 64,
    fieldNameSize: 32,
    headerPairs: 64,
  },
});
```

Defaults verified **[P]**: `fileSize` 1 MiB, `files` 1, `fields` 10, `parts` 1000,
`fieldSize` 100, `fieldNameSize` 100, `headerPairs` 2000. The `fileSize` and `parts`
defaults are described as security-enforced defaults; we raise `fileSize` deliberately
and tighten everything else.

**Memory, not disk.** `@fastify/multipart` buffers in memory by default and warns about
it in its own README **[P]**; `request.saveRequestFiles()` is the API that "stores
files to tmp dir" **[P]**. So:

- Use `for await (const part of request.parts())` and `await part.toBuffer()`.
- **Never** call `saveRequestFiles()` or `part.toFile()` anywhere in the server.
  Enforce it: an ESLint `no-restricted-syntax` rule on those two member names in
  `server/**`. This is the same class of control as the existing privacy lint rules
  (`docs/decisions.md` row 19) and costs nothing.

Exceeding `fileSize` throws `RequestFileTooLargeError`, catchable via
`fastify.multipartErrors` **[P]**, and the request must still be drained. Map it to the
packet's "clear error": *"That file is larger than 10 MB. If it's a scan, Apunta can't
read it anyway — see below."*

### 1.7 Failure taxonomy and what she sees

Every row is content-free in both the log and the UI.

| Condition | Detected by | User-visible copy |
| --- | --- | --- |
| Scanned/image PDF | `extractedChars / pages < 40` | "This PDF looks like a scan — the pages are pictures, not text, and Apunta can't read text out of a picture. You could type the section names instead." |
| Encrypted PDF | `PasswordException` | "That PDF is password-protected." |
| Corrupt PDF | `InvalidPDFException` | "Apunta couldn't open that PDF — it may be damaged." |
| Mojibake | high U+FFFD / non-Latin ratio | "Apunta could open that PDF but couldn't read the text out of it." |
| Not a real docx | zip without `word/document.xml` | Per §1.6 table |
| docx mammoth throws | caught | "Apunta couldn't read that Word document." |
| Empty after extraction | `chars < 20` | "That file came out empty." |
| Extracted but no candidates | `candidates.length === 0` | "We read the file but couldn't find anything that looks like a section heading." + the three recovery options (§3.4) |
| Oversize / too many files / wrong type | multipart + sniff | Per §1.6 |

Every one of these must offer the same escape: **"Describe it myself"**, pre-filled
with nothing, one click away. The M2 path already exists and is the only path that
cannot fail.

### 1.8 Fixtures

`server/src/extract/__fixtures__/` needs real `.docx` and `.pdf` bytes; unit tests
cannot fake them. Three rules:

1. **Fabricated content only** — John Smith, Maria Ruiz, a made-up clinic. Hard rule 2.
2. **Generated by a checked-in script**, `server/src/extract/__fixtures__/make.mjs`, so
   the binaries are auditable rather than opaque. A minimal OOXML `.docx` is a zip of
   four small XML files; a minimal PDF can be written by hand or with a tiny generator.
   Commit both the script and its output so tests do not depend on running it.
3. **Cover the three docx shapes deliberately**: (a) `Heading 1`/`Heading 2` styles,
   (b) bold runs only, (c) a two-column table with blank right cells, plus (d) a
   custom style `SectionHead`. Plus a PDF with a larger heading font and a PDF with no
   extractable text (the scan case).

---

## 2. Section detection

### 2.1 A blank template and a set of example notes are different problems

They are different in the signal they carry, and treating them the same is the main
design error available here.

| | Blank template | Example notes (2–3) |
| --- | --- | --- |
| What marks a section | **Formatting** — a heading style, a bold line, a bigger font, a table label. And, decisively, *what follows it is empty*. | **Repetition** — the same short line-initial label recurs across documents about different people, in the same relative order. |
| What is noise | Letterhead, footer, instructions to the clinician, signature blocks | **All of the clinical content**, which is most of the bytes |
| Privacy | Low: a blank template usually contains no patient material | **High: this is real patient material, hard rule 2 applies in full** |
| Best evidence to show her | The source line itself | Which notes contained it, and how many |
| Model's job | Small | Smaller |

So: two candidate generators, one shared filter, one shared adjudication step.

### 2.2 Stage A — candidates from structure

Normalisation first, `server/src/detect/candidates.ts`:

```
normalizeLabel(raw):
  1. NFKC; NBSP/tab → space; collapse runs of whitespace
  2. strip a leading list marker:
       /^\s*(?:[-*•·–—]|\(?\d{1,2}[.)]|[A-Za-z][.)]|[IVXivx]{1,4}[.)])\s+/
  3. strip trailing ':' or '：'; strip trailing runs of '_', '.', '-' (leader lines)
  4. trim
matchKey(label) = casefold(label) with non-alphanumerics removed
```

**Hard rejects** — not scores, rejects. A candidate must survive all of these:

1. **Line-terminal rule.** The label is either the whole line, or a line *prefix*
   terminated by `:`. `"John reports improved sleep."` is neither, and this single rule
   does most of the work of keeping body prose out of the section list.
2. 2 ≤ characters ≤ 60, and ≤ 8 words.
3. No `?`; no sentence-final `.` after ≥ 5 words; no `@`; no run of ≥ 6 digits;
   no date-shaped substring.
4. Not in the boilerplate stoplist: `page`, `page \d of \d`, `confidential`,
   `continued`, `printed`, `date`, `dob`, `date of birth`, `client name`, `patient
   name`, `clinician`, `therapist`, `signature`, `licence`/`license`, `tel`, `fax`,
   `email`, `www`, a bare month or weekday. (Note `Date` and `Client name` are real
   *form fields* on a template but they are not note sections; if she wants one she
   can add it on the confirmation screen.)
5. Not a duplicate `matchKey` of an already-kept candidate.

**Scoring, `.docx`.** Threshold ≥ 3.

| Signal | Score |
| --- | --- |
| `styleName`/`styleId` matches `/^heading\s*[1-6]$/i` or `styleId` starts with `Heading` | +3 |
| `styleId` belongs to a **cluster**: a non-default styleId used by ≥ 3 short top-level paragraphs | +3 |
| Every run in the paragraph has `isBold` | +2 |
| `isAllCaps`, or the text is uppercase with ≥ 2 letters | +2 |
| Max run `fontSize` ≥ 1.15 × the character-weighted modal body size | +2 |
| First cell of a table row with exactly 2 cells whose second cell is empty or only `_`/`.` | +2 |
| Ends with `:` | +1 |
| `nextIsEmpty` — followed by an empty paragraph, or by a line of only `_`/`.` | +1 |
| `numbering` present and text short | +1 |
| Longer than 8 words | −3 |

The style-cluster rule is the one that catches "structure lives in styles". The
`nextIsEmpty` rule is the one that makes a *blank template* recognisable as such — a
heading followed by nothing is the definition of the thing.

**Scoring, `.pdf`.** Group items into lines by `y` (within 0.6 × median item height),
sort by `x`, join. Body size = character-weighted mode of `fontSize`. Threshold ≥ 3.

| Signal | Score |
| --- | --- |
| Line's max `fontSize` ≥ 1.15 × body size | +3 |
| Short line (≤ 8 words) followed by a vertical gap > 1.5 × median line gap | +2 |
| All-caps and short | +2 |
| Ends with `:` | +1 |
| Text repeats at a similar `y` on ≥ 2 pages (running header/footer) | −4 |
| `y` in the top 6% or bottom 8% of the page box | −3 |

Bold detection in PDF is deliberately absent from the table: `unpdf` exposes
`fontFamily` from pdf.js's style table, and whether that carries the weight (a
PostScript name like `Helvetica-Bold`) or a generic family (`sans-serif`) is **[U]**.
§8/Q2 is the half-hour experiment that settles it; if it carries weight, add
`+2 font name matches /bold|black|semibold|heavy/i`.

**Scoring, plain text.** Only rules 1–4 of the hard rejects plus: ends with `:` (+2),
all-caps (+2), Markdown ATX heading (+3), underlined by a following row of `=`/`-`
(+3), followed by a blank line (+1). Threshold ≥ 3.

### 2.3 Stage B — cross-document agreement (`examples` only)

This is where deterministic parsing decisively beats a model call, and it is worth
saying why: **a short capitalised phrase that recurs at line-start across independent
notes about different people is a structural label, not content.** That is a
frequency argument, and it is the identical argument
`docs/research/style-profile-design-2026-08.md` §3.3 makes for phrase mining ("a phrase
that recurs across three notes and two patients is, by construction, not a fact about
any one patient"). The symmetry is not a coincidence — both are separating structure
from content by repetition — and it means the two features can share the reasoning and
the tests.

```
agree(candidateSequences: string[][]):
  n        = number of uploaded files
  support(k) = |{ i : k ∈ sequence[i] }|
  include  = { k : support(k) >= 2 }            // never 1, whatever n is
  partial  = { k : support(k) >= 2 and support(k) < n }
  aside    = { k : support(k) == 1 }            // never promoted; counted only
  order    = longest common subsequence over the sequences restricted to `include`;
             candidates outside the LCS are inserted at their median index
  label(k) = the most frequent surface form, preserving her capitalisation
```

`support >= 2` is the load-bearing line, and it is a privacy control as much as an
accuracy one: a patient name, a date, a dose or a presenting problem appears in one
note. It may be raised, never lowered.

**n = 1 is a degraded case, not an error.** The packet allows 1–3 files. With one note
there is no agreement signal and the template scorer runs alone; the UI must say so:
*"One note tells us less than two or three. If you have notes from a couple of
different clients, adding them makes this much more accurate."*

### 2.4 Stage C — where the model earns its place, and what it is shown

**The plan is computed deterministically before any model call:**

| Situation | Model task | Why |
| --- | --- | --- |
| `template`, ≥ 2 candidates, most with `nextIsEmpty` | **`name`** only | The structure is unambiguous. A model call can only make it worse. |
| `template`, ≥ 2 candidates, ordering or subset unclear | **`select`** | The model chooses and orders from the candidate list. |
| `template`, < 2 candidates (a prose template: *"cover what the client said, what I observed…"*) | **`sections`** (free strings) | There is no structure to parse. This is genuinely a language problem. |
| `examples`, ≥ 2 agreed candidates | **`name`** only | Agreement is a stronger signal than a 12B model's opinion. |
| `examples`, < 2 agreed candidates | **`select`** over the union of per-file candidates | Falls back to judgement over a bounded list. |
| `manual` | none | M2 ships this; no model call, and none is needed. |

**Two invariants that make "confidently wrong" hard rather than merely unlikely:**

- **Never-drop.** The model may reorder and may add (in the `sections` task); it may
  **not remove** a candidate that met the support threshold. A dropped section is the
  failure she is least likely to notice, because absence has no chip.
- **Membership.** In the `sections` task, every returned string must match a
  `matchKey` present in the extracted text. Anything else is discarded and reported as
  "the AI suggested a section we couldn't find in your file" — which is information,
  not an error.

**What the model is shown, for `examples`: a skeleton, never the notes.**

This is the most important privacy decision in the packet, and it also happens to be
the best engineering decision. Instead of concatenating 2–3 complete clinical notes
into a 16K context — which is the packet's literal wording, "extract → concatenate
(labeled per file for `examples`)" — send only the structure:

```
Note 1
  Subjective — 34 words
  Objective — 12 words
  Assessment — 21 words
  Plan — 9 words

Note 2
  Subjective — 41 words
  Objective — 8 words
  Risk — 6 words
  Assessment — 18 words
  Plan — 11 words
```

Consequences, all good:

- **No patient text enters a prompt**, so no exposure through Ollama's request log, no
  head-truncation interaction, nothing to redact. This is the same move
  `style-profile-design-2026-08.md` §0 makes for voice, applied to structure, and it
  keeps M6 consistent with `docs/decisions.md` row 89.
- **The prompt is a bounded ~200 tokens regardless of note length**, so the
  `transcript_too_long` refusal (preflight §3-E) can never fire on this path and the
  head-truncation failure has nothing to eat.
- **The repetition-loop risk collapses.** ollama#15502 needs "free-text string fields"
  under a grammar (preflight §3-G); `detectFormat` under an `enum` constraint has
  almost no free-text surface. Set `num_predict: 256` anyway.

For `template`, send the extracted text (capped at 6,000 characters, which no real
template approaches) because a blank template carries no patient material. It may
still carry her clinic's letterhead and her own name; that is her data, going to a
model on her own machine, and it does not change the analysis.

### 2.5 Schemas

`shared/src/detect.ts` — the existing `DetectedFormatSchema` from preflight §4.4 stays
and gains two siblings:

```ts
export const DetectedFormatSchema = z.strictObject({
  name: z.string().min(1).max(120),
  sections: z.array(z.string().min(1).max(120)).min(1).max(40),
});

/** `task: 'name'` — the common case. Almost no free-text surface. */
export const DetectedNameSchema = z.strictObject({
  name: z.string().min(1).max(120),
});
```

The JSON schema handed to Ollama's `format` is hand-built, per preflight §4.2 (never
`z.toJSONSchema`, which injects `$schema` and can emit `$ref`s that llama.cpp's
converter handles badly):

```ts
/** `task: 'select'` — the model may only choose from `candidates`. */
export function selectFormatJsonSchema(candidates: readonly string[]) {
  return {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 1 },
      sections: {
        type: 'array',
        items: { enum: [...candidates] },
        minItems: 1,
        maxItems: candidates.length,
      },
    },
    required: ['name', 'sections'],
    additionalProperties: false,
  } as const;
}
```

`enum`, `minItems` and `maxItems` are all on llama.cpp's supported-keyword list
**[P, preflight §4.2]**. `uniqueItems` is on its *silently ignored* list **[P]**, so
duplicates must be removed in code, not asked for in the schema. Re-validate every
result through `SectionsSchema` in `shared/src/note-format.ts`, which enforces
case-insensitive uniqueness — a duplicate would collapse two JSON keys into one and
silently lose a section.

**Why the enum matters more than anything else in this section.** With
`sections: array<enum>`, "the model renamed my *Presenting Concern* to *Subjective*"
becomes impossible at the *sampling* level, not merely improbable at the validation
level. The grammar cannot emit a string that is not in the list. That is a structural
guarantee, and it is the only kind worth having when the reviewer may click through
the confirmation screen.

The response the endpoint returns is richer than `DetectedFormat`, because the
confirmation screen needs evidence (§3):

```ts
export const SectionEvidenceSchema = z.strictObject({
  section: z.string().max(120),
  signal: z.enum(['heading-style','style-cluster','bold','all-caps','font-size',
                  'table-label','colon','repeated','model']),
  support: z.int().min(0),      // how many uploaded notes contained it
  ofTotal: z.int().min(1),
  /** The source line, verbatim. TEMPLATE PATH ONLY — never set for `examples`. */
  quote: z.string().max(120).optional(),
  page: z.int().optional(),
});

export const DetectionResponseSchema = z.strictObject({
  name: z.string().max(120),
  sections: z.array(z.string().max(120)),
  evidence: z.array(SectionEvidenceSchema),
  /** support === 1: offered, not included. */
  alsoFound: z.array(SectionEvidenceSchema),
  confidence: z.enum(['structural', 'model-assisted', 'guessed']),
  unplaced: z.strictObject({
    lines: z.int(),
    /** Template path only. Empty array for `examples`, always. */
    samples: z.array(z.string().max(120)),
  }),
  files: z.int().min(1).max(3),
  extractedChars: z.int(),
});
```

### 2.6 Prompt shape

`server/src/ai/prompts.ts` already has `buildDetectFormatPrompt`, and its instincts are
right — it opens *"You identify the structure of a clinical note format. You do not
write, summarize, or comment on clinical content"* and says *"Use the headings exactly
as written"*. Keep that. Three variants:

**`task: 'name'`** (system, ~80 tokens):

```
You name a clinical note format from its structure. You do not write, summarize,
or comment on clinical content.

Below is the structure of one or more notes: their section headings, with the
body of each section replaced by a word count. You cannot see the clinical text
and you do not need it.

Return one JSON object and nothing else, with exactly one key:

  "name" — a short name for this note format, two or three words, in the
  therapist's own words if the structure suggests one (for example "Progress
  note" or "Intake assessment").

Do not add any other key.
```

**`task: 'select'`** — the same opening, then:

```
## The sections we found

  1. Presenting concern
  2. Session content
  3. Clinical impression
  4. Plan
  5. Next appointment

## Output format

Return one JSON object and nothing else, with exactly these keys:

  "name" — a short name for this note format.
  "sections" — the numbered items above that are genuine sections of the note,
  in the order they belong, as an array of strings copied exactly.

Copy each name exactly as written above. Do not rename, merge, split, translate,
or tidy them. Do not include an item that is a form field rather than a section
of the note (a date, a signature line). Do not add any other key.
```

The enum grammar enforces the "copied exactly" part; the prose is there because the
schema is invisible to the model (preflight §4.5) and because the restatement is what
stops *misfiled* output — the one failure the grammar cannot see.

**`task: 'sections'`** — the shipped prompt, unchanged, plus one line:

```
Every section name you return must appear in the text below. If you cannot find
a section, do not invent one.
```

The user message ends, in every variant, with the one-line key restatement the file
already appends at the tail — the position that survives head truncation.

### 2.7 The validation ladder

Run in order; each step is a pure function with a table test.

1. `done_reason === 'length'` → `output_truncated` (preflight §3-F).
2. Strip a leading ```` ```json ```` fence; a fence *is* the diagnostic that the grammar
   was not applied — log that distinctly (preflight §3-A).
3. `JSON.parse` → on failure `invalid_output` with **length only**, never the text
   (privacy audit H1; `ollama.ts:316` already does exactly this and must keep doing it).
4. zod `strictObject`.
5. `findDegeneration` over `name` (`server/src/ai/degenerate.ts` already exists).
6. **Membership**: every section's `matchKey` exists in the extracted text.
7. **Never-drop**: re-insert any deterministic candidate the model omitted, at its
   deterministic index.
8. Dedupe by `matchKey`, cap at 40, re-validate through `SectionsSchema`.
9. If `sections` is empty after all that → `confidence: 'guessed'`, and the UI shows
   the "we couldn't find structure" screen. **Do not fall back to SOAP.**

### 2.8 The fake provider

The packet specifies: *"Fake provider returns SOAP for anything containing 'Subjective',
else a fixed intake shape."* `fakeDetectFormat` already implements a heading scanner
with a SOAP fallback (`server/src/ai/fake.ts:238`). Two changes:

- It must **honour `candidates`**: when the request carries them, echo them in order.
  Otherwise the e2e test proves nothing about the real path, which is the same
  argument preflight §2.4 makes about streaming event shapes.
- The SOAP fallback stays, but only for `task: 'sections'`, and the response must
  carry `confidence: 'guessed'` so the UI's honest-uncertainty path is exercised in
  fake mode.

**A property worth stating loudly:** the entire deterministic path — extraction,
candidates, agreement, ordering, evidence — contains **no AI at all**. It therefore
runs identically under `APUNTA_FAKE_AI=1`, is fully covered by CI (hard rule 3), and
means **format onboarding works on a machine where Ollama is not installed yet.** That
matters: onboarding is the first screen of the product, and making the first screen
depend on a 9 GB model download being finished is a bad trade.

### 2.9 Interface and files

`server/src/ai/types.ts`:

```ts
export interface DetectFormatRequest {
  readonly kind: 'template' | 'examples' | 'manual';
  /**
   * Structure only. For `examples` this is a skeleton — section labels with
   * bodies replaced by word counts — never the note text.
   */
  readonly text: string;
  /** What the model is allowed to decide. Computed deterministically. */
  readonly task: 'name' | 'select' | 'sections';
  /** Deterministic candidates, in document order. Required when task === 'select'. */
  readonly candidates?: readonly string[] | undefined;
}
```

| File | Change |
| --- | --- |
| `server/src/extract/{index,sniff,docx,pdf,text,types}.ts` | new |
| `server/src/extract/__fixtures__/` + `make.mjs` | new |
| `server/src/detect/{candidates,agree,skeleton,plan,validate,evidence}.ts` | new |
| `server/src/routes/formats.ts` | add `POST /api/formats/detect` (or a sibling `formats-detect.ts`) |
| `server/src/app.ts` | register `@fastify/multipart` with the §1.6 limits |
| `server/src/ai/types.ts` | `DetectFormatRequest` gains `task`, `candidates` |
| `server/src/ai/prompts.ts` | three `buildDetectFormatPrompt` variants |
| `server/src/ai/ollama.ts` | pick schema by task; `num_predict: 256` on this path |
| `server/src/ai/fake.ts` | honour `candidates`; emit `confidence` |
| `shared/src/detect.ts` | new — evidence + response schemas |
| `shared/src/index.ts` | export it |
| `server/package.json` | `mammoth`, `unpdf`, `@fastify/multipart`, `fflate` |

---

## 3. The confirmation screen as a safety net

### 3.1 What it must show

The prototype shows four chips and a save button. Four chips are enough to *confirm* a
correct detection and nowhere near enough to *catch* a wrong one. Five additions, in
descending order of how much they carry:

**1. A blank-note preview.** Above or beside the chips, render the sections exactly as
the note editor will render them — section name, rule, empty body placeholder. She has
written this note several thousand times; she recognises its shape in under a second,
and a missing or renamed section is visible there in a way it is not in a chip list.
This is the single highest-value element on the screen and it is nearly free, because
the editor's section renderer already exists (`web/src/components/NoteView.tsx`).

**2. Evidence under every chip.** One line, quiet, small:

- Template: `Heading 2 · page 1 · "Presenting Concern:"` — the source line, verbatim.
- Examples: `in all 3 notes` / `in 2 of 3 notes`.
- Model-supplied: `suggested by the AI` — visually distinct, because a section that no
  deterministic signal supports deserves more of her attention than one that four do.

**3. Partial-coverage badges.** A section present in 2 of 3 notes is **included and
badged**, not excluded. She omits Risk when nothing came up; the section still exists.
The badge reads `in 2 of 3` and it is the prompt for her to think about whether that
was a real omission. A section present in **1 of 3** is *not* included and appears
under a separate line: *"Also found in one note: Homework"* with an `+ Add` button.
That asymmetry is the correct one and it should be stated in `docs/decisions.md`.

**4. Unmatched material — and here the two paths must differ.**

- **Template:** show the count and the lines, collapsed behind
  *"7 other lines we didn't use"*, each with `+ Add as section`. A blank template
  contains no clinical content, so showing its text back to her is safe and useful.
- **Examples:** show a **count only**, and say what it is:
  *"We skipped 128 lines of clinical text — that's your notes' content, and we
  don't need it."* Never render a body line. This is the privacy asymmetry between
  the two paths made visible, and it doubles as an explanation of what the app just
  did with her patients' notes.

**5. Provenance and disposal, in one sentence.** *"Read from 3 files. Nothing you
uploaded has been saved — only the names below."* She has just handed a piece of
software three real clinical notes; telling her what happened to them is both correct
and reassuring, and it costs one line.

Plus the mechanics the packet already asks for: rename in place (click the chip label
→ inline input), reorder (up/down buttons are more reliable to test than drag, and
Playwright-friendly), remove, add.

### 3.2 Copy

`CLAUDE.md` says to keep the prototype's copy verbatim where a screen exists. So
`"Here's what we found"`, `"Check this matches your work's format before saving."`,
`"Sections detected"`, `"Start over"`, `"Looks right, save"` all stay exactly as they
are. Everything in §3.1 is **additive**: evidence lines, badges, the preview, the
disposal sentence. One addition to the button row, because it is the honest one:
`"Change this later in Settings"` as quiet text under the buttons — true (M6
deliverable 4 makes sections editable, and editing only affects future drafts), and it
lowers the stakes of the decision in a way that makes her *more* likely to engage with
the screen rather than less.

### 3.3 The four states

| `confidence` | Heading | What is shown |
| --- | --- | --- |
| `structural` | `Here's what we found` (prototype) | Chips + evidence + preview |
| `model-assisted` | same | Same, with AI-suggested chips visually distinct |
| `guessed` | **`We couldn't find the structure`** | No chips. Three options: try a different file, describe it myself, or type the sections in directly. **Never a pre-filled SOAP list.** |
| extraction failed | per §1.7 | The specific reason + the same three options |

The `guessed` state is the one that matters most and it is the one a hurried
implementation will skip. Presenting a confident, wrong, pre-filled SOAP list to a
therapist who uploaded a scan is strictly worse than saying nothing.

### 3.4 Honesty about what this screen can do

It is the last line of defence, not the first. She is onboarding, she wants to get to
the product, and `style-profile-design-2026-08.md` §6.10 already makes the general
argument that a card people click past does not carry the weight a design puts on it.
So the screen's job is to make a *large* error obvious in one glance (the preview), and
the *structural* defences in §2.4 and §2.7 must carry the rest. Any part of this design
whose safety rests only on her reading carefully is a part that is not safe.

### 3.5 Files

`web/src/routes/OnboardingFormat.tsx` (real dropzones, a real `<input type="file">`
with a `data-testid` so Playwright can set files on it per the packet),
`web/src/routes/OnboardingPreview.tsx` (evidence, badges, preview, reorder, unmatched),
a new `web/src/components/SectionChips.tsx` extracted from the preview so the Settings
editor reuses it verbatim, `web/src/api/detect.ts`, `web/src/styles/app.css`.

---

## 4. Privacy

Uploaded example notes are real patient material. Hard rule 2 forbids them in fixtures,
tests, logs and commits; hard rule 1 forbids them leaving the machine. The privacy
audit found note text sitting in an error `detail` (`privacy-audit-2026-08.md` H1) — the
route to a log file was pino's `err` serializer copying every *enumerable* own property
of a thrown error. That is fixed (`server/src/ai/errors.ts` now defines `detail`
non-enumerable **[P]**) and this design must not reopen it by a different door.

### 4.1 The life of an uploaded file, step by step

1. **Browser.** She picks or drops files. The client does **not** read them: no
   `FileReader`, no `URL.createObjectURL`, no preview render. It appends them to a
   `FormData` and posts.
2. **The file name never leaves the browser.** A therapist's note file is called
   something like `Smith, John — 2026-07-14.docx`. That name is patient-identifying,
   and multipart transmits it by default. So strip it client-side:

   ```ts
   // `file.slice()` is a Blob view over the same bytes — no copy — and a Blob
   // carries no name, so the third argument is the only filename on the wire.
   // Keep the extension (the server still sniffs magic bytes; the extension only
   // disambiguates .txt from .md) and throw the stem away.
   form.append('files', file.slice(), `note-${String(i + 1)}${extensionOf(file.name)}`);
   ```

   This is worth doing precisely because it is structural: the server cannot log,
   echo, or accidentally persist a name it never received.
3. **Transport.** `POST /api/formats/detect` over loopback HTTP. Fastify's default
   `req` serializer emits `{method, url, version, host, remoteAddress, remotePort}` and
   no headers or body **[P, privacy audit H2]**, and this route has no path or query
   parameters, so the access log is content-free by construction.
4. **Parsing.** `for await (const part of request.parts())`, `await part.toBuffer()`.
   Memory only. `saveRequestFiles`/`toFile` banned by lint (§1.6).
5. **Extraction.** `mammoth.convertToHtml({ buffer })` and
   `getDocumentProxy(new Uint8Array(buffer))` both take bytes **[P]** — **no extractor
   in this design needs a filesystem path**, so the `fs.mkdtemp`-and-unlink branch that
   `style-profile-design-2026-08.md` §4.4 allows for never has to exist. Say so in a
   comment where a future agent would otherwise add one.
6. **Disposal.** After extraction, `buffer.fill(0)` and drop the reference.
   Comment it honestly: this zeroes the one buffer we hold, and it does **not** reach
   busboy's intermediate chunks or V8's copies of the decoded string. It is hygiene,
   not a guarantee, and overselling it in a comment would be worse than omitting it.
7. **Detection.** Candidates, agreement, skeleton — all in local `const`s.
8. **Model call**, only ever with the skeleton (`examples`) or the template text.
   Ollama's own request log is outside our control; the skeleton is what makes that
   acceptable.
9. **Response.** `{name, sections, evidence, …}` with `Cache-Control: no-store`.
   Evidence quotes exist **only** for the template path (`quote` is never set when
   `kind === 'examples'` — enforce it in one place and unit-test the enforcement).
10. **The handler returns and everything is garbage.** `/api/formats/detect`
    **must not take a `db` handle at all.** Not "must not write" — must not have one.
    That makes accidental persistence a type error rather than a code review.
11. **Persistence** happens later and separately, when she presses "Looks right, save",
    through the existing `POST /api/formats` with `{name, sections, source}`.

### 4.2 What is retained, and the problem with section names

Retained: the format's `name`, its `sections[]`, and `source: 'template'|'examples'`.
Nothing else. Not the extracted text, not the skeleton, not the evidence, not a
`detections` table, not a cache, not the file names.

**A section name can itself be identifying**, and this deserves more than a footnote
because section names have a much longer life than the upload does: they become JSON
keys in every prompt, they are stored in `note_formats`, they appear in every note's
rendered text, and they go into M7's export. Three realistic ways it happens:

- A workplace template with a service name that identifies a specialist population
  ("Perinatal Loss — Session Record").
- A template she has customised per client, so a heading carries a name.
- A stray body line promoted to a section (failure mode §7.4), which is the most
  likely route by far.

Mitigations, in order of strength:

1. **The support ≥ 2 rule** (§2.3) — a fact about one patient cannot become a section.
2. **The line-terminal rule and the ≤ 8-word cap** — a clinical statement is neither.
3. **Her review**, which is the only defence that catches a semantically identifying
   name that passes every mechanical filter.
4. **A name-gazetteer check on the Settings edit path**, where `patients` is populated:
   flag a section whose name matches `patients.name` or `patients.identifier`. At
   onboarding the patient table is empty, so this check is inert — say so rather than
   implying a protection that is not there.
5. **One line of copy on the confirmation screen**, because it changes what she looks
   for: *"These names go into every note you write."*

### 4.3 What must never be logged, in any mode

- Extracted text, candidate labels, the skeleton, any note line, any evidence `quote`.
- **Section names.** Yes, really: at the point of logging we do not yet know a name is
  not `"Maria's relapse plan"`. Log counts.
- **Uploaded file names** — structurally prevented in §4.1, but still on the list, in
  case a future path (drag-and-drop of a folder, a CLI import) reintroduces them.
- **Mammoth's `messages[]` verbatim.** This is the non-obvious one. Mammoth's warnings
  embed material from the document — style names and element names, e.g.
  "Unrecognised paragraph style: 'X' (Style ID: X)". A style name is not clinical text,
  but a *custom* style name in a per-client template can be identifying, and the array
  is exactly the thing a developer reflexively dumps into a log line when a docx fails
  to parse. Log `messages.length` and a count by `type`. Never the array.
- **pdf.js console output.** It logs at WARNINGS by default; pass `verbosity: 0` (§1.4).
  In a packaged M8 app that console is a log file on disk with no retention policy
  (privacy audit H1).
- **Anything on `AiError.detail`** except shape: codes, lengths, counts, key names.
  The existing `detectFormat` error — `` `detectFormat did not return JSON (${text.length} chars)` ``
  **[P, `ollama.ts:316`]** — is the pattern to copy, and its comment already explains why.
- **The browser console.** The detection response lives in React state and is rendered.
  It is never `console.log`ed, never put in a URL or a route param, never written to
  `localStorage`/`sessionStorage`. (Note the trap: passing the draft between
  onboarding routes currently uses react-router `location.state`, which is
  `history.state` — held in memory and in the session history entry, not written to
  disk. That is acceptable for section names; it would not be for extracted text, so
  extracted text must never be handed to the client at all.)

**What may be logged, and should be** — a single structured line per request:

```
{ kind: 'examples', files: 3, bytes: 412_889, sniffed: ['docx','docx','docx'],
  extractedChars: 9_214, candidates: 6, agreed: 5, task: 'name',
  confidence: 'structural', attempts: 1, promptTokens: 214, ms: 380 }
```

Every field is shape. All the diagnostic value, none of the content.

### 4.4 Tests that prove it, not comments that claim it

1. **Log capture test.** Run the detect route against the fixtures with a capturing
   logger and assert the captured output contains none of a set of planted sentinel
   strings that appear in the fixture bodies. Assert the *sentinel* is findable in the
   fixture, so the test cannot pass by looking in the wrong place.
2. **Error-path test.** Force each failure in §1.7 and assert the thrown error's
   message and `detail` contain no sentinel.
3. **Egress test.** Extract a fixture PDF and a fixture docx with the egress guard
   installed; assert no `EgressBlockedError` and no `fetch` call at all.
4. **No-db test.** Type-level: the route factory does not accept a `Database`.
5. **Quote-suppression test.** `kind: 'examples'` → every evidence entry has
   `quote === undefined`, on every fixture.
6. **Lint rule.** `saveRequestFiles` / `toFile` banned in `server/**`.

---

## 5. The skill import path

### 5.1 What the mechanical flattener can do

`docs/skill-porting.md` assigns it steps 1, 3 (line-level) and 4. Concretely,
`server/src/skill/flatten.ts`, each rule with a unit test and a counter reported to the
UI:

| # | Rule | Detection | Action |
| --- | --- | --- | --- |
| 1 | YAML frontmatter | File **starts** with `---\n`; find the next line that is exactly `---` or `...`, within the first 100 lines | Delete inclusive. The "starts with" guard is what stops a thematic break mid-document being eaten. |
| 2 | Command code blocks | Fenced block whose info string ∈ {`bash`,`sh`,`zsh`,`shell`,`console`,`bat`,`python`,`py`} | Delete the whole block, count it |
| 3 | Path references | A token that looks like `references/…`, `scripts/…`, `assets/…` or `resources/…` — regex `PATH_REF` below | If the line's non-reference remainder is only an instruction verb → delete. Otherwise **keep the line and flag it**, because it probably carries content. |
| 4 | Tool/file instructions | An imperative line about a file, script, tool or command — regex `TOOL_LINE` below | Delete, count |
| 5 | Claude mechanics | Line contains `<thinking>`, `extended thinking`, `allowed-tools`, `Bash tool`, `Read tool`, `tool_use`, `Skill(`, or is a bare XML-ish tag — regex `BARE_TAG` below | Delete, count |
| 6 | Emptied headings | A heading whose entire body was removed by 1–5 | Delete the heading |
| 7 | Reference warning | Collect every distinct `references/…` path seen at rule 3 | **Warn, never inline.** List the paths so she can paste them herself. |
| 8 | Whitespace | ≥ 3 blank lines → 2; trailing whitespace | Normalise |

The three regexes, out of the table so the escaping is readable:

```ts
/** rule 3 — a relative path into a skill's support folders */
const PATH_REF = /(?:^|[\s("'`])(?:\.\/)?(?:references|scripts|assets|resources)\/[\w.\-/]+/;

/** rule 4 — an imperative line about a file, script, tool or command */
const TOOL_LINE =
  /^\s*(?:[-*]|\d+\.)?\s*(?:read|open|load|run|execute|invoke|call|consult|see)\b.*\b(?:file|script|tool|command|references?|directory)\b/i;

/** rule 5 — a line that is nothing but an XML-ish tag */
const BARE_TAG = /^\s*<\/?[a-z_][\w-]*>\s*$/;
```

Each of these will over-delete on some real skill. That is why the flattened result
lands in a textarea for review with a per-rule count beside it — *"11 tool lines
dropped"* is checkable; a silent rewrite is not.

The output goes into the textarea for review and is **never saved automatically**. The
panel above it reports: `frontmatter removed · 4 command blocks dropped · 11 tool lines
dropped · 3 files referenced (paste those in yourself) · ≈3,240 tokens`.

### 5.2 Where judgement is required, and the flattener must not pretend otherwise

- **Inlining referenced content** (skill-porting step 3, the content half). If a line
  says "the section spec is in `references/FORMS.md`", the spec is *in that file* and
  the flattener cannot see it — a `.zip` import could, but resolving which part of a
  reference file is "the needed content" is a judgement, and a wrong inline blows the
  token budget. Warn; do not guess. If the upload was a `.zip`, the warning can be
  better: list the reference files it *contains*, with sizes, so she knows what she is
  looking for.
- **Adding few-shot pairs** (step 6). Human, and the style-profile design has a much
  better answer than "write some examples": Tier 0 golden pairs, which are the highest
  value item in that document and cost her ten minutes
  (`style-profile-design-2026-08.md` §2.G). §5.5 puts that on this screen.
- **Cutting to budget** (step 7). Deciding which of two overlapping paragraphs is the
  redundant one is judgement.
- **Deduplicating against the built-in instructions.** A skill that restates the
  faithfulness rule is fine; one that *contradicts* it is a safety problem no
  flattener should silently resolve.

### 5.3 When the skill does not map onto sections

This is the interesting failure and the packet does not address it. A `SKILL.md` can:

- name sections the format does not have (`Formulation` vs the format's `Assessment`);
- name none at all (a pure style/tone guide);
- name more than the format has, or fewer;
- use the same names with different meanings.

Detect it cheaply: parse the flattened text's ATX headings (`^#{1,6}\s+(.+)$`) and
bold-only lines, normalise with the same `matchKey` from §2.2, and diff against
`format.sections`. Then show a non-blocking panel above the textarea:

```
This skill and this format don't quite line up.

  Your skill describes      Your format has        
  ─────────────────────     ─────────────────      
  Presenting concern   →    (nothing)              [ Add as section ]
  Formulation          →    (nothing)              [ Add as section ]
  (nothing)            ←    Risk                   [ Remove section ] [ Keep ]
  Plan                 ✓    Plan                   

Apunta always asks the model for your format's sections, whatever the skill says.
So "Risk" will be drafted with no guidance from this skill, and the paragraphs about
"Formulation" will be guidance for a section that doesn't exist.
```

Three rules for this panel:

1. **Never auto-apply.** Not the renames, not the adds, not the removes.
2. **Explain the mechanism, not just the mismatch.** The reason it matters is specific
   and non-obvious: the schema is built from the *format's* section names and the
   prompt builder restates them (`docs/skill-porting.md`, "the app's prompt builder
   always restates the section names"), so a mismatch does not break anything — it
   quietly wastes tokens and gives one section no guidance. Saying that is what lets
   her decide.
3. **Renaming a section that already has notes shows the count**, because M6's own rule
   is that section edits are allowed and only affect future drafts. `countNotesForFormat`
   already exists in `server/src/db/formats.ts` **[P]**.

If the skill names **no** sections at all, say nothing at all. A pure style guide is a
perfectly good `instructions` value and a warning would be noise.

### 5.4 The privacy problem inside an imported skill

**A working therapist's `SKILL.md` plausibly contains her real examples.** That is the
entire point of the skill — it encodes how *she* writes notes — and step 6 of the
porting recipe explicitly asks for few-shot pairs. Unlike an uploaded example note,
which this design destroys within one request, imported skill text is:

- persisted in `note_formats.instructions`;
- sent to the model as the system prompt on **every single draft**, forever;
- included in M7's `GET /api/export`;
- and the first thing a future agent would paste into a bug report.

So the import panel must warn, once, in plain terms: *"This text is saved and is sent
to the AI with every note you write. Check it doesn't contain real client details
before you save."* Plus a cheap, non-blocking scan — flag counts of: tokens matching
`patients.name`/`patients.identifier` (the gazetteer, which on this path is populated),
date-shaped strings, 6+ digit numbers, and email addresses. Report *"4 things in this
text look like real client details"* with the *lines* highlighted in the textarea and
**never** the matched values in a log. It is a nudge, not a filter, and it should be
described as one.

This also earns a line in `docs/skill-porting.md`, which currently has no privacy
paragraph at all.

### 5.5 Two more things on the Instructions panel

- **A token budget meter.** `approximateTokens` already exists in `prompts.ts`
  (chars ÷ 3.5) **[P]**. Show: *"≈3,240 tokens — comfortable"* / *"≈6,800 tokens —
  small models start to drift past about 5,000"* (`docs/skill-porting.md` step 7), and
  a hard warning when instructions + schema restatement + a realistic source leave
  under 20% of `NUM_CTX` (16,384) headroom, which is the condition under which Ollama
  truncates **from the head** and drops the anti-fabrication rules (preflight §3-E).
- **The golden-pairs prompt.** The highest-value item in the whole voice design costs
  ten minutes and no code (`style-profile-design-2026-08.md` §2.G, §8 step 1). The
  Instructions panel is where it belongs: a quiet link, *"Want the drafts to sound more
  like you? Write two notes from made-up sessions →"*, opening a screen pre-filled with
  the fabricated John Smith and Maria Ruiz dictations from `e2e/fixtures/eval/` and a
  textarea per section. What she writes is pasted into `instructions` as a few-shot
  pair. Zero patient data, visible input, her own epistemic restraint demonstrated
  rather than described.

### 5.6 Zip handling and files

```ts
import { unzipSync } from 'fflate';

const entries = unzipSync(new Uint8Array(buffer), {
  // `originalSize` is the *uncompressed* size and is available BEFORE
  // decompression — this is the zip-bomb guard.
  filter: (f) => /(^|\/)SKILL\.md$/i.test(f.name) && f.originalSize < 512 * 1024,
});
```

`UnzipFileInfo` carries `name`, `size` (compressed), `originalSize`, `compression`
**[P]**. If more than one `SKILL.md` matches, take the shallowest; if there is a tie,
ask her which, listing the *directory* names (skill names, not patient data). If none
matches, the error names what was expected.

| File | Change |
| --- | --- |
| `server/src/skill/{flatten,zip,headings}.ts` + tests | new |
| `server/src/skill/__fixtures__/skill/` (a fabricated `SKILL.md`, a `references/`, a `scripts/`) | new |
| `server/src/routes/formats.ts` | `POST /api/formats/flatten-skill` (multipart, 1 file) |
| `web/src/components/InstructionsPanel.tsx` | new — textarea, import button, mismatch panel, budget meter, golden-pairs link |
| `web/src/routes/Settings.tsx` | Edit → chips + instructions |
| `docs/skill-porting.md` | a privacy paragraph; a note that step 6 means *fabricated patients, and prefer pairs she wrote herself* (already requested by `style-profile-design-2026-08.md` §3.9) |

---

## 6. Where the style profile fits

M6 owns the onboarding surface, so it is where a style profile would first be built.
`docs/research/style-profile-design-2026-08.md` §3.8 case 1 anticipates exactly this.
Everything below is subordinate to that document; where I add anything, I say so.

### 6.1 Two uses of one upload, and they are not the same thing

She uploads three notes to answer the question *"what are my sections called?"*. That
is a **structural** use: the design reads labels, discards bodies, and — under §2.4 —
does not even let the note text near a prompt.

Using the same three files to answer *"how does she write?"* is a **content** use. It
reads the bodies. It measures sentence length, person, subject noun, connectives,
attribution rate, hedging. Its output is persisted (`style_profiles`), enters the
prompt on every future draft, and is included in M7's export.

Same bytes, different exposure, different persistence, different lifetime — and
therefore, in my view, **different consent**. Deriving a voice profile from files she
handed over to answer a question about headings is a use she did not ask for, and the
fact that the derivation is deterministic and discards the notes does not make it a use
she authorised.

### 6.2 The consent design

**A checkbox on the upload screen, default off, phrased as what it does:**

```
[ ] Also learn how I write from these notes
    Apunta measures things like sentence length and whether you say "client" or
    "patient". It never keeps the notes and never quotes them. You'll see exactly
    what it learned before anything uses it.
```

Three reasons this beats the alternatives:

- **Ask-later is not free.** By the time she reaches a post-save prompt the buffers are
  gone (§4.1), so ask-later means either a second upload or holding the derived profile
  from a use she has not agreed to. Both are worse.
- **Derive-then-offer is the version to reject explicitly.** "Derive it silently, keep
  it as `proposed`, delete it if she declines" stores derived personal data from an
  unconsented processing step. Name it in `docs/decisions.md` as considered and
  rejected, so it is not reinvented as a convenience.
- **Default off.** `style-profile-design-2026-08.md` §6.10 already says *"Do not
  pre-check anything"* about the review card; the same applies a step earlier.

The onboarding flow therefore becomes: upload (+ optional checkbox) → detection preview
(§3) → save → *if the box was ticked*, the style review card, showing the **literal
rendered prompt block** and the `excluded[]` list per §4.3 of that document. Nothing is
used until she approves it there. Two consents, because there are two decisions.

### 6.3 What may actually be derived from 2–3 uploaded notes

Much less than it looks, and the constraints converge on the same answer from three
directions:

1. **The thresholds forbid it.** `notes ≥ 3` for global slots; `notes ≥ 8 and
   patients ≥ 3` for `opens_with` and `phrases` (§3.3 of that document). Three uploads
   clear the first and cannot clear the second. §3.8 case 1 says this outright: *"the
   first profile is enums only"*.
2. **The name gazetteer is empty.** Filter 4 of the five privacy defences
   (§4.3) is built from `patients.name` / `patients.identifier`. At onboarding the
   patients table is empty, so that filter is **inert**. This is my addition to that
   document's analysis and it is the strongest argument here: phrase mining runs with
   one of its five defences switched off.
3. **`corpus.patients` is unknowable.** We do not know whether her three files are three
   clients or one client three times. The ≥ 2-patients rule — which §4.3 calls "the
   single strongest argument" for phrase mining being admissible at all — cannot be
   evaluated.

**Therefore: phrase mining and `opens_with` are hard-disabled on the upload path,
unconditionally — not threshold-gated, disabled.** A future agent raising the corpus
size must not accidentally re-enable them. The derived profile is enums and numbers
only: person, subject word, mean/p90 sentence words, fragments, semicolons,
contractions, connectives, and the clamped attribution/hedging floors. That is a
genuinely useful profile and it carries zero free text.

The stored row records `corpus: { notes: 3, patients: null, source: 'uploaded' }` and
no dates. When she later has real notes in Apunta, Settings' "Rebuild from my notes"
supersedes it from a bigger corpus with a live gazetteer, `draft_content` for the
autophagy guard (§6.5 of that document), and a real patient count.

### 6.4 The gate

`docs/agents/M6-formats.md` is explicit: *"A gate before any of this ships: a half-day
pre-experiment (§7.1) testing whether a 12B model follows a descriptive style block at
all."* So the recommendation is sequencing, not scope:

- **M6 ships detection with no style hook at all**, and no checkbox — a consent
  checkbox for a feature that does not exist is worse than nothing.
- **Leave a named seam.** The detect handler holds the extracted texts in one place;
  the style hook is one guarded call at exactly one point:

  ```ts
  // The seam for the style profile (docs/research/style-profile-design-2026-08.md
  // §3.8 case 1). Gated on that document's §7.1 pre-experiment. When it lands:
  //   if (consent) proposedProfile = deriveProfile(texts, { phrases: false, openings: false });
  // `texts` is destroyed at the end of this handler either way.
  ```

- If the pre-experiment says no, the whole thing collapses to Tier 0 golden pairs
  (§5.5), which needs no code and is already the highest-value item.

### 6.5 What must not happen on this path, restated

No model call in the derivation (`decisions.md` row 89). No excerpt of an uploaded note
in any prompt, ever. No uploaded text persisted, whether or not she ticks the box. No
profile applied without her approving the literal rendered block. And the extensive/
intensive rule and the one-directional clamps apply identically to an onboarding-derived
profile — those are properties of the profile document, not of where the corpus came
from.

---

## 7. Ranked ways this goes wrong in her hands

Ranked by expected harm × likelihood. Each has a mitigation that is in this design and
a way to detect it.

### 7.1 She accepts a confidently wrong section set, and every note afterwards has the wrong shape

The headline risk, and the one the packet names. The specific sub-case that worries me
most is **silent standardisation**: a small model asked to name sections has a very
strong prior toward SOAP, so *"Presenting Concern / Session Content / Clinical
Impression / Next Steps"* becomes *"Subjective / Objective / Assessment / Plan"* — a
change she may not notice on a chip list, that reshapes her documentation, and that
makes every note she writes slightly less hers.

**Mitigation (structural, in order of load carried):** the `enum` schema, which makes a
renamed section unsamplable when candidates exist (§2.5); the membership check for the
free-string fallback (§2.7 step 6); the never-drop rule (step 7); the prompt's
"copy exactly, do not rename, merge, split, translate or tidy" (§2.6); and the
deterministic path skipping the model entirely in the common case (§2.4).
**Mitigation (behavioural):** the blank-note preview and per-chip evidence (§3.1).
**Recovery:** sections stay editable and only affect future drafts, which the screen
says out loud (§3.2).
**Detection:** the e2e fixture set must include a template whose sections are *not*
SOAP and assert they survive verbatim through the fake and — in `smoke:live` — the real
provider.

### 7.2 Patient text escapes into a log, an error, or a prompt

Highest severity, lower likelihood, and the project has already been bitten once
(privacy audit H1).

**Mitigation:** the skeleton, so note bodies never reach a prompt (§2.4); shape-only
errors (§4.3); the mammoth `messages[]` rule, which is the most likely fresh mistake;
`verbosity: 0` on pdf.js; filename stripping in the browser (§4.1); no `db` handle on
the route (§4.1 step 10).
**Detection:** the sentinel-based log-capture test and the error-path test (§4.4),
running in CI on every commit.

### 7.3 Extraction produces nothing usable and onboarding dead-ends

She uploads a scanned PDF, or a `.doc`, or a `.pages`, on the first screen of a product
she has just installed. The likelihood is genuinely high — a scanned template from an
agency is an ordinary artefact.

**Mitigation:** the per-cause copy in §1.7, each naming the fix; the three-option
recovery screen (§3.3); and above all *never* pre-filling SOAP to paper over it.
**Detection:** a fixture per failure cause, asserted on the copy and not just the code.

### 7.4 A body line is promoted to a section

Most likely when she uploads three notes for the *same* client, where a stock opening
("John reports") repeats across all three and clears the support threshold.

**Mitigation:** the line-terminal rule (a candidate is the whole line or a colon-
terminated prefix), which "John reports improved sleep." fails; the ≤ 8-word and
sentence-shape rejects; the support ≥ 2 rule; and one line of upload copy — *"notes
from two or three different clients work best"* — which is the cheapest fix available
and also improves detection quality.
**Detection:** a fabricated fixture set of three notes for one patient, asserting no
body line is promoted. That fixture is also the leak-check fixture for §6.

### 7.5 A real section is dropped because it appeared in only some notes

Risk, Homework and Safety plan are exactly the sections she omits when nothing came up
— and absence has no chip, so it is the error she is least likely to catch.

**Mitigation:** support ≥ 2 includes it and badges it `in 2 of 3` rather than dropping
it; support == 1 appears under "Also found in one note" with an `+ Add` (§3.1); the
never-drop rule stops the model removing it afterwards.

### 7.6 Onboarding requires a model that is not installed yet

She installs Apunta and starts before the 9 GB pull has finished, or Ollama is not
running (preflight §3-I: `ECONNREFUSED`). If detection needs the model, the first
screen of the product is broken.

**Mitigation:** the deterministic path needs no model at all (§2.8), and the `name`
task is the only model call in the common case — so if it fails, fall back to a
deterministic name (the document's first heading, or the filename-free default
"Progress note") and let her type over it. **Never** fail the whole detection because
naming failed.

### 7.7 Letterhead, footers or form fields become sections

"Confidential", "Page 1 of 3", the clinic's name, "Date:", "Clinician signature".

**Mitigation:** the boilerplate stoplist, the cross-page repetition penalty, and the
top/bottom-of-page geometry penalty (§2.2). Note the deliberate choice: "Date" and
"Client name" *are* fields on a real template, and are excluded on the grounds that
they are not note sections — with `+ Add as section` in the unmatched list if she
disagrees.

### 7.8 The section names themselves are identifying

Covered at length in §4.2. Lower likelihood than 7.4 (it is usually a *consequence* of
7.4), high longevity — a bad section name outlives everything else in this flow.

**Mitigation:** §4.2's five, of which her review is the only one that catches a
semantic identifier. **Detection:** the gazetteer check on the Settings edit path,
which is where the patients table is actually populated.

### 7.9 An imported skill puts real client material into `instructions` permanently

**Mitigation:** the warning and the identifier scan (§5.4), plus the fact that the
flattener leaves everything in a textarea for review rather than saving.
**Detection:** none automatic — this one genuinely rests on her reading, which is why
the warning is worded as a task ("check it doesn't contain…") rather than a notice.

### 7.10 pdf.js tries to fetch a font or CMap and the egress guard kills extraction

Low likelihood on today's `unpdf` (it skips those URLs when `pdfjs-dist` is absent
**[P]**), non-zero on a version bump, and the symptom would be an
`EgressBlockedError` that looks nothing like a PDF problem.

**Mitigation/detection:** the egress-guard extraction test (§4.4 item 3), which turns a
future dependency bump into a red CI run rather than a support conversation.

### 7.11 The bundled server cannot read PDFs even though the tests pass

`unpdf`'s dynamic `import('unpdf/pdfjs')` under esbuild (§1.2). Tests run against
`node_modules`; M8 ships a bundle.

**Mitigation:** the bundled smoke test in M8, or marking `unpdf` external.

### 7.12 The model loops or returns the wrong shape

ollama#15502 needs free-text string fields under a grammar (preflight §3-G); this path
has `enum`s and a 120-character name.

**Mitigation:** `num_predict: 256`; the existing retry ladder in `ollama.ts`;
`findDegeneration` on the name; and the fact that a failed model call degrades to the
deterministic result rather than to nothing.

### 7.13 An oversize file or a zip bomb

Not a threat model — she is the only user — but a crash on the first screen is still a
bad first run.

**Mitigation:** the multipart limits (§1.6) and fflate's `originalSize` filter (§5.6).

---

## 8. Open questions, each with the experiment that settles it

**Q1 — Does the docx AST tap actually fire on real-world templates?** [U]
*Experiment:* build the four fixture docx files in §1.8 (heading styles, bold-only,
two-column table, custom `SectionHead` style) and assert the candidate list for each.
Half a day, and the fixtures are needed anyway. This is the experiment that decides
whether §2.2's scoring table is right or merely plausible.

**Q2 — Is bold detectable in a PDF through `unpdf`'s `fontFamily`?** [U]
pdf.js's `TextStyle.fontFamily` may be a generic family rather than a PostScript name.
*Experiment:* generate a PDF with bold headings, dump `extractTextItems` for page 1,
look at `fontFamily`. Thirty minutes. If it carries weight, add the +2 rule; if not,
font size and geometry carry the PDF path alone.

**Q3 — Does the small model honour an `enum`-constrained array under llama.cpp's
grammar converter?** [P that `enum` is a supported keyword; [U] that our stack
exercises it correctly] *Experiment:* a `smoke:live` case with six candidates, one of
which is `Presenting Concern`, and a prompt-adjacent temptation to answer "Subjective".
Assert the output is a subset of the enum. This is the experiment that validates the
single strongest defence in §2.

**Q4 — Is the support threshold right at 2?** [U] *Experiment:* three fabricated sets
of three notes — one where all three share five sections; one where the third note
omits Risk; one where all three are the same patient with a repeated stock opening.
Sweep the threshold. The right value is where the stock opening stops surviving and
the omitted Risk still does.

**Q5 — Does `unpdf` survive esbuild?** [U] *Experiment:* one bundled smoke test in M8
(§7.11).

**Q6 — What does she actually upload?** Unknowable from here, and the honest answer is
to ask her: *"When you set this up, what will you have — the Word template from work, a
PDF someone sent you, or a few of your own notes? Can you check whether the PDF is a
scan?"* One question, and it re-ranks half of §1.

**Q7 — Does she want her writing measured at all, and from what?** Per §6.2 and
`style-profile-design-2026-08.md` §7.5. Two questions for her: whether she is willing to
have onboarding uploads measured for voice, and the ten-minute golden-pairs ask, which
is worth more than the answer to the first.

**Q8 — Does a 12B model follow a descriptive style block?** Not mine — it is
`style-profile-design-2026-08.md` §7.1, and it gates §6 of this document entirely.

---

## 9. Decisions rows this design would add

| Decision | Why |
| --- | --- |
| `.docx` extraction reads mammoth's document AST via `transformDocument`, not `extractRawText` | `extractRawText` "will ignore all formatting", and formatting is the detection signal. Deviation from M6 deliverable 1. |
| PDF text via `unpdf` (MIT, zero deps, serverless pdf.js) | `pdf-parse` v2 now depends on the native `@napi-rs/canvas`; M8 already fights one native addon |
| `.rtf`, `.doc`, `.pages` rejected with conversion instructions; no OCR | One rare case each, a parser liability each, and a two-click user-side fix each. `textutil` rejected under hard rule 4 |
| Detection is deterministic first; the model names, and at most selects from a deterministic candidate list | A short label recurring across independent notes is structure, not content — a stronger signal than a 12B opinion, and it works with Ollama absent |
| The model never removes a deterministic candidate, and free-string sections must appear verbatim in the source | A dropped section is the error she cannot see; an invented one is the error she will not question |
| For `kind: 'examples'` the model sees a skeleton (labels + word counts), never note bodies | Keeps patient text out of every prompt, log, context window and truncation event — the same move as `decisions.md` row 89, applied to structure |
| Uploaded file names are replaced client-side before upload | `Smith, John — 2026-07-14.docx` is patient-identifying; the server cannot leak what it never receives |
| `POST /api/formats/detect` takes no `Database` handle | Makes accidental persistence a type error rather than a review comment |
| A section found in some but not all example notes is included and badged; found in one, offered but not included | She omits Risk when nothing came up; absence has no chip |
| No SOAP fallback on the real provider — an unreadable file yields "we couldn't find the structure" | A confident wrong answer to a therapist who uploaded a scan is worse than no answer |
| Style derivation from onboarding uploads requires an explicit opt-in, default off, and is enums-only with phrase mining hard-disabled | Different use, different persistence, different consent; and the name gazetteer is empty at onboarding, so one of the five privacy defences is inert |
| Derive-then-offer (derive silently, delete if declined) considered and rejected | Stores derived personal data from an unconsented processing step |

---

## 10. Sources

**Libraries** — npm registry metadata read 2026-08-23 via `https://registry.npmjs.org/<pkg>/latest`;
licences are the `license` field of that record, cross-checked against the repository.

- mammoth 1.12.1, BSD-2-Clause — https://www.npmjs.com/package/mammoth ·
  https://github.com/mwilliamson/mammoth.js ·
  API and caveats read from https://raw.githubusercontent.com/mwilliamson/mammoth.js/master/README.md ·
  AST shape from https://raw.githubusercontent.com/mwilliamson/mammoth.js/master/lib/documents.js ·
  half-point font size from https://raw.githubusercontent.com/mwilliamson/mammoth.js/master/lib/docx/body-reader.js
- unpdf 1.8.1, MIT — https://www.npmjs.com/package/unpdf ·
  https://github.com/unjs/unpdf ·
  `extractText`/`extractTextItems` implementation from https://raw.githubusercontent.com/unjs/unpdf/main/src/text.ts ·
  font/CMap resolution from https://raw.githubusercontent.com/unjs/unpdf/main/src/utils.ts
- pdfjs-dist 6.2.108, Apache-2.0 — https://www.npmjs.com/package/pdfjs-dist ·
  `verbosity` parameter and `VerbosityLevel` from
  https://raw.githubusercontent.com/mozilla/pdf.js/master/src/display/api.js and
  https://raw.githubusercontent.com/mozilla/pdf.js/master/src/shared/util.js
- pdf-parse 2.4.5, Apache-2.0, deps `pdfjs-dist` + `@napi-rs/canvas` — https://www.npmjs.com/package/pdf-parse
- pdf2json 4.0.3, Apache-2.0 — https://www.npmjs.com/package/pdf2json
- officeparser 7.8.0, MIT, deps include `tesseract.js` — https://www.npmjs.com/package/officeparser
- @fastify/multipart 10.1.1, MIT — https://www.npmjs.com/package/@fastify/multipart ·
  limits, defaults and storage behaviour from
  https://raw.githubusercontent.com/fastify/fastify-multipart/master/README.md
- fflate 0.8.3, MIT — https://www.npmjs.com/package/fflate ·
  `UnzipFileInfo.originalSize` from
  https://raw.githubusercontent.com/101arrowz/fflate/master/docs/interfaces/UnzipFileInfo.md
  and the `filter` example in its README
- rtf-parser 1.3.3 (ISC), rtf-stream-parser 4.0.0 (MIT), word-extractor 1.0.4 (MIT),
  yauzl 3.4.0 (MIT), adm-zip 0.6.0 (MIT) — named and not adopted; metadata from the
  same registry endpoint

**Repository sources** (all [P], read today)

- `docs/agents/M6-formats.md`, `docs/skill-porting.md`, `docs/PLAN.md` §8
- `docs/research/style-profile-design-2026-08.md` §0, §2.C/G/H, §3.2–3.8, §4, §6, §7.1
- `docs/research/m3-preflight-2026-08.md` §2.2, §3-A/E/F/G/I, §4.2, §4.4, §4.5
- `docs/research/privacy-audit-2026-08.md` H1, H2
- `docs/research/m8-bundling-2026-08.md` §6.1, §7
- `docs/feedback/2026-08-22-owner-answers.md` answers 2, 3, 6+7
- `docs/decisions.md` rows dated 2026-08-22 (style exemplars; derived profile; closed-vocabulary profile)
- `server/src/ai/{types,prompts,ollama,fake,errors,degenerate}.ts`,
  `server/src/{app,egress-guard}.ts`, `server/src/routes/formats.ts`,
  `server/src/db/formats.ts`, `shared/src/note-format.ts`,
  `web/src/routes/{OnboardingFormat,OnboardingPreview}.tsx`,
  `prototype/onboarding-format.html`, `prototype/onboarding-preview.html`

**Techniques not invented here**

- Frequency-across-documents as a separator of structure from content is the same
  argument `style-profile-design-2026-08.md` §3.3/§4.3 makes for phrase mining, and
  ultimately the same one behind document-frequency weighting in IR.
- Longest common subsequence for reconciling orderings across documents — standard.
- Constrained decoding over an enumerated vocabulary as a structural rather than
  behavioural guarantee — the same reasoning `style-profile-design-2026-08.md` §1 item 3
  applies to the closed-vocabulary profile.
