import { DEFAULT_LOCALE, isLocale, type FormatSource, type Locale, type NoteFormat } from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { uuidv7 } from './uuid.js';

/** `sections` is the one JSON-encoded column here, so rows need a mapper. */
interface NoteFormatRow {
  id: string;
  name: string;
  sections: string;
  instructions: string;
  source: FormatSource;
  locale: Locale;
  created_at: string;
}

const COLUMNS = 'id, name, sections, instructions, source, locale, created_at';

function toFormat(row: NoteFormatRow): NoteFormat {
  return { ...row, sections: JSON.parse(row.sections) as string[] };
}

export function listFormats(db: Database): NoteFormat[] {
  const rows = db
    .prepare(`SELECT ${COLUMNS} FROM note_formats ORDER BY created_at ASC, id ASC`)
    .all() as NoteFormatRow[];
  return rows.map(toFormat);
}

export function getFormat(db: Database, id: string): NoteFormat | undefined {
  const row = db.prepare(`SELECT ${COLUMNS} FROM note_formats WHERE id = ?`).get(id) as
    NoteFormatRow | undefined;
  return row ? toFormat(row) : undefined;
}

export interface CreateFormatInput {
  readonly name: string;
  readonly sections: readonly string[];
  readonly instructions?: string;
  readonly source?: FormatSource;
  /**
   * The language this format is written in (C-LANG@1 rule 3). Optional, and
   * English when absent: `POST /api/formats` with no locale, the seed, the
   * import routes and every test that predates the column all mean English, and
   * D11 leaves it that way.
   */
  readonly locale?: string;
  /** Seed only, to keep the sample formats in a stable order. */
  readonly created_at?: string;
}

export function createFormat(db: Database, input: CreateFormatInput): NoteFormat {
  const format: NoteFormat = {
    id: uuidv7(),
    name: input.name,
    sections: [...input.sections],
    instructions: input.instructions ?? '',
    source: input.source ?? 'manual',
    locale: isLocale(input.locale) ? input.locale : DEFAULT_LOCALE,
    created_at: input.created_at ?? new Date().toISOString(),
  };

  db.prepare(
    `INSERT INTO note_formats (${COLUMNS})
     VALUES (@id, @name, @sections, @instructions, @source, @locale, @created_at)`,
  ).run({ ...format, sections: JSON.stringify(format.sections) });

  return format;
}

export interface UpdateFormatInput {
  readonly name?: string;
  readonly sections?: readonly string[];
  readonly instructions?: string;
  readonly source?: FormatSource;
  /** Optional, like the rest of a `PATCH`. */
  readonly locale?: string;
}

export function updateFormat(db: Database, id: string, patch: UpdateFormatInput): NoteFormat | undefined {
  const current = getFormat(db, id);
  if (!current) return undefined;

  const next: NoteFormat = {
    ...current,
    name: patch.name ?? current.name,
    sections: patch.sections ? [...patch.sections] : current.sections,
    instructions: patch.instructions ?? current.instructions,
    source: patch.source ?? current.source,
    locale: isLocale(patch.locale) ? patch.locale : current.locale,
  };

  db.prepare(
    `UPDATE note_formats SET name = @name, sections = @sections,
            instructions = @instructions, source = @source, locale = @locale
      WHERE id = @id`,
  ).run({ ...next, sections: JSON.stringify(next.sections) });

  return next;
}

/**
 * Refused by the foreign key when notes still reference the format, so callers
 * check first and answer 409 rather than letting SQLite raise.
 */
export function deleteFormat(db: Database, id: string): boolean {
  return db.prepare('DELETE FROM note_formats WHERE id = ?').run(id).changes > 0;
}

export function countNotesForFormat(db: Database, formatId: string): number {
  const row = db.prepare('SELECT COUNT(*) AS count FROM notes WHERE format_id = ?').get(formatId) as {
    count: number;
  };
  return row.count;
}
