export {
  ApiRequestError,
  errorMessage,
  NETWORK_ERROR_MESSAGE,
  requestJson,
  requestStream,
  requestVoid,
} from './client.js';
export type { HttpMethod, Parser, RequestOptions } from './client.js';

export { fetchHealth } from './health.js';

export {
  listImportBatches,
  previewClaudeImport,
  runClaudeImport,
  undoImportBatch,
  previewHalaxyImport,
  runHalaxyImport,
} from './import.js';
export type { ClaudeImportInput, HalaxyImportInput } from './import.js';

export {
  cancelRestore,
  createBackup,
  fetchBackupStatus,
  listBackupFolders,
  setBackupLocation,
  restoreBackup,
} from './backup.js';

export { generateNote, GenerateError } from './generate.js';
export type { GenerateHandlers } from './generate.js';

export { dictateClip, preloadDraftingModel, previewTranscript, transcribeRecording } from './transcribe.js';

export { listChatMessages, sendChatMessage } from './chat.js';
export type { ChatHandlers } from './chat.js';

export { clearBrainstorm, listBrainstorm, sendBrainstormMessage } from './brainstorm.js';
export type { BrainstormHandlers } from './brainstorm.js';

export {
  createPatient,
  deletePatient,
  getPatient,
  listPatients,
  setPatientArchived,
  setPatientGroup,
  updatePatient,
} from './patients.js';

export { createPatientGroup, listPatientGroups, updatePatientGroup } from './patientGroups.js';

export {
  createNote,
  deleteNote,
  getNote,
  listNotes,
  publishNote,
  unpublishNote,
  updateNote,
} from './notes.js';

export {
  createFormat,
  createStandardFormat,
  deleteFormat,
  detectFormat,
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

export {
  fetchAppMode,
  fetchRecoveryStatus,
  fetchUpdateStatus,
  reinstallPreviousVersion,
  requestUpdateAction,
  restoreSafetyCopy,
  setAutoCheck,
  updaterMayBeAvailable,
} from './update.js';
