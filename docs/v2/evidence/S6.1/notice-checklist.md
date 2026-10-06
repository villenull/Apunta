# S6.1 — the Exhibit A notice checklist

The four-field template of `docs/v2/state/S6.1-NOTICE-PROVENANCE.md` §3.1 and §4,
against **the shipped file**. The question this checklist answers is not "was a
notice drafted" but "what does `THIRD-PARTY-LICENSES.md` actually contain", and
the answer is: one generated table row and nothing else.

## The four fields

| Exhibit A field | This card's value | In the shipped file? |
| --- | --- | --- |
| The Original Code is … | the Mexican Spanish (`es_MX`) Hunspell pair (`index.aff` + `index.dic`), as released by the RLA-ES project (`sbosio/rla-es`) and normalised/packaged by `wooorm/dictionaries`, shipped here unmodified under its own names. The descriptive half is sourced; the **scope** half (whether the normalised build is a Modification) is `[interpretation]`, S1.5 §3.7 Q1 — not answered. | **No** |
| The Initial Developer of the Original Code is … | **"Santiago Bosio"** — adopted from the `Para: es_MX` AUTOR (Source A). The project owner's name is never substituted for it. | **No** |
| Portions created by … are Copyright (C) … All Rights Reserved | **`[unknown]`** — no `es_MX`-specific copyright line exists upstream. Next step **U2**. | **No** |
| Contributor(s): … | **`[unknown]`** — whether the normalised build is a Modification is `[interpretation]`. Next step **U3**: the owner's call, on advice; if it is a Modification, the sourced names are Titus Wormer and Thomas Beverley (Source D), not the project owner. | **No** |

## What the shipped file contains, and nothing else

The only mention of the package anywhere in `THIRD-PARTY-LICENSES.md` is the
generated row, inside the `<!-- npm-dependencies:start -->` /
`<!-- npm-dependencies:end -->` markers:

```
848:| `dictionary-es-mx` | 2.0.0 | MPL-1.1 (offered as (GPL-3.0 OR LGPL-3.0 OR MPL-1.1)) | Author: Titus Wormer <tituswormer@gmail.com> (https://wooorm.com) |
```

`rg -n "dictionary-es-mx" THIRD-PARTY-LICENSES.md` prints **that line and
nothing else**, and `git diff -- THIRD-PARTY-LICENSES.md` is, in full, one added
row plus one changed generated summary line (see `V4-licence.md`). Therefore:

- **no** notice section,
- **no** `{{OWNER: …}}` placeholder,
- **no** blank field,
- **no** partially filled template.

A placeholder form was **not** used, so there is none to keep out of the shipped
file. A notice carrying an unresolved field is not a delivered obligation, and
under AM-203 item 2(a) the notice is unshippable while two fields are unknown.

## The two open legal questions of S1.5 §3.7

Recorded **next to the notice in the file**, only if and when all four fields
resolve. They are not in the file, because the notice is not; they are recorded
here and in the return file instead:

1. whether the `wooorm/dictionaries` normalised build is a **Modification** of
   the RLA-ES original, and
2. what that would mean for the *Portions created by …* and *Contributor(s)*
   fields if it is.

## Verdict

**BLOCKED**, and never `PASS`, until U2 and U3 are sourced (the card's Stop 2).
Nothing in the shipped file is a placeholder or a blank, which is what Stop 2
requires of a card in this state; the row is blocked because the obligation is
unmet, not because something incomplete was written.

---

## Superseded 2026-10-06 — AM-220, the checklist re-run against the shipped file

Written under **AM-220** (owner's multiple-choice answers 2026-10-06,
`docs/v2/state/AMENDMENTS.md`), after the research pass of
`docs/v2/state/S6.1-NOTICE-PROVENANCE.md` §7 sourced U1, U2 and U5 and measured
U3's facts. Everything above this line is kept exactly as the blocked pass wrote
it: it was true of the file at that time, and this section supersedes it without
editing a word of it.

### The four fields, as they now appear in `THIRD-PARTY-LICENSES.md`

| Exhibit A field | Value in the shipped file | Where |
| --- | --- | --- |
| The Original Code is … | the Mexican Spanish (`es_MX`) Hunspell orthographic dictionary — affix file and word list — as released by the RLA-ES project (`sbosio/rla-es`) at version 2.8 in `es_MX.aff` and `es_MX.dic` | completed-notice block, lines 845–848 |
| The Initial Developer of the Original Code is … | `Santiago Bosio` | line 850 |
| Portions created by … are Copyright (C) … All Rights Reserved | `Portions created by Santiago Bosio y otros are Copyright (C) 2004-2020 Santiago Bosio y otros. All Rights Reserved.` | lines 851–852 |
| Contributor(s): … | `Titus Wormer, Thomas Beverley` | line 854 |

The completed notice carries the standard Exhibit A licence and warranty
preamble and the alternative-licence paragraph, including its complete
standard tail, filled with the publisher's GPL v3+ and LGPL v3+ alternatives.

### What the shipped file contains now

The package is identified in the component row, election summary, MPL-section
package table and source-availability prose, and in its generated npm row.
These structural locations, rather than a brittle match count or line-number
list, identify the corrected file's notice and generated regions.

So the answer to the question this checklist exists for has changed, in full:

- **yes** — a completed notice under *Licence texts* → *Mozilla Public
  License 1.1*, separate from the full licence's own template;
- **no** `{{OWNER: …}}` placeholder anywhere in the file;
- **no** blank field in the completed notice. The official licence's Exhibit A
  template retains its original blanks; identifiers such as `es_MX` are not
  unresolved fields;
- **no** partially filled notice. The initial notice-writer snapshot measured
  632 insertions and no deletions outside the npm markers, before independent
  source-review corrections. No generated content was hand-edited;
- the complete elected licence text is bundled in the same section, byte-identical
  to `https://www.mozilla.org/media/MPL/1.1/index.txt` as read 2026-10-06.

### The open legal questions recorded beside the notice

The conspicuity question is MPL-1.1 §3.6, discussed in S1.5 §3.4 and the
proposal's §8.3; it is not S1.5 §3.7 Q3. The word-list-as-Source-Code question
is S1.5 §3.7 Q1. Neither is answered here. Q3 (Commercial Use) and Q4 (the
later-version grant) remain in the research report; the notice claims no
exemption and records MPL-1.1 as the current election.

### Verdict

The **BLOCKED** verdict above stands as the record of the blocked pass. This
section's verdict is only about the thing that was blocked: Stop 2's condition —
every field resolved from a source — is now satisfied, so the notice may ship,
and what it says is recorded above rather than summarised. **V4's own verdict is
the coordinator's to record by running V4**; nothing here claims it, and nothing
here is a legal opinion.
