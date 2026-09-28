#!/usr/bin/env node
/**
 * AM-057's offline regression for `scripts/v2/probe-redirects.mjs`.
 *
 * Four properties, all of them offline and all of them about the probe rather
 * than about a vendor:
 *
 *  1. **A malformed `Location` is described without crashing and without
 *     writing a query value.** A `Location` need not be an absolute URL — a
 *     relative reference is legal, and Node hands the header value back exactly
 *     as the origin sent it — so the branch that handles "this did not parse"
 *     is reachable with exactly the input that matters most, a signed
 *     redirect. That branch used to return a bare string where the renderer
 *     reads an array, and to write the raw header verbatim. Both are what these
 *     cases pin.
 *  2. **The query verdict comes from the artifact's own exact-name
 *     allowance.** A name the manifest row enumerates is not a refusal; a name
 *     outside it is refused *by name*; a row that admits no query at all
 *     refuses any query. No name here is invented to make a case pass: the
 *     admitted name is read out of the probe's own artefacts, and the
 *     non-admitted one is a fabricated string that is on no row anywhere.
 *  3. **Importing the probe requests nothing.** The helpers are exported for
 *     this file, so the import itself is under test: `fetch` is replaced with
 *     one that throws, and the module is imported dynamically underneath it.
 *  4. **A `Location` that parses but whose query *name* carries a malformed
 *     percent escape is described, not thrown on.** This is the other
 *     malformed branch and it is a different one: the URL parses, so nothing
 *     about it looks wrong, and the failure only happens when a parameter name
 *     is decoded. A `URIError` escaping here would kill the probe mid-run and
 *     leave the *previous* run's `redirects.md` on disk where it reads as this
 *     one's. The fixture is a literal for that reason — see below.
 *
 * Every value in this file is fabricated (HS-8). Most URLs are derived from the
 * catalogue's own pinned address at run time, and the one URL literal this file
 * holds is on **loopback** — `http://127.0.0.1/…`, which the outbound-URL rule
 * names as allowed — so the file still holds no non-loopback URL literal and
 * needs no `eslint.config.js` exemption. V3 remains a real check on it: the rule
 * applies to every `ts`, `tsx`, `js` and `mjs` file, and this `.test.mjs` is not
 * in the test-file exemption, which covers `test.ts` and `test.tsx` only, so a
 * vendor literal here would fail.
 */

import assert from 'node:assert/strict';
import { after, test } from 'node:test';

/**
 * A `Location` that is legal HTTP and not a URL, carrying a fabricated query.
 * Relative on purpose: that is the shape that reaches the malformed branch.
 */
const MALFORMED_LOCATION =
  '/ggml/resolve/main/ggml-base.bin?Expires=1789000000&Signature=fabricated-signature-value';

/** Fabricated values, named so a leak is unmistakable in a failure message. */
const FABRICATED_VALUE = 'fabricated-signature-value';
const FABRICATED_EXPIRES = '1789000000';

/** A parameter name on no manifest row anywhere, so it is never admitted. */
const UNADMITTED_NAME = 'fabricated-parameter-name';

/**
 * A `Location` that **parses** as a URL and still carries a malformed escape in
 * a query parameter's *name* — the branch above does not reach.
 *
 * It is a literal on purpose, and three deliberate choices hold it together:
 *
 *  - **Literal, not derived.** `withQuery` and `URLSearchParams` percent-encode
 *    the `%` of a literal `%zz` into `%25zz`, which decodes cleanly and never
 *    reaches the failing decode — a case built that way passes against the
 *    unfixed probe, which is worse than no case at all. Nothing here goes
 *    through a URL helper.
 *  - **Loopback and non-`https`.** A real vendor host would be a faithful
 *    fixture and would fail V3: this file is a `.test.mjs`, which the outbound-URL
 *    rule's test-file exemption does not cover, since it names `test.ts` and
 *    `test.tsx` only. Loopback is named as allowed, and the non-`https` scheme is
 *    what the scheme verdict below is *about*, so the scheme refusal is a
 *    recorded, asserted fact rather than something suppressed to make the array
 *    shorter.
 *  - **Fabricated value** (HS-8), so the redaction assertion below is about a
 *    string nobody has ever held.
 */
const MALFORMED_QUERY_NAME_LOCATION =
  'http://127.0.0.1/ggml/resolve/main/ggml-base.bin?%zz=fabricated-malformed-value';

/** The same name, as it arrived and as it is therefore recorded. */
const MALFORMED_QUERY_NAME = '%zz';

/** The fabricated value on that parameter, named so a leak is unmistakable. */
const MALFORMED_QUERY_VALUE = 'fabricated-malformed-value';

/*
 * The import is the first thing this file does, and `fetch` is replaced before
 * it, so the entry-point guard is exercised rather than assumed. If the probe
 * ran on import, this throws before the first assertion is ever reached.
 */
const originalFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = () => {
  fetchCalls += 1;
  throw new Error('importing the probe must not request anything');
};
const probe = await import('./probe-redirects.mjs');
after(() => {
  globalThis.fetch = originalFetch;
});

const [speechArtifact] = probe.ARTIFACTS;
const ADMITTED_NAME = speechArtifact.allowedQueryKeys[0];

/** The catalogue's own pinned address with a fabricated query parameter on it. */
function withQuery(base, name, value) {
  const url = new URL(base);
  url.searchParams.set(name, value);
  return url.href;
}

/** What `renderArtifact` writes for one artifact, as one string. */
function rendered(location, allowedQueryKeys = speechArtifact.allowedQueryKeys) {
  return probe
    .renderArtifact(
      speechArtifact,
      {
        url: speechArtifact.url,
        status: 302,
        failure: null,
        location: probe.describeLocation(location, allowedQueryKeys),
      },
      '2026-01-01T00:00:00.000Z',
    )
    .join('\n');
}

test('importing the probe performs no request', () => {
  assert.equal(fetchCalls, 0);
  assert.equal(typeof probe.describeLocation, 'function');
  assert.equal(typeof probe.renderArtifact, 'function');
  assert.equal(typeof probe.isEntryPoint, 'function');
  // The module was reached as an import, so the guard says so.
  assert.equal(probe.isEntryPoint(), false);
});

test('the probe still asks for one URL per artifact, all from the catalogue', () => {
  // Seven requests, six distinct artifacts: the two speech entries name one
  // file, and the six candidates are the same path with another filename.
  assert.equal(probe.ARTIFACTS.length, 7);
  const origins = new Set(probe.ARTIFACTS.map((artifact) => new URL(artifact.url).origin));
  assert.equal(origins.size, 1);
  for (const artifact of probe.ARTIFACTS) {
    assert.ok(Array.isArray(artifact.allowedQueryKeys));
    assert.equal(artifact.allowedQueryKeys.length, 10);
  }
});

test('the malformed fixture really is unparseable, so the case is not vacuous', () => {
  assert.throws(() => new URL(MALFORMED_LOCATION));
});

test('a Location that is not a URL is described without throwing', () => {
  const described = probe.describeLocation(MALFORMED_LOCATION, speechArtifact.allowedQueryKeys);
  assert.equal(described.unparseable, true);
  // The regression this pins: the renderer reads `.length` and `.map` off this
  // field, so a string sentinel here was a crash waiting for a relative
  // `Location`.
  assert.ok(Array.isArray(described.queryKeys));
  assert.deepEqual(described.queryKeys, []);
});

test('a malformed record renders with an explicit incomplete marker', () => {
  const text = rendered(MALFORMED_LOCATION);
  assert.match(text, /record incomplete/);
  // It must not claim a host was read, and it must not claim a rule fired.
  assert.match(text, /not determined/);
  assert.match(text, /rule 1: not applied/);
  assert.doesNotMatch(text, /\*\*passes\*\*/);
  assert.doesNotMatch(text, /stop condition 1, never an admission/);
});

test('a malformed record never writes a query value', () => {
  const text = rendered(MALFORMED_LOCATION);
  assert.ok(!text.includes(FABRICATED_VALUE), 'a query value reached the rendered record');
  assert.ok(!text.includes(FABRICATED_EXPIRES), 'a query value reached the rendered record');
  // The pair itself must be gone too, not merely the value it carried.
  assert.doesNotMatch(text, /Signature=/);
  assert.doesNotMatch(text, /Expires=/);
  // The raw line is still there, redacted — the record is incomplete, not
  // silent about what arrived.
  assert.match(text, /\?<redacted>/);
});

test('the malformed-name fixture really is parseable, so the case is not vacuous', () => {
  // The mirror image of the control above: this one must NOT throw, or the case
  // lands in the unparseable branch and proves nothing about a decoded name.
  let parsed;
  assert.doesNotThrow(() => {
    parsed = new URL(MALFORMED_QUERY_NAME_LOCATION);
  });
  assert.equal(parsed.search, `?${MALFORMED_QUERY_NAME}=${MALFORMED_QUERY_VALUE}`);
  // And the branch is genuinely reachable: decoding that name is what throws.
  assert.throws(() => decodeURIComponent(MALFORMED_QUERY_NAME), URIError);
});

test('a malformed query name is recorded undecoded rather than throwing a URIError', () => {
  const search = new URL(MALFORMED_QUERY_NAME_LOCATION).search;
  let names;
  assert.doesNotThrow(() => {
    names = probe.queryKeyNames(search);
  });
  assert.ok(Array.isArray(names));
  // Undecoded: an unreadable name is not a name that can be on an allow-list,
  // so it fails closed downstream instead of being turned into a readable one.
  assert.deepEqual(names, [MALFORMED_QUERY_NAME]);
  assert.ok(!names.some((name) => name !== MALFORMED_QUERY_NAME));
});

test('the parseable malformed-name Location is described, with exactly two verdicts', () => {
  let described;
  assert.doesNotThrow(() => {
    described = probe.describeLocation(MALFORMED_QUERY_NAME_LOCATION, speechArtifact.allowedQueryKeys);
  });
  assert.equal(described.unparseable, false);
  assert.deepEqual(described.queryKeys, [MALFORMED_QUERY_NAME]);
  // Exactly two: the scheme (the literal is not `https`) and the query key (the
  // malformed name is on no allowance). This codebase has no `host_not_allowed`
  // verdict — the host is the separate `domainRule` boolean, which is false
  // here, so three entries would mean the assertion invented a verdict.
  assert.equal(described.refusals.length, 2);
  assert.equal(described.refusals[0], '`scheme_not_https`');
  assert.ok(described.refusals[1].includes('query_key_not_allowed'));
  assert.ok(described.refusals[1].includes(MALFORMED_QUERY_NAME), 'the offending name must be visible');
  assert.ok(!JSON.stringify(described.refusals).includes('host_not_allowed'));
  assert.equal(described.domainRule, false);
});

test('a malformed query name is written to the record while its value is not', () => {
  const text = rendered(MALFORMED_QUERY_NAME_LOCATION);
  // The name is public vocabulary a plan editor has to be able to see, and it is
  // recorded undecoded.
  assert.match(text, /`%zz`/);
  assert.match(text, /query_key_not_allowed/);
  // The value is not, and neither is the pair that carried it.
  assert.ok(!text.includes(MALFORMED_QUERY_VALUE), 'a query value reached the rendered record');
  assert.doesNotMatch(text, /\?%zz=/);
  assert.match(text, /\?<redacted>/);
  // This is the diagnostic that replaces the crash, and it says the run is over
  // rather than silently reporting a clean artifact.
  assert.match(text, /rule 1 refusals triggered/);
});

test('a name on the artifact allowance is not a refusal', () => {
  const described = probe.describeLocation(
    withQuery(speechArtifact.url, ADMITTED_NAME, FABRICATED_VALUE),
    speechArtifact.allowedQueryKeys,
  );
  assert.equal(described.unparseable, false);
  assert.deepEqual(described.refusals, []);
  assert.deepEqual(described.queryKeys, [ADMITTED_NAME]);
  assert.match(
    rendered(withQuery(speechArtifact.url, ADMITTED_NAME, FABRICATED_VALUE)),
    /rule 1 refusals triggered: none/,
  );
});

test('a name outside the allowance is refused, and the name is in the message', () => {
  const location = withQuery(speechArtifact.url, UNADMITTED_NAME, FABRICATED_VALUE);
  const described = probe.describeLocation(location, speechArtifact.allowedQueryKeys);
  assert.equal(described.refusals.length, 1);
  assert.match(described.refusals[0], /query_key_not_allowed/);
  assert.ok(described.refusals[0].includes(UNADMITTED_NAME), 'the offending name must be visible');
  // The value is kept only in `raw`, which is what makes the redaction possible
  // at all, and it reaches no other field of the description.
  assert.ok(described.raw.includes(FABRICATED_VALUE));
  assert.ok(!JSON.stringify({ ...described, raw: '' }).includes(FABRICATED_VALUE));
  // Nor does it reach the written record.
  assert.ok(!rendered(location).includes(FABRICATED_VALUE));
});

test('a mixed query refuses only the name outside the allowance', () => {
  const url = new URL(withQuery(speechArtifact.url, ADMITTED_NAME, FABRICATED_VALUE));
  url.searchParams.set(UNADMITTED_NAME, FABRICATED_VALUE);
  const described = probe.describeLocation(url.href, speechArtifact.allowedQueryKeys);
  assert.equal(described.refusals.length, 1);
  assert.ok(described.refusals[0].includes(UNADMITTED_NAME));
  assert.ok(!described.refusals[0].includes(ADMITTED_NAME));
});

test('a row that admits no query refuses any query at all', () => {
  const described = probe.describeLocation(
    withQuery(speechArtifact.url, ADMITTED_NAME, FABRICATED_VALUE),
    [],
  );
  assert.deepEqual(described.refusals, ['`query_not_allowed`']);
  // The names are still recorded: a plan editor needs to see what arrived in
  // order to decide the row is right. Only the values stay redacted.
  assert.deepEqual(described.queryKeys, [ADMITTED_NAME]);
});

test('an absent query is not a query verdict at all', () => {
  const described = probe.describeLocation(speechArtifact.url, speechArtifact.allowedQueryKeys);
  assert.deepEqual(described.refusals, []);
  assert.deepEqual(described.queryKeys, []);
  assert.equal(described.query, 'absent');
});

test('the domain rule is a dot boundary, so a lookalike suffix is not admitted', () => {
  assert.equal(probe.passesDomainRule('us.aws.cdn.hf.co'), true);
  assert.equal(probe.passesDomainRule('hf.co'), true);
  assert.equal(probe.passesDomainRule('hf.co.attacker.invalid'), false);
  // Nothing this probe decided for a malformed `Location` counts as a pass.
  assert.equal(probe.passesDomainRule('not determined — the `Location` did not parse as a URL'), false);
});

test('redactQuery replaces a value and leaves a queryless string alone', () => {
  assert.equal(probe.redactQuery(`${speechArtifact.url}?a=secret`), `${speechArtifact.url}?<redacted>`);
  assert.equal(probe.redactQuery(speechArtifact.url), speechArtifact.url);
  assert.ok(!probe.redactQuery(MALFORMED_LOCATION).includes(FABRICATED_VALUE));
});

test('an unparseable Location contributes no host to the observed-hosts table', () => {
  // The table is a list of hosts that were actually read. A record that read no
  // host must not put a placeholder in it, or the table starts naming something
  // nobody observed and a stop condition looks as if it had fired.
  const text = probe.render(
    [
      {
        entry: speechArtifact,
        url: speechArtifact.url,
        status: 302,
        failure: null,
        location: probe.describeLocation(MALFORMED_LOCATION, speechArtifact.allowedQueryKeys),
      },
    ],
    '2026-01-01T00:00:00.000Z',
    'v24.19.0',
  );
  assert.match(text, /## Observed `Location` hosts\n\nNone\./);
  assert.match(text, /did not parse as a URL/);
  assert.match(text, /never a redirect host candidate/);
  assert.ok(!text.includes(FABRICATED_VALUE));
  assert.ok(!text.includes(FABRICATED_EXPIRES));
});
