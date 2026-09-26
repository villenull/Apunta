import type { ApiError, ApiErrorCode } from '@apunta/shared';
import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';

import { msg, type Locale, type MessageKey, type MessageParams } from './locale.js';

/**
 * One error shape for the whole API (`ApiErrorSchema` in `shared/`): a stable
 * `error` code the client can branch on plus a `message` safe to show the user.
 * Routes throw `HttpError`; the handler below turns everything else into a
 * generic 500 so an internal message never reaches the browser.
 *
 * **The wire does not change.** `message` is still a finished string — the
 * server renders it, in the language of the request that produced it, so the
 * browser needs no locale of its own and `web/src/api/client.ts` is untouched.
 * What changed is where the words come from: a call site names a catalogue
 * **key** and its parameters, never a literal, because a literal is a sentence
 * only one language can say.
 *
 * **Where the sentence is rendered.** A thrower that already holds a locale —
 * a streaming job that captured one, or a refine that resolved the target
 * note's — passes it and `message` is finished on the spot. One that does not
 * leaves it out, and `registerErrorHandler` renders it with the reader it is
 * given, which is the stored `language` setting. Both are the same sentence;
 * the second is a convenience for the request-scoped errors that have no job
 * and no note of their own, and the first is C-LANG@1 rule 4's captured
 * context where one exists.
 */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: ApiErrorCode;
  /** The catalogue entry this error's sentence comes from. */
  readonly key: MessageKey;
  /** What its `{…}` placeholders render, already locale-independent. */
  readonly params: MessageParams;
  /**
   * The locale the sentence was rendered in, or `undefined` when the thrower
   * had none and the handler will render it.
   */
  readonly locale: Locale | undefined;
  readonly details: unknown;

  constructor(
    statusCode: number,
    code: ApiErrorCode,
    key: MessageKey,
    params: MessageParams = {},
    details?: unknown,
    locale?: Locale,
  ) {
    super(locale === undefined ? msg('en', key, params) : msg(locale, key, params));
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.key = key;
    this.params = params;
    this.locale = locale;
    this.details = details;
  }

  /**
   * This error's sentence in `locale`.
   *
   * The error handler calls it for every error that arrived without one, which
   * is how a request-scoped 400 reaches a Spanish-speaking owner without every
   * route having to read the setting first.
   */
  messageIn(locale: Locale): string {
    // A thrower that had no locale renders here, from the reader the handler
    // was given; one that did re-render only if the two disagree.
    if (this.locale === locale) return this.message;
    return msg(locale, this.key, this.params);
  }
}

export function badRequest(
  key: MessageKey,
  params?: MessageParams,
  details?: unknown,
  locale?: Locale,
): HttpError {
  return new HttpError(400, 'bad_request', key, params, details, locale);
}

export function notFound(key: MessageKey, params?: MessageParams, locale?: Locale): HttpError {
  return new HttpError(404, 'not_found', key, params, undefined, locale);
}

export function conflict(key: MessageKey, params?: MessageParams, locale?: Locale): HttpError {
  return new HttpError(409, 'conflict', key, params, undefined, locale);
}

/**
 * C-LANG@1 rule 1: `es-MX` was asked for while the Language control is hidden.
 *
 * 400 rather than 409, and not 403 either: the request was well-formed and
 * would be perfectly acceptable on a build that offers Spanish. What it hits is
 * an offer this one does not make, and a `language_unavailable` the client can
 * branch on is the whole point of the code.
 *
 * The key is S2.2's seed `errors.language_unavailable`, which keeps its name
 * and its bytes; the sentence is still the same one, and there is still no
 * second sentence to slug.
 */
export function languageUnavailable(locale?: Locale): HttpError {
  return new HttpError(400, 'language_unavailable', 'errors.language_unavailable', {}, undefined, locale);
}

/**
 * A sentence that is **not** in the catalogues, and why one still exists.
 *
 * Every render site this card owns names a key. Three do not, and all three
 * are the same shape: a lower layer throws an error that carries a *category*
 * but no slug, and two or more different English sentences share that one
 * category, so the route cannot tell which sentence it is holding:
 *
 * - `ExtractError` (`server/src/extract/types.ts`) — `empty` and `corrupt_pdf`
 *   each back two sentences;
 * - `BackupError` / `RestoreError` (`server/src/backup/`) —
 *   `destination_unwritable`, `not_an_archive` and `corrupt_archive` each back
 *   two or three.
 *
 * Putting those in the catalogue would need a key on the error itself, and
 * those modules are outside this card's write scope; picking one sentence per
 * category would change the English the wire carries today, which the card
 * forbids. So the sentence is forwarded **unchanged** — English, exactly as
 * today — and reported, rather than guessed at. Everything a thrower of this
 * card's own does goes through `badRequest`/`notFound`/`conflict` and a key.
 */
class RawHttpError extends HttpError {
  private readonly raw: string;

  constructor(statusCode: number, code: ApiErrorCode, message: string, details?: unknown) {
    // `errors.internal_error` is a placeholder, because this error's sentence is
    // not in the catalogue and `key` is the only thing the base constructor can
    // render from. Nothing reads it here — `messageIn` is the reader, and it
    // answers with `raw` — so the two things that *do* read a sentence are given
    // the real one.
    super(statusCode, code, 'errors.internal_error', {}, details);
    this.raw = message;
    // `Error.message` is writable, and left as the base class set it this error
    // would say "Something went wrong on the server." — so a 400 or a 409 whose
    // sentence is not in the catalogue would log as a 500 whatever the wire
    // carried. The bytes on the wire are unchanged: `messageIn` is what the
    // handler answers with.
    this.message = message;
  }

  override messageIn(): string {
    return this.raw;
  }
}

export function rawHttpError(
  statusCode: number,
  code: ApiErrorCode,
  message: string,
  details?: unknown,
): HttpError {
  return new RawHttpError(statusCode, code, message, details);
}

export class StorageError extends HttpError {
  constructor(
    key: MessageKey,
    params: MessageParams,
    readonly causeCode: string,
    locale?: Locale,
  ) {
    super(507, 'storage_error', key, params, { cause: causeCode }, locale);
    this.name = 'StorageError';
  }
}

function errorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) return undefined;
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

/** Convert filesystem/SQLite failures into an actionable, safe message. */
export function storageErrorFor(error: unknown, dataDir: string, locale?: Locale): StorageError | null {
  if (error instanceof StorageError) return error;
  const code = errorCode(error);
  if (code === undefined) return null;
  if (code === 'ENOSPC' || code === 'SQLITE_FULL') {
    return new StorageError('errors.storage_error.disk_full', { dir: dataDir }, code, locale);
  }
  if (
    code === 'EACCES' ||
    code === 'EPERM' ||
    code === 'EROFS' ||
    code === 'SQLITE_READONLY' ||
    code === 'SQLITE_READONLY_DIRECTORY' ||
    code === 'SQLITE_CANTOPEN'
  ) {
    return new StorageError('errors.storage_error.read_only', { dir: dataDir }, code, locale);
  }
  return null;
}

/**
 * What the boot-error page shows, as a key and its parameters rather than a
 * finished sentence.
 *
 * The page cannot read the setting — storage is what failed — so it renders
 * this entry in both languages, English first, and the two JSON bodies carry
 * the English `message` this also returns. `index.ts` logs that same English
 * string, which is why it is here: a log line stays English whatever the page
 * shows.
 */
export interface StorageBootFailure {
  readonly key: MessageKey;
  readonly params: MessageParams;
  /** The English sentence, for the log line and the two JSON bodies. */
  readonly message: string;
}

export function storageBootFailure(error: unknown, dataDir: string, dbFile: string): StorageBootFailure {
  const mapped = storageErrorFor(error, dataDir);
  if (mapped !== null) {
    return { key: mapped.key, params: mapped.params, message: mapped.message };
  }
  if (error instanceof Error) {
    return {
      key: 'errors.storage_error.cause',
      params: { detail: error.message, file: dbFile },
      message: msg('en', 'errors.storage_error.cause', { detail: error.message, file: dbFile }),
    };
  }
  return {
    key: 'errors.storage_error.cannot_open',
    params: { file: dbFile },
    message: msg('en', 'errors.storage_error.cannot_open', { file: dbFile }),
  };
}

function body(code: ApiErrorCode, message: string, details?: unknown): ApiError {
  return details === undefined ? { error: code, message } : { error: code, message, details };
}

export interface ErrorHandlerOptions {
  readonly dataDir?: string;
  /**
   * Which language a request with no locale of its own is answered in.
   *
   * The handler is constructed once, before any route exists, so it cannot ask
   * a route what locale it captured; `app.ts` hands it a reader over the same
   * `db` the routes use, and that reader is the stored `language` setting —
   * C-LANG@1 rule 3, the only rule that applies to a request that is not a job
   * and not a refine. With no reader the handler stays English, which is what
   * the boot-error server and a bare `registerErrorHandler(app)` get.
   */
  readonly locale?: () => Locale;
}

/** The locale this handler answers in; English when it was given no reader. */
function requestLocale(options: ErrorHandlerOptions): Locale {
  try {
    return options.locale?.() ?? 'en';
  } catch {
    // A database that cannot answer the setting must not turn a 400 into a 500.
    return 'en';
  }
}

export function registerErrorHandler(app: FastifyInstance, options: ErrorHandlerOptions = {}): void {
  // Fastify types the handler's error as `unknown` by default; naming
  // FastifyError keeps `statusCode`/`message` available on the fall-through.
  app.setErrorHandler<FastifyError>((error, request, reply) => {
    if (error instanceof HttpError) {
      return reply
        .code(error.statusCode)
        .send(body(error.code, error.messageIn(requestLocale(options)), error.details));
    }

    if (options.dataDir !== undefined) {
      const storage = storageErrorFor(error, options.dataDir, requestLocale(options));
      if (storage !== null) {
        // Rendered in `locale` for the reply, in **English** for the log: a pino
        // line is not a sentence anyone chose to read in a language, it is
        // something a grep has to find whatever the request's language was.
        // `storage.message` is the request's locale, so the log renders the
        // sentence again from the key and the parameters rather than reusing it.
        request.log.error({ err: error, code: storage.causeCode }, msg('en', storage.key, storage.params));
        return reply.code(storage.statusCode).send(body(storage.code, storage.message, storage.details));
      }
    }

    // A zod failure that escaped a route wrapper is still a client error.
    if (error instanceof ZodError) {
      return reply
        .code(400)
        .send(
          body('bad_request', msg(requestLocale(options), 'errors.bad_request.body_invalid'), error.issues),
        );
    }

    // Malformed JSON and similar framework-level 4xx. The framework's own
    // message is not one of ours, so it is passed through as data rather than
    // replaced: it names the parser, not a resource.
    const statusCode = error.statusCode ?? 500;
    if (statusCode >= 400 && statusCode < 500) {
      return reply.code(statusCode).send(body('bad_request', error.message));
    }

    request.log.error(error);
    return reply.code(500).send(body('internal_error', msg(requestLocale(options), 'errors.internal_error')));
  });
}
