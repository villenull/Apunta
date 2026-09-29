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
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import { fileURLToPath } from 'node:url';

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
 * P4.5. The evidence file is the oracle, and this read is installed **before**
 * the dynamic import below — the order is the whole point.
 *
 * `docs/v2/evidence/P4.1/redirects.md` is the record of record: a probe that is
 * imported instead of run would overwrite it with seven transport-failure
 * records, and the only sign would be a human noticing the file had changed,
 * because the file it used to be has already gone. Reading the bytes here, and
 * comparing them twice — once in a named case, once in the `after()` hook that
 * cannot be reordered or skipped — turns that into a failure this suite reports
 * about itself. Read-only: nothing in this file writes that path, and it is
 * resolved from the repository root the same way the probe resolves it.
 */
const EVIDENCE_PATH = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  'docs',
  'v2',
  'evidence',
  'P4.1',
  'redirects.md',
);

/** The committed bytes, as they were before a single line of this file ran. */
const EVIDENCE_BYTES = readFileSync(EVIDENCE_PATH);

/** The same file, read again, for the two comparisons above. */
function readEvidenceBytes() {
  return readFileSync(EVIDENCE_PATH);
}

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
  // The second of the two required comparisons, in a hook rather than in a case:
  // a case can be reordered or skipped, a hook cannot.
  assert.ok(
    EVIDENCE_BYTES.equals(readEvidenceBytes()),
    'the evidence file was overwritten while this suite ran',
  );
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

/* -------------------------------------------------------------------------
 * P4.5. Everything below this line was appended by card P4.5.
 *
 * Two changes sit *above* it and both are Fixed decision 2, nothing else: the
 * imports, the read of `docs/v2/evidence/P4.1/redirects.md` into a buffer, and
 * the second byte-equality assertion inside the `after()` hook that was already
 * here. No case above this line was edited, deleted or skipped, and the
 * file's own `redactQuery` case is restated below as case 3 rather than
 * replaced, because a case that changes meaning when a fix lands is a case that
 * cannot be trusted to catch the next one.
 *
 * Every value is fabricated (HS-8) and every URL is **derived** from the
 * catalogue's own pinned address at run time, or is a relative reference that
 * no URL parser accepts. This file is a `.test.mjs`, which the outbound-URL
 * rule's test-file exemption does not cover, so a vendor literal here is a
 * failure of V2 and not something to be worked around.
 * ---------------------------------------------------------------------- */

/** The one line of a rendered record that writes a `Location` raw. */
function rawLine(text) {
  const line = text.split('\n').find((candidate) => candidate.includes('query redacted:'));
  assert.ok(line !== undefined, 'the record wrote no redacted `Location` line');
  return line;
}

/** The one line of a rendered record that writes the query parameter names. */
function namesLine(text) {
  const line = text.split('\n').find((candidate) => candidate.includes('query key names'));
  assert.ok(line !== undefined, 'the record wrote no query key names line');
  return line;
}

/** The one line of a rendered record that writes the rule 1 refusals. */
function refusalsLine(text) {
  const line = text.split('\n').find((candidate) => candidate.includes('rule 1 refusals triggered'));
  assert.ok(line !== undefined, 'the record wrote no refusals line');
  return line;
}

/**
 * What a line's backticks actually enclose.
 *
 * Every code span in the record is one the record itself opened, so what falls
 * between an odd and an even backtick is always something the renderer meant to
 * quote. A header value that arrived carrying its own backticks shows up here as
 * a span the record never opened, which is the shape this helper exists to name.
 */
function codeSpans(line) {
  return line.split('`').filter((_, index) => index % 2 === 1);
}

test('the write precondition refuses in an import context', () => {
  // The export itself is the first assertion, and it is what makes this case
  // non-vacuous: a bare `assert.throws(fn)` would *pass* on the `TypeError` a
  // missing export throws, which is a green suite on a probe with no
  // precondition at all.
  assert.equal(typeof probe.assertMayWriteEvidence, 'function');
  assert.equal(probe.isEntryPoint(), false);
  assert.throws(
    () => probe.assertMayWriteEvidence(),
    (error) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /imported rather than run/);
      // The refusal names the file it refused to write, so a reader of the
      // failure is told which record is at stake rather than only that
      // something was refused.
      assert.ok(
        error.message.includes('docs/v2/evidence/P4.1/redirects.md'),
        'the refusal must name the evidence file it refused to write',
      );
      return true;
    },
  );
});

test('the evidence file is byte-identical before and after this suite', () => {
  // Read at module top, before the dynamic import; compared here, and again in
  // the `after()` hook. A run that let the probe write that file fails on one of
  // those two comparisons rather than in a human diff nobody was going to make.
  assert.ok(EVIDENCE_BYTES.length > 0, 'the committed evidence file read as empty');
  assert.ok(
    EVIDENCE_BYTES.equals(readEvidenceBytes()),
    'this suite changed the evidence file it was supposed to only read',
  );
});

test('a query is redacted and a query-less Location is left alone', () => {
  // Card P4.5 case 3, restating the case above at the head of this file rather
  // than replacing it: the ordinary shape must keep working, and a case that
  // silently changed meaning when `#` handling arrived could not tell the
  // difference between "still redacted" and "redacted somewhere else".
  assert.equal(probe.redactQuery(`${speechArtifact.url}?a=secret`), `${speechArtifact.url}?<redacted>`);
  assert.equal(probe.redactQuery(speechArtifact.url), speechArtifact.url);
  assert.ok(!probe.redactQuery(MALFORMED_LOCATION).includes(FABRICATED_VALUE));
});

/** A fragment carrying a fabricated token, on an otherwise ordinary `Location`. */
const FABRICATED_FRAGMENT_TOKEN = 'fabricated-fragment-token=1';
const FRAGMENT_LOCATION = `${speechArtifact.url}#${FABRICATED_FRAGMENT_TOKEN}`;

test('a fragment is redacted and never pasted', () => {
  const text = rendered(FRAGMENT_LOCATION);
  // Nothing of the fragment reaches the record: neither the fabricated token
  // nor the name on its own, which is what a reader would be left holding if
  // only the tail of the fragment had been cut.
  assert.ok(!text.includes(FABRICATED_FRAGMENT_TOKEN), 'a fragment token reached the record');
  assert.ok(!text.includes('fabricated-fragment-token'), 'a fragment name reached the record');
  // The line is there, redacted, and it ends at the fragment's first character.
  assert.ok(rawLine(text).endsWith('#<redacted>`'), rawLine(text));
  assert.equal(probe.redactQuery(FRAGMENT_LOCATION), `${speechArtifact.url}#<redacted>`);
  // And the refusal is still recorded beside it, so a reviewer can tell a
  // refused fragment from one nobody looked at.
  assert.match(text, /fragment: present — refused/);
  const described = probe.describeLocation(FRAGMENT_LOCATION, speechArtifact.allowedQueryKeys);
  assert.ok(described.refusals.includes('`fragment_present`'));
});

/**
 * A fragment that carries a query of its own: the shape `cards/P4.1.md` named
 * and today's `redactQuery` gets wrong, because the first `?` it finds is the
 * one *inside* the fragment and the slice therefore keeps the token in front of
 * it. Built by concatenation so no URL helper re-encodes the `#`.
 */
const FRAGMENT_THEN_QUERY_LOCATION = `${speechArtifact.url}/p#fabricated-fragment-token=1?fabricated-fragment-value`;

test('a fragment that looks like a query is redacted whole', () => {
  const text = rendered(FRAGMENT_THEN_QUERY_LOCATION);
  assert.ok(!text.includes('fabricated-fragment-token'), 'a fragment token reached the record');
  assert.ok(!text.includes('fabricated-fragment-value'), 'a fragment value reached the record');
  // The `#` is the first of the two delimiters in this string, so it is where
  // the truncation happens, and it is kept.
  assert.equal(probe.redactQuery(FRAGMENT_THEN_QUERY_LOCATION), `${speechArtifact.url}/p#<redacted>`);
  assert.ok(rawLine(text).endsWith('#<redacted>`'), rawLine(text));
  // The record is still a refusal, not a silent write.
  assert.match(text, /fragment: present — refused/);
});

/** Fabricated user-info, applied to the catalogue's own address. */
const FABRICATED_USER = 'fabricated-user';
const FABRICATED_PASSWORD = 'fabricated-password';
const USER_INFO_LOCATION = (() => {
  const url = new URL(speechArtifact.url);
  url.username = FABRICATED_USER;
  url.password = FABRICATED_PASSWORD;
  return url.href;
})();

test('user-info is redacted and the host still reads', () => {
  const text = rendered(USER_INFO_LOCATION);
  assert.ok(!text.includes(FABRICATED_USER), 'a user name reached the record');
  assert.ok(!text.includes(FABRICATED_PASSWORD), 'a password reached the record');
  // The host is kept, so the record still says which host answered — which is
  // the only reason the rest of this line is worth writing.
  const host = new URL(USER_INFO_LOCATION).hostname;
  assert.ok(text.includes(host), 'the observed host stopped being readable');
  assert.ok(text.includes('<redacted>@'), 'the user-info was not replaced');
  assert.equal(
    probe.redactQuery(USER_INFO_LOCATION),
    USER_INFO_LOCATION.replace(`${FABRICATED_USER}:${FABRICATED_PASSWORD}@`, '<redacted>@'),
  );
  // And the refusal is still recorded: removing the credential costs the record
  // nothing, because the refusal itself is its own field.
  assert.match(text, /user-info: present — refused/);
  const described = probe.describeLocation(USER_INFO_LOCATION, speechArtifact.allowedQueryKeys);
  assert.ok(described.refusals.includes('`user_info_present`'));
});

/**
 * A path component shaped exactly like a credential's token: 64 lowercase hex
 * characters, which is what both a content hash and half a bearer token look
 * like. It is fabricated, and it is here to be **preserved**.
 */
const FABRICATED_PATH_TOKEN = 'f0'.repeat(32);
const PATH_TOKEN_LOCATION = `${speechArtifact.url}/${FABRICATED_PATH_TOKEN}`;

test('a path segment is written as observed, deliberately', () => {
  // The pin for P4.5's fixed decision 6. A token embedded in a path is
  // generically indistinguishable from a CDN's own content-addressed path — the
  // committed record carries two 64-hex path components that are artifact
  // content — so no path is redacted, and inventing a "token-shaped" threshold
  // is exactly what HS-7 forbids. This case is what makes a later blanket
  // redaction a conscious change with its own evidence rather than a diff nobody
  // read.
  const text = rendered(PATH_TOKEN_LOCATION);
  assert.ok(text.includes(FABRICATED_PATH_TOKEN), 'the path was redacted, which is not authorised');
  assert.equal(probe.redactQuery(PATH_TOKEN_LOCATION), PATH_TOKEN_LOCATION);
  // It is written only because rule 1 admitted the `Location` outright: a path
  // is never read, judged, or shaped by the redaction rules, it is observed.
  const described = probe.describeLocation(PATH_TOKEN_LOCATION, speechArtifact.allowedQueryKeys);
  assert.deepEqual(described.refusals, []);
  assert.equal(described.domainRule, true);
});

/** A query name that decodes to a backtick on each side, and one to CR LF. */
const BACKTICK_NAME_LOCATION = `${speechArtifact.url}?%60fabricated-name%60=fabricated-backtick-value`;
const LINE_BREAK_NAME_LOCATION = `${speechArtifact.url}?%0d%0afabricated-line-break%0d%0a=fabricated-line-break-value`;

test('a name decoding to a markdown-active character is escaped, never dropped', () => {
  // The escape table itself, first: nothing outside it is touched, so a plan
  // editor still reads a name exactly as the origin spelled it.
  assert.equal(probe.escapeMarkdownInline('`'), '\\u0060');
  assert.equal(probe.escapeMarkdownInline('\r\n'), '\\u000d\\u000a');
  assert.equal(probe.escapeMarkdownInline('\\'), '\\u005c');
  assert.equal(probe.escapeMarkdownInline('|'), '\\u007c');
  assert.equal(probe.escapeMarkdownInline('\u007f'), '\\u007f');
  assert.equal(probe.escapeMarkdownInline('Expires'), 'Expires');
  // The name is still a name: decoded, unescaped, and refused by name, which is
  // where the decision to escape it has to stop.
  assert.deepEqual(
    probe.describeLocation(BACKTICK_NAME_LOCATION, speechArtifact.allowedQueryKeys).queryKeys,
    ['`fabricated-name`'],
  );

  const backticks = rendered(BACKTICK_NAME_LOCATION);
  assert.deepEqual(codeSpans(namesLine(backticks)), ['\\u0060fabricated-name\\u0060']);
  assert.ok(!backticks.includes('`fabricated-name`'), 'a raw backtick span reached the record');

  const lineBreaks = rendered(LINE_BREAK_NAME_LOCATION);
  assert.ok(!lineBreaks.includes('\r'), 'a raw carriage return reached the record');
  // A raw line break inside a name ends the line and starts another, so the
  // record grows lines it did not have. The comparison is against the same
  // record rendered with a name that carries none, which is what makes "a name
  // added a line" a statement about the name.
  const withoutLineBreaks = rendered(`${speechArtifact.url}?fabricated-line-break=${FABRICATED_VALUE}`);
  assert.equal(
    lineBreaks.split('\n').length,
    withoutLineBreaks.split('\n').length,
    'a name was split across lines',
  );
  assert.deepEqual(codeSpans(namesLine(lineBreaks)), ['\\u000d\\u000afabricated-line-break\\u000d\\u000a']);
});

/**
 * A query name that decodes to a backtick and a pipe, on a `Location` whose
 * **path** carries the same two characters.
 *
 * Both halves matter: the name reaches the two display sites that quote a name,
 * and the path reaches the `exact Location` line — the one site where what
 * survives redaction is written out, and therefore the only site a parseable
 * `Location` can carry an unescaped backtick into.
 */
const REFUSAL_ESCAPE_PATH = 'fabricated-`path`|';
const REFUSAL_ESCAPE_LOCATION = `${speechArtifact.url}/${REFUSAL_ESCAPE_PATH}?%60fabricated-refused%60%7C=fabricated-escape-value`;
const FABRICATED_ESCAPE_VALUE = 'fabricated-escape-value';

test('the refusal message and the redacted line escape what they quote', () => {
  const described = probe.describeLocation(REFUSAL_ESCAPE_LOCATION, speechArtifact.allowedQueryKeys);
  // Unescaped, byte for byte, because this is what the membership test runs on
  // and what a plan editor has to read before it can decide to add a name.
  assert.deepEqual(described.queryKeys, ['`fabricated-refused`|']);
  assert.equal(described.refusals.length, 1);

  const text = rendered(REFUSAL_ESCAPE_LOCATION);
  // Both name sites: the name in the refusal sentence, and the list beside it.
  // The backticks the renderer writes itself survive; the ones that arrived
  // inside the name do not.
  assert.deepEqual(codeSpans(refusalsLine(text)), [
    'query_key_not_allowed',
    '\\u0060fabricated-refused\\u0060\\u007c',
  ]);
  assert.deepEqual(codeSpans(namesLine(text)), ['\\u0060fabricated-refused\\u0060\\u007c']);
  // The third: the `exact Location` line, which writes the header value through
  // the redaction and then escapes what is left of it — the path, here. The
  // first span is the record's own word `Location` in the field label.
  assert.deepEqual(codeSpans(rawLine(text)), [
    'Location',
    `${speechArtifact.url}/fabricated-\\u0060path\\u0060\\u007c?<redacted>`,
  ]);
  assert.ok(!text.includes('`fabricated-refused`'), 'a raw code span reached the record');
  assert.ok(!text.includes(FABRICATED_ESCAPE_VALUE), 'a query value reached the record');
});

/** A query, then a fragment: the first delimiter in the string is the `?`. */
const QUERY_THEN_FRAGMENT_LOCATION = `${speechArtifact.url}/p?X-Fabricated=fabricated-query-value#fabricated-fragment=fabricated-fragment-value`;

test('a query then a fragment redacts at the `?`, and the query value never lands', () => {
  // The gate on the *other* rule: truncating at the first `#` whenever one exists
  // is not stricter, it is the opposite. It would keep this whole query — value
  // included — and paste it directly beneath a `query:` field whose own text
  // says the value was never pasted.
  const text = rendered(QUERY_THEN_FRAGMENT_LOCATION);
  assert.equal(probe.redactQuery(QUERY_THEN_FRAGMENT_LOCATION), `${speechArtifact.url}/p?<redacted>`);
  assert.ok(rawLine(text).endsWith('?<redacted>`'), rawLine(text));
  assert.ok(!text.includes('fabricated-query-value'), 'a query value reached the record');
  assert.ok(!text.includes('fabricated-fragment-value'), 'a fragment value reached the record');
  // Both facts are still recorded in their own fields, so nothing that the raw
  // line used to be the only copy of is lost by truncating early.
  assert.match(text, /query: present — `<redacted>`, never pasted/);
  const described = probe.describeLocation(QUERY_THEN_FRAGMENT_LOCATION, speechArtifact.allowedQueryKeys);
  assert.ok(described.refusals.includes('`fragment_present`'));
  assert.ok(
    described.refusals.some((refusal) => refusal.includes('query_key_not_allowed')),
    'the unadmitted parameter name was not refused by name',
  );
  assert.match(text, /fragment: present — refused/);
});

/**
 * A **relative** `Location`, which `new URL()` rejects without a base, carrying
 * a backtick and a CR LF in the part that survives redaction. It is the one
 * display site with no URL parse anywhere in front of it: the header value goes
 * straight into the record.
 */
const UNPARSEABLE_ESCAPE_LOCATION = '/relative/fabricated-`bin`\r\n?fabricated-parameter=fabricated-value';

test("the unparseable branch's raw line escapes what it quotes", () => {
  assert.throws(() => new URL(UNPARSEABLE_ESCAPE_LOCATION));
  const text = rendered(UNPARSEABLE_ESCAPE_LOCATION);
  assert.ok(!text.includes('\r'), 'a raw carriage return reached the record');
  assert.ok(!text.includes(FABRICATED_VALUE), 'a query value reached the record');
  // The first of the two delimiters here is the `?`, so the truncation happens
  // there — and the backtick and the line break in front of it are escaped
  // rather than written, because they are inside the value the code span quotes.
  assert.deepEqual(codeSpans(rawLine(text)), [
    '/relative/fabricated-\\u0060bin\\u0060\\u000d\\u000a?<redacted>',
  ]);
  assert.match(text, /raw, query redacted: /);
  // Everything that made this branch honest in the first place is still there.
  assert.match(text, /record incomplete:/);
  assert.match(text, /not determined/);
  assert.match(text, /query key names \(values never read\): not determined/);
  assert.match(text, /rule 1: not applied/);
});
