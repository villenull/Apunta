import type { Database } from 'better-sqlite3';

import type { AppConfig } from '../config.js';
import { FakeLlmProvider, FakeSttProvider } from './fake.js';
import { resolveModel as resolveProfileModel } from './profiles.js';
import { OllamaProvider } from './ollama.js';
import {
  resolveSttLanguage,
  resolveWhisperBinary,
  resolveWhisperModel,
  resolveWhisperPreviewModel,
} from './stt-settings.js';
import type { AiProviders } from './types.js';
import { WhisperCppSttProvider } from './whisper.js';

/**
 * One factory, one switch: `APUNTA_FAKE_AI=1` gives the deterministic
 * providers, anything else talks to local Ollama. The profile resolver reads
 * Settings on every call so changing the choice takes effect immediately.
 */

export function createProviders(
  config: AppConfig,
  db: Database,
  log?: (message: string, detail: Record<string, unknown>) => void,
): AiProviders {
  if (config.fakeAi) {
    return {
      llm: new FakeLlmProvider({ streamDelayMs: config.fakeStreamDelayMs }),
      stt: new FakeSttProvider(),
    };
  }

  return {
    llm: new OllamaProvider({
      baseUrl: config.ollamaUrl,
      resolveModel: () => resolveProfileModel(db, { baseUrl: config.ollamaUrl }),
      ...(log ? { log } : {}),
    }),
    stt: new WhisperCppSttProvider({
      ...(log ? { log } : {}),
      resolveBinary: () => resolveWhisperBinary(db, config.whisperBin),
      resolveModel: () => resolveWhisperModel(db, config.modelsDir),
      resolvePreviewModel: () => resolveWhisperPreviewModel(db, config.modelsDir),
      resolveLanguage: () => resolveSttLanguage(db),
    }),
  };
}


export {
  LLM_AVAILABLE_PROFILES_SETTING,
  LLM_EFFECTIVE_PROFILE_SETTING,
  LLM_PROFILE_SETTING,
  LLM_PROFILES,
  clearLlmProfileCache,
  isLocalModelTag,
  profileModel,
  resolveLlmProfile,
  resolveModel,
  settingsWithLlmProfiles,
} from './profiles.js';
export type { LlmProfile } from '@apunta/shared';
export { AiError, aiError, UNREACHABLE_MESSAGE } from './errors.js';
export {
  applyDiscussionSubheadings,
  renderClinicalKnowledgeGuide,
  sectionForRole,
  sectionRole,
} from './clinical-knowledge/integration.js';
export {
  headingIsGrounded,
  MAX_SUBHEADING_WORDS,
  tidyDiscussionSubheadings,
} from './clinical-knowledge/discussion-subheadings.js';
export {
  documentInterventions,
  extractInterventionLabels,
  INTERVENTION_KNOWLEDGE,
  mapInterventions,
  NO_INFERENCE_CASES,
} from './clinical-knowledge/interventions.js';
export { PRESENTATION_MSE_KNOWLEDGE, renderPresentationMse } from './clinical-knowledge/presentation.js';
export { FakeLlmProvider, FakeSttProvider } from './fake.js';
export {
  resolveKeepAudio,
  resolveVocabulary,
  resolveWhisperBinary,
  resolveWhisperModel,
} from './stt-settings.js';
export {
  buildVocabularyPrompt,
  buildWhisperArgs,
  parseProgress,
  parseTranscript,
  whisperThreads,
  WhisperCppSttProvider,
} from './whisper.js';
export {
  assertGgufWeights,
  assertSupportedModelName,
  DEFAULT_MODEL,
  defaultModelForMachine,
  isSupportedModelName,
  LARGE_MODEL,
  modelForMemory,
  SMALL_MODEL,
} from './model-picker.js';
export {
  NUM_CTX,
  NUM_PREDICT,
  NUM_PREDICT_BRIEF,
  NUM_PREDICT_DETECT,
  NUM_PREDICT_PLAN,
  NUM_PREDICT_RETRACTIONS,
  NUM_PREDICT_SUMMARY,
  OllamaProvider,
} from './ollama.js';
export type * from './types.js';
