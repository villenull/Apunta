/**
 * Synthetic, offline guard probe for the AM-198/A17 acquisition adapter.
 *
 * It imports the *scratch* adapter (byte-identical to the committed evidence
 * copy) and replaces globalThis.fetch with a recorder that never opens a
 * socket, so a refusal can be observed as "fetch was not reached".
 *
 * The case table is *data*, not code: `guard-cases.json` sits beside this file
 * and holds the 13 `[label, url]` pairs verbatim. Keeping the addresses in a
 * JSON fixture rather than in executable source is what lets this probe live
 * in a linted tree without asking for an outbound-URL exemption. Nothing here
 * fetches: the only consumer of the strings is the adapter under test, which
 * refuses every non-loopback host before a socket opens.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { format } from 'node:util';

import { makeGuardedFetchImpl } from '../../../../build/eod-model-acquisition/guarded-fetch.js';

const calls: string[] = [];
(globalThis as unknown as { fetch: unknown }).fetch = async (input: unknown) => {
  calls.push(String(input));
  return new Response('stub', { status: 200 });
};

const log = 'build/eod-model-probe-repair/guard-probe-egress.jsonl';
const guarded = makeGuardedFetchImpl(log);

const casesPath = join(dirname(fileURLToPath(import.meta.url)), 'guard-cases.json');

/**
 * Fail closed on a fixture that is not exactly the expected shape. A missing,
 * empty, malformed or non-string pair must stop the probe rather than let it
 * print a truncated or partial case table.
 */
const assertCases = (value: unknown): asserts value is Array<[string, string]> => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`${casesPath}: expected a non-empty array of [label, url] string pairs`);
  }
  for (const row of value) {
    if (!Array.isArray(row) || row.length !== 2 || typeof row[0] !== 'string' || typeof row[1] !== 'string') {
      throw new Error(`${casesPath}: every entry must be a [label, url] pair of strings`);
    }
  }
};

const parsed: unknown = JSON.parse(readFileSync(casesPath, 'utf8'));
assertCases(parsed);
const cases = parsed;

for (const [label, url] of cases) {
  const before = calls.length;
  let outcome: string;
  try {
    await guarded(url);
    outcome = 'ALLOWED';
  } catch (error) {
    outcome = `REFUSED (${(error as Error).message})`;
  }
  const socketOpened = calls.length > before;
  const line = `${label.padEnd(26)} -> ${outcome.padEnd(60)} fetchReached=${String(socketOpened)}`;
  process.stdout.write(format('%s\n', line));
}
process.stdout.write(format('%s\n', `total fetchReached=${String(calls.length)}`));
