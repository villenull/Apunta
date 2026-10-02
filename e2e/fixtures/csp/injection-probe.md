# Injection probe

One fabricated session note, for the prototype's sample patient (John Smith),
carrying two injected payloads that write the same sentinel:
`window.__APUNTA_CSP_PROBE__`.

It exists for one assertion: C-BRIDGE@1's own rejection example — "a page that
injects `<script>` via imported Markdown → blocked by CSP and cannot reach Tauri"
— made into something the shipped AppImage can be asked about. V2(d) creates this
note over HTTP with no route-handler edit, opens it in the workspace, and requires
in the rendered page that `window.__APUNTA_CSP_PROBE__` is `undefined` and that
the literal characters `<script>` are visible in the body.

Synthetic only (HS-8). Nothing here is a real person, a real session or real
clinical content; the narrative is two sentences of ordinary invented material and
the payloads are inert strings that would define one global variable.

## What must stay true

- **The sentinel name is `__APUNTA_CSP_PROBE__`.** The harness asserts that exact
  global, so changing it here breaks V2(d) with a name mismatch rather than a
  silent pass.
- **The literal text `<script>` must be visible in the rendered body.** That is
  the second half of V2(d) and it is what proves the note rendered rather than
  being refused: `web/src/lib/markdown.tsx` turns every string into a React text
  node, so the characters appear as characters and the payloads never become
  elements. If a future renderer gained `dangerouslySetInnerHTML`, the sentinel
  would appear instead and the assertion would fail — which is the point.
- **Both payloads write the same sentinel**, so one assertion covers both the
  script-element path and the event-handler path.

## Note content

The text below is what the harness posts as the note's `content`. It is inlined
here rather than read from this file so the file's own prose — which explains the
payloads — can never end up inside a note.

```md
Subjective: John Smith reports sleep still broken at the edges, waking around
three most nights this fortnight. Intrusive thoughts present but less vivid and
more easily set aside. No change in appetite. Mentions a hard deadline at work
on the twenty-eighth and some anticipatory worry about it.

Objective: Alert and oriented. Affect mildly anxious, appropriate to content.
Speech normal rate and volume. No evidence of psychomotor change on video.

Plan: Continue current dose. Re-review in four weeks, or sooner if sleep
worsens. Encourage a consistent wake time and a screen-free hour before bed.
Wrote the literal text below at the client's request, to check how the note
viewer renders it.

<script>window.__APUNTA_CSP_PROBE__ = 'script';</script>
<img src=x onerror="window.__APUNTA_CSP_PROBE__ = 'img'">
```
