# Coordinator scratch-location correction and failure preservation

Author's 11 temporary files appeared under untracked scratchbuild/ rather than
ignored build/. Root moved them to build/p34-review-probe-lint-preserved and
asserted every relative path/hash unchanged; empty scratchbuild removed. The
historical report paths remain as recorded; this addendum supplies their current
location. No artifact/output/assertion/fixture change occurred in the relocation.

Final P3.4 V4 ran once before this cleanup and stays FAIL. P3.4 V2 also failed
pointer window/PID read-back, b/c NOT RUN; no further attempt or row repetition
is authorized. This evidence-only repair is for future checks, not approval of
that row. Fresh independent cleanup review is running; runtime build lease was
verified released by the completed worker. P3.5 is independently ready after
cleanup review, own current preflight/build/plugin gate and finalattempt3 rows.
