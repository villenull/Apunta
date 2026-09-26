# S2.5, attempt 2 — English parity for the 23 keys findings 1–6 needed

Derived, not asserted: for every key this attempt added, the English `text` was
turned into a regular expression (`{name}` → `.+`) and searched against the
**base commit's** `server/src` and `shared/src`, read with `git show fdec649:`
so the comparison is against the code that shipped before this card.

- 22 of 23 are present **verbatim** at the base.
- The one that is not a literal is `chat.request.shorteningNote`, and the
  substitution is exact: at the base the subject was a variable
  (`section === null ? 'the note' : \`the ${section} section\``) interpolated
  into `` `Apunta could not shorten ${subject}: the revision came back no shorter.` ``,
  so the whole-note form is a *rendered* line rather than a written one. Its
  sibling `chat.request.shorteningSection` **is** present verbatim, which is
  what pins the shared half. This is the same shape as
  `errors.conflict.format_in_use`, which attempt 1 disclosed the same way.
- `chat.retractionNotice.list` (`{first}; and {last}`) is assembled from
  `${items.slice(0, -1).join('; ')}; and ${items[items.length - 1]}` rather
  than written out; the two-item case is pinned by
  `server/src/ai/retractions.test.ts`'s existing two-item assertion, and the
  Spanish one by the case this attempt added.

`{date}` in `errors.bad_request.halaxy_empty_session` is `kind: 'text'`, not
`dateOnly`, on purpose: the wire carries `2026-08-08` today, so formatting it
through `Intl` would change the English. The same is true of
`import.halaxyNoteLabel`, which S2.2 already wrote that way.

## No key ships its English as Spanish (fixed decision 7)

```
$ node -e "…compare en[key].text with esMX[key].text for all 23…"
23/23 keys have an es-MX value that is not the English bytes; 0 identical.
```

No placeholder set differs between the two catalogues, which V1's
`t.test.ts:114` also checks by reading both objects rather than a list — and
which is a `tsc` error's *absence*, not its presence, that V2 witnesses.

## The rows this supports

| Row | Time (UTC) | Exit | Collected |
| --- | --- | --- | --- |
| V1 | 20:03:51 → 20:03:53 | 0 | 9 files / 142 tests, none skipped |
| V2 | 20:04:02 → 20:04:14 | 0 / 0 | `TOTAL 0`, five workspaces clean |
| V3 | 20:04:16 → 20:04:21 | 0 | 92 files / 1340 tests, none skipped |
| V4 | 20:04:24 → 20:04:25 | 0 (perturbed run 1) | `errors.language_unavailable in es-MX` |

Node `v24.19.0` in all four; working directory the repository root; full details
in `v1.md` … `v4.md`.
