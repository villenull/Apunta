# Milestones and parent reviews (v2 plan)

Each parent milestone groups child cards. Its review card (`<parent>.R`)
runs after every child is `APPROVED`, in a **separate** sub-session, with the
role IMPLEMENTATION REVIEWER. `tools/build-dispatch.mjs <parent>.R` assembles
its dispatch from this table and the children's verification rows.

A parent review re-runs every child's verification rows on the parent's
final commit, then the level below, and reports `PASS`, `FAIL` or `NOT RUN`
per row. It never fixes code.

| Review | Parent | Title | Level | Extra checks |
| --- | --- | --- | --- | --- |
| P0.R | P0 | Toolchain, zones, sandbox, baseline | L2 | `npm run sandbox:selftest`; BASELINE.md complete |
| P1.R | P1 | Bug round | L2 | the P1.3 real-socket tests; the P1.1 no-reload e2e |
| P2.R | P2 | Brand | L2 | the P2.2 rendered-colour e2e |
| S1.R | S1 | Spanish research | L0 | every S1 output exists; the summary gives S2 a tú/usted choice, S4 the Piper position, S5 the section names and provisional markers, S6 a FITS or DOES NOT FIT verdict |
| S2.R | S2 | Language foundation and UI | L2 | both e2e projects; `node scripts/check-ui-strings.mjs` |
| P3.R | P3 | Linux desktop shell | L2+L3 | P3.3 V3-V5, P3.4 V2, P3.5 V2-V3, P3.6 V3 on the parent commit |
| S3.R | S3 | Spanish instrument | L2+L3 | S3.2 V2-V3 (controls, blinded scorer); S3.2 V4 pipeline baseline present |
| S4a.R | S4a | Spanish speech selection | L3 | recompute the selection from the benchmark table |
| P4.R | P4 | Setup and Spanish acquisition | L2+L3 | P4.4 V2-V4; S4b.1 V1-V5 |
| P5.R | P5 | Updates and migration | L2+L3 | every `test-update-e2e.sh` case |
| P6.R | P6 | Mac and Windows configuration | L2 | `node scripts/v2/check-release-config.mjs`; `node --test scripts/v2/check-manifest.test.mjs` |
| S5.R | S5 | Spanish AI and spell check | L2+L3 | S5.6 V1-V3 results as recorded (the review does not re-run held-out: at most two held-out runs are allowed in total); S6.1 V1-V3 |
