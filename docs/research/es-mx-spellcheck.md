# Mexican Spanish spell-check dictionary and its licence (S1.5)

**Card:** S1.5, role RESEARCH. **Date:** 2026-09-25 local / 2026-09-26 UTC. **Status:** research only; nothing here is implemented, nothing was acquired, and nothing here is legal advice (§3.7 lists the questions only a Mexican lawyer can settle).

**What this file is:** the licence position and the recommendation behind acquisition row **A11** in `docs/v2/ACQUISITION.md` ("The Spanish Hunspell dictionary S1.5 recommends"). It answers the three dispatch questions in §2 (what exists), §3 (the election and its obligations) and §4 (whether anything else fits).

**Method:** public web pages only, no logins, no downloads (HS-3). Nothing was installed, unpacked or `npm install`ed; the registry was read as a page (`registry.npmjs.org/<pkg>` returns public JSON metadata) and GitHub was read through the public API and `raw.githubusercontent.com`. The only commands run locally were read-only greps and one inline `node -e` that evaluates the licence-collector's own regex (evidence in `docs/v2/evidence/S1.5/evidence.md`). **No tarball was fetched**, so no SHA-256 of any file is claimed below — the package manager's `integrity` string is quoted instead, which `ACQUISITION.md` §1 accepts.

**Labels:** `[verified]` = read verbatim or near-verbatim on the cited page. `[inferred]` = my reasoning, with the basis stated. `[not found]` = checked the listed sources and could not confirm; flagged, never filled with a guess.

**No clinical material appears here.** This is a report about a word list and a licence. Per `CLAUDE.md` hard rule 2 there are no clinical examples and no text resembling a note.

---

## 1. Verdict in one paragraph

`dictionary-es-mx` **fits L-POLICY@1**, and only through the single pre-approved exception. Its word data is offered under a **disjunctive triple** — `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)` — and the arm to elect is **MPL-1.1**, recorded by name. `[verified]` the offer, from the package's own licence file and its upstream. The wrapper's MIT covers only the wrapper's own code and does not touch the data. Two obligations are not optional and one surprise is recorded: `npm run lint` **will fail** the moment the package is added to the lockfile, because `scripts/collect-licenses.mjs` treats any licence string containing `GPL` or `LGPL` as forbidden unless the deliberate arm is registered in `DUAL_LICENSED_CHOICES`; and the published tarball almost certainly does **not** contain the licence file, so Apunta must carry the notice and the MPL-1.1 text itself. Details and the exact text in §3.

---

## 2. Q1 — Which packages exist

### 2.1 The table

| Package / source | What it is | Data licence (as declared) | Size | Last update |
| --- | --- | --- | --- | --- |
| **`dictionary-es-mx@2.0.0`** (npm), from `wooorm/dictionaries`, dir `dictionaries/es-MX` — https://www.npmjs.com/package/dictionary-es-mx , https://github.com/wooorm/dictionaries/tree/main/dictionaries/es-MX | Mexican Spanish Hunspell pair (`index.aff` + `index.dic`) generated from `sbosio/rla-es`, "normalized and packaged" | `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)` `[verified]` in `package.json` and the readme's License section — https://github.com/wooorm/dictionaries/blob/main/dictionaries/es-MX/package.json | unpacked 879,564 B over 7 files `[verified]` registry `dist`; the data itself is `index.aff` 158,014 B + `index.dic` 714,044 B = 872,058 B `[verified]` file sizes from the GitHub contents API | published 2023-11-03T17:23:16.990Z; first published 2020-01-22 `[verified]` registry `time`; last commit touching `dictionaries/es-MX` in the monorepo is also 2023-11-03 `[verified]` |
| **`dictionary-es@4.0.0`** (npm), same monorepo, dir `dictionaries/es` — https://www.npmjs.com/package/dictionary-es | The unqualified Spanish dictionary (earlier versions described as "Spanish (Spain)"), also generated from `sbosio/rla-es` `[inferred]`, from the readme's source link plus the 1.0.0 description "Spanish (Spain) spelling dictionary" | the same triple `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)` `[verified]` registry `license` | unpacked 880,768 B over 7 files `[verified]` | published 2023-11-03T17:22:25.283Z `[verified]` |
| **Upstream `sbosio/rla-es`**, `ortografia/` — https://github.com/sbosio/rla-es | The authoritative RLA-ES project; its `afijos`/`palabras` sources are compiled into the per-locale Hunspell dictionaries used by LibreOffice, Apache OpenOffice and Mozilla Firefox `[verified]` from its README | triple scheme, "Puede seleccionar libremente" `[verified]` `LICENSE.md` | the built `es_MX.aff`/`.dic` are **not committed** to the repo (there is no `es_MX` directory; `ortografia/afijos` holds one combined `afijos.txt`, 263,830 B `[verified]`) — they are distributed as release downloads | repo `pushed_at` 2026-09-19T18:41:10Z `[verified]`; corrector version `CORRECTOR="2.9"` `[verified]` `.versiones.cfg` |

Other things that are **not** candidates, checked:

- `@cspell/dict-es_mx` **does not exist** on the registry (HTTP 404 on `https://registry.npmjs.org/@cspell%2Fdict-es_mx`) `[verified]`. So the cspell family offers no es-MX dictionary; the `@cspell/dict-*` packages that do exist are MIT word lists for software ecosystems, and `@cspell/dict-es_mx` is not one of them `[verified]` by the 404.
- `dictionary-es-419` **does not exist** on the registry (HTTP 404) `[verified]`, so there is no broader Latin-American variant in this family to compare against.
- `hunspell/hunspell` ships **no `es_MX` directory** (HTTP 404 on the contents API for that path at `master`) `[verified]`.
- `mozilla/dictionaries` returned HTTP 404 at the GitHub API `[verified]` — no such repository at that path, so it is not a source to check for a packaged es-MX.
- An npm registry search for `hunspell es-mx` and for `es_MX dictionary spelling` surfaced exactly two Spanish dictionary data packages, `dictionary-es` and `dictionary-es-mx`, both from the same monorepo `[verified]` — https://registry.npmjs.org/-/v1/search?text=hunspell%20es-mx

`[not found]` I did **not** enumerate `cspell-dicts`' `dictionaries/` directory listing or the full `wooorm/dictionaries` language table, so I cannot rule out a further Spanish variant published under a name I did not think to try. The two npm searches above are the basis for saying the es-MX choice on npm is `dictionary-es-mx`.

### 2.2 The recommended candidate, in detail

**`dictionary-es-mx@2.0.0`**, integrity `sha512-EkRPJAgPhY55oMiHqwEBavOpokkvXlOO5jOdwZJmV/B6w9pGpJxlm7YorgHjiB2HqyPGW0FRcOoJRBTspTXUEA==`, shasum `30fb094031481fff76cf0fd40bcfd9163149bc00` `[verified]` registry `dist`, https://registry.npmjs.org/dictionary-es-mx . Why it and not something else:

- **It is the only Mexican-Spanish Hunspell pair on npm** (§2.1). The card asks for a Mexican dictionary; the unqualified `es` package is not one, and switching to it would be a locale regression dressed as a licence fix.
- **It is the same shape Apunta already ships for English.** `web/package.json` depends on `dictionary-en ^4.0.0` and `nspell ^2.1.5`; `web/src/lib/speller.ts:19-20` addresses the two Hunspell files with `new URL('../../../node_modules/dictionary-en/index.aff', import.meta.url)` so the bundler copies them into the build, and the files are fetched from the app's own origin and read by `nspell` in the tab. `web/src/lib/speller.test.ts` already asserts exactly that for the English pair. `[inferred]` the identical relative-path form works for a second top-level package such as `dictionary-es-mx`, so Spanish spell check needs no new runtime dependency and no new code path — only the package, a locale switch and a second pair of URLs.
- **The data is the community's, not a wrapper's.** The readme states the package is "generated by `wooorm/dictionaries` from `sbosio/rla-es`, normalized and packaged" and that "dictionaries are not maintained here. Report spelling problems upstream" `[verified]`. The dictionary is the one LibreOffice/OpenOffice/Firefox use for `es_MX` `[verified]` from the upstream README.
- **It is quiet, so nothing depends on a fork.** 316 weekly / 1,822 monthly downloads `[verified]` registry search result. Apunta is unlikely to be the only project depending on these exact bytes.

Two honest weaknesses, both for the owner to weigh:

- **The packaged copy is stale relative to upstream.** The vendored licence file is headed "Versión 2.8" `[verified]` https://github.com/wooorm/dictionaries/blob/main/dictionaries/es-MX/license , while upstream's `.versiones.cfg` says `CORRECTOR="2.9"` `[verified]` https://github.com/sbosio/rla-es/blob/master/.versiones.cfg , and upstream was pushed on 2026-09-19 `[verified]`. The npm package has not moved since 2023-11-03. No new vocabulary in ~3 years is a real cost for a therapist adding terms, and there is no supported way to get 2.9 through this package. `[inferred]` taking a later upstream build instead would mean acquiring from a source `ACQUISITION.md` A11 does not list (npm registry), so that is the coordinator's and owner's call, not this card's.
- **It is normalised, not a byte copy of an upstream release file.** "Normalized" is wooorm's word `[verified]` readme. Apunta would ship wooorm's build of rla-ES, not a file published by rla-ES. `[inferred]` the licence travels with the normalisation because wooorm vendors the upstream `license` file into the package directory `[verified]`, but the *provenance* recorded in `THIRD-PARTY-LICENSES.md` should say "wooorm's normalised build of rla-ES 2.8" rather than "rla-ES 2.8".

### 2.3 What shipping it costs

872,058 B of word data added to the browser bundle `[verified]` file sizes, §2.1), fetched once per tab from `127.0.0.1` like the English pair, and parsed by `nspell` in the tab `[inferred]` from `web/src/lib/speller.ts`. For comparison `docs/decisions.md` records the English pair as "550 KB fetched once from the app's own origin", so Spanish roughly adds 0.9 MB uncompressed to the shipped app and the one-off load. No clinical, privacy or network consequence: the files come from the app's own origin, which is what `shared/src/spelling.ts` exists to guarantee.

---

## 3. Q2 — The election, and the obligations that follow

### 3.1 What the sources actually say

**The package's own data licence file** (`dictionaries/es-MX/license`, the file the readme's License section links to), §2 "LICENCIA", verbatim `[verified]` — https://github.com/wooorm/dictionaries/blob/main/dictionaries/es-MX/license (raw: https://raw.githubusercontent.com/wooorm/dictionaries/main/dictionaries/es-MX/license ):

> Este diccionario para corrección ortográfica, integrado por el fichero de afijos y la lista de palabras (es_MX[.aff|.dic]) se distribuye bajo un triple esquema de licencias disjuntas: GNU GPL versión 3 o posterior, GNU LGPL versión 3 o posterior, ó MPL versión 1.1 o posterior. Puede seleccionar libremente bajo cuál de estas licencias utilizará este diccionario. En el fichero LICENSE.md encontrá más detalles.

The same file names the author — "Este diccionario ha sido desarrollado inicialmente por Santiago Bosio" — and carries a 25-name acknowledgement list `[verified]`, same URL.

**The package's readme**, License section, verbatim `[verified]` — https://github.com/wooorm/dictionaries/blob/main/dictionaries/es-MX/readme.md (mirrored in the npm readme at https://www.npmjs.com/package/dictionary-es-mx ):

> Dictionary and affix file:
> [(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)](https://github.com/wooorm/dictionaries/blob/main/dictionaries/es-MX/license).
> Rest: [MIT](https://github.com/wooorm/dictionaries/blob/main/license) © [Titus Wormer](https://wooorm.com).

**The package metadata** declares `"license": "(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)"` `[verified]` — https://github.com/wooorm/dictionaries/blob/main/dictionaries/es-MX/package.json . It does **not** say MIT.

**Upstream** `LICENSE.md`, verbatim `[verified]` — https://github.com/sbosio/rla-es/blob/master/LICENSE.md (raw: https://raw.githubusercontent.com/sbosio/rla-es/master/LICENSE.md ):

> El proyecto y los diccionarios se distribuyen bajo un triple esquema de licencias disjuntas: GNU GPL versión 3 o posterior, GNU LGPL versión 3 o posterior o MPL versión 1.1 o posterior. Puede seleccionar libremente bajo cuál de estas licencias realizará el uso.

and it points at the three full texts, one of which is a file in the repo: `LICENSE/GPLv3.txt`, `LICENSE/LGPLv3.txt`, `LICENSE/MPL-1.1.txt` `[verified]`, same URL. The same file adds that the *synonym* dictionary is a different object under a different arm ("El diccionario de sinónimos se distribuye según lo auspiciado por la GNU LGPL v2.1") `[verified]` — a useful reminder that this project already separates objects per licence, which is exactly L-POLICY's "applied per object reviewed".

**The Mozilla Public License 1.1** full text, read in full `[verified]` — https://www.mozilla.org/media/MPL/1.1/index.txt

### 3.2 The election

**Elected: MPL-1.1**, for the dictionary data only (`index.aff`, `index.dic`). `[inferred]`, from the sources above:

1. The offer is genuinely disjunctive and free — "licencias disjuntas", "Puede seleccionar libremente" — so taking one arm is a real choice, and choosing wrongly is possible. This is not the shape of a package that has to be taken as offered.
2. L-POLICY's shipped-object row allows MIT, BSD, Apache-2.0, ISC, Zlib, 0BSD, Unicode, OFL-1.1, CC0 and CC-BY-4.0. Neither GPL-3.0 nor LGPL-3.0 is on it, so the data does not fit row 1. The single pre-approved exception is written for exactly this case: "Spanish dictionary **data** under an MPL option of a multi-licence, shipped unmodified in its own files, election and obligations stated in `THIRD-PARTY-LICENSES.md` and `docs/decisions.md`". The candidate is a Spanish dictionary, its data is under an MPL option of a multi-licence, and it can be shipped unmodified in its own files. **FITS, through the exception, on every element of that sentence.**
3. **MPL-1.1, not "MPL-1.1-or-later".** Upstream offers "MPL versión 1.1 o posterior", but the published package declares the exact SPDX `MPL-1.1` with no `-or-later` suffix `[verified]`. Electing the exact version the package declares is the conservative reading and the one a reviewer can check in one line; MPL-2.0 would need its own argument, and nothing in these sources invites it.
4. **This must be written down, not assumed.** The other two arms are pre-approval failures, so a reader who cannot see the election has no way to know which arm Apunta took. That is why the exception requires the election to be stated in `THIRD-PARTY-LICENSES.md` and `docs/decisions.md`. The precedent for the *form* of that record already exists: `docs/decisions.md` has a 2026-09-07 row explaining why `dictionary-en` was preferred (`MIT and BSD`, 4.0.0), and `THIRD-PARTY-LICENSES.md:847` lists it.

### 3.3 What the wrapper's MIT licence does and does not do

**Does not reach the data.** The readme's "Rest: MIT" is scoped to the wrapper, and the sentence above it names the data's triple explicitly `[verified]`. The package's own `license` field is the triple, not MIT `[verified]`. L-POLICY says it in one line: "A dependency's MIT wrapper does not change its data's licence." So the index.js/index.d.ts wrapper (MIT, © Titus Wormer) and the .aff/.dic data (MPL-1.1 elected) are two objects, and the second one is the one Apunta ships to the browser.

**Does not need the wrapper at all.** `web/src/lib/speller.ts` reads the two Hunspell files out of `node_modules` by URL and never imports the package's code `[verified]`, `[inferred]` that only the data reaches the browser. The MIT wrapper is a Node-side convenience this app does not use.

### 3.4 The obligations that follow, as the MPL-1.1 text states them

Quoted from the licence text `[verified]` https://www.mozilla.org/media/MPL/1.1/index.txt . These are the licence's own words; what each one means for a data file is an interpretation and belongs to §3.7.

- **§3.1** — "The Source Code version of Covered Code may be distributed only under the terms of this License or a future version of this License released under Section 6.1, and You must include a copy of this License with every copy of the Source Code You distribute." → Ship a copy of the MPL-1.1 text with the data.
- **§3.5** — "You must duplicate the notice in Exhibit A in each file of the Source Code. If it is not possible to put such notice in a particular Source Code file due to its structure, then You must include such notice in a location (such as a relevant directory) where a user would be likely to look for such a notice. … You must also duplicate this License in any documentation for the Source Code where You describe recipients' rights or ownership rights relating to Covered Code." → A notice next to the data, and the licence text in the notices document. Exhibit A is the block beginning "The contents of this file are subject to the Mozilla Public License Version 1.1 … The Original Code is ______. The Initial Developer of the Original Code is ______." — note the blanks.
- **§3.6** — "You may distribute Covered Code in Executable form only if the requirements of Section 3.1-3.5 have been met for that Covered Code, and if You include a notice stating that the Source Code version of the Covered Code is available under the terms of this License, including a description of how and where You have fulfilled the obligations of Section 3.2. The notice must be conspicuously included in any notice in an Executable version, related documentation or collateral in which You describe recipients' rights relating to the Covered Code." → The shipped app must say, conspicuously, that the data is under MPL-1.1, that its source form is the `.aff`/`.dic` files Apunta ships, and where they are. §3.1's copy of the licence and §3.5's notice are prerequisites of this clause, not alternatives to it.
- **§3.2** — "Any Modification which You create or to which You contribute must be made available in Source Code form under the terms of this License either on the same media as an Executable version or via an accepted Electronic Distribution Mechanism … and must remain available for at least twelve (12) months …" → `[inferred]` this is the clause that makes L-POLICY's "shipped unmodified" wording load-bearing: it is drafted around *Modifications*, and Apunta creates none, so the twelve-month availability duty is not triggered on the face of the text. Whether that is right for a file that is not software code is §3.7.
- **§3.3** — "You must cause all Covered Code to which You contribute to contain a file documenting the changes You made to create that Covered Code and the date of any change." → `[inferred]` no modification, so no change file. If a future Apunta patch ever adds a word, this clause wakes up and so does §3.2 — which is the practical reason to keep Spanish additions in Apunta's own allow-list (`spelling_words`, per `docs/decisions.md` 2026-09-07) and out of the shipped `.dic`.
- **§3.7** — "You may create a Larger Work by combining Covered Code with other code not governed by the terms of this License and distribute the Larger Work as a single product. In such a case, You must make sure the requirements of this License are fulfilled for the Covered Code." → `[inferred]` this is the clause that makes the bundle legal in the first place: the MIT-licensed app and the MPL-governed word list may ship as one product, with the MPL obligations met for the word list and the rest of the app untouched. L-POLICY's "shipped unmodified in its own files" is the same shape, from this side.
- **§1.5 / §1.9** — "Executable" means "Covered Code in any form other than Source Code"; a Modification is "any addition to or deletion from the substance or structure of either the Original Code or any previous Modifications", and, for a file series, "Any addition to or deletion from the contents of a file". → `[inferred]` renames, re-encodings or concatenating the two files into one would create a Modification. Ship the bytes as they are, in two files, with their names.

### 3.5 What Apunta would concretely have to do (for S6.1, and for whoever records the election)

1. Add `dictionary-es-mx@2.0.0` to the `web` workspace and record the acquisition exactly as `ACQUISITION.md` §1 requires: version, URL, size, SHA-256, licence evidence, date. The integrity string to compare against is in §2.2.
2. Record the election in **`THIRD-PARTY-LICENSES.md`** and in a **`docs/decisions.md`** row: offered `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)`, **taken MPL-1.1**, data = `index.aff` + `index.dic`, unmodified, plus the provenance caveat from §2.2 ("wooorm's normalised build of rla-ES 2.8").
3. **Register the arm in `scripts/collect-licenses.mjs`** (or whatever mechanism the owner prefers) — see §3.6. Without this, `npm run lint` fails.
4. Ship, with the two data files: a copy of the **MPL-1.1 text**, the **Exhibit A notice** with the blanks filled, and a statement of where the source form is. Given §3.6's finding below, **copy these into the repo from the two cited URLs rather than relying on the package to carry them.**
5. Do not modify, re-encode, rename or merge the two files; keep Spanish word additions in Apunta's own allow-list.
6. Note the 0.9 MB of additional shipped data in the size figures the owner sees.

### 3.6 The one mechanical surprise: `npm run lint` will fail

`scripts/collect-licenses.mjs:35` declares `const FORBIDDEN = /\b(GPL|AGPL|LGPL|SSPL|CC-BY-NC|BUSL)\b/i;` and `isForbidden()` (line 51) fails any package whose licence string matches and which is not listed in `DUAL_LICENSED_CHOICES` (line 48, currently only `jszip`); a match is collected into `problems` and the script `process.exit(1)`s (line 137), and `npm run lint` runs it.

Evaluating that exact regex and that exact function against the package's declared licence string gives `[verified]` (inline `node -e`, no package installed, evidence file §A3):

```
regex matches: true | isForbidden(dictionary-es-mx): true
en: false
```

The same check on the English package's `(MIT AND BSD)` is `false`, which is why adding `dictionary-es` cost nothing and adding `dictionary-es-mx` will. `[inferred]` the fix is one line in `DUAL_LICENSED_CHOICES` recording `offered: '(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)'`, `taken: 'MPL-1.1'`, which is precisely the mechanism that map's own doc comment describes ("Dual licences where Apunta has deliberately taken the permissive arm") — though MPL-1.1 is not a permissive licence, so the reviewer may prefer a differently named map or an explicit data-licence path. **This card does not touch that script**: it is outside "May edit" and belongs to S6.1 or a licence-collector card. Flagging it here because it is a build-breaking consequence of the acquisition, not a style point.

**The tarball probably does not carry the licence file.** The published `files` array is `["index.aff", "index.d.ts", "index.d.ts.map", "index.dic", "index.js"]` `[verified]` §3.1, and the registry reports `fileCount: 7` `[verified]`. `[inferred]` those five plus npm's always-included `package.json` and readme make exactly seven, so the `license` file (2,596 B in the monorepo directory) `[verified]` GitHub contents API is most likely **not** inside the published package. `[not found]` I could not confirm it either way: confirming needs the tarball, and downloading is prohibited here. Either way the practical instruction is the same — take the licence text from the two cited URLs and ship it, rather than trusting the package to have brought it.

### 3.7 Open questions, for a Mexican lawyer (no legal advice is given or implied above)

1. **Is a word list "Source Code" under MPL-1.1?** §1.11 defines Source Code as "the preferred form of the Covered Code for making modifications to it, including all modules it contains" — written for software. The `.aff`/`.dic` are plainly the form one would modify, so treating them as source is the conservative reading and I have assumed it, but whether a Mexican court or the upstream authors would agree is not something this file can settle.
2. **Who fills in Exhibit A?** The notice's "The Original Code is ______. The Initial Developer of the Original Code is ______." The data licence names Santiago Bosio as the initial developer of the dictionary `[verified]` §3.1, but naming a person in a shipped notice is the owner's call, and the upstream file itself leaves the fields blank.
3. **Does "Commercial Use" (defined in §1.0.1 as "distribution or otherwise making the Covered Code available to a third party") reach Apunta?** Apunta is distributed to one therapist, which is a distribution to a third party on the licence's own wording `[verified]`. No exemption is claimed or needed; the point is only that the pre-approved exception was written with distribution in mind.
4. **Is MPL-1.1-or-later (upstream) a wider grant than MPL-1.1 (package metadata)?** If the owner wants the option to move to MPL-2.0 later, that should be elected deliberately and recorded, not inherited silently.

---

## 4. Q3 — If nothing fits, say so

**Not the case here, so the consequence the card names does not fire on licence grounds.** One candidate fits: `dictionary-es-mx`, through the single pre-approved exception, elected at MPL-1.1 (§3.2). Nothing in §2.1 offers a Mexican-Spanish dictionary under a plainly permissive licence — no CC0, CC-BY-4.0, MIT-data or public-domain es-MX word list was found `[not found]`, checked: the npm registry search for `hunspell es-mx` and for `es_MX dictionary spelling` (only `dictionary-es` and `dictionary-es-mx`), the registry for `@cspell/dict-es_mx` and `dictionary-es-419` (both 404), and `hunspell/hunspell` for an `es_MX` directory (404). The exception is therefore the only route to a Mexican dictionary, which is presumably why it was written into L-POLICY in the first place.

Two things this does **not** decide:

- **Spanish spell check stays subject to C-ES-GATE regardless.** `docs/v2/CONTRACTS.md` C-ES-GATE@1 lists "Spanish spell check passes — S6.1" as one of eight conditions, and says "Any `FAIL`, `BLOCKED` or `NOT RUN` keeps Spanish held." This card makes the licence half of S6.1 achievable; it does not release Spanish, and it is not an input that any human gate is being marked as passed. I read C-ES-GATE only to avoid contradicting it; nothing in this card touches it.
- **The quality of the dictionary is unmeasured.** A licence that permits shipping says nothing about whether an es-MX word list marks her own clinical vocabulary as misspelled. `[not found]` no published accuracy figure for this package exists, and a miss costs a red underline on a word she wrote, not a wrong note. S6.1's own tests, on synthetic fixtures, are where that gets measured.

---

## 5. Sources

Everything below was read on 2026-09-25/26 as a public page, with no login and no download.

- `dictionary-es-mx` registry metadata (versions, `dist` sizes and integrity, `license`, `time`, readme) — https://registry.npmjs.org/dictionary-es-mx ; human page — https://www.npmjs.com/package/dictionary-es-mx
- `dictionary-es` registry metadata (same fields) — https://registry.npmjs.org/dictionary-es
- `dictionary-es-419` — 404 — https://registry.npmjs.org/dictionary-es-419 ; `@cspell/dict-es_mx` — 404 — https://registry.npmjs.org/@cspell%2Fdict-es_mx
- npm registry search `hunspell es-mx` — https://registry.npmjs.org/-/v1/search?text=hunspell%20es-mx ; search `es_MX dictionary spelling` — https://registry.npmjs.org/-/v1/search?text=es_MX%20dictionary%20spelling
- `wooorm/dictionaries` `dictionaries/es-MX` directory listing (file sizes: `index.aff` 158,014 B, `index.dic` 714,044 B, `license` 2,596 B) — https://api.github.com/repos/wooorm/dictionaries/contents/dictionaries/es-MX?ref=main
- `dictionaries/es-MX/license` — the data licence text, verbatim quotes in §3.1 — https://github.com/wooorm/dictionaries/blob/main/dictionaries/es-MX/license
- `dictionaries/es-MX/readme.md` — License section, source and "not maintained here" — https://github.com/wooorm/dictionaries/blob/main/dictionaries/es-MX/readme.md
- `dictionaries/es-MX/package.json` — `"license": "(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)"`, the `files` array — https://github.com/wooorm/dictionaries/blob/main/dictionaries/es-MX/package.json
- `wooorm/dictionaries` commits touching `dictionaries/es-MX` (latest 2023-11-03) — https://api.github.com/repos/wooorm/dictionaries/commits?path=dictionaries/es-MX
- `sbosio/rla-es` `LICENSE.md` — the triple scheme verbatim, the three full-text file names, the synonym dictionary's separate LGPL-2.1 — https://github.com/sbosio/rla-es/blob/master/LICENSE.md
- `sbosio/rla-es` `README.md` — project scope, the 22 regional variants including `es_MX`, and the statement that dictionaries are compiled for LibreOffice, Apache OpenOffice and Mozilla Firefox — https://github.com/sbosio/rla-es/blob/master/README.md
- `sbosio/rla-es` `.versiones.cfg` — `CORRECTOR="2.9"` — https://github.com/sbosio/rla-es/blob/master/.versiones.cfg
- `sbosio/rla-es` `ortografia/afijos` listing (one combined `afijos.txt`, 263,830 B; no per-locale `es_MX` directory) — https://api.github.com/repos/sbosio/rla-es/contents/ortografia/afijos?ref=master
- `sbosio/rla-es` repository metadata (`pushed_at` 2026-09-19, `default_branch` master, licence `NOASSERTION`) — https://api.github.com/repos/sbosio/rla-es
- Mozilla Public License 1.1, full text — https://www.mozilla.org/media/MPL/1.1/index.txt
- `hunspell/hunspell` `es_MX` path — 404 at `master` — https://api.github.com/repos/hunspell/hunspell/contents/es_MX ; `mozilla/dictionaries` — 404 — https://api.github.com/repos/mozilla/dictionaries

In-repo, read locally: `docs/v2/ACQUISITION.md` §3 (L-POLICY@1) and §1 row A11; `web/src/lib/speller.ts`; `web/src/lib/speller.test.ts`; `web/package.json`; `THIRD-PARTY-LICENSES.md` (line 847, `dictionary-en` 4.0.0 `(MIT AND BSD)`); `scripts/collect-licenses.mjs` (lines 35, 48, 51, 137); `docs/decisions.md` (2026-09-07 rows on `dictionary-en-au` and `dictionary-en`); `docs/v2/CONTRACTS.md` C-ES-GATE@1.

---

## 6. Unresolved, and what was not done

- `[not found]` The SHA-256 of `dictionary-es-mx@2.0.0`, of its tarball, and of `index.aff`/`index.dic` individually. Computing them requires fetching the package, which HS-3 forbids for this card. `ACQUISITION.md` §1 makes recording them the acquiring card's job, not this one's; the npm `integrity` string is given in §2.2 so the acquiring card has something to compare against.
- `[not found]` Whether the published tarball contains the `license` file (§3.6). Arithmetic says probably not; confirmation needs the tarball. The instruction to ship the notice regardless is unaffected.
- `[not found]` Any accuracy measurement of this dictionary — no published figure, and none produced here (that is S6.1's test, on synthetic fixtures).
- `[not found]` A maintained es-MX dictionary under a permissive licence, and any newer wooorm build of rla-ES 2.9 (§2.1, §2.2).
- Not done, deliberately: nothing was added to the dependency tree, no file under `web/`, `scripts/`, `THIRD-PARTY-LICENSES.md` or `docs/decisions.md` was touched, and nothing was committed. The election in §3.2 is a **recommendation**; only the owner can make it the project's recorded position.
- The §3.6 lint failure is a prediction about a build that has not been attempted. `[inferred]` from the collector's own code and regex, verified by evaluating that code's logic directly — not by adding the package and running `npm run lint`, which is S6.1's to do.
