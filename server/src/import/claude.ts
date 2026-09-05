import type { ClaudeImportPreview, ImportCandidate, ImportedConversation } from '@apunta/shared';

import { readZip, ZipFormatError } from './zip.js';

/**
 * Reading a Claude data export into proposals (M11).
 *
 * Three rules from `docs/agents/M11-claude-import.md` are enforced here and
 * nowhere else, so they cannot be argued with downstream:
 *
 * - **Her words are the record. Claude's are not.** A proposal's body is the
 *   `human` turns, verbatim and in order. The assistant's turns are carried
 *   separately for her to look at, and are never the default.
 * - **A conversation date is not a session date.** What the export calls
 *   `created_at` is when she talked to Claude; it travels as `recorded_at`.
 * - **Identification is not the model's job.** Candidate people come from the
 *   patients she has already entered (matched by name) and from recurring
 *   proper nouns offered as *possible* people. Nothing here infers.
 *
 * The export's schema is inferred, not known — this repository has never
 * seen a real one (`npm run probe:claude` exists to check). So the reader is
 * tolerant: it accepts the file at the top level or under a key, `sender` or
 * `role`, `text` or a list of content blocks, and skips what it cannot read
 * while counting it, rather than failing the whole archive on one odd row.
 */

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFormatError';
  }
}

export interface RawTurn {
  readonly role: 'human' | 'assistant';
  readonly text: string;
  readonly at: string | null;
}

export interface RawConversation {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string | null;
  readonly turns: readonly RawTurn[];
}

export interface ReadExport {
  readonly conversations: readonly RawConversation[];
  /** Turns read, across every conversation. */
  readonly messages: number;
  /** Conversations with nothing readable in them. */
  readonly skipped: number;
}

/** The uploaded file: a zip with `conversations.json` inside, or that file on its own. */
export function openExport(upload: Buffer, filename: string): ReadExport {
  const looksLikeJson = /\.json$/i.test(filename) || /^\s*[[{]/.test(upload.subarray(0, 64).toString('utf8'));
  if (looksLikeJson) return readConversations(parseJson(upload, filename));

  let entries;
  try {
    entries = readZip(upload);
  } catch (error) {
    if (error instanceof ZipFormatError) {
      throw new ImportFormatError(
        'That file is not a Claude export. Expected the zip Claude sent you, or its conversations.json.',
      );
    }
    throw error;
  }
  const conversations = entries.find((entry) => /(^|\/)conversations\.json$/i.test(entry.name));
  if (!conversations) {
    throw new ImportFormatError('That zip has no conversations.json in it, so it is not a Claude export.');
  }
  return readConversations(parseJson(conversations.read(), conversations.name));
}

function parseJson(bytes: Buffer, filename: string): unknown {
  try {
    return JSON.parse(bytes.toString('utf8')) as unknown;
  } catch {
    throw new ImportFormatError(`${filename} could not be read as JSON.`);
  }
}

/** The export's JSON, whatever its wrapping, into conversations. */
export function readConversations(json: unknown): ReadExport {
  const list = conversationList(json);
  if (list === null) {
    throw new ImportFormatError('No conversations were found in that file.');
  }

  const conversations: RawConversation[] = [];
  let messages = 0;
  let skipped = 0;

  list.forEach((item, index) => {
    const record = asRecord(item);
    if (record === null) {
      skipped += 1;
      return;
    }
    const turns = readTurns(record);
    if (turns.length === 0) {
      skipped += 1;
      return;
    }
    messages += turns.length;
    conversations.push({
      id: firstString(record, ['uuid', 'id', 'conversation_id']) ?? `conversation-${String(index + 1)}`,
      title: firstString(record, ['name', 'title']) ?? '',
      createdAt: isoDate(firstValue(record, ['created_at', 'createdAt', 'create_time'])),
      turns,
    });
  });

  return { conversations, messages, skipped };
}

function conversationList(json: unknown): unknown[] | null {
  if (Array.isArray(json)) return json;
  const record = asRecord(json);
  if (record === null) return null;
  for (const key of ['conversations', 'data', 'items']) {
    const value = record[key];
    if (Array.isArray(value)) return value;
  }
  return null;
}

function readTurns(conversation: Record<string, unknown>): RawTurn[] {
  const raw = firstValue(conversation, ['chat_messages', 'messages']);
  if (!Array.isArray(raw)) return [];
  const turns: RawTurn[] = [];
  for (const item of raw) {
    const message = asRecord(item);
    if (message === null) continue;
    const role = turnRole(message);
    if (role === null) continue;
    const text = turnText(message).trim();
    if (text === '') continue;
    turns.push({ role, text, at: isoDate(firstValue(message, ['created_at', 'createdAt', 'create_time'])) });
  }
  return turns;
}

function turnRole(message: Record<string, unknown>): 'human' | 'assistant' | null {
  const author = asRecord(message['author']);
  const raw =
    firstString(message, ['sender', 'role']) ?? (author === null ? null : firstString(author, ['role']));
  if (raw === null) return null;
  const role = raw.toLowerCase();
  if (role === 'human' || role === 'user') return 'human';
  if (role === 'assistant') return 'assistant';
  return null;
}

function turnText(message: Record<string, unknown>): string {
  const text = message['text'];
  if (typeof text === 'string' && text.trim() !== '') return text;
  const content = message['content'];
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((block) => {
        const record = asRecord(block);
        if (record === null) return '';
        const type = record['type'];
        const value = record['text'];
        return (type === undefined || type === 'text') && typeof value === 'string' ? value : '';
      })
      .filter((piece) => piece !== '')
      .join('\n');
  }
  return '';
}

// --- Proposals -------------------------------------------------------------

export interface KnownPatient {
  readonly id: string;
  readonly name: string;
}

/** What the screen shows: every conversation with her words in it, and who it may be about. */
export function buildPreview(read: ReadExport, known: readonly KnownPatient[]): ClaudeImportPreview {
  const withHerWords = read.conversations.filter((c) => c.turns.some((t) => t.role === 'human'));
  const skipped = read.skipped + (read.conversations.length - withHerWords.length);

  const candidates = findCandidates(withHerWords, known);
  const conversations: ImportedConversation[] = withHerWords.map((conversation) => {
    const text = `${conversation.title}\n${humanText(conversation)}`;
    return {
      id: conversation.id,
      title: conversation.title,
      recorded_at: conversation.createdAt ?? conversation.turns[0]?.at ?? null,
      human_text: humanText(conversation),
      assistant_text: conversation.turns
        .filter((t) => t.role === 'assistant')
        .map((t) => t.text)
        .join('\n\n'),
      people: candidates
        .filter((candidate) => mentions(text, candidate.name))
        .map((candidate) => candidate.name),
      turns: conversation.turns.length,
    };
  });

  const dates = conversations
    .map((c) => c.recorded_at)
    .filter((d): d is string => d !== null)
    .sort();
  return {
    conversations,
    candidates,
    totals: { conversations: read.conversations.length, messages: read.messages, skipped },
    date_range: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
  };
}

function humanText(conversation: RawConversation): string {
  return conversation.turns
    .filter((t) => t.role === 'human')
    .map((t) => t.text)
    .join('\n\n');
}

/**
 * Does the text name this person? The full name as a whole word, or the
 * first name alone when it is long enough not to be a syllable: "John Smith"
 * matches "John came in", "Jo" does not match "Joanna".
 */
export function mentions(text: string, name: string): boolean {
  const full = name.trim();
  if (full === '') return false;
  if (wholeWord(text, full)) return true;
  const first = full.split(/\s+/)[0] ?? '';
  return first.length >= 3 && first !== full && wholeWord(text, first);
}

function wholeWord(text: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}(?=$|[^\\p{L}\\p{N}])`, 'iu').test(text);
}

/**
 * Words that are capitalised for reasons other than being someone's name.
 * Short, and only what shows up in a therapist's notes: a longer list would
 * start deciding who is a person, which is her call.
 */
const NOT_A_NAME = new Set([
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'claude',
  'apunta',
  'chatgpt',
  'ok',
  'okay',
  'yes',
  'no',
  'thanks',
  'thank',
  'please',
  'hi',
  'hello',
  'subjective',
  'objective',
  'assessment',
  'plan',
  'discussion',
  'risk',
  'intervention',
  'session',
  'location',
  'client',
  'patient',
  'note',
  'notes',
  'summary',
  'cbt',
  'dbt',
  'act',
  'emdr',
  'gad',
  'phq',
]);

interface Mention {
  count: number;
  midSentence: boolean;
  conversations: Set<string>;
}

/**
 * People the conversations may be about, most trustworthy first.
 *
 * Patients she has already entered come first, matched by name. Then
 * recurring proper nouns: a capitalised word seen at least twice, at least
 * once somewhere other than the start of a sentence (where every word is
 * capitalised), that is not on the short list above. A two-word name
 * absorbs its first name, so "John Smith" is offered once, not as "John"
 * and "Smith" as well.
 */
export function findCandidates(
  conversations: readonly RawConversation[],
  known: readonly KnownPatient[],
): ImportCandidate[] {
  const texts = conversations.map((c) => ({ id: c.id, text: `${c.title}\n${humanText(c)}` }));
  const candidates: ImportCandidate[] = [];
  const taken = new Set<string>();

  for (const patient of known) {
    const matched = texts.filter((t) => mentions(t.text, patient.name));
    if (matched.length === 0) continue;
    candidates.push({ name: patient.name, conversations: matched.length, patient_id: patient.id });
    taken.add(patient.name.toLowerCase());
    for (const part of patient.name.toLowerCase().split(/\s+/)) taken.add(part);
  }

  const singles = new Map<string, Mention>();
  const pairs = new Map<string, Mention>();
  for (const { id, text } of texts) {
    // Titles and turns are separate sentences; a line break ends one too.
    const pattern = /(^|[^\p{L}\p{N}'])([A-Z][a-z]{2,})(?:'s)?(?:\s+([A-Z][a-z]{2,})(?:'s)?)?/gmu;
    for (const match of text.matchAll(pattern)) {
      const before = match[1] ?? '';
      const start = match.index ?? 0;
      const preceding = text.slice(0, start + before.length).replace(/\s+$/, '');
      const midSentence = preceding !== '' && !/[.!?:\n]$/.test(preceding);
      const first = match[2] ?? '';
      const second = match[3];
      tally(singles, first, id, midSentence);
      if (second !== undefined && !NOT_A_NAME.has(second.toLowerCase()))
        tally(pairs, `${first} ${second}`, id, midSentence);
    }
  }

  const offered: { name: string; conversations: number }[] = [];
  for (const [name, mention] of pairs) {
    const [first = ''] = name.split(' ');
    const alone = singles.get(first);
    const count = mention.count + (alone?.count ?? 0);
    const mid = mention.midSentence || (alone?.midSentence ?? false);
    const seen = new Set([...mention.conversations, ...(alone?.conversations ?? [])]);
    if (count < 2 || !mid || NOT_A_NAME.has(first.toLowerCase())) continue;
    if (taken.has(name.toLowerCase()) || taken.has(first.toLowerCase())) continue;
    offered.push({ name, conversations: seen.size });
    taken.add(name.toLowerCase());
    taken.add(first.toLowerCase());
    for (const part of name.toLowerCase().split(' ')) taken.add(part);
  }
  for (const [name, mention] of singles) {
    if (mention.count < 2 || !mention.midSentence || NOT_A_NAME.has(name.toLowerCase())) continue;
    if (taken.has(name.toLowerCase())) continue;
    offered.push({ name, conversations: mention.conversations.size });
    taken.add(name.toLowerCase());
  }

  offered.sort((a, b) => b.conversations - a.conversations || a.name.localeCompare(b.name));
  return [...candidates, ...offered.map((o) => ({ ...o, patient_id: null }))];
}

function tally(map: Map<string, Mention>, name: string, conversationId: string, midSentence: boolean): void {
  const entry = map.get(name) ?? { count: 0, midSentence: false, conversations: new Set<string>() };
  entry.count += 1;
  entry.midSentence = entry.midSentence || midSentence;
  entry.conversations.add(conversationId);
  map.set(name, entry);
}

// --- Small helpers -----------------------------------------------------------

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstValue(record: Record<string, unknown>, keys: readonly string[]): unknown {
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
  return undefined;
}

function firstString(record: Record<string, unknown>, keys: readonly string[]): string | null {
  const value = firstValue(record, keys);
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

function isoDate(value: unknown): string | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Seconds or milliseconds since the epoch, whichever it looks like.
    return new Date(value < 1e12 ? value * 1000 : value).toISOString();
  }
  if (typeof value !== 'string') return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}
