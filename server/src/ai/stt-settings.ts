import {
  DEFAULT_KEEP_AUDIO,
  DEFAULT_WHISPER_BINARY,
  KEEP_AUDIO_SETTING,
  MAX_VOCABULARY_TERM_CHARS,
  MAX_VOCABULARY_TERMS,
  STT_VOCABULARY_SETTING,
  WHISPER_BINARY_SETTING,
  WHISPER_MODEL_FILENAME,
  WHISPER_MODEL_SETTING,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import { join } from 'node:path';

import { getSetting } from '../db/settings.js';

/**
 * The settings the speech-to-text path reads (M5).
 *
 * Every one has a working default, so a practice that has configured nothing
 * still records: `whisper-cli` off PATH, the model where the setup script puts
 * it, no vocabulary bias, and the audio deleted once it has been transcribed.
 *
 * Read per call rather than captured at boot, so changing a path in Settings
 * takes effect on the next recording instead of the next restart — the same
 * rule `llm_model` follows.
 */

/**
 * `whisper-cli`, or whatever absolute path Settings names.
 *
 * Three layers, most specific first: the `whisper_binary` setting, then the
 * one bundled inside `Apunta.app` (M8 — there is no Homebrew and nothing on
 * `PATH` there), then `whisper-cli` off `PATH` for a developer machine.
 */
export function resolveWhisperBinary(db: Database, bundled?: string | undefined): string {
  const configured = getSetting<unknown>(db, WHISPER_BINARY_SETTING);
  if (typeof configured === 'string' && configured.trim() !== '') return configured.trim();
  if (bundled !== undefined && bundled.trim() !== '') return bundled.trim();
  return DEFAULT_WHISPER_BINARY;
}

/** The GGUF file, defaulting to `<data dir>/models/<filename>` (PLAN §2). */
export function resolveWhisperModel(db: Database, modelsDir: string): string {
  const configured = getSetting<unknown>(db, WHISPER_MODEL_SETTING);
  return typeof configured === 'string' && configured.trim() !== ''
    ? configured.trim()
    : join(modelsDir, WHISPER_MODEL_FILENAME);
}

/**
 * The vocabulary list, cleaned here rather than trusted from the store.
 *
 * Settings is a free-form JSON key/value table, so this reads whatever is
 * there and keeps only the parts that are usable — a corrupt row must not be
 * able to break a recording, and the count is bounded because the rendered
 * prompt shares whisper's text context window.
 */
export function resolveVocabulary(db: Database): string[] {
  const stored = getSetting<unknown>(db, STT_VOCABULARY_SETTING);
  if (!Array.isArray(stored)) return [];

  const terms: string[] = [];
  const seen = new Set<string>();
  for (const entry of stored) {
    if (typeof entry !== 'string') continue;
    const term = entry.trim().slice(0, MAX_VOCABULARY_TERM_CHARS);
    const key = term.toLowerCase();
    if (term === '' || seen.has(key)) continue;
    seen.add(key);
    terms.push(term);
    if (terms.length === MAX_VOCABULARY_TERMS) break;
  }
  return terms;
}

/** Keep the recording after it has been transcribed? Off unless she says so. */
export function resolveKeepAudio(db: Database): boolean {
  const stored = getSetting<unknown>(db, KEEP_AUDIO_SETTING);
  return typeof stored === 'boolean' ? stored : DEFAULT_KEEP_AUDIO;
}
