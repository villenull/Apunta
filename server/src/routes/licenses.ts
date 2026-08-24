import { readFile } from 'node:fs/promises';

import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';

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
  app.get('/api/licenses', async (_request, reply) => {
    try {
      const text = await readFile(config.licensesFile, 'utf8');
      return { text } satisfies LicensesResponse;
    } catch {
      // A build that forgot to copy the file is a packaging bug, not a crash.
      // Saying so beats a 500 the About page renders as "loading…" for ever.
      return reply.code(404).send({
        error: 'not_found',
        message: 'The licence file was not found in this build of Apunta.',
        path: '/api/licenses',
      });
    }
  });
}
