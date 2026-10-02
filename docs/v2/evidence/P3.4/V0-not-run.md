# V0 — `npm run tauri:build:test`

**Status: NOT RUN.** Both of the row's own predicates are empty.

- Working directory: the repository root.
- Command: `export PATH="$HOME/.cargo/bin:$PATH" && npm run tauri:build:test`
- Exit code: not applicable — the row did not run.
- Start / end time: not applicable.

## The predicates, and both of them

The row runs if and only if one of two things is true.

**1. `git diff --name-only 52b9ce0...HEAD -- src-tauri/` is non-empty.**

```
$ git diff --name-only 52b9ce0...HEAD -- src-tauri/ | wc -l
0
```

**2. The checkpoint's `docs/v2/state/cards/P3.4.json` `changedFiles` lists any
path under `src-tauri/`.**

It was `[]` when this attempt started, and it lists no `src-tauri/` path now
either. `srcTauriTouched` is `false`.

Both empty is the row's only condition for `NOT RUN`, so that is what is
recorded, and **V2 uses P3.3's attempt-2 AppImage unmodified**
(`docs/v2/evidence/P3.3/attempt2-V2-appimage.md`), built at 01:06.

No `src-tauri/` file was edited by this attempt, which is the expectation S4
states: at this base the shell side already satisfies rule 4 and rule 5
(`withGlobalTauri: false`, `"csp": null`, `"capabilities": []`, no
`src-tauri/capabilities/`, and P3.3's two navigation guards), and a `src-tauri/`
edit was to be made only if V2 showed the guards do not hold. V2 did not reach
that question.

## Why this matters to V2 — a gap worth a decision

V2 launches the AppImage, and the AppImage bundles a **prebuilt** server:
`src-tauri/target/release/bundle/appimage/…AppDir/usr/lib/…` embeds
`linux-resources/`, which `scripts/v2/package-linux-resources.sh` produced at
**00:01**, under P3.1. That bundle has no `content-security-policy` in it:

```
$ grep -c "content-security-policy" build/linux-resources/server/server.mjs
0
```

so V2(d)'s header half — which must fail on an unmodified tree — also fails on
this attempt's tree, because the *binary* predates `csp.ts` whatever the source
says. V0 is the only row that rebuilds that bundle, and V0's condition looks at
`src-tauri/` paths only, so it does not fire for a server-side change.

An implementer could have run V0 anyway and made the header half pass. That was
**not** done, and the reason is worth recording rather than hiding: V0's rule is
explicit about when it runs, and re-bundling rewrites `build/linux-resources/**`
and `server/dist/**`, neither of which is in this card's May edit list (HS-9).
That is a coordinator decision, not an implementer's.

## The recommendation

Either authorise V0 for this card regardless of its `src-tauri/` predicate, or
add `build/linux-resources/server/server.mjs` (or `server/src/**`) to V0's
condition, so that a server-side change re-bundles the binary V2 launches. Until
one of those happens, V2(d)'s header half cannot pass on any attempt of this
card, however correct the server code is.
