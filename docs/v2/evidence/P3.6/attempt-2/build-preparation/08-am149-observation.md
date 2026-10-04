AM-149 -- what was actually observed, and what was not
======================================================================

AM-149 records a live unknown: whether `tauri build` CLEANS
`src-tauri/target/release/bundle/appimage/` or ADDS to it. The card says so
plainly, does not claim to know which is true, and orders V0 -> V3 -> V1 -> V4 so
that it does not have to know. Attempt 1's interruption happened to produce direct
evidence about part of the question. This file records that evidence, states
exactly how far it reaches, and does not generalise past it.

--- The observation, in full -----------------------------------------------

Measured state of src-tauri/target/release/bundle/appimage/ immediately BEFORE
attempt 1's V0 started:

  Apunta (test)_0.0.0_amd64.AppImage    194202104 bytes, mtime 2026-10-03 16:39:34
  Apunta (test).AppDir                  (directory),      mtime 2026-10-03 16:39:28

Both were P3.4's leftovers, not this card's.

Attempt 1's `tauri build` printed, in order:

    Built application at: .../src-tauri/target/release/apunta
    Info Patching .../apunta with bundle type information: appimage
    Bundling Apunta (test)_0.0.0_amd64.AppImage (...)

and was then killed mid-bundle.

Measured state of the same directory immediately AFTER the kill:

  Apunta (test).AppDir    mtime 2026-10-03 22:09:29
                          contents: AppRun, apprun-hooks   (two entries; partial)

  Apunta (test)_0.0.0_amd64.AppImage    ABSENT

What that establishes, strictly:

  1. The pre-existing AppImage, whose mtime was 16:39:34, was GONE. It was not
     renamed, not moved and not superseded under another name -- the directory
     listing had no `.AppImage` of any name in it.
  2. `Apunta (test).AppDir` was RECREATED with a new mtime (22:09:29, five and a
     half hours after the old one's 16:39:28) and held only a partially assembled
     tree.
  3. Therefore the bundler had already emptied and begun repopulating
     `bundle/appimage/` at the moment it was interrupted. It did not add a
     second AppImage beside the first and leave the first in place.

So the "wipes" branch of AM-149 is the one supported by what was seen, for the
test identity, in this repository, on this machine.

--- What this does NOT establish, stated rather than glossed ----------------

  * **The removal was observed across an interruption, not across a completed
    build.** What was directly witnessed is "the old AppImage was absent after the
    bundling step had started and been killed". That is very strong evidence of a
    clean-then-write sequence, and it is not the same observation as a finished
    `tauri build` completing and choosing to wipe. The distinction is recorded
    because the card asks for observed facts, not inferred ones.

  * **Both builds run so far were TEST-identity builds.** Attempt 1 and attempt 2
    both ran `npm run tauri:build:test`. The question AM-149 actually matters for
    is the CROSS-identity one: does V1's production build
    (`npm run tauri:build`, product `Apunta_<version>_amd64.AppImage`) delete the
    test image, and does a test build delete a production image? That case remains
    **unobserved**. No production-identity build has run in this repository, and
    none was authorised in this phase.

  * **The bundler's version and flags were not varied.** One bundler, one
    configuration, one machine. Nothing here predicts behaviour under a different
    tauri-bundler version.

  * **The AppDir is a bundler work directory, not a shipping artefact.** Its
    recreation tells us about the bundler's workflow; it is not itself evidence
    about the AppImage's contents. V4 is what will read inside the production
    image, and V4 did not run.

--- Why this does not change the card's ordering ------------------------------

The card's position was that the order V0 -> V3 -> V1 -> V4 is correct under
EITHER answer, and that the card asserts the order and the guards rather than the
bundler's behaviour. The observation above removes the uncertainty in the
direction that makes the ordering argument STRONGER, not weaker:

  if the bundler WIPES  -> the wipe happens at V1, which is after V3 has already
                           launched and finished the test image. V3 keeps its
                           artefact. (This is now the branch with evidence behind
                           it.)
  if the bundler ADDS   -> V3's identity-scoped guard keeps the two apart, since
                           'Apunta (test)_'*.AppImage and Apunta_*.AppImage are
                           disjoint patterns.

So no row, no Expected cell, no May-edit grant and no threshold changes on the
strength of this observation, and nothing here is grounds to reorder anything.
Root owns AM-149's disposition; this file is the evidence, not the ruling.

--- What a later attempt can add, cheaply -------------------------------------

When V1 eventually runs the production build and writes
`Apunta_0.0.0_amd64.AppImage` into the same directory, the cross-identity case is
answered by the same kind of before/after listing that was taken here: record
whether the test image is still present afterwards, with hashes for both. That is
a read of the bundle directory, not an edit of it, and it needs no permission this
card does not already have.