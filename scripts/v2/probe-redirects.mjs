#!/usr/bin/env node
/**
 * P4.1 step 1: find out where the pinned model URLs actually redirect, before
 * anything in the catalogue is allowed to follow one.
 *
 * This is the only source of the approved redirect hosts, so it runs first and
 * it runs on its own. A `HEAD` with `redirect: 'manual'` answers with the
 * `Location` without this script having to follow it, so one request per
 * artifact is enough to see the whole redirect and follow none of it. No
 * response body is read, no byte is downloaded, no credential is sent, no query
 * string is added, and no host is contacted that the catalogue does not already
 * name.
 *
 * Two things are deliberate about how it is written:
 *
 *  - **It holds no URL literal.** Every URL it requests is read out of the
 *    built catalogue (`installer/dist/catalog.js`), and the C-STT candidate
 *    paths are built by substituting a filename into the pinned speech URL's
 *    own path. That is why `eslint.config.js` needs no exemption for this file
 *    and the one exemption it already has stays exactly one. Assembling a URL
 *    out of fragments to slip past the lint selector would be loosening a
 *    guard, not satisfying it.
 *  - **It sanitises by construction.** No `os.hostname()`, no login name, no
 *    home or sandbox path reaches the file. The only paths in the output are
 *    the repository-relative evidence path and the catalogue's own public URLs,
 *    and a query string's **values** are never written: the file carries
 *    `<redacted>` in their place plus the parameter *names*, which are public
 *    vocabulary that an allow-list has to name anyway.
 *  - **Importing it requests nothing.** The descriptive helpers are pure and
 *    exported for the offline regression, so the network call lives behind an
 *    entry-point guard. A top-level `await main()` would turn every import into
 *    a run, and the regression could not then assert the one property the guard
 *    exists for.
 *
 * It writes `docs/v2/evidence/P4.1/redirects.md` itself. A hand-transcribed
 * version of that file would be worth nothing, because the run is the evidence.
 */

import { realpathSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { A07_ALLOWED_QUERY_KEYS, PREVIEW_SPEECH_MODEL, SPEECH_MODEL } from '../../installer/dist/catalog.js';

/**
 * The six C-STT candidates (`docs/v2/CONTRACTS.md`), as filenames.
 *
 * They are not catalogue entries — S4a.2 chooses one of them — so they are
 * named here as bare filenames and turned into URLs by substitution, never
 * written out as addresses.
 */
const C_STT_CANDIDATES = [
  'ggml-base.bin',
  'ggml-base-q5_1.bin',
  'ggml-small.bin',
  'ggml-small-q5_1.bin',
  'ggml-large-v3-turbo-q5_0.bin',
  'ggml-large-v3-turbo-q8_0.bin',
];

/** A07's "only Hugging Face CDN hosts", in the mechanical form rule 1 tests. */
const CDN_DOMAIN_SUFFIXES = ['huggingface.co', 'hf.co'];

const REQUEST_TIMEOUT_MS = 30_000;

/** What §1's size and SHA-256 fields say when no bytes were acquired. */
const NOT_ACQUIRED = 'not acquired — HEAD only, no bytes';

/**
 * What every derived field reads when the `Location` did not parse at all.
 *
 * A `Location` need not be an absolute URL — a relative reference is legal and
 * Node hands the header value back exactly as the origin sent it — so this
 * outcome is reachable, and it has to be readable. "Unparseable" is not a
 * finding: nothing was learned about the host, so no field is guessed and no
 * rule is claimed to have fired.
 */
const UNDETERMINED = 'not determined — the `Location` did not parse as a URL';

/** The one refusal-shaped sentence an unparseable `Location` produces. */
const UNDETERMINED_REASON =
  'the `Location` could not be parsed as a URL, so rule 1 could not be applied to it at all';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const evidencePath = join(repoRoot, 'docs', 'v2', 'evidence', 'P4.1', 'redirects.md');

/*
 * The two speech entries are probed as one request, which is only true while
 * they name the same file. If the catalogue ever splits them this probe would
 * be under-collecting, so it says so rather than quietly reporting one artifact
 * where the catalogue has two.
 */
if (PREVIEW_SPEECH_MODEL.url !== SPEECH_MODEL.url) {
  throw new Error(
    'the two speech catalogue entries no longer name the same file, so one request cannot stand for both',
  );
}

/** One candidate's URL: the pinned speech URL with the filename swapped in. */
function candidateUrl(filename) {
  const url = new URL(SPEECH_MODEL.url);
  url.pathname = url.pathname.replace(/[^/]+$/, filename);
  return url.href;
}

/**
 * What gets requested: the one pinned speech file, recorded under both entry
 * names because `catalog.test.ts` pins the two entries equal, plus the six
 * candidates. Seven requests, seven URLs, and no host that is not the pinned
 * one.
 */
export const ARTIFACTS = [
  {
    key: 'speech',
    filename: SPEECH_MODEL.filename,
    entries: '`SPEECH_MODEL` and `PREVIEW_SPEECH_MODEL`',
    attribution:
      'The two catalogue entries name literally the same file (`catalog.test.ts` pins them equal), so this is **one** request recorded under both entry names.',
    url: SPEECH_MODEL.url,
    allowedQueryKeys: SPEECH_MODEL.allowedQueryKeys,
    licence: SPEECH_MODEL.licence,
    licenceNote: 'Read from the catalogue entry itself.',
  },
  ...C_STT_CANDIDATES.map((filename) => ({
    key: `c-stt-${filename}`,
    filename,
    entries: '_no catalogue entry yet — S4a.2 chooses one of the six_',
    attribution:
      'A C-STT candidate. Its URL is the pinned speech URL with this filename substituted into the path, so it is the same host and the same repository as the pinned entry.',
    url: candidateUrl(filename),
    // The manifest row that covers a candidate is A07, so the candidate's
    // allowance is A07's enumerated names. Read out of the catalogue rather
    // than written here: this probe names no host and no query name of its own.
    allowedQueryKeys: A07_ALLOWED_QUERY_KEYS,
    licence: SPEECH_MODEL.licence,
    licenceNote:
      'Inherited from the pinned entry: same publisher and same repository, not a separate read of this artifact’s terms.',
  })),
];

/**
 * One `HEAD`, redirect never followed.
 *
 * The `Location` is read off the response and handed back unfollowed. A
 * transport failure is recorded as itself rather than retried anywhere: the
 * grant covers these seven requests, not a second attempt against a host that
 * might answer.
 */
async function head(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'HEAD',
      redirect: 'manual',
      signal: controller.signal,
    });
    return { status: response.status, location: response.headers.get('location'), failure: null };
  } catch (error) {
    return { status: null, location: null, failure: describeTransportFailure(error) };
  } finally {
    clearTimeout(timer);
  }
}

/** A transport failure, named without a path, a host or a login. */
function describeTransportFailure(error) {
  if (!(error instanceof Error)) return 'unknown transport failure';
  const code = (error.cause instanceof Error ? error.cause.code : undefined) ?? error.name;
  return `no HTTP response — transport failure (${String(code)})`;
}

/** Does a host end in one of the CDN domains, on a dot boundary? */
export function passesDomainRule(host) {
  const lower = host.toLowerCase();
  return CDN_DOMAIN_SUFFIXES.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`));
}

/**
 * One parameter name, decoded — or left exactly as it arrived.
 *
 * `decodeURIComponent` throws a `URIError` on a malformed percent escape, and a
 * `Location` is whatever the origin sent. One that parses as a URL but carries
 * `%zz` in a name would take an unguarded decode straight out of `main()`, kill
 * the run *before* the evidence file is written, and leave the previous run's
 * `redirects.md` on disk where it reads as this one's — a stale record that
 * looks like a finding. An unreadable name is not a name that can be on an
 * allow-list, so leaving it undecoded fails closed downstream, which is exactly
 * what `queryParameterNames` in `installer/src/readiness.ts` already does for
 * the shipped guard.
 */
function decodeQueryName(name) {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/**
 * The sorted, de-duplicated **names** of a query string's parameters. A value
 * is never returned, so nothing signed can leak through this function; a
 * parameter with no `=` still contributes its name, because that is exactly
 * the case where a name alone is the whole of what an allow-list must name.
 */
export function queryKeyNames(search) {
  if (search === '') return [];
  return [
    ...new Set(
      search
        .replace(/^\?/, '')
        .split('&')
        .filter((pair) => pair !== '')
        .map((pair) => decodeQueryName(pair.split('=')[0] ?? pair)),
    ),
  ].sort();
}

/**
 * Everything rule 1 checks about a `Location`, recorded per hop.
 *
 * `allowedQueryKeys` is the artifact's own exact-name allowance, read out of
 * the catalogue for the artifact this `Location` came from, so the query
 * verdict is the one the downloader would actually reach rather than a flat
 * refusal of every query: a row that admits no query at all refuses any query
 * (`query_not_allowed`), a row that enumerates names refuses only a name
 * outside that list (`query_key_not_allowed`, with the offending name written
 * out, because a name is public vocabulary and the plan editor has to be able
 * to see which one would have to be added), and a name on the list triggers
 * nothing at all. Membership is exact — never a prefix, a wildcard or a blanket
 * permission — and it is decided from names alone: no value is read, compared
 * or written.
 */
export function describeLocation(raw, allowedQueryKeys = []) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      unparseable: true,
      raw,
      host: UNDETERMINED,
      scheme: UNDETERMINED,
      port: UNDETERMINED,
      query: UNDETERMINED,
      // An array in every branch, always. The renderer reads `.length` and
      // `.map` off this field whichever outcome it is in, so a bare string
      // sentinel here is what used to throw the moment a relative `Location`
      // arrived — a crash in the one branch that must never crash.
      queryKeys: [],
      userInfo: UNDETERMINED,
      fragment: UNDETERMINED,
      refusals: [UNDETERMINED_REASON],
      domainRule: false,
    };
  }
  const refusals = [];
  if (parsed.protocol !== 'https:') refusals.push('`scheme_not_https`');
  if (parsed.port !== '' && parsed.port !== '443') refusals.push('`port_not_allowed`');
  if (parsed.username !== '' || parsed.password !== '') refusals.push('`user_info_present`');
  if (parsed.hash !== '') refusals.push('`fragment_present`');
  if (parsed.search !== '') {
    if (allowedQueryKeys.length === 0) {
      refusals.push('`query_not_allowed`');
    } else {
      for (const name of queryKeyNames(parsed.search)) {
        if (allowedQueryKeys.includes(name)) continue;
        refusals.push(`\`query_key_not_allowed\` — \`${escapeMarkdownInline(name)}\``);
      }
    }
  }
  return {
    unparseable: false,
    raw,
    host: parsed.hostname,
    scheme: parsed.protocol,
    // An explicit `:443` is normalised away by URL parsing and is the scheme's
    // default, so "absent" here means 443 either way.
    port: parsed.port === '' ? "absent (the scheme's default, 443)" : parsed.port,
    query: parsed.search === '' ? 'absent' : 'present — `<redacted>`, never pasted',
    // Key names only, never a value. The names are what a plan editor needs to
    // write an enumerated allow-list; a value is a signed-URL secret and is
    // never written, here or anywhere.
    queryKeys: queryKeyNames(parsed.search),
    userInfo: parsed.username === '' && parsed.password === '' ? 'absent' : 'present — refused',
    fragment: parsed.hash === '' ? 'absent' : 'present — refused',
    refusals,
    domainRule: passesDomainRule(parsed.hostname),
  };
}

/**
 * A value as it is about to be written into a code span, with every character
 * markdown acts on replaced by a visible escape.
 *
 * A query parameter's *name* is a header value: the origin chose it, and this
 * script has read it, percent-decoded it, and is about to write it into a
 * record a human reads as prose. A name carrying a backtick opens a code span
 * the record's own quoting never closes; a name carrying CR LF ends the line and
 * can make the record read as though a line finished there; a name carrying a
 * backslash or a vertical bar survives a table or an escape. A name is **not**
 * dropped and **not** truncated: it is escaped, so a plan editor still reads
 * every character of a name an allow-list might have to gain.
 *
 * This is a display concern only. The membership test in `describeLocation` and
 * the array it returns are untouched by it — a name is escaped when it is shown,
 * never when it is decided on — so no verdict and no allowance can move.
 *
 * The set is walked rather than written as a character class: a regular
 * expression naming C0 is `no-control-regex`, and the alternative to disabling
 * that rule for this file is a set that says the same thing without a pattern.
 * Every code point below 0x20 is a C0 control, so the two spellings of "C0"
 * cannot drift apart.
 */
const MARKDOWN_ESCAPED_CODE_POINTS = new Set([
  0x60, // U+0060 backtick: opens a code span the record's own quoting never closes
  0x5c, // U+005C backslash: escapes whatever follows it
  0x7c, // U+007C vertical bar: escapes into a table cell
]);

export function escapeMarkdownInline(value) {
  let escaped = '';
  for (const character of value) {
    const code = character.codePointAt(0);
    const markdownActive = code < 0x20 || code === 0x7f || MARKDOWN_ESCAPED_CODE_POINTS.has(code);
    escaped += markdownActive ? `\\u${code.toString(16).padStart(4, '0')}` : character;
  }
  return escaped;
}

/**
 * The `Location` as observed, with any query string replaced, never pasted.
 *
 * **Position, not precedence.** The string is truncated at whichever of `?` and
 * `#` occurs **first**, and that delimiter is kept, so `…?a=1#f=2` and
 * `…#f=2?a=1` both lose everything from the earlier of the two onward. The rule
 * is not "prefer the fragment": truncating at the first `#` whenever one exists
 * is the *opposite* of stricter, because on a query-then-fragment `Location` it
 * keeps the whole query — values included — and pastes it directly beneath a
 * `query:` field whose own text says the value was never pasted.
 *
 * The first of the two is where the unverifiable tail of the value begins, so
 * everything from it onward goes, whichever one it is. A string with neither
 * delimiter comes back unchanged. The record does not depend on the raw line for
 * the rest of what it knows: `query:`, `fragment:` and the `fragment_present`
 * refusal are separate fields, so the raw line is the convenience copy and not
 * the only copy.
 */
export function redactQuery(raw) {
  const query = raw.indexOf('?');
  const fragment = raw.indexOf('#');
  let mark = -1;
  if (query !== -1) mark = query;
  if (fragment !== -1 && (mark === -1 || fragment < mark)) mark = fragment;
  return redactUserInfo(mark === -1 ? raw : `${raw.slice(0, mark)}${raw[mark]}<redacted>`);
}

/**
 * The authority's user-info, gone, and the host still readable.
 *
 * An authority of `user:pass@host` is a credential by definition, and this
 * function has no way to tell a real one from a redacted one, so it writes
 * `<redacted>@host` — everything before the last `@` of the authority
 * replaced, the `@` kept, the host and path untouched. Removing it costs
 * nothing: the record already carries `user-info: present — refused` and the
 * `user_info_present` refusal as their own fields, so a reviewer can tell a
 * refused `Location` from one that was never checked.
 *
 * Only a string that actually has an authority is touched: an absolute URL
 * (`scheme://…`) or a protocol-relative one (`//…`). A relative reference has
 * no authority, and an `@` in its first path segment is a path character, not a
 * credential.
 */
function redactUserInfo(raw) {
  const scheme = raw.indexOf('://');
  const protocolRelative = scheme === -1 && raw.startsWith('//');
  if (scheme === -1 && !protocolRelative) return raw;
  const authorityStart = scheme === -1 ? 2 : scheme + 3;
  let authorityEnd = raw.length;
  for (const delimiter of ['/', '?', '#']) {
    const at = raw.indexOf(delimiter, authorityStart);
    if (at !== -1 && at < authorityEnd) authorityEnd = at;
  }
  const at = raw.lastIndexOf('@', authorityEnd);
  if (at < authorityStart) return raw;
  return `${raw.slice(0, authorityStart)}<redacted>@${raw.slice(at + 1)}`;
}

export function renderArtifact(artifact, observation, when) {
  const lines = [];
  lines.push(`### \`${artifact.filename}\``, '');
  lines.push(`- **Catalogue entries:** ${artifact.entries}`);
  lines.push(`- **Attribution:** ${artifact.attribution}`);
  lines.push("- **Method:** `HEAD`, `redirect: 'manual'` — the `Location` is read and never requested");
  lines.push(`- **Request URL:** \`${observation.url}\``);
  lines.push(
    observation.failure === null
      ? `- **Response status:** \`${String(observation.status)}\``
      : `- **Response status:** _none_ — ${observation.failure}`,
  );
  lines.push('- **Hops followed:** 0 — a `HEAD` is the whole of this probe and no `Location` was requested');
  lines.push(`- **Date (UTC):** ${when}`);

  if (observation.location === null) {
    lines.push(
      '- **`Location`:** none — the response carried no redirect, so this artifact needs no redirect host',
    );
  } else {
    const location = observation.location;
    lines.push('- **`Location` observed (would be hop 1; never requested):**', '');
    if (location.unparseable) {
      // The one branch that used to write the raw header verbatim, reachable
      // with exactly the input that matters most: a legal relative reference
      // carrying a signed query. It is redacted here as the parseable branch
      // is, and it says outright that the record is incomplete, so a reviewer
      // can tell "the vendor sent something I could not describe" from "there
      // was nothing to describe".
      lines.push(
        '  - **record incomplete:** the `Location` did not parse as a URL. Every field below is `not determined`, rule 1 was not applied, and no host here is a candidate for any allowance. This is not a finding.',
      );
      lines.push(`  - raw, query redacted: \`${escapeMarkdownInline(redactQuery(location.raw))}\``);
    }
    lines.push(`  - host: \`${location.host}\``);
    lines.push(`  - scheme: \`${location.scheme}\``);
    lines.push(`  - port: ${location.port}`);
    lines.push(`  - query: ${location.query}`);
    lines.push(
      `  - query key names (values never read): ${
        location.unparseable
          ? 'not determined — nothing parsed, so no parameter name was read'
          : location.queryKeys.length === 0
            ? location.query === 'absent'
              ? 'none — the query is absent'
              : 'none — the query has no parameter name'
            : location.queryKeys.map((name) => `\`${escapeMarkdownInline(name)}\``).join(', ')
      }`,
    );
    lines.push(`  - user-info: ${location.userInfo}`);
    lines.push(`  - fragment: ${location.fragment}`);
    lines.push(
      `  - attributable to this artifact alone: yes — this is the \`Location\` this artifact's own request returned`,
    );
    lines.push(
      location.unparseable
        ? "  - A07's domain rule (`huggingface.co` or `hf.co` on a dot boundary): not determined — no host was read, so the rule was not applied and stop condition 1 was not reached"
        : `  - A07's domain rule (\`huggingface.co\` or \`hf.co\` on a dot boundary): ${location.domainRule ? '**passes**' : '**fails** — stop condition 1, never an admission'}`,
    );
    lines.push(
      location.unparseable
        ? `  - rule 1: not applied — ${location.refusals.join(', ')}`
        : location.refusals.length === 0
          ? '  - rule 1 refusals triggered: none'
          : `  - rule 1 refusals triggered: ${location.refusals.join(', ')}`,
    );
    lines.push(
      `  - exact \`Location\`, query redacted: \`${escapeMarkdownInline(redactQuery(location.raw))}\``,
    );
  }

  lines.push('- **Acquisition (`docs/v2/ACQUISITION.md` §1 fields):**', '');
  lines.push(`  - exact version/revision: ${NOT_ACQUIRED}`);
  lines.push(`  - URL: \`${observation.url}\``);
  lines.push(`  - size: ${NOT_ACQUIRED}`);
  lines.push('  - SHA-256: not computed — HEAD only, no bytes');
  lines.push(
    `  - licence evidence: ${artifact.licence.name} — ${artifact.licence.url} (\`verified: ${String(artifact.licence.verified)}\`); ${artifact.licenceNote}`,
  );
  lines.push(`  - date: ${when}`);
  lines.push('');
  return lines;
}

export function render(observations, when, nodeVersion) {
  // A `Location` that did not parse yielded no host, so it contributes no row:
  // the table is a list of hosts that were actually read, and putting a
  // placeholder in it would name something nobody observed.
  const incomplete = observations.filter(
    (observation) => observation.location !== null && observation.location.unparseable,
  );
  const observedHosts = [];
  for (const observation of observations) {
    if (observation.location !== null && !observation.location.unparseable) {
      const host = observation.location.host;
      if (!observedHosts.includes(host)) observedHosts.push(host);
    }
  }

  const lines = [];
  lines.push('# P4.1 — redirect probe, one `HEAD` per pinned artifact');
  lines.push('');
  lines.push('Written by `scripts/v2/probe-redirects.mjs`, which read every URL out of the built catalogue');
  lines.push('(`installer/dist/catalog.js`) and held no URL literal of its own. This file is the run.');
  lines.push('');
  lines.push('## The run');
  lines.push('');
  lines.push(`- **Date (UTC):** ${when}`);
  lines.push(`- **Node:** ${nodeVersion}`);
  lines.push(`- **Requests:** ${String(observations.length)} — one \`HEAD\` each, \`redirect: 'manual'\``);
  lines.push('- **Hops followed:** 0 in total — no `Location` was ever requested');
  lines.push(
    '- **Bytes acquired:** none. No response body was read, nothing was downloaded, no model was pulled, no Ollama daemon was contacted.',
  );
  lines.push(
    '- **Credentials:** none. No cookie jar, no `Authorization`, no query of its own, no fragment, no custom header. Whatever `User-Agent` Node sends was left alone.',
  );
  lines.push("- **Host names below are the artefact's content**, recorded as observed, the way");
  lines.push('  `docs/v2/evidence/P1.5/licence-evidence.md` records a public vendor URL.');
  lines.push('');

  lines.push('## Observed `Location` hosts');
  lines.push('');
  if (observedHosts.length === 0) {
    lines.push('None. No artifact in this run answered with a redirect, so no redirect host is a');
    lines.push('candidate for any allowance, and the lists in `catalog.ts` stay empty. An empty list is');
    lines.push('the correct answer here, not a gap in the run.');
  } else {
    lines.push('| host | artifacts that returned it | A07 domain rule |');
    lines.push('| --- | --- | --- |');
    for (const host of observedHosts) {
      const names = observations
        .filter((observation) => observation.location !== null && observation.location.host === host)
        .map((observation) => `\`${observation.entry.filename}\``);
      const verdict = passesDomainRule(host) ? 'passes' : '**fails**';
      lines.push(`| \`${host}\` | ${names.join(', ')} | ${verdict} |`);
    }
  }
  if (incomplete.length > 0) {
    lines.push('');
    lines.push(
      `${String(incomplete.length)} of ${String(observations.length)} artifacts returned a \`Location\` that ` +
        'did not parse as a URL, so no host was read from ' +
        `${incomplete.length === 1 ? 'it' : 'them'} and ${incomplete.length === 1 ? 'it is' : 'they are'} ` +
        'absent from the table above by design. Each is marked **record incomplete** in its own section, ' +
        'with its raw value redacted. An unparseable `Location` is never a redirect host candidate and never ' +
        'reaches an allowance.',
    );
  }
  lines.push('');

  lines.push('## Per artifact');
  lines.push('');
  for (const observation of observations) {
    lines.push(...renderArtifact(observation.entry, observation, when));
  }

  lines.push('## What a reader may conclude');
  lines.push('');
  lines.push('- The redirect host set is exactly the table above, and it is a candidate list only:');
  lines.push("  `docs/v2/ACQUISITION.md` A07's redirect cell is a placeholder this card fills by");
  lines.push('  observation, and the coordinator replaces that cell through the plan editor before');
  lines.push('  S4a.2 is unblocked. Until it is, nothing observed here is claimed approved.');
  lines.push('- No size and no SHA-256 appear in this file because none was computed. A `HEAD` returns');
  lines.push("  headers, not bytes; §1's fields are recorded as such rather than left blank.");
  lines.push('');
  return `${lines.join('\n')}\n`;
}

async function main() {
  // The first statement, before the loop and therefore before every `fetch` and
  // before the single `writeFile` at the bottom of this function. See
  // `assertMayWriteEvidence` for why the check lives here and not only in the
  // offline suite.
  assertMayWriteEvidence();

  const when = new Date().toISOString();
  const observations = [];
  let transportFailures = 0;

  for (const entry of ARTIFACTS) {
    process.stderr.write(`HEAD ${entry.url}\n`);
    const result = await head(entry.url);
    if (result.failure !== null) transportFailures += 1;
    observations.push({
      entry,
      url: entry.url,
      status: result.status,
      failure: result.failure,
      location: result.location === null ? null : describeLocation(result.location, entry.allowedQueryKeys),
    });
  }

  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, render(observations, when, process.version), 'utf8');

  const hosts = new Set(
    observations
      .filter((observation) => observation.location !== null && !observation.location.unparseable)
      .map((observation) => observation.location.host),
  );
  process.stderr.write(
    `\nwrote ${observations.length} artifacts to docs/v2/evidence/P4.1/redirects.md\n` +
      `redirect hosts observed: ${hosts.size === 0 ? 'none' : [...hosts].join(', ')}\n` +
      `transport failures: ${String(transportFailures)}\n`,
  );

  // A file that records a transport failure is still the honest record of the
  // run, but the run did not observe what it was sent to observe, and V2's row
  // expects exit 0. Say so with the exit code.
  process.exitCode = transportFailures === 0 ? 0 : 1;
}

/**
 * Was this file *run*, rather than imported?
 *
 * The helpers above are pure and are exported so the offline regression can
 * reach them without a network, which is only true if importing this module
 * does not run the probe. A bare top-level `await main()` would make every
 * import seven `HEAD` requests against the card's egress grant, so the network
 * call lives behind this guard — and the regression asserts the guard by
 * importing the module with a `fetch` that throws if it is touched.
 */
export function isEntryPoint() {
  const invoked = process.argv[1];
  if (invoked === undefined) return false;
  const self = fileURLToPath(import.meta.url);
  if (resolve(invoked) === self) return true;
  // A symlinked checkout, a `.mjs` reached through a loader, a different but
  // equivalent spelling of the same file: none of those may silently skip the
  // run the card's V2 row depends on.
  try {
    return realpathSync(resolve(invoked)) === realpathSync(self);
  } catch {
    return false;
  }
}

/**
 * May this process write `docs/v2/evidence/P4.1/redirects.md` at all?
 *
 * The entry-point guard on the last line of this file is the only thing between
 * an *import* and seven `HEAD`s plus an overwrite of the record of record, and
 * a guard that lives only there cannot be regressed without the regression being
 * noticed *after* the write it was supposed to prevent: the offline suite would
 * go red on a file that has already been replaced, and the replacement is
 * invisible in a diff of the evidence because the file it was diffed against is
 * gone. So the same question is asked again, here, as `main()`'s first
 * statement — before the loop, before the first `fetch`, before the `mkdir` and
 * the `writeFile`. A regressed guard now makes an import *refuse* on its first
 * statement, so the regression is harmless first and detected second, in that
 * order.
 *
 * The throw is deliberate and must stay one: a silent `return` would make the
 * regression invisible again, which is the exact failure this exists to close.
 * Nothing is written and nothing is requested on the way out.
 *
 * @returns `undefined` when the probe was run.
 * @throws `Error` when the module was imported rather than run.
 */
export function assertMayWriteEvidence() {
  if (isEntryPoint()) return undefined;
  throw new Error(
    'the probe was imported rather than run, so it refused to write ' +
      'docs/v2/evidence/P4.1/redirects.md: run `node scripts/v2/probe-redirects.mjs` ' +
      'to record a run, and never import it from anything that expects it to have run',
  );
}

if (isEntryPoint()) await main();
