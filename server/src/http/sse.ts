import type { FastifyReply, FastifyRequest } from 'fastify';

/**
 * Server-sent events, the transport for every streaming endpoint (PLAN §4):
 * `/api/generate` here, `/api/notes/:id/chat` in M4 and `/api/transcribe` in
 * M5. Event names live in `shared/` next to the schema for each payload.
 *
 * The reply is hijacked so Fastify does not also try to send one, and the
 * headers disable every buffering layer between here and the browser — a
 * streamed draft that arrives all at once is not a streamed draft.
 */
export interface SseStream {
  send(event: string, data: unknown): void;
  end(): void;
  /** True once the client has gone away; stop working and clean up. */
  readonly closed: boolean;
}

export function openSse(request: FastifyRequest, reply: FastifyReply): SseStream {
  reply.hijack();

  let clientGone = false;
  request.raw.on('close', () => {
    clientGone = true;
  });

  reply.raw.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    connection: 'keep-alive',
    // nginx and friends buffer proxied responses by default, which would hold
    // the whole draft back until it finished.
    'x-accel-buffering': 'no',
  });

  return {
    send(event: string, data: unknown): void {
      if (clientGone || reply.raw.writableEnded) return;
      reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    },
    end(): void {
      if (!reply.raw.writableEnded) reply.raw.end();
    },
    get closed(): boolean {
      return clientGone || reply.raw.writableEnded;
    },
  };
}
