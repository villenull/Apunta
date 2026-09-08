import {
  ChatErrorEventSchema,
  ChatMessageEventSchema,
  ChatMessageListResponseSchema,
  ChatNoteUpdatedEventSchema,
  ChatStatusEventSchema,
  ChatTokenEventSchema,
  type ChatMessage,
  type ChatNoteUpdatedEvent,
  type ChatRequest,
  type ChatStatusEvent,
} from '@apunta/shared';

import { requestJson, requestStream } from './client.js';
import { GenerateError } from './generate.js';
import { readEvents } from './sse.js';

/** `GET /api/notes/:id/chat` — the thread, oldest first. */
export async function listChatMessages(noteId: string, signal?: AbortSignal): Promise<ChatMessage[]> {
  const { messages } = await requestJson(
    `/api/notes/${noteId}/chat`,
    ChatMessageListResponseSchema,
    signal ? { signal } : {},
  );
  return messages;
}

export interface ChatHandlers {
  /** Progress: contacting the AI, loading the model, thinking. */
  onStatus?: (event: ChatStatusEvent) => void;
  /** A decoded slice of the assistant's reply — never raw JSON. */
  onToken?: (text: string) => void;
  /**
   * A persisted turn. Arrives for the user's own message first (so an
   * optimistic bubble can be swapped for the real row) and then for the
   * assistant's, which supersedes whatever streamed.
   */
  onMessage?: (message: ChatMessage) => void;
  /** The rewritten note, already saved. Never fires for a published note. */
  /** May resolve after the editor has rendered the committed note. */
  onNoteUpdated?: (event: ChatNoteUpdatedEvent) => void | Promise<void>;
}

/**
 * `POST /api/notes/:id/chat` over SSE.
 *
 * Failures inside the stream arrive as a `GenerateError` — the same class the
 * drafting call throws, because it is the same set of local-AI failures with
 * the same user-facing messages.
 */
export async function sendChatMessage(
  noteId: string,
  input: ChatRequest,
  handlers: ChatHandlers = {},
  signal?: AbortSignal,
): Promise<void> {
  const response = await requestStream(`/api/notes/${noteId}/chat`, {
    method: 'POST',
    body: input,
    ...(signal ? { signal } : {}),
  });
  if (!response.body) throw new Error('The server sent no reply stream.');

  let sawAssistant = false;

  for await (const frame of readEvents(response.body, signal)) {
    switch (frame.event) {
      case 'status':
        handlers.onStatus?.(ChatStatusEventSchema.parse(frame.data));
        break;
      case 'token':
        handlers.onToken?.(ChatTokenEventSchema.parse(frame.data).text);
        break;
      case 'message': {
        const { message } = ChatMessageEventSchema.parse(frame.data);
        if (message.role === 'assistant') sawAssistant = true;
        handlers.onMessage?.(message);
        break;
      }
      case 'note-updated':
        await handlers.onNoteUpdated?.(ChatNoteUpdatedEventSchema.parse(frame.data));
        break;
      case 'error':
        throw new GenerateError(ChatErrorEventSchema.parse(frame.data));
      default:
        // An event name this build does not know about is not a reason to
        // fail: the stream still ends with a reply or an error.
        break;
    }
  }

  // A stream that ended without the assistant's persisted turn left a bubble
  // on screen that is not in the database — say so rather than let a reload
  // silently disagree with what she is looking at.
  if (!sawAssistant) throw new Error('The reply stream ended before the answer was saved.');
}
