export { ApiRequestError, errorMessage, requestJson, requestStream, requestVoid } from './client.js';
export type { HttpMethod, Parser, RequestOptions } from './client.js';

export { fetchHealth } from './health.js';

export { fetchLicenses } from './licenses.js';

export {
  cancelRestore,
  createBackup,
  fetchBackupStatus,
  markRestoreVerified,
  restoreBackup,
} from './backup.js';

export { generateNote, GenerateError } from './generate.js';
export type { GenerateHandlers } from './generate.js';

export { previewTranscript, transcribeRecording } from './transcribe.js';
export type { TranscribeHandlers, TranscribeInput } from './transcribe.js';

export { listChatMessages, sendChatMessage } from './chat.js';
export type { ChatHandlers } from './chat.js';

export {
  createPatient,
  deletePatient,
  getPatient,
  listPatients,
  setPatientArchived,
  updatePatient,
} from './patients.js';

export { createNote, deleteNote, listNotes, publishNote, unpublishNote, updateNote } from './notes.js';

export {
  createFormat,
  deleteFormat,
  detectFormat,
  flattenSkill,
  listFormats,
  updateFormat,
} from './formats.js';

export { getSettings, putSettings } from './settings.js';

export {
  activatePlan,
  createGoal,
  deleteGoal,
  exportPlan,
  getPlan,
  listPlanVersions,
  startPlanVersion,
  suggestGoals,
  updateGoal,
  updatePlan,
} from './plan.js';
export type { SuggestHandlers } from './plan.js';

export { listBriefings, prepareBriefing, saveBriefing } from './prep.js';
export type { PrepHandlers } from './prep.js';
