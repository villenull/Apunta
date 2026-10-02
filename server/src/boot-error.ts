import Fastify, { type FastifyInstance } from 'fastify';
import { t } from '@apunta/shared';

import type { AppConfig } from './config.js';
import { registerCsp } from './http/csp.js';
import { registerRequestGuard } from './http/request-guard.js';
import type { MessageKey, MessageParams } from './http/locale.js';

export interface BootErrorOptions {
  readonly dataDir: string;
  /** The catalogue entry describing the failure, rendered twice on the page. */
  readonly key: MessageKey;
  /** What its `{…}` placeholders render. A path, or a lower layer's message. */
  readonly params: MessageParams;
}

/**
 * The page both languages, English first.
 *
 * Nothing here can read the `language` setting: storage is what failed, so the
 * database that holds the setting is the thing that is not there. A therapist
 * whose install is Spanish meets a Spanish sentence here or none, so the page
 * prints the English one and then the Spanish one under `<html lang="en">` —
 * the document's own language is the one it starts in, and the second
 * paragraph is the alternative, not a silent switch.
 */
function paragraphs(options: BootErrorOptions): { english: string; spanish: string } {
  return {
    english: t(options.key, options.params, 'en'),
    spanish: t(options.key, options.params, 'es-MX'),
  };
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

export function bootErrorHtml(options: BootErrorOptions): string {
  const { english, spanish } = paragraphs(options);
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(t('boot.title'))}</title>
<style>body{margin:0;padding:2rem;max-width:42rem;font:16px system-ui,sans-serif;line-height:1.5;color:#262620;background:#f8f7f2}main{margin:8vh auto;padding:2rem;background:#fff;border:1px solid #d7d5ca;border-radius:12px}h1{font-size:1.5rem}code{overflow-wrap:anywhere}strong{font-weight:650}</style></head>
<body><main><h1>${escapeHtml(t('boot.title'))}</h1><p>${escapeHtml(english)}</p><p lang="es-MX">${escapeHtml(spanish)}</p><p><strong>${escapeHtml(t('boot.dataFolder'))}</strong> <code>${escapeHtml(options.dataDir)}</code></p><p>${escapeHtml(t('boot.recovery'))}</p></main></body></html>`;
}

/**
 * The boot-error page still answers a browser on loopback, so it runs the same
 * request guard as the main app (C-REQ@1). `port` is the port `serveBootError`
 * is about to listen on: an injected request is not listening and is checked
 * against it, and a request on the real socket is checked against the port
 * actually bound.
 *
 * Its two JSON bodies carry `storage_error` with the **English** sentence. They
 * cannot be bilingual — there is one `message` field, nothing in the browser is
 * alive to ask which language to render, and the request that reaches them is
 * the tab's own failed boot rather than a choice she made.
 */
export function buildBootErrorApp(options: BootErrorOptions, port: number): FastifyInstance {
  const app = Fastify({ logger: true });
  registerRequestGuard(app, { port });
  /**
   * C-BRIDGE@1 rule 6 names the boot-error page explicitly, so the same `onSend`
   * hook is registered here beside the guard. It is the hook, and only the hook,
   * that gives the inline `<style>` above its per-response nonce — which is why
   * `bootErrorHtml` needs no parameter and the HTML below is still built once.
   */
  registerCsp(app);
  const html = bootErrorHtml(options);
  const json = { error: 'storage_error', message: t(options.key, options.params, 'en') };
  app.get('/', (_request, reply) => reply.type('text/html').code(503).send(html));
  app.get('/api/health', (_request, reply) => reply.code(503).send(json));
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api'))
      return reply.type('text/html').code(503).send(html);
    return reply.code(503).send(json);
  });
  return app;
}

export async function serveBootError(
  config: Pick<AppConfig, 'host' | 'port'>,
  options: BootErrorOptions,
): Promise<FastifyInstance> {
  const app = buildBootErrorApp(options, config.port);
  await app.listen({ host: config.host, port: config.port });
  return app;
}
