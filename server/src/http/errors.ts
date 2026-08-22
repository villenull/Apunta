import type { ApiError, ApiErrorCode } from '@apunta/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

/**
 * One error shape for the whole API (`ApiErrorSchema` in `shared/`): a stable
 * `error` code the client can branch on plus a `message` safe to show the user.
 * Routes throw `HttpError`; the handler below turns everything else into a
 * generic 500 so an internal message never reaches the browser.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  readonly details: unknown;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export function badRequest(message: string, details?: unknown): HttpError {
  return new HttpError(400, 'bad_request', message, details);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, 'not_found', message);
}

export function conflict(message: string): HttpError {
  return new HttpError(409, 'conflict', message);
}

function body(code: ApiErrorCode, message: string, details?: unknown): ApiError {
  return details === undefined ? { error: code, message } : { error: code, message, details };
}

export function registerErrorHandler(app: FastifyInstance): void {
  // Fastify types the handler's error as `unknown` by default; naming
  // FastifyError keeps `statusCode`/`message` available on the fall-through.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(body(error.code, error.message, error.details));
    }

    // A zod failure that escaped a route wrapper is still a client error.
    if (error instanceof ZodError) {
      return reply.code(400).send(body('bad_request', 'Request body is invalid', error.issues));
    }

    // Malformed JSON and similar framework-level 4xx.
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send(body('bad_request', error.message));
    }

    request.log.error(error);
    return reply.code(500).send(body('internal_error', 'Something went wrong on the server.'));
  });
}
