import { z } from 'zod';

/**
 * C-LANG@1 rule 2's one locale table.
 *
 * Everything that follows from "which language is this" is answered here and
 * nowhere else: the `Intl` locale the UI paints with, the code whisper's `-l`
 * takes, which speech model dictation runs on, which spell-check dictionary
 * S6.1 installs, and which prompt set the drafting paths load. A locale is not
 * a country and not a voice, so `en` and `es-MX` are the only two values — a
 * note's `locale`, a format's `locale` and the `language` setting are all this
 * one type rather than three lookalike enums that could drift apart.
 */
export const LOCALES = ['en', 'es-MX'] as const;
export const LocaleSchema = z.enum(LOCALES);
export type Locale = z.infer<typeof LocaleSchema>;

/**
 * What an unset column, an unset setting or a caller that names no locale gets.
 * D11: every document that exists today is English, and stays that way.
 */
export const DEFAULT_LOCALE: Locale = 'en';

export function isLocale(value: unknown): value is Locale {
  return (LOCALES as readonly unknown[]).includes(value);
}

export interface LocaleSettings {
  /** BCP 47 tag for the UI and for every `Intl` call. */
  readonly ui: Locale;
  /** Whisper's `-l` language code, which is not a BCP 47 tag. */
  readonly whisperLanguage: string;
  /**
   * The ggml speech-model file, or `null` when C-STT@1 has not selected one.
   *
   * `null` is a decision, not a gap: S4a.2 writes
   * `docs/v2/state/STT-SELECTION.json` and P4.3 wires the selection into
   * production code, and a `NO QUALIFYING CANDIDATE` result leaves it `null` —
   * which is what keeps Spanish dictation off and Spanish held. No candidate
   * is named here, so nothing in this file can be read as an acquisition.
   */
  readonly speechModel: string | null;
  /**
   * The Hunspell dictionary package, or `null` when none ships. English has
   * none today; `es-MX` carries S1.5's recommendation, which S6.1 installs
   * (acquisition row A11). Names only — this file downloads nothing.
   */
  readonly dictionary: string | null;
  /** A prompt-set id. Set ids only; no prompt text is held anywhere here. */
  readonly promptSet: string;
}

/**
 * English is the app as it has always been, and this row says so: the same
 * `Intl` locale, the same English speech model it already downloads, and no
 * dictionary, because none ships today.
 *
 * Spanish is the held locale. The UI tag and the whisper code are settled, the
 * dictionary is S1.5's recommendation, and the speech model is deliberately
 * empty until S4a.2 has chosen one.
 */
export const LOCALE_SETTINGS: Readonly<Record<Locale, LocaleSettings>> = Object.freeze({
  en: Object.freeze({
    ui: 'en',
    whisperLanguage: 'en',
    speechModel: 'ggml-tiny.en.bin',
    dictionary: null,
    promptSet: 'en',
  }),
  'es-MX': Object.freeze({
    ui: 'es-MX',
    whisperLanguage: 'es',
    speechModel: null,
    dictionary: 'dictionary-es-mx@2.0.0',
    promptSet: 'es-MX',
  }),
});

export function localeSettings(locale: Locale): LocaleSettings {
  return LOCALE_SETTINGS[locale];
}
