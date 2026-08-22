export { boundedText, IdSchema, MAX_BODY_CHARS, optionalText, TimestampSchema } from './common.js';

export { ApiErrorCodeSchema, ApiErrorSchema } from './errors.js';
export type { ApiError, ApiErrorCode } from './errors.js';

export { HealthResponseSchema } from './health.js';
export type { HealthResponse } from './health.js';

export {
  CreatePatientRequestSchema,
  PatientListItemSchema,
  PatientListResponseSchema,
  PatientSchema,
  UpdatePatientRequestSchema,
} from './patient.js';
export type {
  CreatePatientRequest,
  Patient,
  PatientListItem,
  PatientListResponse,
  UpdatePatientRequest,
} from './patient.js';

export {
  CreateNoteFormatRequestSchema,
  FormatSourceSchema,
  NoteFormatListResponseSchema,
  NoteFormatSchema,
  SectionsSchema,
  UpdateNoteFormatRequestSchema,
} from './note-format.js';
export type {
  CreateNoteFormatRequest,
  FormatSource,
  NoteFormat,
  NoteFormatListResponse,
  UpdateNoteFormatRequest,
} from './note-format.js';

export {
  CreateNoteRequestSchema,
  NoteListResponseSchema,
  NoteSchema,
  NoteStatusSchema,
  UpdateNoteRequestSchema,
} from './note.js';
export type { CreateNoteRequest, Note, NoteListResponse, NoteStatus, UpdateNoteRequest } from './note.js';

export { CreateTranscriptInputSchema, TranscriptSchema, TranscriptSourceSchema } from './transcript.js';
export type { CreateTranscriptInput, Transcript, TranscriptSource } from './transcript.js';

export { ChatMessageSchema, ChatRoleSchema, CreateChatMessageInputSchema } from './chat-message.js';
export type { ChatMessage, ChatRole, CreateChatMessageInput } from './chat-message.js';

export { SettingKeySchema, SettingsSchema, UpdateSettingsRequestSchema } from './settings.js';
export type { Settings, UpdateSettingsRequest } from './settings.js';
