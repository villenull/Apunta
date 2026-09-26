# Blocked cards

`<card> | reason | evidence path | what would unblock it | dependent cards`

(none yet)
P0.2 | V2 (`TZ=Australia/Sydney npm test`) fails 6 tests in 4 files outside the card's May-edit list; cause verified as test code (all three attempts + three independent reviews agree; per-test analysis in evidence). No in-scope fix exists (HS-9 forbids those files; Stop conditions forbid production-code changes; global TZ pin forbidden). Attempt budget 3/3 exhausted. | docs/v2/state/reviews/P0.2-impl.md, docs/v2/evidence/P0.2/finding-sydney-attempt2.md | A plan amendment adding a follow-up card whose May-edit list covers exactly `shared/src/backup.test.ts`, `web/src/lib/format.test.ts`, `server/src/backup/store.test.ts`, `server/src/routes/import.test.ts` (apply P0.2's per-describe zone set/restore pattern, no global pin); only the owner/plan editor can add it | P0.R (waits on P0.2)
