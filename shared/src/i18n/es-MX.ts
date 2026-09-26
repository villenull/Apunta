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
   * Las frases del servidor: la lista de S2.5. Los mismos siete comentarios que
   * en `en.ts`, con el vocabulario de S1.4: *tú* (O-1, §1), minúscula en la
   * frase (§2.4), «Configuración inicial» por Setup y «Ajustes» por Settings
   * (§3.3), y los nombres propios sin traducir (§3.4). El texto entrecomillado
   * que nombra un control de la interfaz se traduce con él, porque así es como
   * se lee en la pantalla española.
   */

  'errors.internal_error': { text: 'Algo salió mal en el servidor.' },
  'errors.not_found.route': { text: 'No encontrado' },
  'errors.backup_in_progress': {
    text: 'Ya hay otra copia de seguridad en curso. Espera a que termine e inténtalo de nuevo.',
  },
  'errors.stale_write.note_changed': { text: 'Esta nota cambió en otra ventana.' },

  'errors.bad_request.body_invalid': { text: 'El cuerpo de la solicitud no es válido' },
  'errors.bad_request.query_invalid': { text: 'La cadena de consulta no es válida' },
  'errors.bad_request.params_invalid': { text: 'Los parámetros de la ruta no son válidos' },
  'errors.bad_request.needs_format': {
    text: 'Crea un formato de nota antes de importar, para que las notas tengan a dónde ir.',
  },
  'errors.bad_request.backup_path_not_absolute': {
    text: 'La carpeta de la copia de seguridad debe ser una ruta absoluta.',
  },
  'errors.bad_request.backup_filename_invalid': {
    text: '{name} no es un nombre de archivo de copia de seguridad de Apunta (apunta-backup-YYYY-MM-DD.zip).',
    kind: { name: 'text' },
  },
  'errors.bad_request.format_detect_kind': {
    text: 'Dile a Apunta si son una plantilla vacía o notas completadas.',
  },
  'errors.bad_request.format_detect_no_file': {
    text: 'Elige un archivo para leer el formato.',
  },
  'errors.bad_request.format_detect_examples': {
    text: 'Sube 2 o 3 notas completadas para que Apunta vea qué tienen en común.',
  },
  'errors.bad_request.format_detect_unusable': {
    text: 'Apunta leyó el archivo pero no pudo armar un formato utilizable. Describe tú las secciones.',
  },
  'errors.bad_request.format_detect_skill_file': {
    text: 'Elige un archivo SKILL.md o un .zip de la carpeta de la habilidad.',
  },
  'errors.bad_request.format_detect_one_file': { text: 'Sube un archivo a la vez.' },
  'errors.bad_request.format_detect_too_many_files': {
    text: 'Sube como máximo {max} archivos a la vez.',
    kind: { max: 'number' },
  },
  'errors.bad_request.format_detect_file_too_large': {
    text: 'Ese archivo pesa más de 10 MB. Si es un escaneo, Apunta tampoco puede leerlo: no hace OCR.',
  },
  'errors.bad_request.format_detect_not_multipart': {
    text: 'Sube el archivo con el formulario de la pantalla anterior.',
  },

  'errors.bad_request.halaxy_selection_invalid': {
    text: 'La selección de la revisión de Halaxy no es válida.',
  },
  'errors.bad_request.halaxy_no_patients': {
    text: 'Selecciona al menos un paciente para importar.',
  },
  'errors.bad_request.halaxy_patient_unmatched': {
    text: 'Elige un paciente activo que coincida o crea uno nuevo antes de importar.',
  },
  'errors.bad_request.halaxy_not_multipart': {
    text: 'Envía uno o más PDF como multipart/form-data usando el campo files.',
  },
  'errors.bad_request.halaxy_wrong_field': { text: 'Sube los PDF en el campo files.' },
  'errors.bad_request.halaxy_not_pdf': {
    text: 'Las exportaciones de Halaxy deben ser archivos PDF.',
  },
  'errors.bad_request.halaxy_pdf_too_large': {
    text: 'Un PDF es demasiado grande para leerlo de una vez.',
  },
  'errors.bad_request.halaxy_pdfs_too_large': {
    text: 'Los PDF seleccionados son demasiado grandes para leerlos de una vez.',
  },
  'errors.bad_request.halaxy_no_files': { text: 'Elige al menos un PDF de Halaxy.' },
  'errors.bad_request.halaxy_unreadable': {
    text: 'Apunta no pudo leer ese PDF. Elige una exportación de Halaxy con texto.',
  },
  'errors.bad_request.halaxy_no_patient_header': {
    text: 'El PDF no identifica a ningún paciente en su encabezado.',
  },
  'errors.bad_request.halaxy_no_dated_sessions': {
    text: 'El PDF no tiene sesiones fechadas inequívocas para importar.',
  },
  'errors.bad_request.halaxy_no_session_text': {
    text: 'El PDF tiene encabezados con fecha pero ningún texto de sesión.',
  },

  'errors.bad_request.import_not_multipart': {
    text: 'Envía la exportación como multipart/form-data con un solo archivo.',
  },
  'errors.bad_request.import_too_large': {
    text: 'Esa exportación es demasiado grande para leerla de una vez.',
  },
  'errors.bad_request.import_no_file': {
    text: 'No llegó ningún archivo. Elige la exportación que te envió Claude.',
  },
  'errors.bad_request.import_patient_limit': {
    text: 'Escribe como máximo {max} nombres.',
    kind: { max: 'number' },
  },
  'errors.bad_request.import_bad_source': {
    text: 'El origen de las notas debe ser "assistant" o "human".',
  },
  'errors.bad_request.import_bad_cutoff': { text: 'Usa una fecha de corte como 2026-07-01.' },
  'errors.bad_request.import_bad_exclude': {
    text: 'No se pudo leer la lista de pacientes desmarcados.',
  },
  'errors.bad_request.import_bad_existing': {
    text: 'No se pudieron leer las opciones de importación de pacientes.',
  },
  'errors.bad_request.import_not_claude_export': {
    text: 'Ese archivo no es una exportación de Claude. Se esperaba el zip que te envió Claude, o su conversations.json.',
  },
  'errors.bad_request.import_no_conversations_json': {
    text: 'Ese zip no trae conversations.json, así que no es una exportación de Claude.',
  },
  'errors.bad_request.import_json_unreadable': {
    text: 'No se pudo leer {filename} como JSON.',
    kind: { filename: 'text' },
  },
  'errors.bad_request.import_no_conversations': {
    text: 'No se encontró ninguna conversación en ese archivo.',
  },
  'errors.bad_request.prep_foreign_note': {
    text: 'Este resumen previo cita una nota que no pertenece a este paciente',
  },
  'errors.bad_request.settings_bad_language': { text: 'El idioma debe ser "en" o "es-MX".' },
  'errors.bad_request.wav_unreadable': { text: 'No se pudo leer ese audio como WAV.' },
  'errors.bad_request.dictation_too_long': {
    text: 'Un mensaje dictado puede durar hasta {max} minutos.',
    kind: { max: 'number' },
  },
  'errors.bad_request.transcribe_not_multipart': {
    text: 'Envía la grabación como multipart/form-data con un solo archivo de audio.',
  },
  'errors.bad_request.transcribe_too_long': {
    text: 'Esa grabación es demasiado larga para subirla. Graba en sesiones más cortas.',
  },
  'errors.bad_request.transcribe_no_audio': { text: 'No se subió ningún audio.' },

  'errors.not_found.note': { text: 'No se encontró la nota' },
  'errors.not_found.note_format': { text: 'No se encontró el formato de nota' },
  'errors.not_found.patient': { text: 'No se encontró el paciente' },
  'errors.not_found.plan': { text: 'No se encontró el plan' },
  'errors.not_found.plan_version': { text: 'No existe esa versión del plan' },
  'errors.not_found.goal': { text: 'No se encontró la meta' },
  'errors.not_found.import_undone': { text: 'Esa importación ya se ha deshecho.' },
  'errors.not_found.backup_file': {
    text: '{file} no es un archivo de copia de seguridad en la carpeta de copias.',
    kind: { file: 'text' },
  },

  'errors.conflict.format_in_use': {
    text: 'Este formato lo usa {count} nota y no se puede eliminar.',
    plural: {
      one: 'Este formato lo usa {count} nota y no se puede eliminar.',
      many: 'Este formato lo usan {count} notas y no se puede eliminar.',
      other: 'Este formato lo usan {count} notas y no se puede eliminar.',
    },
    kind: { count: 'number' },
  },
  'errors.conflict.plan_draft_exists': {
    text: 'Este plan ya tiene una versión en borrador. Actívala o edítala primero.',
  },
  'errors.conflict.plan_superseded_activate': {
    text: 'Una versión de plan que quedó obsoleta no se puede volver a activar.',
  },
  'errors.conflict.plan_already_active': { text: 'Esta versión ya está en vigencia.' },
  'errors.conflict.plan_superseded_readonly': {
    text: 'Esta versión del plan quedó obsoleta y es de solo lectura. Empieza una revisión.',
  },
  'errors.conflict.note_published': { text: 'Esta nota ya está publicada.' },
  'errors.conflict.note_not_published': { text: 'Esta nota no está publicada.' },
  'errors.conflict.note_published_lock': {
    text: 'Esta nota está publicada, así que su contenido está bloqueado. Despublica primero y después edítala.',
  },

  'errors.storage_error.disk_full': {
    text: 'Apunta no puede escribir en {dir} porque el disco está lleno. Libera espacio e inténtalo de nuevo. Tus datos existentes quedaron intactos.',
    kind: { dir: 'text' },
  },
  'errors.storage_error.read_only': {
    text: 'Apunta no puede escribir en {dir} porque la carpeta es de solo lectura o los permisos no permiten el acceso. Elige una carpeta donde se pueda escribir o corrige sus permisos e inténtalo de nuevo. Tus datos existentes quedaron intactos.',
    kind: { dir: 'text' },
  },
  'errors.storage_error.cannot_open': {
    text: 'Apunta no pudo abrir su base de datos en {file}. Revisa que la carpeta permita escritura e inténtalo de nuevo.',
    kind: { file: 'text' },
  },
  'errors.storage_error.cause': {
    text: '{detail} Base de datos: {file}.',
    kind: { detail: 'text', file: 'text' },
  },

  /* Los veinte fallos de IA. `configuración inicial` en minúscula dentro de la frase. */
  'ai.unreachable_banner': {
    text: 'Apunta no puede acceder a la IA local: ve a Configuración inicial',
  },
  'ai.ollama_unreachable': {
    text: '{banner}. Ollama no parece estar ejecutándose en esta computadora.',
    kind: { banner: 'text' },
  },
  'ai.model_missing': {
    text: 'El modelo de IA de Apunta todavía no está instalado: ve a Configuración inicial, que te explica cómo obtenerlo.',
  },
  'ai.non_gguf_model': {
    text: 'El modelo configurado no es una compilación GGUF, y Apunta no puede hacer que siga el formato de nota de forma confiable. Elige un modelo GGUF en Ajustes.',
  },
  'ai.unsupported_model_tag': {
    text: 'Esa etiqueta de modelo es una compilación MLX/safetensors. Apunta no puede hacer que esas sigan el formato de nota de forma confiable: elige una etiqueta GGUF.',
  },
  'ai.insufficient_memory': {
    text: 'A esta computadora le faltó memoria al cargar el modelo de IA. Elige un modelo más pequeño en Ajustes e inténtalo de nuevo.',
  },
  'ai.input_too_long': {
    text: 'Este resumen de sesión es demasiado largo para que la IA lo lea de una vez. Acórtalo o divídelo en dos notas.',
  },
  'ai.context_overflow': {
    text: 'A la IA se le acabó el espacio y tuvo que descartar parte de las instrucciones de Apunta, así que se tiró el borrador. Acorta el resumen e inténtalo de nuevo.',
  },
  'ai.output_truncated': {
    text: 'A la IA se le acabó el espacio a media nota. Inténtalo de nuevo o acorta el resumen.',
  },
  'ai.empty_response': {
    text: 'La IA no devolvió nada. Inténtalo de nuevo; si sigue pasando, revisa Configuración inicial.',
  },
  'ai.invalid_output': {
    text: 'La IA devolvió algo que no era una nota. Inténtalo de nuevo; si sigue pasando, puede que el modelo no esté siguiendo el formato de nota.',
  },
  'ai.degenerate_output': {
    text: 'La IA se atascó repitiéndose en vez de escribir la nota. Inténtalo de nuevo; si sigue pasando, prueba con otro modelo en Ajustes.',
  },
  'ai.timeout': {
    text: 'La IA tardó demasiado en responder. Puede que todavía esté cargando el modelo: inténtalo de nuevo en un momento.',
  },
  'ai.ollama_error': {
    text: 'La IA local reportó un error. Revisa Configuración inicial e inténtalo de nuevo.',
  },
  'ai.whisper_missing': {
    text: 'Apunta no encuentra whisper en esta computadora, así que no puede transcribir la grabación. Ve a Configuración inicial o ajusta la ruta de whisper en Ajustes.',
  },
  'ai.whisper_model_missing': {
    text: 'El modelo de transcripción de Apunta todavía no está instalado: ve a Configuración inicial, que te explica cómo obtenerlo.',
  },
  'ai.audio_unsupported': {
    text: 'Esa grabación está en un formato que Apunta no puede transcribir. Grábala de nuevo desde esta pantalla.',
  },
  'ai.audio_decode_failed': {
    text: 'No se pudo leer la grabación; puede que se haya cortado a media guardar. Grábala de nuevo.',
  },
  'ai.transcription_failed': {
    text: 'Falló la transcripción de la grabación. Inténtalo de nuevo; si sigue pasando, revisa Configuración inicial.',
  },
  'ai.transcription_timeout': {
    text: 'La transcripción tardó demasiado y se detuvo. Una grabación más corta sí va a pasar; una muy larga puede necesitar una computadora más rápida.',
  },
  'ai.transcription_empty': {
    text: 'No se detectó voz en esa grabación. Revisa que esté seleccionado el micrófono correcto y graba de nuevo.',
  },

  /* Los cuadros `status` y `progress`. */
  'status.thinking': { text: 'Pensando…' },
  'status.applying_corrections': { text: 'Aplicando tus correcciones…' },
  'status.drafting_retry': { text: 'Ese borrador salió mal formado. Intentando de nuevo…' },
  'status.loading_model': {
    text: 'Cargando el modelo: la primera nota después de reiniciar tarda más…',
  },
  'status.drafting_note': { text: 'Redactando la nota…' },
  'status.saving_draft': { text: 'Guardando el borrador…' },
  'status.applying_move': { text: 'Aplicando el movimiento…' },
  'status.rewriting_sections': {
    text: 'Reescribiendo {done} de {total} secciones…',
    kind: { done: 'number', total: 'number' },
  },
  'status.reading_note': {
    text: 'Leyendo la nota {index} de {total}…',
    kind: { index: 'number', total: 'number' },
  },
  'status.drafting_goals': { text: 'Redactando las metas…' },
  'status.writing_briefing': { text: 'Redactando el resumen previo…' },
  'progress.transcribing': { text: 'Transcribiendo…' },

  /* Las frases del chat de refinado. */
  'chat.publishedRefusal': {
    text: 'Esta nota está publicada, así que no la voy a cambiar. Haz clic en «Publicada (haz clic para editar)» para desbloquearla primero y después pídemelo otra vez.',
  },
  'chat.firstPass': {
    text: 'Este es un primer borrador basado en tu dictado. Dime qué cambiar —acortar una sección, agregar algo que se me pasó, ajustar el tono— y lo actualizo. Resalta cualquier parte de la nota para señalarme exactamente dónde.',
  },
  'chat.moveReply': {
    text: 'Moví el texto citado de {source} a {target}.',
    kind: { source: 'text', target: 'text' },
  },
  'chat.guardNotice.opening': { text: 'Apunta bloqueó una parte de esta revisión.' },
  'chat.guardNotice.section': {
    text: '{section} se dejó como estaba: la revisión habría agregado "{phrase}", que no está en la nota ni en tu dictado.',
    kind: { section: 'text', phrase: 'text' },
  },
  'chat.factNotice.opening': { text: 'Apunta retuvo una parte de esta revisión.' },
  'chat.factNotice.section': {
    text: '{section} se dejó como estaba: el cambio habría perdido "{phrase}", y nada en tu mensaje pedía quitarla.',
    kind: { section: 'text', phrase: 'text' },
  },
  'chat.factNotice.tail': { text: 'Para quitar algo, dilo y nomíbralo.' },
  'chat.priorNoteNotice.opening': { text: 'Apunta dejó fuera tus otras notas de esta revisión.' },
  'chat.priorNoteNotice.section': {
    text: '{section} se dejó como estaba: la revisión habría traído "{phrase}" de otra de tus notas.',
    kind: { section: 'text', phrase: 'text' },
  },
  'chat.priorNoteNotice.tail': {
    text: 'Para traer algo de otra sesión, pídelo.',
  },

  'backup.failure': { text: '{at} — {detail}', kind: { at: 'date', detail: 'text' } },

  /* La página de error de arranque, en los dos idiomas. */
  'boot.title': { text: 'Apunta no pudo iniciar' },
  'boot.dataFolder': { text: 'Carpeta de datos:' },
  'boot.recovery': {
    text: 'Asegúrate de que el disco tenga espacio y de que esta carpeta esté disponible y permita escritura, y luego inicia Apunta de nuevo. Tu base de datos existente quedó intacta.',
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

  /*
   * El resto de la aplicación web: las doce rutas, los veintitrés componentes
   * que S2.3 no tocó y los doce literales de `web/src/App.tsx`.
   *
   * La voz es la de S1.4 y la de S2.3: `tú` (O-1, §1), minúscula dentro de la
   * frase (§2.4), `¿` en las preguntas (§2.5), `«»` para lo citado, y sin raya
   * larga como paréntesis (§2.5). Los términos salen del glosario: *nota*,
   * *borrador*, *copia de seguridad* (§3.3), *lluvia de ideas*, *resumen previo*,
   * *plan de tratamiento*, *participación del cliente*, *cédula profesional*
   * para la licencia profesional y *licencia* para la del software.
   *
   * Los nombres de producto y los identificadores van sin traducir (§3.4),
   * incluso dentro de una frase: `Apunta`, `Claude`, `Halaxy`, `Mac`, `NPI`,
   * `PDF`, `SKILL.md`, `conversations.json`, `RESTORE.txt` y
   * `/Volumes/Backup/Apunta` se escriben igual que en inglés, nunca entran en
   * la lista de excepciones y nunca se separan en una clave propia.
   *
   * Cada entrada repite el `kind` de su clave en inglés, y no por gusto:
   * `t()` lee el `kind` de la entrada que eligió, así que una entrada en
   * español sin `dateOnly` imprimiría `2026-11-21` donde el inglés imprime
   * `Nov 21, 2026`. Las fechas y los números no se escriben aquí: `t()` los
   * formatea con `Intl` en la configuración regional pedida, que es lo que
   * produce `8 ago 2026` y `1,234` para `es-MX` (§2.1, §2.3). Los conteos
   * plurales llevan las tres formas que `Intl.PluralRules('es-MX')` puede
   * elegir en esta máquina: `one`, `many` y `other`.
   *
   * La copia es de S2.7 y S2.8: una objeción de una traductora a una palabra no
   * es un defecto en este archivo. Dos decisiones se dejan anotadas para ellas:
   * `plan.target` usa «objetivo» porque «meta» ya es la meta del plan, y
   * `patients.namePlaceholder` conserva el nombre de muestra en inglés porque
   * `e2e/fixtures/eval-es/NAMES.md` todavía no existe (O-3, §3.5).
   */
  'common.loading': {
    text: 'Cargando…',
  },
  'common.checkAgain': {
    text: 'Revisar de nuevo',
  },
  'common.setup': {
    text: 'Configuración inicial',
  },
  'common.settings': {
    text: 'Ajustes',
  },
  'common.back': {
    text: 'Atrás',
  },
  'common.patients': {
    text: 'Pacientes',
  },
  'common.search': {
    text: 'Buscar',
  },
  'common.searchPatients': {
    text: 'Buscar pacientes',
  },
  'common.copy': {
    text: 'Copiar',
  },
  'common.copied': {
    text: 'Copiado',
  },
  'common.notRecorded': {
    text: 'No registrado',
  },
  'common.thinkingBusy': {
    text: 'Pensando…',
  },
  'common.starting': {
    text: 'Iniciando…',
  },
  'common.importing': {
    text: 'Importando…',
  },
  'common.reading': {
    text: 'Leyendo…',
  },
  'common.keep': {
    text: 'Conservar',
  },
  'common.kept': {
    text: 'Conservado',
  },
  'common.add': {
    text: 'Agregar',
  },
  'common.save': {
    text: 'Guardar',
  },
  'common.edit': {
    text: 'Editar',
  },
  'common.archive': {
    text: 'Archivar',
  },
  'common.undo': {
    text: 'Deshacer',
  },
  'doc.settings': {
    text: 'Ajustes',
  },
  'doc.setup': {
    text: 'Configuración inicial',
  },
  'doc.about': {
    text: 'Acerca de',
  },
  'doc.licences': {
    text: 'Licencias',
  },
  'doc.patients': {
    text: 'Pacientes',
  },
  'doc.newPatient': {
    text: 'Nuevo paciente',
  },
  'doc.newNote': {
    text: 'Nueva nota',
  },
  'doc.noteFormat': {
    text: 'Formato de nota',
  },
  'doc.importClaude': {
    text: 'Importar desde Claude',
  },
  'doc.importHalaxy': {
    text: 'Importar desde Halaxy',
  },
  'app.primary.opening': {
    text: 'Abriendo Apunta…',
  },
  'app.primary.checking': {
    text: 'Comprobando cuál ventana es la principal.',
  },
  'app.primary.unsupportedTitle': {
    text: 'Este navegador no puede mantener una sola ventana de edición',
  },
  'app.primary.unsupportedBody': {
    text: 'Apunta necesita la API de Web Locks para asegurarse de que solo una ventana edite a la vez, y este navegador no la tiene. Esta ventana queda bloqueada y sin acceso a la edición: abre Apunta en Chromium o Safari para continuar.',
  },
  'app.primary.takingOver': {
    text: 'Tomando el control…',
  },
  'app.primary.takingOverBody': {
    text: 'La otra ventana está guardando sus cambios pendientes y retirándose. Esta ventana se desbloquea en cuanto lo haga.',
  },
  'app.primary.blockedTitle': {
    text: 'Apunta está abierto en otra ventana',
  },
  'app.primary.blockedBody': {
    text: 'Solo una ventana puede editar a la vez, así que esta ventana está bloqueada. ¿Quieres que esta ventana pase a ser la principal? La otra ventana guarda su trabajo y queda bloqueada en su lugar.',
  },
  'app.primary.decline': {
    text: 'Ahora no',
  },
  'app.primary.takeover': {
    text: 'Hacer esta ventana la principal',
  },
  'ai.modelMissing': {
    text: 'Apunta no encuentra el modelo de IA{model} — mira',
    kind: { model: 'text' },
  },
  'ai.unreachable': {
    text: 'Apunta no puede alcanzar la IA local — mira',
  },
  'ai.bannerTail': {
    text: '. Todo excepto redactar una nota nueva sigue funcionando.',
  },
  'backup.title': {
    text: 'Copia de seguridad',
  },
  'backup.restore': {
    text: 'Restaurar',
  },
  'backup.cancelPending': {
    text: 'Cancelarla',
  },
  'backup.noneYet': {
    text: 'Aún no hay copias de seguridad',
  },
  'backup.lastAt': {
    text: 'Última copia de seguridad: {when}',
    kind: { when: 'text' },
  },
  'backup.justNow': {
    text: 'ahora mismo',
  },
  'backup.minutesAgo': {
    text: 'hace {count} minuto',
    plural: {
      one: 'hace {count} minuto',
      many: 'hace {count} minutos',
      other: 'hace {count} minutos',
    },
    kind: { count: 'number' },
  },
  'backup.hoursAgo': {
    text: 'hace {count} hora',
    plural: {
      one: 'hace {count} hora',
      many: 'hace {count} horas',
      other: 'hace {count} horas',
    },
    kind: { count: 'number' },
  },
  'backup.yesterday': {
    text: 'ayer',
  },
  'backup.daysAgo': {
    text: 'hace {count} días',
    kind: { count: 'number' },
  },
  'backup.working': {
    text: 'Trabajando…',
  },
  'backup.now': {
    text: 'Hacer una copia ahora',
  },
  'backup.failed': {
    text: 'La última copia de seguridad falló: {detail}',
    kind: { detail: 'text' },
  },
  'backup.restoreWaiting': {
    text: 'Hay una restauración pendiente: sal de Apunta y vuelve a abrirlo para terminarla.',
  },
  'backup.restoreCancelled': {
    text: 'Restauración cancelada. No cambió nada.',
  },
  'backup.done': {
    text: 'Copia guardada: {notes} notas, {bytes}, revisada e íntegra.',
    kind: { notes: 'text', bytes: 'text' },
  },
  'backup.pruned': {
    text: 'se eliminaron {count} más antiguas.',
    kind: { count: 'text' },
  },
  'backup.folder': {
    text: 'Carpeta',
  },
  'backup.sameDisk': {
    text: 'Estas copias de seguridad están en el mismo disco que tus notas; una memoria USB es más seguro.',
  },
  'backup.changeFolder': {
    text: 'Cambiar la carpeta',
  },
  'backup.folderPlaceholder': {
    text: '/Volumes/Backup/Apunta',
  },
  'backup.passphrase': {
    text: 'Frase de contraseña',
  },
  'backup.passphraseWarning': {
    text: 'Si pierdes esta frase de contraseña, nadie podrá abrir la copia de seguridad.',
  },
  'backup.backUp': {
    text: 'Hacer una copia de seguridad',
  },
  'backup.restoreReady': {
    text: 'La restauración del {day} está lista. Sal de Apunta y vuelve a abrirlo para terminarla; tus notas actuales quedan guardadas en {path}.',
    kind: { day: 'text', path: 'text' },
  },
  'backup.noted': {
    text: 'Anotado.',
  },
  'backup.stored': {
    text: 'Guardadas: {notes} notas de {patients} pacientes{range}, {transcripts} transcripciones, {bytes}',
    kind: { notes: 'text', patients: 'text', range: 'text', transcripts: 'text', bytes: 'text' },
  },
  'backup.storedRange': {
    text: ', desde el {day}',
    kind: { day: 'text' },
  },
  'backup.encrypted': {
    text: ', cifrada',
  },
  'backup.noArchives': {
    text: 'Aún no hay archivos. Deja un archivo de copia de seguridad en la carpeta de arriba para restaurarlo.',
  },
  'backup.neverTested': {
    text: 'Restauración nunca probada: abre un archivo y sigue su RESTORE.txt.',
  },
  'backup.markTested': {
    text: 'Ya lo hice',
  },
  'backup.tested': {
    text: 'Restauración probada por última vez el {day}.',
    kind: { day: 'text' },
  },
  'notes.new': {
    text: 'Nueva nota',
  },
  'notes.loading': {
    text: 'Cargando notas…',
  },
  'notes.prepareForSession': {
    text: 'Preparar la sesión',
  },
  'notes.emptyFor': {
    text: 'Aún no hay notas de {name}.',
    kind: { name: 'text' },
  },
  'notes.createFirst': {
    text: 'Crear la primera nota',
  },
  'notes.createNew': {
    text: 'Crear una nota nueva',
  },
  'note.draftChip': {
    text: 'Borrador',
  },
  'patients.showColumn': {
    text: 'Mostrar pacientes',
  },
  'patients.hideColumn': {
    text: 'Ocultar pacientes',
  },
  'patients.newShort': {
    text: 'Nuevo',
  },
  'patients.new': {
    text: 'Nuevo paciente',
  },
  'patients.loading': {
    text: 'Cargando pacientes…',
  },
  'patients.tabActive': {
    text: 'Activos',
  },
  'patients.tabArchived': {
    text: 'Archivados',
  },
  'directory.select': {
    text: 'Seleccionar',
  },
  'patients.missionControl': {
    text: 'Control de misión',
  },
  'nav.language': {
    text: 'Idioma',
  },
  'nav.help': {
    text: 'Ayuda',
  },
  'directory.clearSearch': {
    text: 'Limpiar la búsqueda',
  },
  'directory.hideSearch': {
    text: 'Ocultar la búsqueda',
  },
  'patients.emptyStart': {
    text: 'Agrega tu primer paciente para empezar.',
  },
  'patients.addFirst': {
    text: 'Agrega tu primer paciente',
  },
  'directory.emptyActive': {
    text: 'No hay pacientes activos.',
  },
  'directory.emptyArchived': {
    text: 'No hay pacientes archivados.',
  },
  'directory.noMatch': {
    text: 'Ningún paciente coincide con «{query}».',
    kind: { query: 'text' },
  },
  'patients.viewAll': {
    text: 'Ver todos',
  },
  'preview.unavailable': {
    text: '{what} aún no forma parte de esta vista previa.',
    kind: { what: 'text' },
  },
  'workspace.serverUnreachable': {
    text: 'Apunta no puede alcanzar su servidor',
  },
  'workspace.serverUnreachableBody': {
    text: 'Vuelve a iniciar Apunta y después reintenta esta página.',
  },
  'workspace.deleteTitle': {
    text: '¿Eliminar a {name}?',
    kind: { name: 'text' },
  },
  'workspace.deleteConfirm': {
    text: 'Eliminar a {name}',
    kind: { name: 'text' },
  },
  'workspace.deleteBodyFirst': {
    text: 'Esto elimina a {name}, todas sus notas, las transcripciones de esas notas y las conversaciones de refinado y de lluvia de ideas. Aquí no se puede deshacer.',
    kind: { name: 'text' },
  },
  'workspace.deleteBodySecond': {
    text: 'Tampoco puede alcanzar las copias que ya existen en otro lugar: una copia de seguridad que hayas hecho, una copia de Time Machine o el sistema de registros donde pegaste las notas terminadas.',
  },
  'workspace.deleteBodyThirdLead': {
    text: 'Si solo quieres sacarlos de la lista,',
  },
  'workspace.deleteBodyThirdTail': {
    text: 'eso lo hace y no elimina nada.',
  },
  'workspace.noNoteSelected': {
    text: 'No hay ninguna nota seleccionada de {name}',
    kind: { name: 'text' },
  },
  'brainstorm.title': {
    text: 'Lluvia de ideas',
  },
  'brainstorm.new': {
    text: 'Conversación nueva',
  },
  'brainstorm.placeholder': {
    text: 'Piensa en voz alta…',
  },
  'brainstorm.messageLabel': {
    text: 'Mensaje de lluvia de ideas',
  },
  'brainstorm.confirmTitle': {
    text: '¿Empezar una conversación nueva?',
  },
  'brainstorm.confirmBody': {
    text: 'Esto olvida la conversación de arriba. Las notas de {name} quedan tal cual.',
    kind: { name: 'text' },
  },
  'brainstorm.confirmConfirm': {
    text: 'Olvidarla',
  },
  'brainstorm.contextNone': {
    text: 'Aún no hay notas',
  },
  'brainstorm.contextAll': {
    text: 'Pensando con {count} nota',
    plural: {
      one: 'Pensando con {count} nota',
      many: 'Pensando con {count} notas',
      other: 'Pensando con {count} notas',
    },
    kind: { count: 'number' },
  },
  'brainstorm.contextNoneOf': {
    text: 'No cabe ninguna de las {count} notas',
    kind: { count: 'number' },
  },
  'brainstorm.contextMostRecentOne': {
    text: 'Usando la más reciente de {count} notas',
    kind: { count: 'number' },
  },
  'brainstorm.contextMostRecent': {
    text: 'Usando la más reciente de {count} notas',
    plural: {
      one: 'Usando la más reciente de {count} notas',
      many: 'Usando las {count} notas más recientes de {total}',
      other: 'Usando las {count} notas más recientes de {total}',
    },
    kind: { count: 'number', total: 'number' },
  },
  'brainstorm.contextSome': {
    text: 'Usando {count} de {total} notas',
    plural: {
      one: 'Usando {count} de {total} notas',
      many: 'Usando {count} de {total} notas',
      other: 'Usando {count} de {total} notas',
    },
    kind: { count: 'number', total: 'number' },
  },
  'plan.loading': {
    text: 'Cargando el plan…',
  },
  'plan.title': {
    text: 'Plan de tratamiento',
  },
  'prep.planHeading': {
    text: 'El plan',
  },
  'plan.versionMeta': {
    text: 'Versión {version} · {status}',
    kind: { version: 'text', status: 'text' },
  },
  'plan.versionMetaEffective': {
    text: 'Versión {version} · {status} · vigente desde el {day}',
    kind: { version: 'text', status: 'text', day: 'dateOnly' },
  },
  'plan.version': {
    text: 'Versión',
  },
  'plan.current': {
    text: 'Actual',
  },
  'plan.versionOption': {
    text: 'Versión {version} — {status}',
    kind: { version: 'text', status: 'text' },
  },
  'plan.copy': {
    text: 'Copiar el plan',
  },
  'plan.putInForce': {
    text: 'Poner en vigencia',
  },
  'plan.startReview': {
    text: 'Iniciar una revisión',
  },
  'plan.reviewOverdue': {
    text: 'La revisión del plan vencía el {day} — {gap}.',
    kind: { day: 'dateOnly', gap: 'text' },
  },
  'plan.reviewUpcoming': {
    text: 'Revisión del plan el {day} ({gap}).',
    kind: { day: 'dateOnly', gap: 'text' },
  },
  'plan.gapToday': {
    text: 'hoy',
  },
  'plan.gapInDays': {
    text: 'dentro de {days} día',
    plural: {
      one: 'dentro de {days} día',
      many: 'dentro de {days} días',
      other: 'dentro de {days} días',
    },
    kind: { days: 'number' },
  },
  'plan.gapDaysAgo': {
    text: 'hace {days} día',
    plural: {
      one: 'hace {days} día',
      many: 'hace {days} días',
      other: 'hace {days} días',
    },
    kind: { days: 'number' },
  },
  'plan.superseded': {
    text: 'Esta versión fue reemplazada. Se conserva exactamente como estaba y no se puede editar.',
  },
  'plan.noneYet': {
    text: 'Aún no hay un plan de tratamiento para {name}.',
    kind: { name: 'text' },
  },
  'plan.start': {
    text: 'Iniciar un plan',
  },
  'plan.draftGoals': {
    text: 'Redactar metas a partir de las notas recientes',
  },
  'plan.readingNotes': {
    text: 'Leyendo tus notas…',
  },
  'plan.goals': {
    text: 'Metas',
  },
  'plan.nothingYet': {
    text: 'Aún no hay nada en el plan. Las sugerencias de abajo no forman parte de él hasta que aceptes una.',
  },
  'plan.addGoalMyself': {
    text: 'Agregar una meta yo misma',
  },
  'plan.suggestedHeading': {
    text: 'Sugeridas a partir de tus notas',
  },
  'plan.suggestionHelp': {
    text: 'Las sugerencias no forman parte del plan. Acepta, edita o descarta cada una.',
  },
  'plan.noSuggestions': {
    text: 'No hay sugerencias esperando.',
  },
  'plan.details': {
    text: 'Detalles del plan',
  },
  'plan.detailsNone': {
    text: '— diagnóstico, modalidad y frecuencia no registrados',
  },
  'plan.detailsList': {
    text: '— {items}',
    kind: { items: 'text' },
  },
  'plan.attestation': {
    text: 'Declaración',
  },
  'plan.notAttested': {
    text: 'Aún sin declarar. Poner esta versión en vigencia registra la fecha y copia tu nombre y tu cédula desde Ajustes.',
  },
  'plan.licence': {
    text: 'Cédula {licence}',
    kind: { licence: 'text' },
  },
  'plan.npi': {
    text: 'NPI {npi}',
    kind: { npi: 'text' },
  },
  'plan.attestedNote': {
    text: 'Declarado en Apunta: firma la copia en tu sistema de registros. Apunta no tiene inicio de sesión, así que un nombre escrito aquí no es una firma.',
  },
  'plan.lookbackNone': {
    text: 'Aún no hay notas de este paciente, así que no había nada de lo que redactar.',
  },
  'plan.lookbackRead': {
    text: 'Se leyeron {count} nota (límite {cap}).',
    plural: {
      one: 'Se leyeron {count} nota (límite {cap}).',
      many: 'Se leyeron {count} notas (límite {cap}).',
      other: 'Se leyeron {count} notas (límite {cap}).',
    },
    kind: { count: 'number', cap: 'number' },
  },
  'plan.lookbackReadBackTo': {
    text: 'Se leyeron {count} nota, desde el {day} (límite {cap}).',
    plural: {
      one: 'Se leyeron {count} nota, desde el {day} (límite {cap}).',
      many: 'Se leyeron {count} notas, desde el {day} (límite {cap}).',
      other: 'Se leyeron {count} notas, desde el {day} (límite {cap}).',
    },
    kind: { count: 'number', day: 'dateOnly', cap: 'number' },
  },
  'plan.lookbackSkipped': {
    text: 'No se pudieron leer {count}.',
    kind: { count: 'text' },
  },
  'plan.lookbackDroppedOne': {
    text: 'Se redactó {count} meta borrador y luego se descartó porque no se pudo rastrear hasta nada en esas notas. No se agregó nada al plan.',
    kind: { count: 'text' },
  },
  'plan.lookbackDroppedMany': {
    text: 'Se redactaron {count} metas borrador y luego se descartaron porque no se pudieron rastrear hasta nada en esas notas. No se agregó nada al plan.',
    kind: { count: 'text' },
  },
  'plan.lookbackThin': {
    text: 'No se redactó nada a partir de ellas: todavía hay muy poco registrado en estas notas.',
  },
  'plan.diagnoses': {
    text: 'Diagnósticos',
  },
  'plan.diagnosesNone': {
    text: 'Ninguno registrado. Se espera que las metas se rastreen hasta un diagnóstico, y entered por ti.',
  },
  'plan.diagnosisCode': {
    text: 'Código',
  },
  'plan.diagnosisDescription': {
    text: 'Descripción',
  },
  'plan.diagnosisPrimary': {
    text: 'Principal',
  },
  'plan.addDiagnosis': {
    text: 'Agregar un diagnóstico',
  },
  'plan.diagnosisCodeLabel': {
    text: 'Código del diagnóstico {n}',
    kind: { n: 'text' },
  },
  'plan.diagnosisSystemLabel': {
    text: 'Sistema del diagnóstico {n}',
    kind: { n: 'text' },
  },
  'plan.diagnosisDescriptionLabel': {
    text: 'Descripción del diagnóstico {n}',
    kind: { n: 'text' },
  },
  'plan.removeDiagnosis': {
    text: 'Quitar el diagnóstico {n}',
    kind: { n: 'text' },
  },
  'plan.presentingProblem': {
    text: 'Motivo de consulta',
  },
  'plan.strengths': {
    text: 'Fortalezas',
  },
  'plan.modality': {
    text: 'Modalidad del servicio',
  },
  'plan.frequency': {
    text: 'Frecuencia del servicio',
  },
  'plan.dischargeCriteria': {
    text: 'Criterios de alta',
  },
  'plan.reviewInterval': {
    text: 'Intervalo de revisión',
  },
  'plan.reviewIntervalDays': {
    text: 'Intervalo de revisión (días)',
  },
  'plan.everyDays': {
    text: 'Cada {days} días',
    kind: { days: 'text' },
  },
  'plan.clientParticipation': {
    text: 'Participación del cliente',
  },
  'plan.participationReviewed': {
    text: 'Revisado con el cliente',
  },
  'plan.participationDeclined': {
    text: 'El cliente se negó a firmar',
  },
  'plan.participationSignedElsewhere': {
    text: 'Copia firmada en mi sistema de registros',
  },
  'plan.participationDate': {
    text: 'Fecha de participación del cliente',
  },
  'plan.participationNote': {
    text: 'Nota de participación del cliente',
  },
  'plan.participationNotePlaceholder': {
    text: 'Motivo, si no se pudo firmar',
  },
  'plan.saveDetails': {
    text: 'Guardar los detalles del plan',
  },
  'plan.suggestedBadge': {
    text: 'Sugerida: todavía no está en el plan',
  },
  'plan.accept': {
    text: 'Aceptar',
  },
  'plan.met': {
    text: 'Cumplida',
  },
  'plan.discontinue': {
    text: 'Suspender',
  },
  'plan.discardSuggestion': {
    text: 'Descartar esta sugerencia',
  },
  'plan.deleteGoal': {
    text: 'Eliminar esta meta',
  },
  'plan.carriedForward': {
    text: 'Se arrastró desde la versión anterior.',
  },
  'plan.noObjectives': {
    text: 'Aún no hay objetivos.',
  },
  'plan.interventions': {
    text: 'Intervenciones: {list}',
    kind: { list: 'text' },
  },
  'plan.draftedFrom': {
    text: 'Redactado a partir de tus notas:',
  },
  'plan.objectiveMeta': {
    text: 'Medición: {measure} · Línea base: {baseline} · Objetivo: {target} · Para: —',
    kind: { measure: 'text', baseline: 'text', target: 'text' },
  },
  'plan.objectiveMetaDated': {
    text: 'Medición: {measure} · Línea base: {baseline} · Objetivo: {target} · Para: {day}',
    kind: { measure: 'text', baseline: 'text', target: 'text', day: 'dateOnly' },
  },
  'plan.evidenceSection': {
    text: ' · {section}',
    kind: { section: 'text' },
  },
  'plan.goalLabel': {
    text: 'Meta',
  },
  'plan.objectiveLabel': {
    text: 'Objetivo {n}',
    kind: { n: 'text' },
  },
  'plan.measure': {
    text: 'Medición',
  },
  'plan.baseline': {
    text: 'Línea base',
  },
  'plan.target': {
    text: 'Objetivo',
  },
  'plan.addObjective': {
    text: 'Agregar un objetivo',
  },
  'plan.interventionsLabel': {
    text: 'Intervenciones, una por línea',
  },
  'plan.goalTargetDate': {
    text: 'Fecha objetivo de la meta',
  },
  'plan.saveAndAccept': {
    text: 'Guardar y aceptar',
  },
  'plan.objectiveMeasureLabel': {
    text: 'Medición del objetivo {n}',
    kind: { n: 'text' },
  },
  'plan.objectiveBaselineLabel': {
    text: 'Línea base del objetivo {n}',
    kind: { n: 'text' },
  },
  'plan.objectiveTargetLabel': {
    text: 'Objetivo del objetivo {n}',
    kind: { n: 'text' },
  },
  'plan.objectiveTargetDateLabel': {
    text: 'Fecha objetivo del objetivo {n}',
    kind: { n: 'text' },
  },
  'prep.title': {
    text: 'Antes de esta sesión',
  },
  'prep.again': {
    text: 'Preparar de nuevo',
  },
  'prep.noGoals': {
    text: 'Aún no hay metas en el plan.',
  },
  'prep.objectiveBy': {
    text: ' — para el {day}',
    kind: { day: 'dateOnly' },
  },
  'prep.reviewDue': {
    text: 'Revisión pendiente el {day}.',
    kind: { day: 'dateOnly' },
  },
  'prep.sinceHeading': {
    text: 'Desde la última vez que los viste',
  },
  'prep.empty': {
    text: 'Nada que leer todavía: no hay notas de este paciente.',
  },
  'prep.notSaved': {
    text: 'Este resumen previo no se guarda a menos que lo conserves.',
  },
  'prep.keptFor': {
    text: '{count} conservados de {name}.',
    kind: { count: 'text', name: 'text' },
  },
  'prep.lookbackNone': {
    text: 'No se leyó ninguna nota.',
  },
  'prep.lookbackRead': {
    text: 'Se leyó la última {count} nota (límite {cap}).',
    plural: {
      one: 'Se leyó la última {count} nota (límite {cap}).',
      many: 'Se leyeron las últimas {count} notas (límite {cap}).',
      other: 'Se leyeron las últimas {count} notas (límite {cap}).',
    },
    kind: { count: 'number', cap: 'number' },
  },
  'prep.lookbackReadBackTo': {
    text: 'Se leyó la última {count} nota, desde el {day} (límite {cap}).',
    plural: {
      one: 'Se leyó la última {count} nota, desde el {day} (límite {cap}).',
      many: 'Se leyeron las últimas {count} notas, desde el {day} (límite {cap}).',
      other: 'Se leyeron las últimas {count} notas, desde el {day} (límite {cap}).',
    },
    kind: { count: 'number', day: 'dateOnly', cap: 'number' },
  },
  'prep.lookbackSkipped': {
    text: 'No se pudieron leer {count}.',
    kind: { count: 'text' },
  },
  'spelling.none': {
    text: 'Sin sugerencias',
  },
  'spelling.ignore': {
    text: 'Ignorar',
  },
  'spelling.add': {
    text: 'Agregar al diccionario',
  },
  'spelling.menuLabel': {
    text: 'Ortografía de {word}',
    kind: { word: 'text' },
  },
  'patients.renameLabel': {
    text: 'Nombre de {name}',
    kind: { name: 'text' },
  },
  'common.name': {
    text: 'Nombre',
  },
  'patients.add': {
    text: 'Agregar paciente',
  },
  'common.adding': {
    text: 'Agregando…',
  },
  'patients.addLede': {
    text: 'Lo justo para organizar sus notas.',
  },
  'patients.namePlaceholder': {
    text: 'p. ej. John Smith',
  },
  'patients.identifierLabel': {
    text: 'Identificador (opcional)',
  },
  'patients.identifierPlaceholder': {
    text: 'Referencia interna, número de expediente, etc.',
  },
  'format.instructions': {
    text: 'Instrucciones',
  },
  'format.instructionsHelp': {
    text: 'Lo que se le dice al modelo local sobre cómo escribir este formato. Pega aquí instrucciones de skill aplanadas; déjalo en blanco para usar el valor predeterminado integrado. La receta para aplanar una skill de Claude está en',
  },
  'format.instructionsHelpTail': {
    text: 'dentro de la carpeta de Apunta.',
  },
  'format.instructionsPlaceholder': {
    text: 'Déjalo en blanco para usar el valor predeterminado integrado.',
  },
  'format.tokensLarge': {
    text: '≈{tokens} tokens: los modelos pequeños empiezan a desviarse a partir de unos {budget}.',
    kind: { tokens: 'number', budget: 'number' },
  },
  'format.tokensOk': {
    text: '≈{tokens} tokens: cómodo.',
    kind: { tokens: 'number' },
  },
  'format.readingSkill': {
    text: 'Leyendo la skill…',
  },
  'format.importFromSkill': {
    text: 'Importar desde un archivo de skill',
  },
  'format.skillFileLead': {
    text: 'Un',
  },
  'format.skillFileAnd': {
    text: 'o un',
  },
  'format.skillFileTail': {
    text: 'de la carpeta de la skill. No se guarda nada hasta que presiones guardar.',
  },
  'format.reportFrontmatter': {
    text: 'frontmatter eliminado',
  },
  'format.reportCommandBlocks': {
    text: '{count} bloque de comandos eliminado',
    plural: {
      one: '{count} bloque de comandos eliminado',
      many: '{count} bloques de comandos eliminados',
      other: '{count} bloques de comandos eliminados',
    },
    kind: { count: 'number' },
  },
  'format.reportToolLines': {
    text: '{count} línea de herramienta eliminada',
    plural: {
      one: '{count} línea de herramienta eliminada',
      many: '{count} líneas de herramienta eliminadas',
      other: '{count} líneas de herramienta eliminadas',
    },
    kind: { count: 'number' },
  },
  'format.reportClaudeLines': {
    text: '{count} línea específica de Claude eliminada',
    plural: {
      one: '{count} línea específica de Claude eliminada',
      many: '{count} líneas específicas de Claude eliminadas',
      other: '{count} líneas específicas de Claude eliminadas',
    },
    kind: { count: 'number' },
  },
  'format.reportEmptiedHeadings': {
    text: '{count} encabezado vaciado eliminado',
    plural: {
      one: '{count} encabezado vaciado eliminado',
      many: '{count} encabezados vaciados eliminados',
      other: '{count} encabezados vaciados eliminados',
    },
    kind: { count: 'number' },
  },
  'format.reportNothing': {
    text: 'no hubo nada que eliminar',
  },
  'format.reportReadFirst': {
    text: 'Léelo antes de guardar: estas reglas borran de más en algunas skills.',
  },
  'format.referencedFiles': {
    text: 'Esta skill se refiere a {files}, que Apunta no puede leer. Si esos archivos traen definiciones de secciones o terminología, pega tú ese texto.',
    kind: { files: 'text' },
  },
  'format.instructionsWarning': {
    text: 'Este texto se guarda y se envía a la IA con cada nota que escribes. Antes de guardar, comprueba que no contenga datos reales de clientes.',
  },
  'format.addTitle': {
    text: 'Agrega tu formato de nota',
  },
  'format.addLede': {
    text: 'Elige cómo definirlo: nosotros descubrimos la estructura por ti.',
  },
  'format.choicesLabel': {
    text: 'Opciones de formato de nota',
  },
  'format.standardTitle': {
    text: 'Mi nota de evolución estándar',
  },
  'format.recommended': {
    text: 'Recomendado',
  },
  'format.standardSubtitle': {
    text: '{sections}, con mis instrucciones de redacción',
    kind: { sections: 'text' },
  },
  'format.templateTitle': {
    text: 'Sube una plantilla vacía',
  },
  'format.templateSubtitle': {
    text: 'Un documento de Word o un PDF con secciones vacías',
  },
  'format.examplesTitle': {
    text: 'Sube algunas notas de ejemplo',
  },
  'format.examplesSubtitle': {
    text: 'De 2 a 3 notas terminadas para aprender el patrón',
  },
  'format.manualTitle': {
    text: 'Describirlo yo misma',
  },
  'format.manualSubtitle': {
    text: 'Escribe las secciones que necesitas',
  },
  'format.dropTemplate': {
    text: 'Suelta aquí una plantilla .docx o .pdf',
  },
  'format.dropExamples': {
    text: 'Suelta aquí de 2 a 3 notas terminadas',
  },
  'format.dropClick': {
    text: 'o haz clic para elegir un archivo',
  },
  'format.dropMore': {
    text: 'Agrega una o dos más: Apunta deduce las secciones de lo que las notas tengan en común.',
  },
  'format.nameLabel': {
    text: 'Nombre del formato',
  },
  'format.namePlaceholder': {
    text: 'p. ej. Nota de evolución',
  },
  'format.sectionsLabel': {
    text: 'Secciones',
  },
  'format.sectionsPlaceholder': {
    text: 'p. ej. Subjetivo, Objetivo, Evaluación, Plan',
  },
  'format.errorName': {
    text: 'Dale un nombre al formato.',
  },
  'format.errorSections': {
    text: 'Enumera al menos una sección.',
  },
  'format.errorDuplicate': {
    text: '«{section}» aparece dos veces: los nombres de sección tienen que ser únicos.',
    kind: { section: 'text' },
  },
  'format.errorAlreadySection': {
    text: '«{section}» ya es una sección.',
    kind: { section: 'text' },
  },
  'format.errorNoSections': {
    text: 'Un formato necesita al menos una sección.',
  },
  'common.saving': {
    text: 'Guardando…',
  },
  'format.readingFile': {
    text: 'Leyendo tu archivo…',
  },
  'common.continue': {
    text: 'Continuar',
  },
  'format.readingNote': {
    text: 'Leyendo el archivo y deduciendo sus secciones. No se guarda nada hasta que digas que está bien.',
  },
  'format.restoreLead': {
    text: '¿Ya tienes una copia de seguridad de Apunta, o alguien te preparó un archivo de ajustes?',
  },
  'format.restoreLink': {
    text: 'Restáurala en su lugar',
  },
  'format.editTitle': {
    text: 'Editar el formato de nota',
  },
  'format.foundTitle': {
    text: 'Esto es lo que encontramos',
  },
  'format.editLede': {
    text: 'Cambia el nombre o las secciones, y guarda.',
  },
  'format.foundLede': {
    text: 'Comprueba que coincide con el formato de tu trabajo antes de guardar.',
  },
  'format.truncatedNote': {
    text: 'Ese archivo era largo, así que Apunta solo leyó la primera parte. Revisa que no falte nada abajo.',
  },
  'format.sectionsDetected': {
    text: 'Secciones detectadas',
  },
  'format.renameLabel': {
    text: 'Nombre nuevo para {section}',
    kind: { section: 'text' },
  },
  'format.renameAction': {
    text: 'Cambiar el nombre de {section}',
    kind: { section: 'text' },
  },
  'format.moveUp': {
    text: 'Subir {section}',
    kind: { section: 'text' },
  },
  'format.moveDown': {
    text: 'Bajar {section}',
    kind: { section: 'text' },
  },
  'format.removeSection': {
    text: 'Quitar {section}',
    kind: { section: 'text' },
  },
  'format.sectionNamePlaceholder': {
    text: 'Nombre de la sección',
  },
  'format.addSection': {
    text: '+ Agregar sección',
  },
  'format.existingNotesNote': {
    text: 'Las notas que ya escribiste conservan las secciones con las que se escribieron. Los cambios de aquí solo se aplican a los borradores futuros.',
  },
  'format.startOver': {
    text: 'Empezar de nuevo',
  },
  'format.saveChanges': {
    text: 'Guardar los cambios',
  },
  'format.looksRight': {
    text: 'Está bien, guardar',
  },
  'settings.appearance': {
    text: 'Apariencia',
  },
  'settings.format': {
    text: 'Formato',
  },
  'settings.backup': {
    text: 'Copia de seguridad',
  },
  'settings.import': {
    text: 'Importar',
  },
  'settings.advanced': {
    text: 'Avanzado',
  },
  'settings.sectionsLabel': {
    text: 'Secciones de Ajustes',
  },
  'settings.closeLabel': {
    text: 'Cerrar Ajustes',
  },
  'settings.formats': {
    text: 'Formatos de nota',
  },
  'settings.addFormat': {
    text: 'Agregar otro formato',
  },
  'settings.importClaude': {
    text: 'Importar desde Claude',
  },
  'settings.importHalaxy': {
    text: 'Importar desde Halaxy',
  },
  'settings.app': {
    text: 'Aplicación',
  },
  'settings.about': {
    text: 'Acerca de',
  },
  'settings.loadingAi': {
    text: 'Cargando los ajustes de IA…',
  },
  'settings.draftingModel': {
    text: 'Modelo de redacción',
  },
  'settings.quick': {
    text: 'Rápido',
  },
  'settings.thorough': {
    text: 'Exhaustivo',
  },
  'settings.quickHelp': {
    text: 'Borradores más rápidos.',
  },
  'settings.thoroughHelp': {
    text: 'Borradores más lentos y cuidadosos.',
  },
  'settings.savedDot': {
    text: 'Guardado.',
  },
  'settings.loading': {
    text: 'Cargando los ajustes…',
  },
  'settings.colour': {
    text: 'Color',
  },
  'settings.reset': {
    text: 'Restablecer',
  },
  'settings.theme': {
    text: 'Tema',
  },
  'settings.fontSize': {
    text: 'Tamaño de fuente',
  },
  'settings.animations': {
    text: 'Animaciones',
  },
  'settings.sizeSmall': {
    text: 'Pequeño',
  },
  'settings.sizeDefault': {
    text: 'Predeterminado',
  },
  'settings.sizeLarge': {
    text: 'Grande',
  },
  'settings.sizeExtraLarge': {
    text: 'Extra grande',
  },
  'settings.themeSystem': {
    text: 'Sistema',
  },
  'settings.themeLight': {
    text: 'Claro',
  },
  'settings.themeDark': {
    text: 'Oscuro',
  },
  'about.title': {
    text: 'Acerca de Apunta',
  },
  'about.localOnlyHeading': {
    text: 'Nada de lo que escribes aquí sale a internet',
  },
  'about.localOnlyBody': {
    text: 'Apunta se ejecuta en esta computadora. Es una página web que sirve un programa de la misma computadora, y la aplicación no hace ninguna conexión de red saliente. No hay cuenta ni copia remota.',
  },
  'about.modelsLocalBody': {
    text: 'El modelo de redacción y el de transcripción también se ejecutan localmente. Un programa de esta computadora lee tu grabación y nunca la sube. Apunta no usa el reconocimiento de voz integrado del navegador, porque ese puede enviar el audio a un tercero.',
  },
  'about.noTelemetryBody': {
    text: 'No hay analíticas, informes de fallos, comprobación de actualizaciones ni datos de uso anónimos.',
  },
  'about.whereHeading': {
    text: 'Dónde están realmente tus notas',
  },
  'about.dbPath': {
    text: 'Una carpeta en esta computadora, con un solo archivo:',
  },
  'about.dbPathLoading': {
    text: 'Una carpeta en esta computadora, con un solo archivo: cargando…',
  },
  'about.recordsBody': {
    text: 'Ese archivo es tu historial de redacción. No es tu expediente clínico: el expediente vive en el sistema donde pegues la nota terminada. Aun así vale la pena hacer una copia de seguridad, porque las notas preliminares, las transcripciones y las conversaciones de refinado y de lluvia de ideas no existen en ningún otro lado.',
  },
  'about.recordsBackupTail': {
    text: 'tiene «Copia de seguridad».',
  },
  'about.threatsHeading': {
    text: 'Las dos cosas de las que esto no te protege',
  },
  'about.threatPerson': {
    text: 'Alguien en tu computadora sin bloquear.',
  },
  'about.threatPersonBody': {
    text: 'Apunta no tiene contraseña propia. Cualquiera que esté sentado en esta computadora mientras tú has iniciado sesión puede abrirlo y leerlo todo. La respuesta real es bloquear la pantalla cuando te alejas.',
  },
  'about.threatStolen': {
    text: 'Una computadora robada con el disco sin cifrar.',
  },
  'about.threatStolenBody': {
    text: 'El cifrado de disco protege a una computadora perdida de quedar al descubierto. Su estado se muestra abajo solo cuando el sistema operativo puede informarlo.',
  },
  'about.diskEncryption': {
    text: 'Cifrado de disco:',
  },
  'about.diskNotChecked': {
    text: 'no comprobado',
  },
  'about.diskReady': {
    text: 'listo',
  },
  'about.diskNotReady': {
    text: 'no listo',
  },
  'about.diskTailOs': {
    text: 'en este sistema operativo. {detail}',
    kind: { detail: 'text' },
  },
  'about.diskTailDetail': {
    text: '. {detail}',
    kind: { detail: 'text' },
  },
  'about.diskTailOff': {
    text: '. Actívalo en Ajustes del sistema → Privacidad y seguridad → FileVault antes de guardar notas reales, y guarda la clave de recuperación en un lugar distinto de esta computadora.',
  },
  'about.diskTailUnknown': {
    text: '. Apunta no pudo leer su estado; compruébalo tú mismo en los ajustes de seguridad del sistema operativo. {detail}',
    kind: { detail: 'text' },
  },
  'about.aiHeading': {
    text: 'Qué hace con la IA',
  },
  'about.aiBody': {
    text: 'Cuando creas un borrador, el modelo recibe lo que dictaste o escribiste y la forma de tu formato de nota. Refinar y la lluvia de ideas también pueden incluir notas anteriores pertinentes cuando se usan como contexto. Se le pide escribir solo lo que tiene delante. Todavía comete errores, así que cada borrador es tuyo para leer antes de publicarlo.',
  },
  'about.aiUnclearBody': {
    text: 'Donde la grabación no estaba clara, el borrador lo dice en el texto en lugar de adivinar.',
  },
  'about.builtFromHeading': {
    text: 'Con qué está hecho Apunta',
  },
  'about.builtFromBody': {
    text: 'La IA que redacta y el programa que lee tus grabaciones los escribieron otras personas y vienen incluidos dentro de Apunta. Sus licencias piden que este aviso viaje con la aplicación:',
  },
  'about.licensesLink': {
    text: 'las licencias están aquí',
  },
  'about.modelsSeparateBody': {
    text: 'Los modelos de IA en sí no forman parte de Apunta. Se instalan en esta computadora bajo sus propios términos, y Apunta no los reparte.',
  },
  'about.missingPieces': {
    text: 'Lo que falta y qué ejecutar:',
  },
  'setup.title': {
    text: 'Configuración inicial',
  },
  'setup.lede': {
    text: 'Apunta se ejecuta en esta computadora. Estas son las piezas que necesita y qué hacer con las que falten.',
  },
  'setup.checking': {
    text: 'Comprobando…',
  },
  'setup.allAtOnce': {
    text: 'O hazlo todo de una vez',
  },
  'setup.terminalHelp': {
    text: 'Desde una ventana de Terminal en la carpeta de Apunta. Instala lo que falte, descarga los modelos y se puede volver a ejecutar tantas veces como quieras.',
  },
  'setup.backingUpLead': {
    text: 'Hacer una copia de seguridad es otra pregunta, y la que más vale la pena dejar bien:',
  },
  'setup.stateOk': {
    text: 'Listo',
  },
  'setup.stateMissing': {
    text: 'Falta',
  },
  'setup.stateUnknown': {
    text: 'No comprobado',
  },
  'licenses.overview': {
    text: 'Resumen',
  },
  'licenses.builtFrom': {
    text: 'Con qué está hecho Apunta',
  },
  'licenses.lede': {
    text: 'Apunta incluye programas escritos por otras personas, y sus licencias piden que este aviso viaje con la aplicación. Nada de lo que hay aquí te pide nada: está porque debería estar.',
  },
  'licenses.panelLabel': {
    text: 'Licencias de terceros',
  },
  'licenses.filterLabel': {
    text: 'Filtrar licencias',
  },
  'licenses.filterPlaceholder': {
    text: 'Filtrar por componente o por texto',
  },
  'licenses.copyPlain': {
    text: 'Copiar como texto plano',
  },
  'licenses.componentsLabel': {
    text: 'Componentes con licencia',
  },
  'licenses.noMatch': {
    text: 'Ningún texto de licencia coincide con «{filter}».',
    kind: { filter: 'text' },
  },
  'capture.newNote': {
    text: 'Nueva nota',
  },
  'capture.newNoteFor': {
    text: 'Nueva nota para {name}',
    kind: { name: 'text' },
  },
  'capture.missingPatient': {
    text: 'Puede que este paciente se haya eliminado, así que nada de lo que se grabara aquí se podría guardar.',
  },
  'capture.backToPatients': {
    text: 'Volver a pacientes',
  },
  'capture.formatLabel': {
    text: 'Formato de nota',
  },
  'capture.noFormats': {
    text: 'Aún no hay formatos de nota.',
  },
  'capture.addOneFirst': {
    text: 'Agrega uno primero',
  },
  'capture.noFormatsTail': {
    text: '— una nota necesita una estructura que seguir.',
  },
  'capture.sourceRecording': {
    text: 'Empieza con una grabación',
  },
  'capture.sourceTail': {
    text: '— o escribe notas en su lugar. Puedes usar una cosa, la otra, o combinarlas antes de crear el borrador.',
  },
  'capture.stopAndDraft': {
    text: 'Detener y crear el borrador',
  },
  'capture.openingMicrophone': {
    text: 'Abriendo el micrófono…',
  },
  'capture.allowMicrophone': {
    text: 'Permite el acceso al micrófono para empezar tu grabación privada.',
  },
  'capture.preparingDraft': {
    text: 'Preparando tu borrador…',
  },
  'capture.preparingDraftShort': {
    text: 'Preparando tu borrador',
  },
  'dictation.transcribingBusy': {
    text: 'Transcribiendo…',
  },
  'capture.recordingReady': {
    text: 'Grabación lista',
  },
  'capture.recorded': {
    text: '{timer} de grabación. Nada ha salido de esta Mac.',
    kind: { timer: 'text' },
  },
  'capture.draftFromRecording': {
    text: 'Crear el borrador a partir de la grabación',
  },
  'capture.discardRecording': {
    text: 'Descartar la grabación',
  },
  'capture.recordAudio': {
    text: 'Grabar audio',
  },
  'capture.recordAudioHelp': {
    text: 'Empieza aquí: narra tus notas; agrega notas escritas antes o durante la grabación',
  },
  'capture.typeNotes': {
    text: 'Escribir notas',
  },
  'capture.typeNotesHelp': {
    text: 'Escribe notas antes o durante la grabación, o solo escribir',
  },
  'capture.summaryPlaceholder': {
    text: 'Escribe el resumen de tu sesión...',
  },
  'capture.summaryLabel': {
    text: 'Resumen de la sesión',
  },
  'dictation.previewNoteCapture': {
    text: 'Todo lo dicho hasta ahora, más o menos. La nota se escribe a partir de la grabación terminada.',
  },
  'capture.createDraft': {
    text: 'Crear borrador',
  },
  'capture.leaveTitle': {
    text: '¿Dejar esta nota sin terminar?',
  },
  'capture.stay': {
    text: 'Seguir aquí',
  },
  'capture.discardAndLeave': {
    text: 'Descartar y salir',
  },
  'capture.leaveBodyFirst': {
    text: 'Si sales, se descartarán tus notas escritas, tu grabación o el borrador en curso.',
  },
  'capture.leaveBodySecond': {
    text: 'Quédate para seguir trabajando, o descarta esta captura sin terminar y continúa.',
  },
  'count.note': {
    text: '{count} nota',
    plural: {
      one: '{count} nota',
      many: '{count} notas',
      other: '{count} notas',
    },
    kind: { count: 'number' },
  },
  'count.patient': {
    text: '{count} paciente',
    plural: {
      one: '{count} paciente',
      many: '{count} pacientes',
      other: '{count} pacientes',
    },
    kind: { count: 'number' },
  },
  'count.conversation': {
    text: '{count} conversación',
    plural: {
      one: '{count} conversación',
      many: '{count} conversaciones',
      other: '{count} conversaciones',
    },
    kind: { count: 'number' },
  },
  'count.session': {
    text: '{count} sesión',
    plural: {
      one: '{count} sesión',
      many: '{count} sesiones',
      other: '{count} sesiones',
    },
    kind: { count: 'number' },
  },
  'count.newPatient': {
    text: '{count} paciente nuevo',
    plural: {
      one: '{count} paciente nuevo',
      many: '{count} pacientes nuevos',
      other: '{count} pacientes nuevos',
    },
    kind: { count: 'number' },
  },
  'count.attachedFile': {
    text: '{count} archivo adjunto',
    plural: {
      one: '{count} archivo adjunto',
      many: '{count} archivos adjuntos',
      other: '{count} archivos adjuntos',
    },
    kind: { count: 'number' },
  },
  'import.skip.beforeCutoff': {
    text: 'sin actividad desde la fecha de corte',
  },
  'import.skip.singleSession': {
    text: 'una sola sesión, no un historial de paciente',
  },
  'import.skip.notClinical': {
    text: 'las respuestas de Claude nunca parecieron una nota',
  },
  'import.skip.noName': {
    text: 'no se pudo identificar con certeza ningún nombre de paciente',
  },
  'import.skip.ambiguous': {
    text: 'más de un nombre de tu lista',
  },
  'import.skip.excluded': {
    text: 'desmarcaste al paciente',
  },
  'import.nameSource.previous': {
    text: 'importado antes',
  },
  'import.nameSource.list': {
    text: 'de tu lista',
  },
  'import.nameSource.existing': {
    text: 'ya está en Apunta',
  },
  'import.nameSource.title': {
    text: 'nombre deducido del título del chat: compruébalo',
  },
  'import.doneTitle': {
    text: 'Importado',
  },
  'import.undoneTitle': {
    text: 'Importación deshecha',
  },
  'import.undoneLine': {
    text: 'Deshecho: se eliminaron {notes} y {patients}.',
    kind: { notes: 'text', patients: 'text' },
  },
  'import.undoneNotesKept': {
    text: 'Se conservó {count} nota que habías finalizado.',
    plural: {
      one: 'Se conservó {count} nota que habías finalizado.',
      many: 'Se conservaron {count} notas que habías finalizado.',
      other: 'Se conservaron {count} notas que habías finalizado.',
    },
    kind: { count: 'number' },
  },
  'import.undonePatientsKept': {
    text: 'Se conservó {count} paciente con otro trabajo adjunto.',
    plural: {
      one: 'Se conservó {count} paciente con otro trabajo adjunto.',
      many: 'Se conservaron {count} pacientes con otro trabajo adjunto.',
      other: 'Se conservaron {count} pacientes con otro trabajo adjunto.',
    },
    kind: { count: 'number' },
  },
  'halaxy.undoneNotesKept': {
    text: 'Se conservaron {count} notas que habías finalizado.',
    plural: {
      one: 'Se conservaron {count} notas que habías finalizado.',
      many: 'Se conservaron {count} notas que habías finalizado.',
      other: 'Se conservaron {count} notas que habías finalizado.',
    },
    kind: { count: 'number' },
  },
  'import.nothingNew': {
    text: 'No hay nada nuevo que importar.',
  },
  'import.doneLine': {
    text: '{notes} de {patients}{new}. Cada una es un borrador con la fecha en que hablaste con Claude y marcada como importada.',
    kind: { notes: 'text', patients: 'text', new: 'text' },
  },
  'import.doneNewCount': {
    text: ' ({count} nuevos)',
    kind: { count: 'number' },
  },
  'halaxy.doneLine': {
    text: '{notes} de {patients} importadas como historial publicado.',
    kind: { notes: 'text', patients: 'text' },
  },
  'import.undo': {
    text: 'Deshacer esta importación',
  },
  'import.goToPatients': {
    text: 'Ir a pacientes',
  },
  'import.readyTitle': {
    text: 'Listo para importar',
  },
  'import.summaryLine': {
    text: '{toCreate} por crear, {notes} repartidas entre {patients}. {skipped} omitidas{ambiguous}.',
    kind: { toCreate: 'text', notes: 'text', patients: 'text', skipped: 'text', ambiguous: 'text' },
  },
  'import.summaryAmbiguous': {
    text: ', {count} de ellas por ambigüedad',
    kind: { count: 'number' },
  },
  'import.summaryAgain': {
    text: '{count} sesión ya importada antes no se importará de nuevo.',
    plural: {
      one: '{count} sesión ya importada antes no se importará de nuevo.',
      many: '{count} sesiones ya importadas antes no se importarán de nuevo.',
      other: '{count} sesiones ya importadas antes no se importarán de nuevo.',
    },
    kind: { count: 'number' },
  },
  'import.untickHelp': {
    text: 'Desmarca a quien no sea paciente. Cada nota llega como borrador marcado como importado, y esta importación se puede deshacer con un clic después.',
  },
  'import.attachmentsNote': {
    text: '{count} archivo adjunto de estas sesiones no se importa: se queda en Claude.',
    plural: {
      one: '{count} archivo adjunto de estas sesiones no se importa: se queda en Claude.',
      many: '{count} archivos adjuntos de estas sesiones no se importan: se quedan en Claude.',
      other: '{count} archivos adjuntos de estas sesiones no se importan: se quedan en Claude.',
    },
    kind: { count: 'number' },
  },
  'import.noConversations': {
    text: 'No se encontraron conversaciones de pacientes desde {cutoff}.',
    kind: { cutoff: 'text' },
  },
  'import.patientLabel': {
    text: 'Importar a {name}',
    kind: { name: 'text' },
  },
  'import.patientExcerpt': {
    text: '{notes} · {source}',
    kind: { notes: 'text', source: 'text' },
  },
  'import.whereTo': {
    text: '¿A dónde van estas notas?',
  },
  'import.addTo': {
    text: 'Agregar a {name}',
    kind: { name: 'text' },
  },
  'import.createNew': {
    text: 'Crear uno nuevo',
  },
  'import.createNewPatient': {
    text: 'Crear un paciente nuevo',
  },
  'import.notFound': {
    text: 'No encontrados desde {cutoff}: {names}.',
    kind: { cutoff: 'text', names: 'text' },
  },
  'import.runLabel': {
    text: 'Importar {notes}',
    kind: { notes: 'text' },
  },
  'import.changeSettings': {
    text: 'Cambiar los ajustes',
  },
  'import.claudeLede': {
    text: 'Trae a Apunta las notas que redactaste con Claude: cada paciente que has visto desde la fecha de corte, con todo su historial, un borrador por sesión.',
  },
  'import.exportHelp': {
    text: 'En Claude, abre Ajustes → Privacidad → Exportar datos. La exportación llega por correo como un zip. Elige ese archivo aquí, o el conversations.json que viene dentro. Se lee en esta Mac y no se guarda en ninguna parte.',
  },
  'import.patientsSince': {
    text: 'Pacientes vistos desde',
  },
  'import.namesHelp': {
    text: 'Los nombres de tus pacientes, uno por línea (opcional: ayudan a escribir y cotejar los nombres; cualquiera que no esté en la lista se encuentra igual por el título del chat)',
  },
  'import.eachNoteIs': {
    text: 'Cada nota es',
  },
  'import.sourceAssistant': {
    text: 'La última respuesta de Claude en cada sesión (la nota con la que terminaste)',
  },
  'import.sourceHuman': {
    text: 'Tus propios mensajes en cada sesión',
  },
  'import.readingExport': {
    text: 'Leyendo la exportación…',
  },
  'import.check': {
    text: 'Comprobar qué se importará',
  },
  'import.nothingWritten': {
    text: 'No se escribe nada hasta que presiones Importar en la siguiente pantalla.',
  },
  'import.nameGuessedSuffix': {
    text: ' · nombre deducido: compruébalo',
  },
  'import.skippedSummary': {
    text: '{conversations} omitidas: {reasons}',
    kind: { conversations: 'text', reasons: 'text' },
  },
  'import.why': {
    text: 'Motivo',
  },
  'import.started': {
    text: 'Inicio',
  },
  'import.lastMessage': {
    text: 'Último mensaje',
  },
  'import.messages': {
    text: 'Mensajes',
  },
  'import.undated': {
    text: 'sin fecha',
  },
  'halaxy.summaryLine': {
    text: '{notes} repartidas entre {patients}.',
    kind: { notes: 'text', patients: 'text' },
  },
  'halaxy.untickHelp': {
    text: 'Comprueba los nombres, desmarca lo que no quieras y luego importa. Las notas se guardan como historial publicado.',
  },
  'import.chooseDifferent': {
    text: 'Elegir otros archivos',
  },
  'halaxy.lede': {
    text: 'Trae a Apunta tus notas de Halaxy. Elige un PDF por paciente.',
  },
  'halaxy.localOnly': {
    text: 'Los PDF de texto se leen en esta computadora y no se guardan en ninguna parte.',
  },
  'halaxy.readingPdfs': {
    text: 'Leyendo los PDF…',
  },
  'import.patientName': {
    text: 'Nombre del paciente',
  },
  'import.halaxyNoteLabel': {
    text: 'Importar {date} de {name}',
    kind: { date: 'text', name: 'text' },
  },
  'import.halaxyNoteLabelTitled': {
    text: 'Importar {date} {title} de {name}',
    kind: { date: 'text', title: 'text', name: 'text' },
  },
  'import.sessionTitle': {
    text: 'Sesión',
  },
  'import.filesNotImported': {
    text: 'Archivos no importados',
  },
  'import.earlier': {
    text: 'Importaciones anteriores',
  },
  'import.batchLine': {
    text: '{date} — {notes}',
    kind: { date: 'text', notes: 'text' },
  },
  'import.batchPatients': {
    text: ', {count} paciente nuevo',
    plural: {
      one: ', {count} paciente nuevo',
      many: ', {count} pacientes nuevos',
      other: ', {count} pacientes nuevos',
    },
    kind: { count: 'number' },
  },
} satisfies Record<MessageKey, Message>;
