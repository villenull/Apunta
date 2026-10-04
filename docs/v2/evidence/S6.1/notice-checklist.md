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
