# D2 — stale rectangles in `readReported`

`scripts/v2/tauri-audio.test.mjs:977-989`:

```js
for (const marker of state.markers) {
  for (const [key, value] of marker.entries()) {
    if (!key.startsWith('tid_')) continue;
    const [, testId, field] = key.split('_');
    const rect = state.tids.get(testId) ?? {};
    rect[field] = Number(value);
    state.tids.set(testId, rect);
  }
}
```

`state.tids` is a single Map filled from **every** marker in order; it is never
cleared when a later marker no longer carries a `data-testid`. `rectOf`
(`:999-1005`) accepts any finite `w > 0, h > 0` rectangle, and
`waitForPublished` (`:901-912`) returns the first one found, so a rectangle from
an earlier screen can satisfy a wait for an element that is not on screen.

`stale-rectangle.mjs` (pinned Node `v24.19.0`) reproduces the exact loop with a
marker that carries `tid_record-start_*` followed by a marker that does not.
Exact output (exit 0):

```
tids map after both markers: [["record-start",{"x":100,"y":200,"w":80,"h":40}],["home-search",{"x":10,"y":20,"w":300,"h":30}]]

PASS the newest marker no longer carries record-start
PASS the harness still reports a record-start rectangle from the older marker: {"x":100,"y":200,"w":80,"h":40}
PASS rectOf would therefore accept it as a live target (w,h > 0 and finite): {"x":100,"y":200,"w":80,"h":40}

Verdict: stale rectangle reproduced (defect)
```

This did not misfire in the recorded V3 run — the click set reached
`record-start` at the right moment — but it is a latent wrong-control click
hazard whenever a `data-testid` appears on one screen and is queried on another.
