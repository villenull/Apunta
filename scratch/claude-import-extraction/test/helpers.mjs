// Shared helpers for the extraction tests. No test framework beyond `node:test`,
// no dependency, no network, no port.

import { createSyntheticAccount, DEFAULTS } from '../fixtures/account.mjs';
import { EXPECTED, expectedCapture, expectedDigests } from '../fixtures/expected.mjs';
import { createMemoryCheckpoint, createFileCheckpoint } from '../src/checkpoint.mjs';
import { createComplianceSource, createWebAppSource } from '../src/sources.mjs';
import { extract, handoff } from '../src/walker.mjs';

export { EXPECTED, expectedCapture, expectedDigests, handoff, extract };

export const MECHANISMS = {
  'web-app': createWebAppSource,
  'compliance-api': createComplianceSource,
};

/** A `sleep` that records what it was asked to wait for instead of waiting. */
export function recordingSleep() {
  const waits = [];
  const sleep = async (ms, info) => {
    waits.push({ ms, ...info });
  };
  sleep.waits = waits;
  return sleep;
}

/** Build a source over a synthetic account with the given misbehaviour. */
export function synthetic(mechanism, options = {}) {
  const account = createSyntheticAccount(options);
  const source = MECHANISMS[mechanism]({ request: account.request });
  return { account, source, config: { ...DEFAULTS, ...options } };
}

/** One full run, in memory, with retries recorded rather than waited out. */
export async function runOnce(mechanism, options = {}, extra = {}) {
  const { account, source } = synthetic(mechanism, options);
  const sleep = recordingSleep();
  const checkpoint = extra.checkpoint ?? createMemoryCheckpoint();
  const result = await extract({
    source,
    checkpoint,
    runId: extra.runId ?? 'run-1',
    sleep,
    limits: extra.limits,
    until: extra.until,
  });
  return {
    account,
    result,
    sleep,
    checkpoint,
    files: handoff({
      conversations: result.conversations,
      report: result.report,
      allowGaps: extra.allowGaps === true,
    }),
  };
}

/** The endpoints a capture is allowed to touch. Anything else is a defect. */
export const ALLOWED_PATHS = [
  /^\/api\/organizations$/,
  /^\/api\/organizations\/[^/]+\/chat_conversations$/,
  /^\/api\/organizations\/[^/]+\/chat_conversations\/[^/]+$/,
  /^\/v1\/compliance\/apps\/chats$/,
  /^\/v1\/compliance\/apps\/chats\/[^/]+\/messages$/,
  /^\/v1\/compliance\/apps\/artifacts\/[^/]+\/content$/,
];

export function assertOnlyKnownEndpoints(assert, account) {
  for (const log of account.logs) {
    const path = log.url.split('?')[0];
    assert.ok(
      ALLOWED_PATHS.some((pattern) => pattern.test(path)),
      `request to an endpoint outside the modelled set: ${log.method} ${path}`,
    );
  }
}

/** The gap codes a run reports, deduplicated. */
export function gapCodes(report) {
  return [...new Set(report.gaps.map((gap) => gap.code))].sort();
}

/** How many requests a given conversation took. */
export function requestsFor(account, fragment) {
  return account.logs.filter((log) => log.url.includes(fragment)).length;
}

export { createFileCheckpoint, createMemoryCheckpoint };
