/**
 * Invocation adapter for the existing installer acquisition (AM-198, A17).
 *
 * It is a wrapper, not a replacement: every host, redirect, query-name, size
 * and hash decision is still made by `installer/src/readiness.ts`,
 * `installer/src/catalog.ts` and `installer/src/download.ts`, unchanged. This
 * adapter only bounds *which* fetch may leave the process, so an unexpected code
 * path cannot widen the acquisition:
 *
 *  - the local runtime may be asked for tag metadata (`/api/tags`) and a digest
 *    (`/api/show`) and nothing else — `/api/pull`, `/api/generate` and
 *    `/api/chat` are refused here, before a socket opens;
 *  - an external request is admitted only to a host the catalogue's own speech
 *    allowance names, over https on 443, with no user-info and no fragment, by
 *    GET, and with no query value ever read;
 *  - every request is logged with its query **names** only and every value as
 *    `<redacted>`, exactly as `docs/v2/ACQUISITION.md` requires.
 */

import { appendFileSync } from 'node:fs';

import { SPEECH_DOWNLOAD_ALLOWANCE } from '../../installer/src/catalog.js';
import { queryParameterNames, safeUrl } from '../../installer/src/readiness.js';

const EXTERNAL_HOSTS = new Set([
  ...SPEECH_DOWNLOAD_ALLOWANCE.allowedHosts,
  ...SPEECH_DOWNLOAD_ALLOWANCE.allowedRedirectHosts,
]);

const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);

/** The only runtime endpoints this acquisition may read. A pull is not one. */
const ALLOWED_LOOPBACK_PATHS = new Set(['/api/tags', '/api/show']);

export class EgressRefused extends Error {}

export function makeGuardedFetchImpl(logPath: string): typeof fetch {
  let seq = 0;

  const record = (entry: Record<string, unknown>): void => {
    appendFileSync(logPath, `${JSON.stringify({ seq: (seq += 1), ...entry })}\n`);
  };

  const guarded = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      record({ decision: 'refused', reason: 'not_a_url' });
      throw new EgressRefused('refused: not a URL');
    }

    const method = (init?.method ?? 'GET').toUpperCase();
    // Names only. The raw query string is never logged, stored or compared;
    // `queryParameterNames` cuts each pair at its first `=`.
    const names = queryParameterNames(url.search);
    const base = {
      method,
      scheme: url.protocol,
      host: url.hostname,
      port: url.port === '' ? '(default)' : url.port,
      path: url.pathname,
      queryNames: names,
      queryValues: url.search === '' ? '(none)' : '<redacted>',
      where: safeUrl(raw),
      redirectMode: init?.redirect ?? '(runtime default)',
    };

    const refuse = (reason: string): never => {
      record({ ...base, decision: 'refused', reason });
      throw new EgressRefused(`refused (${reason}): ${base.where}`);
    };

    if (LOOPBACK_HOSTS.has(url.hostname)) {
      if (!ALLOWED_LOOPBACK_PATHS.has(url.pathname)) refuse('loopback_path_not_metadata');
      if (url.search !== '') refuse('loopback_query_present');
      record({ ...base, decision: 'allowed', kind: 'local_tag_metadata' });
      return await fetch(url.href, init);
    }

    if (url.protocol !== 'https:') refuse('scheme_not_https');
    if (url.port !== '' && url.port !== '443') refuse('port_not_allowed');
    if (url.username !== '' || url.password !== '') refuse('user_info_present');
    if (url.hash !== '') refuse('fragment_present');
    if (!EXTERNAL_HOSTS.has(url.hostname)) refuse('host_not_allowed');
    if (method !== 'GET') refuse('method_not_allowed');

    const kind = url.hostname === SPEECH_DOWNLOAD_ALLOWANCE.allowedHosts[0] ? 'catalogue_initial' : 'cdn_redirect';
    record({ ...base, decision: 'allowed', kind });
    return await fetch(url.href, init);
  };

  return guarded as unknown as typeof fetch;
}
