# P3.5 attempt 1 — review-1 evidence

Independent implementation-and-evidence review of candidate `46419f5` against
base `8783181`. Verdict and findings: `docs/v2/state/reviews/P3.5-impl1.md`.

Nothing here was produced by running the app, server, database, build, real
model, audio, microphone, display or network. The only executable work was
offline permission unit tests and pure fabricated Node scripts.

| File | What |
| --- | --- |
| `source-outputs-mapping.md` | D1: the `pactl list short source-outputs` column mapping is wrong; the real-mic leak check is vacuous. Host `pactl` disassembly plus a synthetic extraction test. |
| `stale-rectangle.md` | D2: `readReported` keeps rectangles from older markers. Synthetic proof. |
| `environment-gstreamer.md` | ENV1: `appsink` is a bundle-path problem; `E6` is necessary but not sufficient. |
| `commands.md` | Exact commands, working directories and exit codes. |
| `source-outputs-mapping.mjs` | The synthetic script (extracts the shipped predicate and evaluates it). |
| `stale-rectangle.mjs` | The synthetic script for the stale-rectangle union. |

The two `.mjs` files are byte-identical copies of the scratch scripts under the
git-ignored `build/p3.5-review1/`.
