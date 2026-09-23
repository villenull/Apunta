import type { FastifyRequest } from 'fastify';

import { AiError, aiError } from '../ai/errors.js';
import type { LlmStats } from '../ai/types.js';

/** Normalize provider failures before they cross an SSE boundary. */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  return aiError('ollama_error', String(error));
}

/** Log shape-only diagnostics; prompts and replies never reach the log. */
export function logFailure(request: FastifyRequest, failure: AiError, message: string): void {
  request.log.error({ code: failure.code, detail: failure.detail }, message);
}

/** Record model timing/count metadata without recording clinical text. */
export function logStats(request: FastifyRequest, stats: LlmStats, message: string): void {
  const tokensPerSecond = stats.evalNanos > 0 ? stats.outputTokens / (stats.evalNanos / 1e9) : 0;
  request.log.info(
    {
      model: stats.model,
      promptTokens: stats.promptTokens,
      outputTokens: stats.outputTokens,
      tokensPerSecond: Math.round(tokensPerSecond * 10) / 10,
      loadMs: Math.round(stats.loadNanos / 1e6),
      doneReason: stats.doneReason,
      attempts: stats.attempts,
    },
    message,
  );
}
