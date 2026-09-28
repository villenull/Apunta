# The extension: what it is, and what it costs

**A loadable prototype, since 2026-09-28** — the D15 gap in the independent
review. It has been unpacked into Chromium 152 on a throwaway profile and driven
end to end against a synthetic local account; the fourteen checks and their
results are in `docs/research/claude-import-browser-readiness.md` §2. It has
**never** been executed against a signed-in account, and no request has been made
to any Claude endpoint.

The reasoning below is unchanged and still holds; where it once described an
unbuilt design, the file it names now exists.

## What is decided, and why

**The walk does not run in the service worker.** The worker is terminated after
30 s of inactivity, after a single request over five minutes, or when a `fetch()`
response takes over 30 s ([lifecycle][life]). A five-hundred-conversation
account is a walk of hundreds of requests measured in minutes, so a walk there
would be killed mid-account and would have to be resumed every thirty seconds.
The walk therefore runs in a content script in the page's own world
(`"world": "MAIN"`, Chrome 111+), which has no such clock, and the popup is
only a start button and a progress line.

**The requests are made from the page's world, not the extension's.** Chrome's
own documentation says content scripts are subject to the same-origin policy and
that "cross-origin requests are always treated as such in content scripts, even
if the extension has host permissions" ([network requests][net]). A `fetch()` to
`/api/organizations/...` issued from an extension service worker is a *cross-site*
request from the browser's point of view, and whether claude.ai's session cookie
is attached to it depends on that cookie's `SameSite` attribute, which nobody has
observed from outside. The same request issued from claude.ai's own page is
same-origin, and the browser attaches the session because that is what a
same-origin request is. This is the reason the capture lives in the page's world
and not the extension's: it is the only arrangement that does not depend on an
unobserved cookie attribute.

**No cookie is read, copied or stored.** The extension never calls the `cookies`
API and never sees a cookie value. It asks the page to make a request the page
could make itself, and the browser attaches whatever it attaches. That keeps the
"no cookie copying" rule true by construction rather than by promise.

**Permissions are two, and the second is a host.** `storage` for the
checkpoint; `https://claude.ai/*` to inject the content script at all. There is
no `tabs`, no `cookies`, no `webRequest`, no `debugger`, no `downloads`, no
`unlimitedStorage`, no `<all_urls>`, no `clipboardWrite`, no `nativeMessaging`.
Notably absent:

- `unlimitedStorage` would lift the 10 MB `storage.local` quota, and the
  checkpoint does not need it: 508 conversation ids, a digest each and a cursor
  is tens of kilobytes ([storage][store]). Asking for a bigger quota than the
  feature needs is the kind of thing that gets an extension rejected under
  Limited Use ([limited use][limited]).
- `downloads` is not needed because the *page's* world can create a download
  link from a Blob, which is what every public exporter does. The
  `File System Access API` in an extension page is the alternative if the owner
  wants to choose the destination, and it needs no extra permission either.
- `nativeMessaging` would be the only way to push the file straight into Apunta,
  and it is the most expensive thing on the list: the host manifest must be
  written by an installer into a fixed OS location and must name the extension's
  exact origin, with no wildcards ([native messaging][native]). That is a file
  written outside the browser by an installer — a step the therapist would have
  to be given, or a setup click she cannot perform herself.

**The extension does not talk to Apunta.** Apunta's own request guard (C-REQ)
accepts an `Origin` of `127.0.0.1` or `localhost` and nothing else, so a
`POST http://127.0.0.1:7717` from a claude.ai page would be refused by the app
before it reached any route. Pushing the capture over localhost would need a
production change to C-REQ first, which is out of this lane's scope. The file
route — download `conversations.json`, choose it in Settings → Import — needs no
production change at all, and
`test/importer-contract.test.mjs` proves the unchanged importer already opens it.

## The relay, since 2026-09-28

`bridge.js` (ISOLATED world) now carries a bounded, correlated, validated message
set between the service worker and the page world, and the popup drives the whole
thing with one button. `sw.js` resolves an eligible tab itself — the popup names
none — validates the candidate, proves a receiver by pinging it, and reports
`no_eligible_tab` and `no_listener` as different answers. A real click-through run
in Chromium 152, with a real download read back from disk and hashed, is
`docs/research/claude-import-relay-results.md`.

Three things that design deliberately is not, and the reasoning is in that
document and in `bridge.js`'s own header:

- **A fetch proxy.** A page message cannot name a URL, a path or a method. The
  bridge builds its own outgoing object from seven fields; the page world runs with
  *its own* transport and allow-list.
- **A code path.** Nothing in a message is evaluated, and no message can change a
  permission, a host, an endpoint or a setting.
- **A security boundary against a hostile page.** The page world shares globals
  with the capture, so a page on the right origin can forge a report. The origin
  check, the request correlation and the report validation are hygiene; the
  boundary is the account host. Two sharper consequences: an origin check is
  weaker inside a same-origin iframe, and every loopback page receives both
  scripts while the loopback host is in the manifest for research.

**On `event.source`, measured rather than assumed.** A MAIN-world message *does*
arrive in the ISOLATED-world listener, and `event.source` *can* be compared across
the two worlds — `inpage.js` filters on it, and the capture demonstrably starts
through it. The bridge's decision not to use `event.source` is a choice: it checks
`event.origin` against the frame's own origin, which is stricter than a host list
and does not depend on which object the browser hands back as the source. Neither
check can distinguish the bridge from page script, and that is the host-trust
property above rather than a defect in either. (An earlier note here said the
comparison was impossible across worlds. It was wrong, and is corrected.)

## Since the build

- `capture-core.js` is a **second implementation** of the reference walk, because
  a page-world content script cannot `import`. It is held to the reference by
  test: the same file, driven against the same synthetic account, must produce
  the same digest, counts and gap codes.
- The manifest carries `http://127.0.0.1/*` in `host_permissions` and
  `content_scripts[].matches` so a synthetic local page can be used. **That is a
  research affordance and it is marked as one in `sw.js`; remove it before any
  distribution.**
- The popup loads `capture-core.js` and `mock-account.js` and deliberately **not**
  `inpage.js`: that file needs a page's world and belongs in the tab.
- `chrome.storage.local` holds exactly one key (`mode`). The capture's own state
  is not persisted: a run that dies mid-walk is a run that is repeated, and the
  offline checkpointing is not duplicated here. That is a known gap in the
  prototype, not a decision.

## What is not decided, and what it would cost

| Question | Why it is open | Cost to close |
| --- | --- | --- |
| How is the extension installed? | A Web Store listing is the only install path with no developer mode, and it is now the *only* remaining step: the artifact loads, and a person can press a button and get a file. Store publication is out of this phase; `Load unpacked` is developer mode, which the plan forbids in the therapist's workflow and which is authorized here for research only. | A store review, a privacy policy, a Limited Use disclosure, and a decision about whether a private/unlisted listing is possible for one owner. |
| Is the web app's inventory pagination `limit`/`offset`? | No public source shows parameters at all — and a source that sends none does not show the endpoint has none. | One observed request records what that response carried; only a large account can show anything about pagination. |
| Does the web app expose an artifact's body? | No source shows an artifact content endpoint outside the Enterprise API. | One observed request; until then the capture reports the artifacts it saw as not captured. |
| Will the session cookie ride a cross-site request from an extension worker? | Only observable on a real signed-in session. | One observed request — or, better, no need for it, because the capture does not make one. |
| Is any of this permitted by the terms? | Not checked; see `SOURCES.md` §13. | A decision, then possibly a different design. |

## Clicks

**Estimates, not observations.** No browser flow was executed in this lane, so
these are counted from the documented steps, and every one of them is
unverified. A real run must replace them with what was actually clicked.

| Step | Clicks | Note |
| --- | --- | --- |
| Install from the store, once | ~4 | Open the listing, Add to Chrome, confirm the permission prompt, dismiss the welcome tab. Optional: pin. |
| Open claude.ai and sign in, once | ~3 | Sign-in is the account's own, not the extension's. |
| Start a capture | 2 | Open the popup, press Start. |
| Wait | 0 | Progress is shown; the walk is resumable, so closing the tab loses nothing. |
| Save the file | 1 | The page offers the download; the browser asks where to put it once. |
| Import into Apunta | 3 | Settings → Import from Claude, choose the file, press Import (the preview is one screen). |
| **Total, first time** | **~13** | Plus the store's install prompt text, which the owner has to read. |

Compare with the export route the plan is trying to avoid: Settings → Privacy →
Export data, wait for the email, download the 33 MB archive, then the same three
import steps — with a wait that is not a click count and an archive that contains
everything, not one account's worth of relevant chats.

[life]: https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle
[net]: https://developer.chrome.com/docs/extensions/develop/concepts/network-requests
[store]: https://developer.chrome.com/docs/extensions/reference/api/storage
[native]: https://developer.chrome.com/docs/extensions/develop/concepts/native-messaging
[limited]: https://developer.chrome.com/docs/webstore/program-policies/limited-use
