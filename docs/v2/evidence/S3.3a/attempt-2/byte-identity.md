# Byte identity of the rules that execute — S3.3a attempt 2

- Command: `node build/s3.3a-attempt2/byte-identity.mjs`
- Working directory: repository root
- Exit: 0
- The script compares the raw bytes of each named rule declaration, and every
  printed summary line, in the working tree against `git show 9d92d7b:`.

```
identical  scripts/check-refine.mjs  function sectionsOf  (464 bytes)
identical  scripts/check-refine.mjs  function wordCount  (129 bytes)
identical  scripts/check-refine.mjs  function stillHas  (274 bytes)
identical  scripts/check-refine.mjs  function losses  (108 bytes)
identical  scripts/check-refine.mjs  function claimProblems  (1264 bytes)
identical  scripts/check-refine.mjs  function readChat  (633 bytes)
identical  scripts/check-refine.mjs  const CLAIM_VERBS  (369 bytes)
identical  scripts/check-refine.mjs  const SERVER_OPENINGS  (309 bytes)
identical  scripts/check-refine.mjs  const HELD_BACK  (121 bytes)
identical  scripts/check-refine.mjs  every printed summary line
identical  scripts/check-note-format.mjs  function splitSections  (432 bytes)
identical  scripts/check-note-format.mjs  function exampleSentences  (471 bytes)
identical  scripts/check-note-format.mjs  function flagsFor  (1323 bytes)
identical  scripts/check-note-format.mjs  function noteFromStream  (427 bytes)
identical  scripts/check-note-format.mjs  every printed summary line

all identical against 9d92d7b.
```
