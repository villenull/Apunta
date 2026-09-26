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
 *
 * It writes `docs/v2/evidence/P4.1/redirects.md` itself. A hand-transcribed
 * version of that file would be worth nothing, because the run is the evidence.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PREVIEW_SPEECH_MODEL, SPEECH_MODEL } from '../../installer/dist/catalog.js';

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
const ARTIFACTS = [
  {
    key: 'speech',
    filename: SPEECH_MODEL.filename,
    entries: '`SPEECH_MODEL` and `PREVIEW_SPEECH_MODEL`',
    attribution:
      'The two catalogue entries name literally the same file (`catalog.test.ts` pins them equal), so this is **one** request recorded under both entry names.',
    url: SPEECH_MODEL.url,
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
function passesDomainRule(host) {
  const lower = host.toLowerCase();
  return CDN_DOMAIN_SUFFIXES.some((suffix) => lower === suffix || lower.endsWith(`.${suffix}`));
}

/**
 * The sorted, de-duplicated **names** of a query string's parameters. A value
 * is never returned, so nothing signed can leak through this function; a
 * parameter with no `=` still contributes its name, because that is exactly
 * the case where a name alone is the whole of what an allow-list must name.
 */
function queryKeyNames(search) {
  if (search === '') return [];
  return [
    ...new Set(
      search
        .replace(/^\?/, '')
        .split('&')
        .filter((pair) => pair !== '')
        .map((pair) => decodeURIComponent(pair.split('=')[0] ?? pair)),
    ),
  ].sort();
}

/** Everything rule 1 checks about a `Location`, recorded per hop. */
function describeLocation(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return {
      unparseable: true,
      raw,
      host: '(unparseable)',
      scheme: '(unparseable)',
      port: '(unparseable)',
      query: '(unparseable)',
      queryKeys: '(unparseable)',
      userInfo: '(unparseable)',
      fragment: '(unparseable)',
      refusals: ['the Location could not be parsed as a URL at all'],
      domainRule: false,
    };
  }
  const refusals = [];
  if (parsed.protocol !== 'https:') refusals.push('`scheme_not_https`');
  if (parsed.port !== '' && parsed.port !== '443') refusals.push('`port_not_allowed`');
  if (parsed.username !== '' || parsed.password !== '') refusals.push('`user_info_present`');
  if (parsed.hash !== '') refusals.push('`fragment_present`');
  if (parsed.search !== '') refusals.push('`query_not_allowed`');
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

/** The `Location` as observed, with any query string replaced, never pasted. */
function redactQuery(raw) {
  const mark = raw.indexOf('?');
  return mark === -1 ? raw : `${raw.slice(0, mark)}?<redacted>`;
}

function renderArtifact(artifact, observation, when) {
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
      lines.push(`  - raw: \`${location.raw}\``);
    }
    lines.push(`  - host: \`${location.host}\``);
    lines.push(`  - scheme: \`${location.scheme}\``);
    lines.push(`  - port: ${location.port}`);
    lines.push(`  - query: ${location.query}`);
    lines.push(
      `  - query key names (values never read): ${
        location.queryKeys.length === 0
          ? location.query === 'absent'
            ? 'none — the query is absent'
            : 'none — the query has no parameter name'
          : location.queryKeys.map((name) => `\`${name}\``).join(', ')
      }`,
    );
    lines.push(`  - user-info: ${location.userInfo}`);
    lines.push(`  - fragment: ${location.fragment}`);
    lines.push(
      `  - attributable to this artifact alone: yes — this is the \`Location\` this artifact's own request returned`,
    );
    lines.push(
      `  - A07's domain rule (\`huggingface.co\` or \`hf.co\` on a dot boundary): ${location.domainRule ? '**passes**' : '**fails** — stop condition 1, never an admission'}`,
    );
    lines.push(
      location.refusals.length === 0
        ? '  - rule 1 refusals triggered: none'
        : `  - rule 1 refusals triggered: ${location.refusals.join(', ')}`,
    );
    lines.push(`  - exact \`Location\`, query redacted: \`${redactQuery(location.raw)}\``);
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

function render(observations, when, nodeVersion) {
  const observedHosts = [];
  for (const observation of observations) {
    if (observation.location !== null) {
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
      location: result.location === null ? null : describeLocation(result.location),
    });
  }

  await mkdir(dirname(evidencePath), { recursive: true });
  await writeFile(evidencePath, render(observations, when, process.version), 'utf8');

  const hosts = new Set(
    observations
      .filter((observation) => observation.location !== null)
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

await main();
