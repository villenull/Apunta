# Coordinator verification of submitted S3.3a attempt 1

Candidate is not accepted. Worker returned and was archived; build lease released
after returned commands completed and no competing build was observed. No model,
server, live data or port 7717 used in coordinator checks.

## Targeted suites

Command (repo root):
`APUNTA_CHECK_URL=http://127.0.0.1:1 ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node --test scripts/check-refine.test.mjs scripts/check-note-format.test.mjs`

Sandbox invocation exited 1 without useful per-test detail; authorised loopback
stub invocation outside that sandbox exited 0: 25 tests passed, zero failed.
No additional global build/test rerun was needed.

## Reproduced defects

1. Repo-root command:
`APUNTA_V2=1 APUNTA_CHECK_URL=http://127.0.0.1:1 ~/.local/share/apunta-node/node-v24.19.0-linux-x64/bin/node scripts/check-refine.mjs --only tone-request shorten-keeps-facts`

Exit 2: `Refusing to run: unexpected argument shorten-keeps-facts.` The parser
collects multiple IDs but advances its outer index by only one; documented
multi-ID compatibility is broken before any request.

2. Repo-root fabricated in-memory fetch stand-in, no listener or HTTP call:

```js
globalThis.fetch = async (url, init) => {
  if (!init) return new Response(JSON.stringify(
    url.endsWith('/api/formats') ? {formats:[]} : {patients:[]}
  ));
  return new Response(JSON.stringify({id:'synthetic-id',name:'Synthetic fixture'}), {status:201});
};
await import('./scripts/v2/seed-check-instance.mjs');
```

Run with the same pinned node, `--input-type=module`, APUNTA_V2=1 and dead
APUNTA_CHECK_URL. Exit 2: `That Apunta took the format and returned no id for it.`
`post()` returns a Response, while seed() reads its `.id` without `.json()`.
A fresh sandbox would create the format then abort, not seed both records.

## Further review concern

The rules dump duplicates actual rules in PINNED_* blocks. A test for literal
presence anywhere in the source may find the copy itself after an effective
rule changes, giving false assurance that the dump reflects executed rules.
Independent reviewer must test this concern against actual test/source bytes.
No rule or threshold changed by coordinator.

V6/V7 remain owner-held, not approved. V8 retains the worker's FAIL with
documentation-only drift attributed; no row was reinterpreted to PASS.
