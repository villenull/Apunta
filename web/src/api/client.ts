import { ApiErrorSchema } from '@apunta/shared';

/**
 * The one place the browser talks to the server.
 *
 * Every path is a same-origin relative URL: in production Fastify serves this
 * bundle, and in dev Vite proxies /api to 127.0.0.1:7717. An absolute URL to
 * anything but loopback is a hard-rule violation (and a lint error).
 *
 * Responses are validated with the zod schemas from `shared/`, so a shape the
 * server should not have sent fails here rather than three renders later.
 */

/** Structurally a zod schema, without making `web` depend on zod itself. */
export interface Parser<T> {
  parse(value: unknown): T;
}

export class ApiRequestError extends Error {
  /** HTTP status, or 0 when the request never reached the server. */
  readonly status: number;
  /** `error` code from the API's JSON body, or `network_error`. */
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiRequestError';
    this.status = status;
    this.code = code;
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';

export interface RequestOptions {
  method?: HttpMethod;
  /** Serialized as JSON. */
  body?: unknown;
  /**
   * A multipart body, sent as-is. `POST /api/transcribe` uploads a recording
   * this way (M5); the browser writes the boundary, so no content-type header
   * is set here — one would break the request.
   */
  form?: FormData;
  signal?: AbortSignal;
}

const NETWORK_ERROR_MESSAGE = 'Could not reach the Apunta server. Is it still running?';

function buildInit(options: RequestOptions): RequestInit {
  const { method = 'GET', body, form, signal } = options;
  return {
    method,
    ...(form !== undefined
      ? { body: form }
      : body === undefined
        ? {}
        : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    ...(signal ? { signal } : {}),
  };
}

/** Turn a non-2xx response into an ApiRequestError carrying the server's message. */
async function toError(response: Response): Promise<ApiRequestError> {
  let code = 'internal_error';
  let message = `Request failed with HTTP ${String(response.status)}`;
  try {
    const parsed = ApiErrorSchema.safeParse(await response.json());
    if (parsed.success) {
      code = parsed.data.error;
      message = parsed.data.message;
    }
  } catch {
    // A non-JSON error body (a proxy page, say) keeps the generic message.
  }
  return new ApiRequestError(response.status, code, message);
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  try {
    return await fetch(path, buildInit(options));
  } catch (error) {
    // An aborted request is the caller unmounting, not a failure to report.
    if (options.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error;
    throw new ApiRequestError(0, 'network_error', NETWORK_ERROR_MESSAGE);
  }
}

/** Request a JSON resource and validate it against `parser`. */
export async function requestJson<T>(
  path: string,
  parser: Parser<T>,
  options: RequestOptions = {},
): Promise<T> {
  const response = await send(path, options);
  if (!response.ok) throw await toError(response);
  return parser.parse(await response.json());
}

/**
 * Request a streaming endpoint. The caller reads `response.body` itself.
 *
 * A non-2xx still comes back as an `ApiRequestError` carrying the server's
 * message, because `/api/generate` validates the request *before* it opens the
 * stream — so "no such patient" is an ordinary 404 with a JSON body, and only
 * failures after that point arrive as events inside the stream.
 */
export async function requestStream(path: string, options: RequestOptions = {}): Promise<Response> {
  const response = await send(path, options);
  if (!response.ok) throw await toError(response);
  return response;
}

/** Request an endpoint that answers 204 (or whose body we do not need). */
export async function requestVoid(path: string, options: RequestOptions = {}): Promise<void> {
  const response = await send(path, options);
  if (!response.ok) throw await toError(response);
}

/** The message to show a user for any thrown value. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return String(error);
}
