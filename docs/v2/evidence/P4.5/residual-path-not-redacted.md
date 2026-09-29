# The residual Fixed decision 6 accepts, on purpose

Card P4.5 redacts a query tail, a fragment tail, a fragment that looks like a
query, and user-info. It redacts **no path**. That is a decision with a reason
rather than an oversight, and this file records the residual so it is not
rediscovered as a surprise.

## What is still written verbatim

A path component of a `Location` reaches the evidence file exactly as observed.
A token embedded in a path — a bearer token in a query is a secret, but a token
in a path is generically indistinguishable from a CDN's own content-addressed
path — is therefore not removed. This card's authorising amendment says the same:
redacting "token-shaped" path segments would mean **inventing a new threshold
inside this card**, which is what HS-7 forbids and which no owner has authorised.

## What is still guaranteed about a path

Unchanged, and true for every write: a path is written only after rule 1 has
judged scheme, port, user-info, fragment and every query parameter name
(`describeLocation`, `probe-redirects.mjs:261-274` in the base numbering). A
`Location` that fails any of those is a recorded **refusal** — a named verdict in
the record — not a silent write. And the user-info rule now reaches a path's own
authority, so the one part of a `Location` before the path that is a credential
by definition is gone.

## The pin

Case 7 of the suite, `a path segment is written as observed, deliberately`, is
the pin. Its fixture is a 64-lowercase-hex path component — the shape both a
content hash and half a bearer token have — and it asserts that the component
**survives verbatim**, that `redactQuery` returns the `Location` byte-identical,
and that the `Location` was admitted by rule 1 outright (`refusals` empty,
`domainRule` true). A blanket path redaction later cannot land without turning
that case red, which is what makes it a conscious change with its own evidence
instead of a diff nobody read.

## If it ever bites

This card ran the probe **zero times**, so nothing was observed: the only record
that exists is the committed one, which carries two 64-hex path components that
are the artifact's content, no `#`, no authority `@`, and no `?` other than
`?<redacted>`, with `user-info: absent` and `fragment: absent` on every artifact.
A real observation of a credential-shaped path would arrive as a report, not
from this card. If one does, the action is:

1. record the exact `Location` with its query and fragment written `<redacted>`;
2. report `BLOCKED` — stop condition 3;
3. name the plan-editor action. Whether the path rule changes is the
   coordinator's and the owner's: a new redaction threshold is a contract-shaped
   decision (HS-7) and never one made inside a card.
