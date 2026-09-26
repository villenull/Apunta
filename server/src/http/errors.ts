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

/**
 * C-LANG@1 rule 1: `es-MX` was asked for while the Language control is hidden.
 *
 * 400 rather than 409, and not 403 either: the request was well-formed and
 * would be perfectly acceptable on a build that offers Spanish. What it hits is
 * an offer this one does not make, and a `language_unavailable` the client can
 * branch on is the whole point of the code.
 */
export function languageUnavailable(message: string): HttpError {
  return new HttpError(400, 'language_unavailable', message);
}

export class StorageError extends HttpError {
  constructor(
    message: string,
    readonly causeCode: string,
  ) {
    super(507, 'storage_error', message, { cause: causeCode });
    this.name = 'StorageError';
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}
/** Convert filesystem/SQLite failures into an actionable, safe message. */
export function storageErrorFor(error: unknown, dataDir: string): StorageError | null {
  if (error instanceof StorageError) return error;
  const code = errorCode(error);
  if (code === undefined) return null;
  if (code === 'ENOSPC' || code === 'SQLITE_FULL') {
    return new StorageError(
      `Apunta cannot write to ${dataDir} because the disk is full. Free space and try again. Your existing data was left untouched.`,
      code,
    );
  }
  if (
    code === 'EACCES' ||
    code === 'EPERM' ||
    code === 'EROFS' ||
    code === 'SQLITE_READONLY' ||
    code === 'SQLITE_READONLY_DIRECTORY' ||
    code === 'SQLITE_CANTOPEN'
  ) {
    return new StorageError(
      `Apunta cannot write to ${dataDir} because the folder is read-only or permissions do not allow access. Choose a writable folder or fix its permissions, then try again. Your existing data was left untouched.`,
      code,
    );
  }
  return null;
}

export function storageBootMessage(error: unknown, dataDir: string, dbFile: string): string {
  const mapped = storageErrorFor(error, dataDir);
  if (mapped !== null) return mapped.message;
  if (error instanceof Error) return `${error.message} Database: ${dbFile}.`;
  return `Apunta could not open its database at ${dbFile}. Check that the folder is writable, then try again.`;
}

function body(code: ApiErrorCode, message: string, details?: unknown): ApiError {
  return details === undefined ? { error: code, message } : { error: code, message, details };
}

export interface ErrorHandlerOptions {
  readonly dataDir?: string;
}

export function registerErrorHandler(app: FastifyInstance, options: ErrorHandlerOptions = {}): void {
  // Fastify types the handler's error as `unknown` by default; naming
  // FastifyError keeps `statusCode`/`message` available on the fall-through.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply.code(error.statusCode).send(body(error.code, error.message, error.details));
    }

    if (options.dataDir !== undefined) {
      const storage = storageErrorFor(error, options.dataDir);
      if (storage !== null) {
        request.log.error({ err: error, code: storage.causeCode }, storage.message);
        return reply.code(storage.statusCode).send(body(storage.code, storage.message, storage.details));
      }
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
