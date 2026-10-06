# S6.1 — acquisition record (A11)

`docs/v2/ACQUISITION.md` §1's own fields, for the one acquisition this card is
allowed to make. It was made by the Steps' pinned install and by nothing else:
no other network call was made from this card, at build time or at runtime.

| Field | Value |
| --- | --- |
| Item | **A11** — the Spanish Hunspell dictionary S1.5 recommends |
| Package | `dictionary-es-mx` |
| Exact version | **2.0.0** (exact; `--save-exact`; no caret in any of the three copies) |
| Source | npm registry (A11's allowed host), redirect hosts: none, allowed query keys: **none** |
| URL | `https://registry.npmjs.org/dictionary-es-mx/-/dictionary-es-mx-2.0.0.tgz` (as recorded in the lockfile) |
| Date | 2026-10-04 (UTC), the install ran at about 19:45Z |
| Command | `npm install --workspace @apunta/web --save-exact --no-audit --no-fund dictionary-es-mx@2.0.0` |
| Exit code | **0** (`added 1 package in 486ms`) |
| Query string | **none.** `--no-audit --no-fund` keeps the acquisition to A11's one host, whose query-key allowance is `none`, so a query string is refused before the URL is requested. |
| Unpacked size, re-measured from `node_modules` after the install | **879,564 bytes** for the whole installed package |
| `index.aff`, re-measured | **158,014 bytes** |
| `index.dic`, re-measured | **714,044 bytes** |
| Per-file SHA-256 | `index.aff` `4dc9ddafc140e0fc27a40fe808ff3d77138e12bf3db5748832f03d780aadecfa`<br>`index.dic` `bfb17f2e285505fbe7a2d8c1785906e7ed2cd7f6fd6182afb9d8ac0e7e16d202` |
| Owner-facing shipped size (S1.5 §3.5 item 6) | **~0.9 MB** of additional shipped data: 158,014 + 714,044 bytes of Hunspell files, emitted by the build as `index-DlpzEtDK.aff` (158.01 kB) and `index-HxP415V3.dic` (714.04 kB) alongside the English pair's 3.08 kB and 551.76 kB. Recorded in this card's return-file summary; see *Deviations* for why it is not also in `docs/decisions.md`'s size row. |
| Digest | The lockfile's `integrity` string — `docs/v2/ACQUISITION.md:4-7` accepts the package manager's integrity string |

## Integrity, compared

| | Value |
| --- | --- |
| Lockfile `integrity` | `sha512-EkRPJAgPhY55oMiHqwEBavOpokkvXlOO5jOdwZJmV/B6w9pGpJxlm7YorgHjiB2HqyPGW0FRcOoJRBTspTXUEA==` |
| S1.5 §2.2 expected | `sha512-EkRPJAgPhY55oMiHqwEBavOpokkvXlOO5jOdwZJmV/B6w9pGpJxlm7YorgHjiB2HqyPGW0FRcOoJRBTspTXUEA==` |
| Result | **equal, byte for byte** |

| | Value |
| --- | --- |
| S1.5 §2.2 shasum | `30fb094031481fff76cf0fd40bcfd9163149bc00` |
| Verified? | **`[unknown]`** — this is the npm shasum of the **tarball**, and the tarball does not exist on disk after the install. Verifying it would need a second fetch, which HS-3 forbids and A11 does not authorise. Next step that would close it: a single re-fetch of the same pinned URL under an amended A11 row, hashing the tarball. The integrity string above is what the acquisition policy accepts, and it matches. |

## Licence evidence

| Field | Value |
| --- | --- |
| Installed package's declared `license` | `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)` — read from `node_modules/dictionary-es-mx/package.json`, the installed tree, after the install |
| Lockfile's `license` | `(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)` — identical |
| The two URLs S1.5 §3.1 read the data licence from | recorded in `docs/research/es-mx-spellcheck.md`; not re-fetched by this card (HS-3: no second acquisition) |
| Does the installed tree contain a licence file? | **Yes** — `node_modules/dictionary-es-mx/license` (lowercase, no extension). `scripts/collect-licenses.mjs`'s `LICENSE_FILENAMES` list does not include that spelling, so `copyrightOf()` found no `Copyright` line in it and fell back to the package's `author` field; the generated row therefore reads `Author: Titus Wormer <…>`, and the `Author:` prefix is the collector's own marker for that fallback. |
| Election | **MPL-1.1**, elected by the owner and recorded in `docs/decisions.md` (the 2026-10-04 row, quoted in `V0-preflight.md`) and in the generated block of `THIRD-PARTY-LICENSES.md`. Data only, shipped unmodified in its own files: `index.aff` and `index.dic` are never renamed, re-encoded, concatenated, merged or patched, and the shipped files are byte-identical to the installed ones. |

## Fields that remain `[unknown]` after the install, with their next step

| Field | State | Next step |
| --- | --- | --- |
| Exhibit A: *Portions created by … are Copyright (C) … All Rights Reserved* | `[unknown]` — no `es_MX`-specific copyright line exists upstream | **U2**: a separately authorised read of an upstream `es_MX` release archive header, or an upstream maintainer statement |
| Exhibit A: *Contributor(s)* | `[unknown]` — whether the normalised build is a Modification is `[interpretation]` | **U3**: the owner's call, on advice; if it is a Modification, the sourced names are Titus Wormer and Thomas Beverley (Source D), not the project owner |
| The tarball shasum | `[unknown]` as above | a single re-fetch of the pinned URL under an amended A11 row |

None of these is recorded as a plausible value anywhere: the shipped
`THIRD-PARTY-LICENSES.md` carries no notice section, no `{{OWNER: …}}`
placeholder and no blank field, and V4 is `BLOCKED` until U2 and U3 are sourced.

## Repeatability

The install is the one non-repeatable acquisition in this card and is recorded
in `docs/v2/state/cards/S6.1.json` under `sideEffectsDone` with its exit code.
A resumed session re-runs neither this install nor the `npm run licenses`
rewrite.

---

## Superseded 2026-10-06 — AM-220; the three rows above are closed

Appended, not edited: every row above stands as the blocked pass wrote it, and
this section records what happened to them rather than rewriting them.

| Row above | State since 2026-10-06 | Evidence |
| --- | --- | --- |
| *Portions created by …* (U2, line 52) | **closed** | `docs/v2/state/S6.1-NOTICE-PROVENANCE.md` §7.3: the `es_MX` affix file's own header at rla-es v2.8 — `Copyright 2004-2020, Santiago Bosio y otros.` — plus a census of all 70 inputs the build reads. The claim that "no `es_MX`-specific copyright line exists upstream" was **wrong**, and the reason is now on record there (§3.2, §4). Adopted by AM-220 and written into the shipped file at `THIRD-PARTY-LICENSES.md` lines 851–852. |
| *Contributor(s)* (U3, line 53) | **facts closed, decision taken** | §7.4 measures the normalisation exactly: two deletions of a single trailing space, nothing else, in commit `122fb1a8d238ff5734e36911c61b8e206055b21b` (Titus Wormer, 2023-11-03). AM-220 treats that conservatively as a Modification and adopts the package's own `contributors`; written at line 854 as `Titus Wormer, Thomas Beverley`. |
| The tarball shasum (line 54) | **closed** | SHA-1 of `dictionary-es-mx-2.0.0.tgz` fetched by the separately authorised research pass (provenance §7.1 row 9) is `30fb094031481fff76cf0fd40bcfd9163149bc00`, equal to S1.5 §2.2's string; SHA-256 of the same bytes is `89f26b9821ab0ebbca319c52ca875a87d8e2abbb56cae0f06c0940d51b5e54cd`. It was a read of the same pinned URL for research, **not a re-run of the A11 install** — the install above was not repeated. Whether that satisfies this row's suggested "single re-fetch under an amended A11 row" is the coordinator's call to record; the value itself is no longer unknown. |

The licence-file row (line 45) was already correct about the installed tree and
is not changed: provenance §7.2 additionally established that the **published
tarball** carries `license` too, byte-identical to the installed file, which was
the separate `[unknown]` §4.3 of the provenance file had held open.

The closing paragraph above — "the shipped `THIRD-PARTY-LICENSES.md` carries no
notice section … and V4 is `BLOCKED` until U2 and U3 are sourced" — described
this file's state before AM-220 and **no longer describes it**: the notice
section exists, it carries no `{{OWNER: …}}` placeholder and no blank field, and
the complete elected licence text is bundled beside it. V4's verdict is the
coordinator's to record by running V4; nothing here claims it.

## Naming precision after independent notice review — 2026-10-06

The older “never renamed” wording describes neither the actual build names
nor the corrected source-availability statement. The installed package keeps
`index.aff` and `index.dic`; Vite emits separate content-hashed `.aff`/`.dic`
assets with identical bytes. The shipped notice now identifies both macOS and
Linux AppImage asset paths and both SHA-256 digests. Normalization provenance
and the original acquisition ledger remain unchanged.

AM-224 authorizes one separate network-free licence-generation invocation
during resumed V4. The original acquisition is still non-repeatable, and
the historical stale-block failure is not recreated or overwritten.
