# P3.4 owner proposal, revision 4 — independent review reproductions

Produced by `docs/v2/state/reviews/P3.4-owner-proposal-ir4.md` (fresh independent
review of `docs/v2/state/P3.4-REPAIR-PROPOSAL-2026-10-03.md`, revision 4).

**Nothing here was run against the app.** No application, server, build, test
suite, model, audio, input, download, network request or display; port 7717 never
contacted; no live data folder opened; no `pkill`; no repository card, dispatch,
state or source file written or modified. Every script below is pure synthetic
JavaScript over synthetic string fixtures, and every one of them exits 0 having
printed its finding.

## 1. `attempt-line-identity.mjs` — §T.1(b)'s byte-identity claim

Evaluates the three template expressions from `docs/v2/tools/build-dispatch.mjs:344`
— the existing line, the arithmetic form ir3 rejected, and revision 4's branch —
for `attempt` 1–5, with `attempt`, `exception` and `id` as locals.

```
node docs/v2/evidence/P3.4/proposal-ir4/attempt-line-identity.mjs
```

Result: attempt 4 is byte-identical under the branch (`before===after: true`) and
**not** under the arithmetic form (`before===arith: false`); attempts 1–3 are
unchanged under both; attempt 5 gains the new sentence. **B1 is closed.**

## 2. `tooling-guard.test.mjs` — §T.1's guard and §T.2's five tests

Runs §T.2's five tests plus nine adversarial ones against a **patched copy** of
`build-dispatch.mjs` in an ignored scratch directory. The patched tool is the
proposal's own §T.1(a)+(b) applied to `git show 8783181:…`; it is deliberately
**not** committed, because committing it would be applying the grant this review
is evaluating.

```
mkdir -p build/ir4
git show 8783181:docs/v2/tools/build-dispatch.mjs > build/ir4/build-dispatch.mjs
git show 8783181:docs/v2/tools/plan-lib.mjs        > build/ir4/plan-lib.mjs
# apply §T.1(a) and §T.1(b) to build/ir4/build-dispatch.mjs
APUNTA_TOOL_DIR=$PWD/build/ir4 node --test \
  docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs
```

Result: **14/14 pass** once `makePlan`'s fixture H1 follows the parameterised card
id. Against §T.2 **exactly as written** — `writeFileSync(join(dir,'cards',`${id}.md`),
cardText)` with `cardText`'s H1 left at `# T1 Test card` — tests 3 and 4 **exit 1
and never reach the guard**, because `loadPlan` throws. That is finding **N3**.

Every fixture is written into `mkdtempSync` directories with
`APUNTA_V2_PLAN_DIR` pointed at them, `--print` is used so nothing is written
outside them, and no repository card, dispatch or state file is read for content
or written. All fixtures are synthetic (`T1`, `P3.4`, `T0.R`, `AM-999`).

## 3. `plan-fixture-filename-id.mjs` — the `loadPlan` file-name invariant

Isolates N3. Three cases against synthetic plan directories:

```
APUNTA_TOOL_DIR=$PWD/build/ir4 \
  node docs/v2/evidence/P3.4/proposal-ir4/plan-fixture-filename-id.mjs
```

```
A) file=P3.4.md H1="# T1 Test card" -> exit 1
   Error: P3.4.md: file name must be T1.md      (plan-lib.mjs:215)
B) file=P3.4.md H1="# P3.4 Test card" -> exit 0
   - Attempt 5 of 3, plus two corrective attempts the owner authorised by AM-999 — there is no attempt 6.
C) file=T1.md   H1="# T1 Test card"   -> exit 0
   - Attempt 4 of 3, plus one corrective attempt the owner authorised by AM-049 — there is no attempt 5.
```

## 4. `frame-identity-adversarial.mjs` — §E's frame-completeness rule

Feeds synthetic marker-line batches through two readings of §E's
`readObservations` snippet — the one as written (`batches.get(batch) ?? {…}`) and
one that refreshes `total`/`frame` on every sighting — and judges completeness
the way §E specifies.

```
node docs/v2/evidence/P3.4/proposal-ir4/frame-identity-adversarial.mjs
```

- **(A)** a hover publication read mid-arrival at **unchanged `total`** — the
  exact case D1 was raised for. As written, the mixture is labelled consistently
  and **passes**; refreshed, it is refused.
- **(B)** the count crossing a batch boundary (`200 → 220`, six batches). As
  written, a complete current publication is **permanently unselectable**;
  refreshed, `6/6 batches, all frame f2`.
- **(C)** one complete publication — the control, which both readings pass.

That is finding **N2**. The rule §E states in prose ("every one of them carries
that publication's `frame` and `total`") is not what its own snippet computes.