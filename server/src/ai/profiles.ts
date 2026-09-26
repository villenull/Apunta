import type { EffectiveModel, LlmProfile, Settings } from '@apunta/shared';
import { effectiveModel, PROMOTED_DEFAULT_MODEL } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { DEFAULT_OLLAMA_URL } from '../config.js';
import { getAllSettings, getSetting } from '../db/settings.js';

/**
 * The sole promoted profile; ModelEval rejected every Thorough candidate.
 *
 * Its tag is asserted to equal `PROMOTED_DEFAULT_MODEL` in this file's test.
 * That is the whole of `llm_profile`: a label for the settings screen and a
 * name for `llm_available_profiles`. It is **not** a second override path —
 * `effectiveModel` reads `llm_model` only — and the two agreeing is what keeps
 * the label describing the model the app will actually run.
 */
export const LLM_PROFILES: Partial<Record<LlmProfile, { model: string }>> = {
  quick: { model: PROMOTED_DEFAULT_MODEL },
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

/**
 * A read that either happened or did not. Both outcomes used to be an empty
 * set, and the empty set is what `installedModelTags` has to split apart.
 */
type InstalledRead = { readonly ok: true; readonly names: ReadonlySet<string> } | { readonly ok: false };

const modelCaches = new Map<string, ModelCache>();

function isLoopback(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'http:' && (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost')
    );
  } catch {
    return false;
  }
}

/** Cloud-backed Ollama variants must never be selected, even when tags are listed locally. */
export function isLocalModelTag(tag: string): boolean {
  return !tag.toLowerCase().includes(CLOUD_TAG);
}

async function readInstalledModelNames(
  baseUrl = DEFAULT_OLLAMA_URL,
  fetchImpl: typeof globalThis.fetch = (...args) => globalThis.fetch(...args),
): Promise<InstalledRead> {
  const normalized = baseUrl.replace(/\/+$/, '');
  if (!isLoopback(normalized)) return { ok: false };
  const now = Date.now();
  const cached = modelCaches.get(normalized);
  if (cached && cached.expiresAt > now) return { ok: true, names: cached.names };

  try {
    const response = await fetchImpl(`${normalized}/api/tags`, { signal: AbortSignal.timeout(2500) });
    if (!response.ok) return { ok: false };
    const body = (await response.json()) as { models?: Array<{ name?: string; model?: string }> };
    const names = new Set<string>();
    for (const entry of body.models ?? []) {
      for (const name of [entry.name, entry.model]) {
        if (typeof name === 'string' && isLocalModelTag(name)) names.add(name);
      }
    }
    modelCaches.set(normalized, { expiresAt: now + MODEL_CACHE_MS, names });
    return { ok: true, names };
  } catch {
    return { ok: false };
  }
}

export interface InstalledModelOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof globalThis.fetch;
}

/**
 * The installed-tag list C-MODEL@1's resolver needs, or `null` when the
 * runtime could not be asked.
 *
 * This is the one place that knows the difference. The 2 s `/api/tags` cache is
 * today's, unchanged; what is new is that a *failed* read now reports itself,
 * because a failed read and a successful read of an empty list are different
 * facts and the resolver needs to tell them apart. Reporting an unreachable
 * runtime as "no models installed" would tell the owner her model is gone
 * every time Ollama happens to be restarting.
 *
 * Exported so the health route feeds the same list to the same resolver rather
 * than keeping a second copy of the question.
 */
export async function installedModelTags(
  options: InstalledModelOptions = {},
): Promise<readonly string[] | null> {
  const read = await readInstalledModelNames(options.baseUrl, options.fetchImpl);
  return read.ok ? [...read.names] : null;
}

/**
 * The `llm_model` setting, trimmed, or `null` when it is absent or blank.
 *
 * Deliberately not filtered by `isLocalModelTag`: the resolver decides the tag
 * and `source`, and a cloud override is a real stored value whose truth is
 * "in effect, and not here". The cloud filter stays a guard at the use site.
 */
export function llmModelOverride(db: Database): string | null {
  const value = getSetting<unknown>(db, 'llm_model');
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

/**
 * C-MODEL@1's resolver, over this database and this runtime.
 *
 * `fakeAi` skips the runtime entirely: there is nothing to ask, and fake mode
 * reports the fake provider. Health reaches the same answer through
 * `effectiveModel()` directly, because it is handed an installed list it can
 * inject.
 */
export async function resolveEffectiveModel(
  db: Database,
  options: InstalledModelOptions & { readonly fakeAi?: boolean } = {},
): Promise<EffectiveModel> {
  const override = llmModelOverride(db);
  if (options.fakeAi === true) {
    // No runtime, so `installed` is unknown — and the fake provider reports its
    // model as present, which is the fact the caller is about to publish.
    return { ...effectiveModel({ override, installed: null }), present: true };
  }
  return effectiveModel({ override, installed: await installedModelTags(options) });
}

function configuredModel(db: Database): string {
  return llmModelOverride(db) ?? LLM_PROFILES.quick?.model ?? PROMOTED_DEFAULT_MODEL;
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
 * Resolve the sole promoted Quick profile while preserving the pre-existing
 * `llm_model` setting. ModelEval rejected every Thorough candidate, so there
 * is no default replacement or dead profile to expose.
 */
export async function resolveLlmProfile(
  db: Database,
  options: InstalledModelOptions & { readonly fakeAi?: boolean } = {},
): Promise<ResolvedLlmProfile> {
  const profiles = Object.keys(LLM_PROFILES) as LlmProfile[];
  const model = configuredModel(db);
  if (options.fakeAi) return { profile: 'quick', model, available: profiles };

  const names = await readInstalledModelNames(options.baseUrl, options.fetchImpl);
  // Today's behaviour for an unreadable runtime, kept verbatim: a failed read
  // has no names, so nothing is available. C-MODEL@1 changes which tag is
  // resolved, not how this list behaves.
  const available = profiles.filter((profile) => {
    const profileTag = profileModel(profile);
    return profileTag !== undefined && isLocalModelTag(model) && names.ok && names.names.has(model);
  });
  return { profile: 'quick', model, available };
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
