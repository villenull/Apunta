import type { Message, MessageKey } from './t.js';

/**
 * The es-MX catalogue, typed from the English one.
 *
 * `satisfies Record<MessageKey, Message>` is the whole point of this file: a
 * key English has and this one does not is a `tsc` error, and so is a key
 * this one has and English does not. There is no runtime check for either,
 * which is why `t.test.ts` reads the two objects and compares them per entry
 * as well — the types cannot see inside a string, so the placeholder names
 * are compared at runtime.
 *
 * The copy follows S1.4 (`docs/research/es-mx-ui-conventions.md`): `tú`
 * throughout (O-1, §1), sentence case for labels (§2.4), *copia de seguridad*
 * for backup (§3.3), and the ten keep-as-is tokens left alone (§3.4) — which
 * is why `brand.name` is the same word in both files. Dates and numbers are
 * not written here at all: `t()` renders them through `Intl` in the
 * requested locale, which is what produces `8 ago 2026` and `1,234` for
 * `es-MX` (S1.4 §2.1's day–month–year order; §2.3's separator is `Intl`'s
 * to decide, and the difference from the prose recommendation is recorded
 * for S2.7/S2.8).
 *
 * S2.7 and S2.8 own any later change to this copy, so a translator's
 * objection to a word is not a defect in this file.
 */
export const esMX = {
  /** The product's own name: never translated (S1.4 §3.4). */
  'brand.name': { text: 'Apunta' },

  /** The notes column's header. */
  'notes.title': { text: 'Notas' },

  /**
   * "{count} nota" / "{count} notas". es-MX needs three cardinals and has
   * three: `Intl.PluralRules('es-MX').resolvedOptions().pluralCategories` is
   * exactly `many`, `one` and `other` on this box (ICU 78.3), and a large
   * count such as 1,000,000 selects `many` — which is why the `many` form
   * cannot be left out here the way English's can.
   */
  'notes.count': {
    text: '{count} nota',
    plural: {
      one: '{count} nota',
      many: '{count} notas',
      other: '{count} notas',
    },
    kind: { count: 'number' },
  },

  /** "Hoy", for a note written in this session. */
  'notes.today': { text: 'Hoy' },

  /** A calendar date: `8 ago 2026`, rendered by `Intl` from `{day}`. */
  'notes.date': {
    text: '{day}',
    kind: { day: 'dateOnly' },
  },

  /** An instant as the local calendar date it fell on, from `{at}`. */
  'note.updatedAt': {
    text: '{at}',
    kind: { at: 'date' },
  },

  /**
   * The stale-backup warning. "copia de seguridad" is S1.4 §3.3's rendering
   * of *backup*, and the plural marks land on *días* alone; `many` and
   * `other` are the same sentence, because in Spanish they are.
   */
  'backup.stale': {
    text: 'No hay copias de seguridad de hace más de {days} día.',
    plural: {
      one: 'No hay copias de seguridad de hace más de {days} día.',
      many: 'No hay copias de seguridad de hace más de {days} días.',
      other: 'No hay copias de seguridad de hace más de {days} días.',
    },
    kind: { days: 'number' },
  },

  /**
   * The brainstorm thread's empty state. A colon rather than the English
   * em dash, which S1.4 §2.5 advises against in Spanish, and `tú` nowhere in
   * it because the app never has the clinician addressed directly here.
   */
  'brainstorm.empty': {
    text: 'Piensa en voz alta sobre {name}: esta conversación nunca se escribe en sus notas.',
    kind: { name: 'text' },
  },

  /**
   * `language_unavailable` in Spanish: `Elige` is the `tú` imperative (O-1),
   * and `español` stays lowercase mid-sentence (§2.4).
   */
  'errors.language_unavailable': {
    text: 'El español no está disponible en esta versión de Apunta. Elige inglés o instala la edición en español.',
  },
} satisfies Record<MessageKey, Message>;
