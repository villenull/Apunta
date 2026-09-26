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

  /**
   * "hoy" en minúscula, para la segunda mitad de la línea de la nota: en
   * español va en minúscula dentro de la frase (§2.4), y la frase ya dice
   * `editada`.
   */
  'note.editedToday': { text: 'hoy' },

  /**
   * La línea de la nota. `{name}` es el nombre del paciente — dato, nunca
   * traducido — y `{date}` es la marca de tiempo ISO, que `t()` formatea en la
   * configuración regional activa: `8 ago 2026` (§2.1), no `8/8/2026` escrito a
   * mano ni el `Aug 8, 2026` de la hoy en inglés.
   */
  'note.meta': {
    text: '{name} · creada {date}',
    kind: { name: 'text', date: 'date' },
  },

  /** La misma frase para una nota escrita hoy. */
  'note.metaToday': {
    text: '{name} · creada {today}',
    kind: { name: 'text', today: 'text' },
  },

  /** La segunda mitad de la línea, con el ` · ` que comparte con la primera. */
  'note.editedMeta': {
    text: ' · editada {date}',
    kind: { date: 'date' },
  },

  /** La misma mitad para una edición de hoy. */
  'note.editedMetaToday': {
    text: ' · editada {today}',
    kind: { today: 'text' },
  },

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

  /*
   * La concha, la pantalla de inicio, el panel de captura, la nota y el chat de
   * refinado: los catorce componentes de S2.3. Los términos salen del glosario
   * de S1.4 y la voz de sus decisiones: `tú` (O-1, §1), minúscula en la frase
   * (§2.4), `¿` en las preguntas (§2.5), y los nombres de producto sin
   * traducir (§3.4). La copia es de S2.7 y S2.8: una objeción de una
   * traductora a una palabra no es un defecto en este archivo.
   */

  /** `NoteBody.tsx:173`, `NoteView.tsx:600`: la última sección de una lista. */
  'common.listLast': { text: '{items} y {last}', kind: { items: 'text', last: 'text' } },

  /** `ConfirmDialog.tsx:47`. */
  'common.cancel': { text: 'Cancelar' },

  /** `Toast.tsx:44`. */
  'common.dismiss': { text: 'Descartar' },

  /** `ComposerButtons.tsx:109`. */
  'common.send': { text: 'Enviar' },

  /** `ComposerButtons.tsx:96`. */
  'common.stop': { text: 'Detener' },

  /** `RefineColumn.tsx:208`. */
  'common.tryAgain': { text: 'Intentar de nuevo' },

  /** `ThinkingDots.tsx:22`. */
  'common.working': { text: 'Procesando' },

  /** `RefineColumn.tsx:223`. */
  'common.thinking': { text: 'Pensando' },

  /** `HomeLauncher.tsx:85`. */
  'home.title': { text: 'Vamos a enfocarnos en…' },

  /** `HomeLauncher.tsx:92`. */
  'home.searchPlaceholder': { text: 'Buscar pacientes' },

  /** `HomeLauncher.tsx:93`. */
  'home.searchLabel': { text: 'Buscar un paciente' },

  /** `HomeLauncher.tsx:107`. */
  'home.resultsLabel': { text: 'Pacientes' },

  /** `HomeLauncher.tsx:146`. `{name}` es lo que ella escribió. */
  'home.newWith': { text: 'Nuevo: {name}', kind: { name: 'text' } },

  /** `LiveRecording.tsx:50`. */
  'capture.recordingSession': { text: 'Grabación de la sesión' },

  /** `LiveRecording.tsx:52`. */
  'capture.liveHint': {
    text: 'Habla con naturalidad. Puedes agregar notas escritas antes o durante esta grabación.',
  },

  /** `LiveRecording.tsx:74`, dos veces: lo que se ve y lo que se anuncia. */
  'capture.listening': { text: 'Escuchando palabras…' },

  /** `ComposerButtons.tsx:22`. */
  'dictation.previewNote': {
    text: 'Todo lo dicho hasta ahora, más o menos. Tu mensaje se escribe a partir de la grabación terminada.',
  },

  /** `ComposerButtons.tsx:32`. */
  'dictation.stop': { text: 'Dejar de dictar' },

  /** `ComposerButtons.tsx:71`. */
  'dictation.mic': { text: 'Dictar un mensaje' },

  /** `ComposerButtons.tsx:87`. */
  'dictation.transcribing': { text: 'Transcribiendo' },

  /** `InterventionApproachSuggestion.tsx:35`. */
  'approach.label': { text: 'Sugerencia de enfoque de intervención' },

  /** `InterventionApproachSuggestion.tsx:38`. */
  'approach.possible': { text: 'Posible enfoque para Intervención' },

  /**
   * `InterventionApproachSuggestion.tsx:54`. `{approach}` es la etiqueta que el
   * modelo compartido leyó de la nota: texto clínico, dato, sin traducir.
   */
  'approach.add': { text: 'Agregar {approach} a Intervención', kind: { approach: 'text' } },

  /** `InterventionApproachSuggestion.tsx:63`. */
  'approach.notNow': { text: 'Ahora no' },

  /** `RefineColumn.tsx:172`, `:184`, `NoteView.tsx:773`. */
  'refine.title': { text: 'Refinar nota' },

  /** `RefineColumn.tsx:190`, `NoteView.tsx:761`. */
  'refine.closeLabel': { text: 'Cerrar «Refinar nota»' },

  /** `RefineColumn.tsx:203`. */
  'refine.loadingConversation': { text: 'Cargando la conversación…' },

  /** `RefineColumn.tsx:213`. */
  'refine.empty': { text: 'Haz una pregunta sobre esta nota o da comentarios para refinarla.' },

  /** `RefineColumn.tsx:282`. */
  'refine.inputPlaceholder': { text: 'Haz una pregunta o da comentarios...' },

  /** `RefineColumn.tsx:283`. */
  'refine.inputLabel': { text: 'Haz una pregunta o da comentarios' },

  /**
   * `RefineColumn.tsx:28` y el `throw` de `:134`. `Apunta` es un nombre de
   * producto dentro de una frase: se escribe igual en los dos catálogos
   * (§3.4) y nunca entra en la lista de excepciones, que solo acepta cadenas
   * completas.
   */
  'refine.saveBeforeChat': {
    text: 'Tus últimos cambios no se han guardado, así que Apunta aún no puede usarlos. Inténtalo de nuevo.',
  },

  /** `RefineColumn.tsx:240`. */
  'refine.outcomeApplied': { text: 'Cambios aplicados' },

  /** `RefineColumn.tsx:242`. */
  'refine.outcomePartial': { text: 'Algunos cambios aplicados' },

  /** `RefineColumn.tsx:243`. */
  'refine.outcomeNone': { text: 'No se aplicaron cambios' },

  /** `RefineColumn.tsx:263`. */
  'refine.clearQuoteLabel': { text: 'Limpiar el extracto resaltado' },

  /** `NoteBody.tsx:151`. */
  'note.body': { text: 'Cuerpo de la nota' },

  /** `NoteBody.tsx:133`. `{sections}` son los nombres de sección del formato. */
  'notes.emptySections': {
    text: 'No hay nada registrado en {sections}: agrégalas o déjalas en blanco.',
    kind: { sections: 'text' },
  },

  /** `NoteView.tsx:643`. */
  'note.saveSaved': { text: 'Guardada' },

  /** `NoteView.tsx:638`. */
  'note.saveSaving': { text: 'Guardando…' },

  /** `NoteView.tsx:640`. */
  'note.saveError': { text: 'No se pudo guardar' },

  /** `NoteView.tsx:642`. */
  'note.saveConflict': { text: 'Cambiada en otra ventana' },

  /** `NoteView.tsx:647`. */
  'note.updating': { text: 'Actualizando la nota…' },

  /** `NoteView.tsx:772`. */
  'note.updatingShort': { text: 'Actualizando la nota' },

  /** `NoteView.tsx:652`. */
  'note.updatedSections': { text: 'Actualizada {sections}', kind: { sections: 'text' } },

  /** `NoteView.tsx:676`. */
  'note.copy': { text: 'Copiar' },

  /** `NoteView.tsx:676`. */
  'note.copied': { text: 'Copiado' },

  /** `NoteView.tsx:692`. */
  'note.editAgain': { text: 'Editar de nuevo' },

  /** `NoteView.tsx:692`. */
  'note.finishAndCopy': { text: 'Finalizar y copiar' },

  /** `NoteView.tsx:658-659`, `:794`. */
  'note.deleteLabel': { text: 'Eliminar nota' },

  /** `NoteView.tsx:797`: `¿` siempre, y sin punto detrás (§2.5). */
  'note.deleteTitle': { text: '¿Eliminar esta nota?' },

  /** `NoteView.tsx:801`. */
  'note.deleteBodyFirst': {
    text: 'La nota, su transcripción y la conversación de refinado se van. Aquí no se puede deshacer.',
  },

  /**
   * `NoteView.tsx:802`. *backup* es *copia de seguridad* (§3.3) y los posesivos
   * van en `tu` (O-1, §1); la raya larga inglesa se sustituye por un punto y
   * coma, que es lo que el español usa para separar esa idea (§2.5).
   */
  'note.deleteBodySecond': {
    text: 'Si ya pegaste esta nota en tu sistema de registros, esa copia no cambia; tampoco cambia ninguna copia de seguridad escrita antes de ahora.',
  },

  /** `NoteView.tsx:699`. */
  'note.conflictHelp': { text: 'Esta nota se cambió en otra ventana. Tus cambios siguen aquí.' },

  /** `NoteView.tsx:702-704`. */
  'note.conflictKeepMine': { text: 'Conservar la mía' },

  /** `NoteView.tsx:702-704`. */
  'note.conflictUnlockApply': { text: 'Desbloquear y aplicar mi cambio' },

  /** `NoteView.tsx:707`. */
  'note.conflictTakeTheirs': { text: 'Tomar la de ellos' },

  /** `NoteView.tsx:320`. */
  'note.unsavedConflict': { text: 'Conflicto sin resolver' },

  /** `NoteView.tsx:323`. */
  'note.unsavedError': { text: 'No se pudieron guardar los cambios pendientes' },
} satisfies Record<MessageKey, Message>;
