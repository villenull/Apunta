# P3.6 attempt 7 runtime evidence — AM-214, independent reviewer

Consolidated run record for the six rows. Per-row detail, full excerpts and the
V3 diagnosis live in `V0-review-impl7.md` … `V5-review-impl7.md` beside this
file. Raw stdout+stderr stay in the sandbox side folder and are **not** committed;
each is referenced by sha256 and byte count.

| Field | Value |
| --- | --- |
| Role | independent IMPLEMENTATION REVIEWER, AM-214 — run everything, modify nothing that is not evidence |
| Working directory for every row | the repository root |
| HEAD for every row | `f93e27d3cd9931dbc3e5b4726a1ac635d7c660e9` |
| Tree | clean before V2, V0, V3, V1 and V4; `docs/v2/CONTRACTS.md` and `docs/v2/cards/P5.4.md` went dirty at **19:24 UTC**, after all six rows, written by another worker — left alone |
| Harness sha256 | `4b6b00406eb1f7d5d9597c5441579e03c0efe4dbc668c7a399d5cd4f10a6c42f` (3972 lines) — matches the dispatch's stated value, unmodified |
| Sandbox port | 7879 (never 7717); preview 7831 left alone |
| Node | `v24.19.0` first on `PATH` for every row that asks; cargo `1.99.0` |
| A06 candidate | `~/.cache/apunta-v2/whisper-src/whisper.cpp/build-vulkan/bin/whisper-cli`, executable, 1064648 B, mtime 2026-10-02 13:00:05 -0600 — read, never written |
| Retries | **none.** Each row ran exactly once; no rebuild, relaunch, SIGKILL of anything I did not spawn, no assertion weakened |

## Order actually used

`V2 → V5 → V0 → V3 → V1 → V4`. S3's mandatory order is **V0 → V3 → V1 → V4**,
which is preserved exactly; V2 and V5 are the two rows the card says may run at
any point, and they were run first because they start nothing.

## Row log

All times UTC. `cmd` sha256 is the decoded command as executed; `log` sha256 is
the raw stdout+stderr file.

| Row | Start | End | Elapsed | Exit | Status | cmd sha256 | log sha256 | log bytes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| V2 | 2026-10-06T19:09:31Z | 2026-10-06T19:09:31Z | 0 s | 0 | **PASS** | `2b902435d1569a1bcec2c1e9dd23cb2094d700a996890e3973301637f30715db` | `b7677d3ec37ee1897ba07dc2cfe8292fe421c9ac93396cca5bbece486d1a2a41` | 9 |
| V5 | 2026-10-06T19:09:41Z | 2026-10-06T19:09:41Z | 0 s | 0 | **PASS** | `5361aac349c06611fffa7195af0b05e8a9fc2c1d7420b0524dbed3c0c9e097cb` | `b7677d3ec37ee1897ba07dc2cfe8292fe421c9ac93396cca5bbece486d1a2a41` | 9 |
| **V0** | 2026-10-06T19:09:52Z | 2026-10-06T19:12:18Z | 146 s | 0 | **PASS** | `cdb77a6b26ea2ded0923fd17f85ba1a1ebae75c6ed956d29a19f46a6f54184aa` | `9758d421b765119e2e54b2129bcb22a106371e01e44ea5ea0e38850669a3044b` | 1793 |
| **V3** | 2026-10-06T19:14:00Z | 2026-10-06T19:14:36Z | 36 s | **4** | **FAIL** | `c117b9f3991273149ab7d5f6fffe6a6849d996b5055be89da9fd4b03fdbaa520` | `e14425d7bbc609146612c289d572c1853d6ce900f0763bb0029c2c4f10bc6c55` | 11245 |
| **V1** | 2026-10-06T19:17:20Z | 2026-10-06T19:19:42Z | 142 s | 0 | **PASS** | `afd5a9e2244441f490a36972ecb58fc90c8b2f913371db6751aa150d5a7e547e` | `a9efbcb12eda3bf92658269b5e46a151952637ae0b5dda7a979ace257a5676db` | 1688 |
| V4 | 2026-10-06T19:19:48Z | 2026-10-06T19:19:49Z | 1 s | 0 | **PASS** | `c7c68855beea1e08e52e43c665a238272bfdca1ee3221a11a76f66960dfa201b` | `3193a9f87c1d0257bae1752904189ea11c19b9620d82d0a2e39b3da470b5bf3a` | 51 |

Sandbox run folders created (one per `sandbox.mjs env` call), all under
`/tmp/apunta-v2/<runid>`, i.e. `<sandbox>`, none inside the repository:
`19:09:52Z` (V0), `19:14:00Z` (V3), `19:17:20Z` (V1), `19:19:48Z` (V4).

## Artefacts

| Artefact | sha256 | size | mtime |
| --- | --- | --- | --- |
| `Apunta (test)_0.0.0_amd64.AppImage` (V0) | `aebc698eac3aeccbc238df95f431d2ea56e88bdd13a2b897570d04012c64fb24` | 194439672 | 2026-10-06 13:12:18 -0600 |
| `Apunta_0.0.0_amd64.AppImage` (V1) | `39cc92a38e96eecad720783aabd8e9343666ba5a980da86652898dbfadc9f1d0` | 194439672 | 2026-10-06 13:19:42 -0600 |
| `docs/v2/evidence/P3.6/impl7-v3-window-2097190.png` (V3's own window capture) | `16ee9ca415cf9385b913db84708f23ae977893e32a417dd18f8b1712388783d3` | 54125 | 1280x860, 885 colours |
| `THIRD-PARTY-LICENSES.md`, repository copy | `65db0bc093ba59ef06ad3ed440aa072d75ede0c9bc918ec81a43e645e840ef58` | 253144 | — |
| `THIRD-PARTY-LICENSES.md` **inside** the V1 image | `65db0bc093ba59ef06ad3ed440aa072d75ede0c9bc918ec81a43e645e840ef58` | 253144 | — |

The test image no longer exists on disk: `tauri build` in V1 removed it (recorded
in `V1-review-impl7.md`, finding 2 of the review).

## V3 in one screen

```
display: the inherited X display :99            (xvfb-run -a -s "-screen 0 1400x1000x24")
PASS smoke Rule B freshness: the source set has not moved since the commit the AppImage was built from
PASS smoke the AppImage is newer than the newest Rule B input (fresh-build anchor)
PASS smoke CSP: 8 directives, nonce present
PASS smoke the server answers with this run id
PASS smoke no server process from the run remains
PASS smoke the port is released
PASS smoke ollama is still running
...
48/48 assertions passed, 11 NOT RUN
```

Every flow:

```
NOT RUN onboarding / capture / draft / refine / publish+copy / patient list /
        plan / briefing / brainstorm / settings / backup
```

**Stop condition 5: a screen was reached but could not be read.** Root cause,
reproduced against this run's own capture with the shipped module's own
`screenWords()`: `tauri-e2e-smoke.test.mjs:948` requires an integer OCR
confidence and tesseract 5.5.3 prints `conf` as a float, so 95 of 98 words are
discarded and `screenWords` returns `null`. Detail, numbers and the exact
reproduction are in `V3-review-impl7.md`.

## Postconditions, re-read from outside the run

| Check | Observed |
| --- | --- |
| Port 7879 | free |
| Stray harness / AppImage / Xvfb processes | none |
| `ollama` on 127.0.0.1:11434 | still listening, pid 1121 unchanged |
| Port 7717 | never contacted |
| Preview 7831 | untouched |
| `git status` on evidence paths | only this attempt's new files |
| Historical evidence (`attempt-1` … `attempt-7`, `attempt-6/runtime/`) | untouched |
| Checkpoints, cards, dispatch, contracts | untouched by this review |
| Git | nothing staged, committed, pushed or branched |

## Verdict of this evidence set

**V0 PASS · V1 PASS · V2 PASS · V3 FAIL (exit 4) · V4 PASS · V5 PASS.**
Overall **FAIL**; Stop 5 open; approval blocked pending the coordinator.
