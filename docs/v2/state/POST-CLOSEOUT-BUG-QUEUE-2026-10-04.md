# Post-closeout bug queue — 2026-10-04

Owner-requested external review by Claude Opus 5.5, agent fda5cfcb, against
`eba45ee`. The report is preserved verbatim in
`reviews/project-bug-review-2026-10-04.md` (SHA-256: d2e8b40d23da7486e7758f993ff4e2fe4796d29ad2c845cb74c24a1e8bb22d61).
The coordinator has not independently reproduced these application findings.
They are queued after this closeout; no fixes, new workers or runtime checks
were started. Each accepted fix needs a regression test and independent review.
Use only the CLAUDE.md permitted free models for future delegated fixes.

| Priority / packet | Finding and proposed work | Required verification |
| --- | --- | --- |
| First, restore alone | Reported HIGH, reproduced by reviewer: pending restore discards live WAL/SHM, damaging the safety copy and rollback. Checkpoint before rename with native binding; preserve sidecars on failure and restore them on rollback. | Synthetic unclean-exit WAL database retains committed rows in safety copy and rollback; no live DB. |
| Import packet | #2 omitted format locale in Claude/Halaxy createNote; localized Halaxy title. #4 archived/unknown existingPatientIds throws untranslated 500; typed localized 400. | es-MX format imports keep locale; both preview/run reject stale patient selection correctly. Spanish benchmark remains parked. |
| Note-write packet | #5 refine lacks revision guard and can overwrite concurrent edits. #6 persistDraft writes note/transcript/chat without one transaction. | Held fake refine plus concurrent PATCH preserves edit and reports withheld; injected persistence failure leaves no partial note. |
| Audio retention | #7 note/patient deletion leaves retained WAVs; crashes leave orphans. Remove referenced files only after successful DB deletion; assess safe orphan sweep. | Synthetic deletion/orphan tests preserve active recordings. The proposed one-hour sweep is not an adopted retention policy. |
| Environment, deduplicate | #3 Node 26 localStorage/jsdom failures: already tracked under P0.5 / AM-047. Pinned Node 24.19.0 full gates passed in P3.4 static completion. Consider engine enforcement; do not broaden engines or weaken tests. | Use pinned Node for gates; establish bundled/runtime version from existing evidence before claiming a production mismatch. |
| Small hardening | #8 recorder flush acknowledgement can hang; assess bounded timeout/error policy. #9 backup basename uses POSIX splitting and breaks Windows paths. | Never-ack recorder test; POSIX/Windows archive-path tests. A one-second timeout is proposed, not adopted; path.basename on POSIX alone does not parse Windows separators. |

Preserve privacy, OS portability, existing acceptance contracts and all previous
failures. Follow repository packet authority before implementing, including any
protected ownership/protocol changes. This queue does not approve the product
or grant new acceptance attempts. Full reporter locations, fixes and test ideas
are in the preserved report.
