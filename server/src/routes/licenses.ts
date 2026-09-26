import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';
import { notFound } from '../http/errors.js';

/**
 * `THIRD-PARTY-LICENSES.md`, served to the About page (M8 deliverable 6).
 *
 * Shipping other people's binaries carries obligations — MIT and BSD both
 * require the notice to travel with the distribution — and a licence file that
 * only exists in the repository has not travelled anywhere. So the packaged
 * app carries a copy in `Contents/Resources/` and the About page reads it from
 * here.
 *
 * Markdown as text, not HTML: the file contains licence text verbatim, and
 * rendering it would mean deciding what to do with the characters in it.
 */

export interface LicensesResponse {
  /** The whole file. */
  readonly text: string;
}

export function registerLicensesRoute(app: FastifyInstance, config: AppConfig): void {
  app.get('/api/licenses', async (_request) => {
    try {
      const text = await readFile(config.licensesFile, 'utf8');
      return { text } satisfies LicensesResponse;
    } catch {
      // A build that forgot to copy the file is a packaging bug, not a crash.
      // Saying so beats a 500 the About page renders as "loading…" for ever.
      //
      // Thrown rather than sent, which is what lets the sentence be rendered in
      // the stored language: this route holds no `db` and no job, so the error
      // handler is the one place that can read the setting (C-LANG@1 rule 3,
      // and `registerErrorHandler`'s own reader). `error: 'not_found'` on the
      // wire is unchanged; the `path` this used to send alongside `message` is
      // not part of `ApiErrorSchema` and nothing read it.
      throw notFound('errors.not_found.licenses_file');
    }
  });
}
