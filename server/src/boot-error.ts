import Fastify, { type FastifyInstance } from 'fastify';

import type { AppConfig } from './config.js';

export interface BootErrorOptions {
  readonly dataDir: string;
  readonly message: string;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function bootErrorHtml(options: BootErrorOptions): string {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Apunta could not start</title>
<style>body{margin:0;padding:2rem;max-width:42rem;font:16px system-ui,sans-serif;line-height:1.5;color:#262620;background:#f8f7f2}main{margin:8vh auto;padding:2rem;background:#fff;border:1px solid #d7d5ca;border-radius:12px}h1{font-size:1.5rem}code{overflow-wrap:anywhere}strong{font-weight:650}</style></head>
<body><main><h1>Apunta could not start</h1><p>${escapeHtml(options.message)}</p><p><strong>Data folder:</strong> <code>${escapeHtml(options.dataDir)}</code></p><p>Make sure the disk has space and this folder is available and writable, then start Apunta again. Your existing database was left untouched.</p></main></body></html>`;
}

export function buildBootErrorApp(options: BootErrorOptions): FastifyInstance {
  const app = Fastify({ logger: true });
  const html = bootErrorHtml(options);
  app.get('/', (_request, reply) => reply.type('text/html').code(503).send(html));
  app.get('/api/health', (_request, reply) =>
    reply.code(503).send({ error: 'storage_error', message: options.message }),
  );
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api'))
      return reply.type('text/html').code(503).send(html);
    return reply.code(503).send({ error: 'storage_error', message: options.message });
  });
  return app;
}

export async function serveBootError(
  config: Pick<AppConfig, 'host' | 'port'>,
  options: BootErrorOptions,
): Promise<FastifyInstance> {
  const app = buildBootErrorApp(options);
  await app.listen({ host: config.host, port: config.port });
  return app;
}
