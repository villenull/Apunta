# P3.4 static-completion final IR — evidence

Fresh independent frozen-evidence audit of the AM-199 static completions and
the attempt-6 record. Read/hash/parse/git-compare only. No row executed.

- `01-independent-decode-and-hash.txt` — independent decode of the card's V3
  and V4 cells via `parseCard` + one outer-backtick strip, with byte counts and
  sha256, matched against the executed files and the proposal/IR evidence.
- `02-identity-snapshots-and-frozen-rows.txt` — commit map, checkpoint
  append-only check, V4 whole-chain check, V2 frozen 20/20, V0 conditional
  derivation.

Verdict and boundary: `docs/v2/state/reviews/P3.4-static-completion-final-ir.md`.
