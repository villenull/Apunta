## V2

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7853 > /tmp/apunta-v2-p5.3-V2.env && . /tmp/apunta-v2-p5.3-V2.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V2" )`
- sandbox port: 7853 (its es-MX port 7854 was free)
- started: 2026-10-04T23:41:25Z
- finished: 2026-10-04T23:41:34Z
- exit code: 0

```
  
  Running 1 test using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:181:3 › C-UPD@1 quiescence › V2: refuses while a refine is streaming, the stream still finishes, and service resumes (3.9s)
  
    1 passed (8.6s)
```

## V3

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7855 > /tmp/apunta-v2-p5.3-V3.env && . /tmp/apunta-v2-p5.3-V3.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V3" )`
- sandbox port: 7855 (its es-MX port 7856 was free)
- started: 2026-10-04T23:41:34Z
- finished: 2026-10-04T23:41:40Z
- exit code: 0

```
  
  Running 1 test using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:213:3 › C-UPD@1 quiescence › V3: refuses a conflict, and keeps the text on both sides of it (1.3s)
  
    1 passed (5.9s)
```


## V4

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7857 > /tmp/apunta-v2-p5.3-V4.env && . /tmp/apunta-v2-p5.3-V4.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V4" )`
- sandbox port: 7857 (its es-MX port 7858 was free)
- started: 2026-10-04T23:41:40Z
- finished: 2026-10-04T23:41:46Z
- exit code: 0

```
  
  Running 1 test using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:265:3 › C-UPD@1 quiescence › V4: an idle app quiesces, refuses new work while it holds, and releases when the window closes (685ms)
  
    1 passed (5.3s)
```


## V6 — first reading (exit 1)

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7875 > /tmp/apunta-v2-p5.3-V6.env && . /tmp/apunta-v2-p5.3-V6.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V6" )`
- sandbox port: 7875 (its es-MX port 7876 was free)
- started: 2026-10-04T23:41:57Z
- finished: 2026-10-04T23:42:02Z
- exit code: 1

```
        348 |
          at /home/villenull/Projects/Apunta/e2e/tests/quiescence.spec.ts:345:16
  
      Error Context: test-results/quiescence-C-UPD-1-quiesce-e37f1-editor-still-holds-the-text-chromium/error-context.md
  
    1 failed
      [chromium] › tests/quiescence.spec.ts:308:3 › C-UPD@1 quiescence › V6a: a close attempt with unsaved text asks first, and the editor still holds the text 
    1 did not run
```


## V6 — second reading (exit 0)

- why the first reading failed: the row's control navigated away *after* the held save landed, and the app replaces its editor when the note it just saved arrives, so the guard refused that navigation too (`net::ERR_ABORTED`). The control was moved ahead of the dirty edit instead — a clean screen leaves without asking, a dirty one does not — which is the falsifiable pair the row wanted and is not timing-dependent. The product code did not change between the two readings.

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7875 > /tmp/apunta-v2-p5.3-V6.env && . /tmp/apunta-v2-p5.3-V6.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V6" )`
- sandbox port: 7875 (its es-MX port 7876 was free)
- started: 2026-10-04T23:43:03Z
- finished: 2026-10-04T23:43:11Z
- exit code: 0
- why the first reading failed: the row carried a control that navigated away *after* the held save landed, and the editor refuses that navigation on its own (the app replaces the textarea on the note it just saved). The control was moved ahead of the dirty edit — a clean screen leaving without asking — which is the falsifiable pair the row wanted, and it is not timing-dependent.

```
  
  Running 2 tests using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:308:3 › C-UPD@1 quiescence › V6a: a close attempt with unsaved text asks first, and the editor still holds the text (828ms)
    ✓  2 [chromium] › tests/quiescence.spec.ts:480:3 › the recording half of the close policy › V6b: a close attempt with a recording running is not silent (1.8s)
  
    2 passed (7.4s)
```


## V7 — reading 1 (exit 0)

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7868 > /tmp/apunta-v2-p5.3-V7.env && . /tmp/apunta-v2-p5.3-V7.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V7" )`
- sandbox port: 7868 (its es-MX port 7869 was free)
- started: 2026-10-04T23:42:02Z
- finished: 2026-10-04T23:42:08Z
- exit code: 0

```
  
  Running 1 test using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:349:3 › C-UPD@1 quiescence › V7: a close attempt while a save is outstanding is deferred, and the editor keeps its text (597ms)
  
    1 passed (5.2s)
```


## V7 — reading 2 (exit 0)

- the row was run twice; both readings agree, and no retry or timeout was added to reach that.

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7868 > /tmp/apunta-v2-p5.3-V7.env && . /tmp/apunta-v2-p5.3-V7.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V7" )`
- sandbox port: 7868 (its es-MX port 7869 was free)
- started: 2026-10-04T23:43:15Z
- finished: 2026-10-04T23:43:20Z
- exit code: 0

```
  
  Running 1 test using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:347:3 › C-UPD@1 quiescence › V7: a close attempt while a save is outstanding is deferred, and the editor keeps its text (599ms)
  
    1 passed (5.2s)
```


## V9 — reading 1 (exit 0)

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7871 > /tmp/apunta-v2-p5.3-V9.env && . /tmp/apunta-v2-p5.3-V9.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V9" )`
- sandbox port: 7871 (its es-MX port 7872 was free)
- started: 2026-10-04T23:42:08Z
- finished: 2026-10-04T23:42:15Z
- exit code: 0

```
  
  Running 1 test using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:387:3 › C-UPD@1 quiescence › V9: a dirty disconnect before a quiesce is never settled over, and only the same tab clears it (2.1s)
  
    1 passed (6.7s)
```


## V9 — reading 2 (exit 0)

- the row was run twice; both readings agree. The first attempt at this row used a different disconnect mechanism and is described under Deviations in the return file.

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7871 > /tmp/apunta-v2-p5.3-V9.env && . /tmp/apunta-v2-p5.3-V9.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V9" )`
- sandbox port: 7871 (its es-MX port 7872 was free)
- started: 2026-10-04T23:43:20Z
- finished: 2026-10-04T23:43:27Z
- exit code: 0

```
  
  Running 1 test using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:385:3 › C-UPD@1 quiescence › V9: a dirty disconnect before a quiesce is never settled over, and only the same tab clears it (2.1s)
  
    1 passed (6.7s)
```


## V4 — final reading (exit 0)

- re-run after the last code tidy (the maintenance controller lost one unused accessor); the row agreed with its first reading.

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7857 > /tmp/apunta-v2-p5.3-V4.env && . /tmp/apunta-v2-p5.3-V4.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V4" )`
- sandbox port: 7857 (its es-MX port 7858 was free)
- started: 2026-10-04T23:47:10Z
- finished: 2026-10-04T23:47:16Z
- exit code: 0

```
  
  Running 1 test using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:265:3 › C-UPD@1 quiescence › V4: an idle app quiesces, refuses new work while it holds, and releases when the window closes (683ms)
  
    1 passed (5.3s)
```


## V2 — final reading (exit 0)

- re-run after the last code tidy, on its own port again; the row agreed with its first reading.

- cwd: repository root
- command: `node scripts/v2/sandbox.mjs env --port 7853 > /tmp/apunta-v2-p5.3-V2.env && . /tmp/apunta-v2-p5.3-V2.env && ( cd e2e && PLAYWRIGHT_CHROMIUM_EXECUTABLE=/usr/bin/chromium npx playwright test --project=chromium quiescence.spec.ts --grep "V2" )`
- sandbox port: 7853 (its es-MX port 7854 was free)
- started: 2026-10-04T23:47:16Z
- finished: 2026-10-04T23:47:25Z
- exit code: 0

```
  
  Running 1 test using 1 worker
  
    ✓  1 [chromium] › tests/quiescence.spec.ts:181:3 › C-UPD@1 quiescence › V2: refuses while a refine is streaming, the stream still finishes, and service resumes (3.9s)
  
    1 passed (8.5s)
```

