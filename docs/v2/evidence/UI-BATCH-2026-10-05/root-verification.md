# Root verification — UI batch 2026-10-05

Baseline candidate (A+B, before bounded repair): Node24.19.0.
`npm test`: exit0, 171 files/2445 tests passed. `npm run typecheck`,
`npm run lint`, `npm run build`: all exit0. Ignored raw logs under
`build/ui-batch-2026-10-05/`; no live data or production port used.
Scoped `playwright test tests/workspace.spec.ts tests/capture.spec.ts
tests/save-integrity.spec.ts --project=chromium --project=es-MX`,
sandbox base7860, system Chromium: exit0, 33passed/1skipped (35.6s).
This scoped UI run does not replace the blocked P5.3 full V8 failure.

Root real-Chromium candidate sandbox7823, 1280x800: sidebar node identity
preserved across View all and patient selection, exactly1 patients fetch;
notes patient heading absent; footer695..800 fixed; blank-area deselect works;
capture background inert, blur6px, summary focused; unfinished close → Stay
retains typed text, Discard closes. Then saved existing draft → created new
draft persisted/URL changed but no note editor visible: browser script exit1.
Independent review F1 confirmed; evidence is a failure, not acceptance.

Separate clean capture → Escape focus probe exit0 as observational command:
computed max-width460px, activeElement BODY after close/background inertfalse.
These observations confirm F2 and focus residual for bounded repair.
Postrepair checks and final acceptance pending; owner7821 remains old build.

## Postrepair verification
Node24.19.0 root rerun: npm test exit0,171files2450tests; typecheck/lint/build exit0.
Clean New note → Escape actual Chromium: width560px, focus BUTTON notes-new-note,
background inertfalse. Browser script exit0: sidebarSame across directory and
patient selection,1patients fetch; notes footer695..800; capture560px/inerttrue/
blur6px/summary focused; clean Escape restores opener; dirty close Stay preserves
text, Discard closes; prior save → capture Create draft persisted and selected
without sidebar remount/list refetch or page errors. Real30note list client651/
scroll2325, footer stays695..800 after scroll. Direct capture URL Escape returns
same patient. Candidate only7823, fabricated test data, owner7821 untouched.

The first long-list assertion sampled initial entrance-transform animation after
full page.reload, causing bbox697.10→696.60. Diagnostic recorded workspace top1.60,
inner scroller651/2325, footer105; waiting for actual route getAnimations().finished
before comparing gives exact695..800. No application edit or relaxed threshold.
Rerun scratch cleanup initially selected a deleted synthetic scroll note, then
a blank click atx1 hit the existing sidebar resizer. Corrected fixture selection
and real blank padding targetx30,y2; no forced click/check weakening. Those
harness-only failures are preserved in this description; no product claim from them.

Postrepair scoped workspace/capture/save-integrity Chromium+es-MX e2e rerun exit0,33passed/1skipped (35.1s). Same isolated base7860 fakeAI sandbox; log e2e-repair.log.

## Owner preview promotion
Final independent CLEAR impl2 accepted. Copied built frontend assets first,
index.html last to existing owner-preview/web; retained7821server and data.
Existing sandbox had19patients/114notes (one owner-created test patient empty).
Added1explicitlyfabricated note to that test patient; no reseed/overwrite.
Owner-check.mjs exit0:19patients/115notes/min1each/fakeAItrue/modal560px/
focusRestoredtrue/pageerrors[]. Independent reviewer archived confirmed;
candidate7823 terminal closed, owner7821 remains running.
