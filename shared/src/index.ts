export {
  MAX_HALAXY_FILES,
  MAX_HALAXY_FILE_BYTES,
  MAX_HALAXY_TOTAL_BYTES,
  HalaxyExistingPatientSchema,
  HalaxyPreviewNoteSchema,
  HalaxyPreviewPatientSchema,
  HalaxyPreviewResponseSchema,
  HalaxyImportRequestSchema,
  HalaxyImportPatientSchema,
  HalaxyImportResponseSchema,
} from './halaxy.js';
export type {
  HalaxyExistingPatient,
  HalaxyPreviewNote,
  HalaxyPreviewPatient,
  HalaxyPreviewResponse,
  HalaxyImportRequest,
  HalaxyImportPatient,
  HalaxyImportResponse,
} from './halaxy.js';

export {
  approximateTokens,
  boundedText,
  calendarDay,
  IdSchema,
  instantToLocalDay,
  MAX_BODY_CHARS,
  optionalText,
  TimestampSchema,
} from './common.js';

export { ApiErrorCodeSchema, ApiErrorSchema } from './errors.js';
export type { ApiError, ApiErrorCode } from './errors.js';

export {
  CLINICAL_GUIDANCE_VERSION,
  INTERVENTION_MODALITIES,
  PRESENTATION_MSE_DOMAINS,
  suggestInterventionApproach,
} from './clinical-guidance.js';
export type { InterventionModality, PresentationMseDomainName } from './clinical-guidance.js';

export {
  DEFAULT_MODEL,
  DEFAULT_TIER_GIB,
  isSupportedModelName,
  LARGE_MODEL,
  LARGE_TIER_GIB,
  modelForMemory,
  SMALL_MODEL,
} from './models.js';

export { FileVaultStateSchema, FileVaultStatusSchema, HealthResponseSchema } from './health.js';
export type { FileVaultState, FileVaultStatus, HealthResponse } from './health.js';

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
  STANDARD_PROGRESS_FORMAT,
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
  DetectFormatResponseSchema,
  DetectKindSchema,
  MAX_DETECT_CHARS,
  MAX_DETECT_FILES,
  MAX_SKILL_BYTES,
  MAX_UPLOAD_BYTES,
  MIN_EXTRACTED_CHARS,
  SKILL_TOKEN_BUDGET,
  SkillFlattenCountsSchema,
  SkillFlattenResponseSchema,
} from './detect.js';
export type { DetectFormatResponse, DetectKind, SkillFlattenCounts, SkillFlattenResponse } from './detect.js';

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

export {
  DEFAULT_KEEP_AUDIO,
  DEFAULT_STT_LANGUAGE,
  DEFAULT_WHISPER_BINARY,
  KEEP_AUDIO_SETTING,
  MAX_AUDIO_BYTES,
  MAX_DICTATION_SECONDS,
  MAX_RECORDING_SECONDS,
  MAX_STT_PROMPT_TOKENS,
  MAX_VOCABULARY_TERM_CHARS,
  MAX_VOCABULARY_TERMS,
  MIN_RECORDING_SECONDS,
  STT_ERROR_CODES,
  STT_LANGUAGE_SETTING,
  STT_VOCABULARY_SETTING,
  TRANSCRIBE_EVENT_NAMES,
  TranscribeFieldsSchema,
  TranscribeProgressEventSchema,
  WARN_RECORDING_SECONDS,
  WHISPER_BINARY_SETTING,
  WHISPER_MODEL_FILENAME,
  WHISPER_MODEL_SETTING,
  WHISPER_PREVIEW_MODEL_FILENAME,
  WHISPER_PREVIEW_MODEL_SETTING,
  PREVIEW_COMMIT_AFTER_SECONDS,
  PREVIEW_COMMIT_FORCE_SECONDS,
  PREVIEW_FIRST_MS,
  PREVIEW_INTERVAL_MS,
  PREVIEW_MAX_SECONDS,
  PREVIEW_MIN_GAP_MS,
  PREVIEW_SLOW_GAP_MS,
  TranscribeDictationResponseSchema,
  TranscribePreviewResponseSchema,
} from './transcribe.js';
export type {
  TranscribeEventName,
  TranscribeFields,
  TranscribeDictationResponse,
  TranscribePreviewResponse,
  TranscribeProgressEvent,
} from './transcribe.js';

export {
  AUDIO_BITS_PER_SAMPLE,
  AUDIO_CHANNELS,
  AUDIO_SAMPLE_RATE,
  encodeWav,
  floatToPcm16,
  parseWavHeader,
  WAV_CONTENT_TYPE,
  WAV_HEADER_BYTES,
  WavFormatError,
  wavHeader,
} from './wav.js';
export type { WavFormat } from './wav.js';

export { ChatMessageSchema, ChatRoleSchema, CreateChatMessageInputSchema } from './chat-message.js';
export type { ChatMessage, ChatRole, CreateChatMessageInput } from './chat-message.js';

export {
  CHAT_EVENT_NAMES,
  CHAT_HISTORY_TURNS,
  ChatErrorEventSchema,
  ChatMessageEventSchema,
  ChatMessageListResponseSchema,
  ChatNoteUpdatedEventSchema,
  ChatRequestSchema,
  ChatStatusEventSchema,
  ChatTokenEventSchema,
  FIRST_PASS_MESSAGE,
  PUBLISHED_REFUSAL,
} from './chat.js';
export type {
  ChatErrorEvent,
  ChatEventName,
  ChatMessageEvent,
  ChatMessageListResponse,
  ChatNoteUpdatedEvent,
  ChatRequest,
  ChatStatusEvent,
  ChatTokenEvent,
} from './chat.js';

export {
  BRAINSTORM_EVENT_NAMES,
  BRAINSTORM_HISTORY_TURNS,
  BrainstormContextEventSchema,
  BrainstormContextSchema,
  BrainstormErrorEventSchema,
  BrainstormMessageEventSchema,
  BrainstormMessageSchema,
  BrainstormNoteSchema,
  BrainstormReplySchema,
  BrainstormRequestSchema,
  BrainstormStatusEventSchema,
  BrainstormThreadResponseSchema,
  BrainstormTokenEventSchema,
  brainstormJsonSchema,
} from './brainstorm.js';
export type {
  BrainstormContext,
  BrainstormContextEvent,
  BrainstormErrorEvent,
  BrainstormEventName,
  BrainstormMessage,
  BrainstormMessageEvent,
  BrainstormNote,
  BrainstormReply,
  BrainstormRequest,
  BrainstormStatusEvent,
  BrainstormThreadResponse,
  BrainstormTokenEvent,
} from './brainstorm.js';

export {
  ACCENT_COLOR_SETTING,
  ANIMATIONS_SETTING,
  DEFAULT_ACCENT_COLOR,
  DEFAULT_FONT_SIZE,
  FONT_SCALE,
  FONT_SIZE_SETTING,
  FONT_SIZES,
  isAccentColor,
  isFontSize,
  LLM_PROFILE_SETTING,
  LlmProfileSchema,
  SettingKeySchema,
  SettingsSchema,
  UpdateSettingsRequestSchema,
} from './settings.js';
export type { FontSize, LlmProfile, Settings, UpdateSettingsRequest } from './settings.js';

export {
  buildRefineSchema,
  buildSectionsSchema,
  DetectedFormatSchema,
  detectedFormatJsonSchema,
  emptySectionNames,
  MAX_SECTION_CHARS,
  refineJsonSchema,
  sectionsJsonSchema,
  sectionsToText,
  textToSections,
  UNCLEAR_MARKER,
} from './sections.js';
export type { DetectedFormat, JsonSchemaObject, RefineResult, Sections } from './sections.js';

export {
  AiErrorCodeSchema,
  GENERATE_EVENT_NAMES,
  GenerateErrorEventSchema,
  GenerateNoteEventSchema,
  GenerateRequestSchema,
  GenerateStageSchema,
  GenerateStatusEventSchema,
  GenerateTokenEventSchema,
} from './generate.js';
export type {
  AiErrorCode,
  GenerateErrorEvent,
  GenerateEventName,
  GenerateNoteEvent,
  GenerateRequest,
  GenerateStage,
  GenerateStatusEvent,
  GenerateTokenEvent,
} from './generate.js';

export {
  ActivatePlanRequestSchema,
  addDays,
  ATTESTATION_TEXT,
  CalendarDateSchema,
  ClientParticipationSchema,
  CLINICIAN_CREDENTIAL_SETTING,
  CLINICIAN_LICENCE_SETTING,
  CLINICIAN_NAME_SETTING,
  CLINICIAN_NPI_SETTING,
  CreateGoalRequestSchema,
  DEFAULT_LOOKBACK_NOTES,
  DEFAULT_REVIEW_INTERVAL_DAYS,
  DiagnosisSchema,
  GoalEvidenceSchema,
  GoalSourceSchema,
  GoalStatusSchema,
  LOOKBACK_SETTING,
  MAX_LOOKBACK_NOTES,
  PlanGoalSchema,
  PlanObjectiveSchema,
  PlanResponseSchema,
  PlanStatusSchema,
  PlanVersionListResponseSchema,
  REVIEW_INTERVAL_SETTING,
  reviewDueState,
  StartPlanVersionRequestSchema,
  today,
  TreatmentPlanSchema,
  UpdateGoalRequestSchema,
  UpdatePlanRequestSchema,
} from './plan.js';
export type {
  ActivatePlanRequest,
  ClientParticipation,
  CreateGoalRequest,
  Diagnosis,
  GoalEvidence,
  GoalSource,
  GoalStatus,
  PlanGoal,
  PlanObjective,
  PlanResponse,
  PlanStatus,
  PlanVersionListResponse,
  ReviewDueState,
  StartPlanVersionRequest,
  TreatmentPlan,
  UpdateGoalRequest,
  UpdatePlanRequest,
} from './plan.js';

export {
  BriefCompositionSchema,
  briefCompositionJsonSchema,
  BriefLineSchema,
  BriefLookbackSchema,
  ComposedBriefLineSchema,
  MAX_BRIEF_LINE_CHARS,
  MAX_BRIEF_LINES,
  MAX_SUGGESTED_EVIDENCE,
  MAX_SUGGESTED_GOALS,
  MAX_SUGGESTED_INTERVENTIONS,
  MAX_SUGGESTED_OBJECTIVES,
  MAX_SUMMARY_EXCERPT_CHARS,
  MAX_SUMMARY_EXCERPTS,
  MAX_SUMMARY_POINT_CHARS,
  MAX_SUMMARY_POINTS,
  NoteSummarySchema,
  noteSummaryJsonSchema,
  PlanErrorEventSchema,
  PlanStageSchema,
  PlanStatusEventSchema,
  PlanSuggestionSchema,
  planSuggestionJsonSchema,
  PREP_EVENT_NAMES,
  PrepBriefEventSchema,
  PrepLineEventSchema,
  SaveBriefRequestSchema,
  SessionBriefContentSchema,
  SessionBriefListResponseSchema,
  SessionBriefSchema,
  SUGGEST_EVENT_NAMES,
  SuggestDoneEventSchema,
  SuggestedEvidenceSchema,
  SuggestedGoalSchema,
  SuggestedObjectiveSchema,
  SuggestGoalEventSchema,
} from './plan-ai.js';
export type {
  BriefComposition,
  BriefLine,
  BriefLookback,
  ComposedBriefLine,
  NoteSummary,
  PlanErrorEvent,
  PlanStage,
  PlanStatusEvent,
  PlanSuggestion,
  PrepBriefEvent,
  PrepEventName,
  PrepLineEvent,
  SaveBriefRequest,
  SessionBrief,
  SessionBriefContent,
  SessionBriefListResponse,
  SuggestDoneEvent,
  SuggestedEvidence,
  SuggestedGoal,
  SuggestedObjective,
  SuggestEventName,
  SuggestGoalEvent,
} from './plan-ai.js';

export {
  BACKUP_DIR_SETTING,
  BACKUP_DIRNAME,
  BACKUP_FILE_PREFIX,
  BACKUP_FILE_SUFFIX,
  BACKUP_STALE_DAYS,
  BackupFileSchema,
  BackupManifestSchema,
  BackupStatusResponseSchema,
  BackupStatusSchema,
  backupFilename,
  backupFilenameDate,
  classifyBackupDestination,
  CreateBackupRequestSchema,
  CreateBackupResponseSchema,
  DATA_JSON_FILENAME,
  DB_ENTRY_NAME,
  DestinationAdviceSchema,
  DestinationRiskSchema,
  ENCRYPTED_PAYLOAD_NAME,
  ENCRYPTION_META_FILENAME,
  EncryptionMetaSchema,
  KEEP_DAILY_BACKUPS,
  KEEP_MONTHLY_BACKUPS,
  LAST_BACKUP_AT_SETTING,
  LAST_BACKUP_ERROR_SETTING,
  LAST_BACKUP_FILE_SETTING,
  LAST_VERIFIED_RESTORE_SETTING,
  MANIFEST_FILENAME,
  MIN_BACKUP_PASSPHRASE,
  PENDING_RESTORE_DIRNAME,
  RESTORE_FILENAME,
  RestoreBackupRequestSchema,
  RestoreBackupResponseSchema,
  safeFilePart,
  VerifiedRestoreResponseSchema,
  SYNC_ROOT_RELATIVE_PATHS,
} from './backup.js';
export type {
  BackupFile,
  BackupManifest,
  BackupStatus,
  BackupStatusResponse,
  CreateBackupRequest,
  CreateBackupResponse,
  DestinationAdvice,
  DestinationRisk,
  EncryptionMeta,
  RestoreBackupRequest,
  RestoreBackupResponse,
  VerifiedRestoreResponse,
} from './backup.js';

export {
  MAX_RETRACTION_GAP_WORDS,
  MAX_WITHDRAWN_WORDS,
  RetractionCorrectionSchema,
  RetractionCorrectionsSchema,
  retractionCorrectionsJsonSchema,
} from './retractions.js';
export type { AppliedRetraction, RetractionCorrection, RetractionCorrections } from './retractions.js';

export {
  MAX_SPELLING_WORD_CHARS,
  MAX_SPELLING_WORDS,
  SPELLING_WORDS_SETTING,
  spellingWordsFrom,
} from './spelling.js';

export { planDocumentText } from './plan-document.js';
export type { PlanDocumentInput } from './plan-document.js';

export {
  ClaudeImportReportSchema,
  DEFAULT_IMPORT_CUTOFF,
  ImportCutoffSchema,
  ImportNameSourceSchema,
  ImportBatchListResponseSchema,
  ImportBatchSchema,
  importedNoteTitle,
  ImportNoteSourceSchema,
  ImportPatientPlanSchema,
  ImportSkippedConversationSchema,
  ImportSkipReasonSchema,
  ImportUndoResponseSchema,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_PATIENTS,
  parsePatientList,
} from './import.js';
export type {
  ClaudeImportReport,
  ImportBatch,
  ImportBatchListResponse,
  ImportNameSource,
  ImportNoteSource,
  ImportPatientPlan,
  ImportSkippedConversation,
  ImportSkipReason,
  ImportUndoResponse,
} from './import.js';

export { isLabelText, leadingLabel, MAX_LABEL_CHARS } from './note-labels.js';
