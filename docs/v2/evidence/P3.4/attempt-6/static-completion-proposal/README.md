# P3.4 attempt 6 — static-completion proposal: evidence

Read-only preparation for the bounded owner exception described in
`docs/v2/state/P3.4-STATIC-COMPLETION-PROPOSAL.md`, with the runtime audit in
`docs/v2/state/reviews/P3.4-attempt6-runtime-audit.md`.

**This evidence executes nothing from the card.** No V3 shipping guard and no V4
row was run. The only executions are on synthetic fixtures (`printf` bodies) that
reproduce the attempt-6 wrapper symptom without touching `src-tauri/`, the app,
the build, the database or the network. Nothing is staged or committed; scratch
is the ignored `build/p34-static-completion/`.

## Files

| File | What it proves |
| --- | --- |
| `01-decode-and-negative-control.txt` | The exact decode (card codec + code-span strip) and its negative control: `bash -n` exits 0 on a body still wrapped in backticks, so a structural guard is required; the guard fires on the wrapper; the wrapper reproduces the outer-127 symptom on a harmless synthetic body. |
| `02-decoded-v3-command.txt` | The correctly decoded V3 cell, recorded and NOT executed, with its hashes and the byte-identity to the implementer's own corrected cell. |
| `03-decoded-v4-command.txt` | The correctly decoded V4 cell (the whole `&&` chain), recorded and NOT executed; the proposal re-runs this verbatim, never a partial `npm run lint`. |
| `04-verification.txt` | Node versions, syntax exits, source hash, scratch ignore, writes, and the other worker's in-flight paths read but untouched. |

## The one-line result

The attempt-6 V3 error is fully explained and mechanically preventable: the
card's cell is a GFM code span; `parseCells` unescapes the table but leaves the
backticks; stripping them yields a body byte-identical to the corrected cell the
runtime worker already recorded (`94dd6995…`), `bash -n` clean. `bash -n` alone
is insufficient — it passes the bad wrapper — so the decode must also assert
that no outer backtick survives. The proposal asks the owner for exactly two
authorised executions inside attempt 6 (V3 once, V4 once after the P3.5 artifact
lint is independently CLEAR) and nothing else.

## Reproduce

```
node build/p34-static-completion/decode-proof.mjs
```
