# P3.7 — the change, in full

One added check, in one place, in one file. `git diff --stat 330b2b1`:

```
 scripts/v2/package-linux-resources.test.sh | 72 ++++++++++++++++++++++++++++++
 1 file changed, 72 insertions(+)
```

72 insertions and **0 deletions**: nothing existing moved, was reworded or was
weakened. The insertion sits between the end of the `spa-body` block and the
`# 5. the whisper binary` banner, so the whisper check keeps the position the
card fixes and the missing-SQLite negative case never shifts.

## The diff

```diff
@@ -447,6 +447,78 @@ else
   fail "spa-body" "GET / returned a body of ${#ROOT_BODY} bytes; an empty or truncated web/dist must fail here"
 fi

+# P3.7 — the one hashed script the SERVED shell names, fetched and measured.
+#
+# The three checks above inspect GET / only, and index.html survives
+# `rm -rf web/dist/assets` intact, so all three pass on a bundle with no
+# JavaScript in it. What separates a truncated bundle from a good one is the
+# asset the shell itself names: the SPA fallback answers a missing one
+# `200 text/html` (the boot page, which is why /patients resolves on a fresh
+# load) and a real one `200 application/javascript` with the length the
+# bundle's own manifest records for that path.
+#
+# The path comes out of the SERVED body — $ROOT_BODY, captured above — never off
+# disk, so a shell that references a script the bundle does not carry fails here
+# rather than in a person's browser. Zero or several `src="` is a failure with
+# the count in the detail, never a skip and never a pass: a check that quietly
+# finds nothing is the defect this card exists to remove. There is no
+# modulepreload fallback, no glob, no hard-coded asset name, no file read from
+# disk, and no hard-coded size floor — the expected length is the `bytes`
+# manifest.json records, read from the copy under test with the bundled Node, so
+# this invents no threshold of its own.
+SPASSET_SITE_COUNT="$(printf '%s' "$ROOT_BODY" | grep -o 'src="' | wc -l | tr -d ' ' || true)"
+if [ "$SPASSET_SITE_COUNT" != "1" ]; then
+  fail "spa-asset" "the served GET / body carries ${SPASSET_SITE_COUNT} src=\" references, expected exactly 1; this check asserts the shell and the server agree about one hashed script and does not guess which"
+fi
+
+SPASSET_PATH="$(printf '%s' "$ROOT_BODY" | grep -o 'src="[^"]*"' | sed -E 's/^src="([^"]*)"$/\1/' || true)"
+if [ "${SPASSET_PATH#/}" = "$SPASSET_PATH" ]; then
+  fail "spa-asset" "the served shell names '${SPASSET_PATH}', which is not a site-absolute path; resolving one against / would be a guess, not an assertion"
+fi
+
+SPASSET_MANIFEST_KEY="web/dist${SPASSET_PATH}"
+SPASSET_EXPECTED="$(
+  "$BUNDLE_NODE" -e '
+    const fs = require("node:fs");
+    try {
+      const manifest = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
+      const entry = (manifest.files ?? []).find((f) => f.path === process.argv[2]);
+      if (entry && Number.isInteger(entry.bytes)) process.stdout.write(String(entry.bytes));
+    } catch {}
+  ' "$FOLDER/manifest.json" "$SPASSET_MANIFEST_KEY"
+)"
+if [ -z "$SPASSET_EXPECTED" ]; then
+  fail "spa-asset" "manifest.json records no byte length for ${SPASSET_MANIFEST_KEY}; the bundle does not carry the script its own shell names"
+fi
+
+SPASSET_FILE="$APUNTA_DATA_DIR/../tmp/spa-asset.bin"
+SPASSET_HEADERS="$APUNTA_DATA_DIR/../tmp/spa-asset.headers"
+SPASSET_STATUS="$(curl -s -o "$SPASSET_FILE" -D "$SPASSET_HEADERS" -w '%{http_code}' --max-time 20 "http://127.0.0.1:${PORT}${SPASSET_PATH}" 2>/dev/null || printf '000')"
+SPASSET_TYPE="$(grep -i '^content-type:' "$SPASSET_HEADERS" 2>/dev/null | tail -n 1 | tr -d '\r' | cut -d' ' -f2- | cut -d';' -f1 | sed -E 's/[[:space:]]+$//' || true)"
+# Bytes as the server sent them, counted on the downloaded body. Never
+# ${#VAR}: under the run's UTF-8 locale that counts characters, and the shell
+# and the asset disagree by enough to fail a perfect bundle.
+SPASSET_ACTUAL="$(wc -c < "$SPASSET_FILE" 2>/dev/null | tr -d ' ' || true)"
+[ -n "$SPASSET_ACTUAL" ] || SPASSET_ACTUAL=0
+
+if [ "$SPASSET_STATUS" != "200" ]; then
+  fail "spa-asset" "GET ${SPASSET_PATH} answered ${SPASSET_STATUS}, not 200; content-type '${SPASSET_TYPE}', ${SPASSET_ACTUAL} bytes served against the ${SPASSET_EXPECTED} manifest.json records"
+fi
+case "$SPASSET_TYPE" in
+  *[Jj]ava[Ss]cript*) ;;
+  *)
+    fail "spa-asset" "GET ${SPASSET_PATH} answered ${SPASSET_STATUS} with content-type '${SPASSET_TYPE}', which does not contain javascript; a missing asset is answered 200 text/html by the SPA fallback, not 404, so the content type is what caught this; ${SPASSET_ACTUAL} bytes served against the ${SPASSET_EXPECTED} manifest.json records"
+    ;;
+esac
+if [ "$SPASSET_ACTUAL" != "$SPASSET_EXPECTED" ]; then
+  fail "spa-asset" "GET ${SPASSET_PATH} answered ${SPASSET_STATUS} as '${SPASSET_TYPE}' but served ${SPASSET_ACTUAL} bytes, not the ${SPASSET_EXPECTED} manifest.json records"
+fi
+
+# One informational line, not a PASS: pass() prints the name alone, and the
+# four values below are what the row's acceptance and the return file quote.
+printf 'spa-asset %s %s %s %s\n' "$SPASSET_PATH" "$SPASSET_STATUS" "$SPASSET_TYPE" "$SPASSET_ACTUAL"
+pass "spa-asset"
+
 # 5. the whisper binary -------------------------------------------------------
 if "$FOLDER/bin/whisper-cli" --help > /dev/null 2>&1; then
   pass "whisper-help"
```

## How each Fixed decision is met

| Fixed decision | Where |
| --- | --- |
| 1 — one check, `spa-asset`, immediately after `spa-body` and before the whisper check | the whole insertion; 72 lines, one hunk |
| 1 — the `src="` is taken from the served `$ROOT_BODY`, exactly one expected, the count in the detail, never a skip or a pass | `SPASSET_SITE_COUNT` and its `fail` |
| 1 — 200, a content type containing `javascript`, and a **byte** length equal to the manifest's | the three assertions after the fetch |
| 1 — bytes measured on the downloaded body, never `${#VAR}` | `SPASSET_ACTUAL` from `wc -c < "$SPASSET_FILE"` |
| 1 — a path the manifest does not list is a `FAIL` naming the path | the `SPASSET_EXPECTED` emptiness check |
| 1 — the success line is one, informational, not `PASS `-prefixed, four values in order | `printf 'spa-asset %s %s %s %s\n'` |
| 2 — `server/src/app.ts` unchanged; the content type carries the check | the diff touches no file but the test script |
| 3 — the expected length is the bundle's own `bytes`, read with the bundled Node from the copy under test | `SPASSET_EXPECTED`, keyed `web/dist` + served path |
| 4 — the shell is read from the served response, so a shell and `assets/` that disagree cannot pass | `$ROOT_BODY`, never a file read |
| 5 — exactly one `PASS spa-asset`, the count is the tripwire | V1's 29 against the base's 28 |
| 6 — nothing about the launch changes | no deleted line; `sandbox.mjs env`, the `cp -R`, `env -i`, the four `APUNTA_*` overrides, the ownership poll, rule-7 shutdown, the negative case and exit-1-on-first-failure are all as they were |

## One judgement call, recorded

The card fixes "exactly one `src="` is expected" and names the failure when the
count is not 1. It does not say what to do with a reference that is not
site-absolute. Rather than resolve such a path against `/` — which is a guess,
and the card forbids guessing — the check refuses it with the path named, in the
same `FAIL spa-asset` style. The bundle on disk names `/assets/index-D7iOgJVA.js`,
so the assertion is never reached on a real bundle; it exists so a future bundle
whose shell changed shape fails loudly here instead of being papered over. No
new threshold, no new key, no fallback.
