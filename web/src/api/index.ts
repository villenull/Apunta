export { ApiRequestError, errorMessage, requestJson, requestStream, requestVoid } from './client.js';
export type { HttpMethod, Parser, RequestOptions } from './client.js';

export { fetchHealth } from './health.js';

export { generateNote, GenerateError } from './generate.js';
export type { GenerateHandlers } from './generate.js';

export { listChatMessages, sendChatMessage } from './chat.js';
export type { ChatHandlers } from './chat.js';

export { createPatient, deletePatient, getPatient, listPatients, updatePatient } from './patients.js';

export { createNote, deleteNote, listNotes, publishNote, unpublishNote, updateNote } from './notes.js';

export { createFormat, deleteFormat, listFormats, updateFormat } from './formats.js';
