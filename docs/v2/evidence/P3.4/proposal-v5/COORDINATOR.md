# Coordinator check of submitted v5

Measured 2026-10-03T03:11:45.304262+00:00; candidate bf6e7f0. No runtime, display, input, server, model,
audio, acquisition, source or real tooling change.

Pinned interpreter /home/villenull/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node:
- --test build/p3.4-spec-v5/model.test.mjs: exit0, 41 tests passed.
- APUNTA_TOOL_DIR=$PWD/build/p3.4-spec-v5/tool node --test docs/v2/evidence/P3.4/proposal-ir4/tooling-guard.test.mjs: exit0, 14 tests passed.

Initial sandboxed default-interpreter invocations did not give equivalent results:
model command showed only one outer file pass; tooling command exited1 with one
outer file failure and no useful detail. Those are not used as the 41/14 proof.
Authorized pinned-interpreter reruns above produced all individual cases.

Passing submitted fixtures is not independent acceptance. Reviewer must assess
truncated valid newer headers versus highest-seen fallback, complete duplicate
validation, bootstrap containment/exemptions, the removed fixtures and changed
selection predicate. These concern correspondence to the resolved contract.
The author model remains unchanged for independent comparison.
