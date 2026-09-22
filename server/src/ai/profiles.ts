import type { LlmProfile, Settings } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { DEFAULT_OLLAMA_URL } from '../config.js';
import { getAllSettings, getSetting } from '../db/settings.js';

/** The only models the application may select for its two user-facing profiles. */
export const LLM_PROFILES: Record<LlmProfile, { model: string }> = {
  quick: { model: 'qwen3.5:4b-q4_K_M' },
  thorough: { model: 'THOROUGH_MODEL_TBD' },
};

export const LLM_PROFILE_SETTING = 'llm_profile';
export const LLM_AVAILABLE_PROFILES_SETTING = 'llm_available_profiles';
export const LLM_EFFECTIVE_PROFILE_SETTING = 'llm_effective_profile';

const MODEL_CACHE_MS = 2_000;
const CLOUD_TAG = 'cloud';

interface ModelCache {
  readonly expiresAt: number;
  readonly names: ReadonlySet<string>;
}

const modelCaches = new Map<string, ModelCache>();

function isLoopback(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost');
  } catch {
    return false;
  }
}

/** Cloud-backed Ollama variants must never be selected, even when tags are listed locally. */
export function isLocalModelTag(tag: string): boolean {
  return !tag.toLowerCase().includes(CLOUD_TAG);
}

async function installedModels(
  baseUrl = DEFAULT_OLLAMA_URL,
  fetchImpl: typeof globalThis.fetch = (...args) => globalThis.fetch(...args),
): Promise<ReadonlySet<string>> {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (!isLoopback(normalized)) return new Set();
  const now = Date.now();
  const cached = modelCaches.get(normalized);
  if (cached && cached.expiresAt > now) return cached.names;

  try {
    const response = await fetchImpl(`${normalized}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return new Set();
    const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const names = new Set<string>();
    for (const entry of body.models ?? []) {
      for (const name of [entry.name, entry.model]) {
        if (typeof name === 'string' && isLocalModelTag(name)) names.add(name);
      }
    }
    modelCaches.set(normalized, { expiresAt: now + MODEL_CACHE_MS, names });
    return names;
  } catch {
    return new Set();
  }
}

function configuredProfile(db: Database): LlmProfile | undefined {
  const value = getSetting<unknown>(db, LLM_PROFILE_SETTING);
  return value === 'quick' || value === 'thorough' ? value : undefined;
}

export function profileModel(profile: LlmProfile): string | undefined {
  return LLM_PROFILES[profile]?.model;
}

export interface ResolvedLlmProfile {
  readonly profile: LlmProfile;
  readonly model: string;
  readonly available: readonly LlmProfile[];
}

/**
 * Resolve the profile and model for every provider call. A stale stored choice
 * is ignored when its model disappeared; the default is Thorough, then Quick
 * is the final available fallback. When Ollama is down, Quick is returned so
 * the normal model-missing/unreachable error remains user-visible.
 */
export async function resolveLlmProfile(
  db: Database,
  options: {
    baseUrl?: string;
    fakeAi?: boolean;
    fetchImpl?: typeof globalThis.fetch;
  } = {},
): Promise<ResolvedLlmProfile> {
  const profiles = Object.keys(LLM_PROFILES) as LlmProfile[];
  if (options.fakeAi) {
    const available = profiles;
    const profile = configuredProfile(db) ?? (LLM_PROFILES.thorough ? 'thorough' : 'quick');
    return { profile, model: LLM_PROFILES[profile].model, available };
  }

  const names = await installedModels(options.baseUrl, options.fetchImpl);
  const available = profiles.filter((profile) => {
    const model = profileModel(profile);
    return model !== undefined && isLocalModelTag(model) && names.has(model);
  });
  const configured = configuredProfile(db);
  const preferred = configured ?? (LLM_PROFILES.thorough ? 'thorough' : 'quick');
  const selected = [preferred, 'quick' as const].find((profile) => available.includes(profile)) ?? 'quick';
  const model = profileModel(selected) ?? LLM_PROFILES.quick.model;
  return { profile: selected, model, available };
}

export async function resolveModel(
  db: Database,
  options: { baseUrl?: string; fakeAi?: boolean } = {},
): Promise<string> {
  return (await resolveLlmProfile(db, options)).model;
}

export async function settingsWithLlmProfiles(
  db: Database,
  options: { baseUrl?: string; fakeAi?: boolean } = {},
): Promise<Settings> {
  const settings = { ...getAllSettings(db) };
  const resolved = await resolveLlmProfile(db, options);
  settings[LLM_AVAILABLE_PROFILES_SETTING] = [...resolved.available];
  settings[LLM_EFFECTIVE_PROFILE_SETTING] = resolved.profile;
  return settings;
}

export function clearLlmProfileCache(): void {
  modelCaches.clear();
}
