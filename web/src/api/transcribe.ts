import {
  GenerateErrorEventSchema,
  GenerateNoteEventSchema,
  GenerateStatusEventSchema,
  GenerateTokenEventSchema,
  TranscribePreviewResponseSchema,
  TranscribeProgressEventSchema,
  type GenerateNoteEvent,
  type TranscribePreviewResponse,
  type TranscribeProgressEvent,
} from '@apunta/shared';

import { requestStream } from './client.js';
import { GenerateError, type GenerateHandlers } from './generate.js';
import { readEvents } from './sse.js';

/**
 * `POST /api/transcribe` — upload the recording and watch it become a note.
 *
 * One request, two halves: `progress` while whisper works, then exactly the
 * events `/api/generate` sends, because the server runs the same drafting code
 * once it has a transcript. So this reuses `GenerateHandlers` rather than
 * inventing a parallel set of callbacks, and the capture screen renders the
 * second half with the code it already had.
 */

export interface TranscribeInput {
  readonly patient_id: string;
  readonly format_id: string;
  readonly title?: string;
  /** Whatever she typed alongside the recording; both reach the model. */
  readonly typed_notes?: string;
  /** 16 kHz mono WAV, written by `lib/recorder.ts`. */
  readonly audio: Blob;
}

export interface TranscribeHandlers extends GenerateHandlers {
  /** How far through the recording whisper is. */
  onProgress?: (event: TranscribeProgressEvent) => void;
}

export async function transcribeRecording(
  input: TranscribeInput,
  handlers: TranscribeHandlers = {},
  signal?: AbortSignal,
): Promise<GenerateNoteEvent> {
  const form = new FormData();
  form.set('patient_id', input.patient_id);
  form.set('format_id', input.format_id);
  if (input.title !== undefined) form.set('title', input.title);
  if (input.typed_notes !== undefined) form.set('typed_notes', input.typed_notes);
  // The file goes last so the server has every text field before it starts
  // writing 100 MB to disk.
  form.set('audio', input.audio, 'session.wav');

  const response = await requestStream('/api/transcribe', {
    method: 'POST',
    body: form,
    ...(signal ? { signal } : {}),
  });
  if (!response.body) throw new Error('The server sent no transcription stream.');

  let result: GenerateNoteEvent | null = null;

  for await (const frame of readEvents(response.body, signal)) {
    switch (frame.event) {
      case 'progress':
        handlers.onProgress?.(TranscribeProgressEventSchema.parse(frame.data));
        break;
      case 'status':
        handlers.onStatus?.(GenerateStatusEventSchema.parse(frame.data));
        break;
      case 'token':
        handlers.onToken?.(GenerateTokenEventSchema.parse(frame.data));
        break;
      case 'note':
        result = GenerateNoteEventSchema.parse(frame.data);
        break;
      case 'error':
        throw new GenerateError(GenerateErrorEventSchema.parse(frame.data));
      default:
        // An event name this build does not know about is not a reason to
        // fail: the stream still ends with `note` or `error`.
        break;
    }
  }

  if (result === null) throw new Error('The recording stream ended before the note was saved.');
  return result;
}

/**
 * `POST /api/transcribe/preview` — the provisional words shown while she is
 * still speaking.
 *
 * Separate from `transcribeRecording` above in every sense: it creates
 * nothing, its result is never stored, and a failure is not worth telling her
 * about — the preview is reassurance, and a reassurance that breaks should go
 * quiet rather than raise an alarm about a recording that is going fine. So
 * this resolves with `null` instead of throwing.
 */
export async function previewTranscript(
  audio: Blob,
  signal?: AbortSignal,
): Promise<TranscribePreviewResponse | null> {
  const body = new FormData();
  body.append('audio', audio, 'preview.wav');
  try {
    const response = await fetch('/api/transcribe/preview', {
      method: 'POST',
      body,
      ...(signal ? { signal } : {}),
    });
    if (!response.ok) return null;
    return TranscribePreviewResponseSchema.parse(await response.json());
  } catch {
    return null;
  }
}
