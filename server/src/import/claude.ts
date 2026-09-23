import {
  instantToLocalDay,
  type ClaudeImportReport,
  type ImportNameSource,
  type ImportNoteSource,
  type ImportPatientPlan,
  type ImportSkippedConversation,
  type ImportSkipReason,
} from '@apunta/shared';
import { plainFromMarkdown } from './markdown.js';
import { readZip, ZipFormatError } from './zip.js';

/**
 * Reading a Claude data export into an import plan (M11).
 *
 * The owner chose an automatic import over per-note review (2026-09-21), so
 * the rules that keep it honest live here, in pure functions with tests:
 *
 * - **The thread she ended up on.** Edited and regenerated messages fork a
 *   conversation; `liveThread` follows the parent links from the latest
 *   message back, and the abandoned forks are counted, never imported.
 * - **One note per session.** Her pattern is one long conversation per
 *   patient; `splitSessions` cuts it at every gap over `SESSION_GAP_HOURS`.
 *   Each session's date is when she talked to Claude — *recorded*, never
 *   asserted as the session date.
 * - **Skip rather than guess.** `assignConversation` gives a conversation to
 *   a patient on her list only when the match is unambiguous.
 * - **Verbatim.** A note is Claude's last reply in the session (the default:
 *   she drafted her notes with Claude) or her own messages, as written.
 *   Nothing is summarised and no model is involved.
 *
 * The reader is tolerant: it accepts the file at the top level or under a
 * key, `sender` or `role`, `text` or a list of content blocks, and skips what
 * it cannot read while counting it, rather than failing the whole archive on
 * one odd row.
 */

export class ImportFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFormatError';
  }
}

export interface RawTurn {
  /** The export's message id, when it has one — provenance and re-import detection hang off it. */
  readonly id: string | null;
  readonly role: 'human' | 'assistant';
  /** Verbatim; may be empty for a message that carried only an attachment. */
  readonly text: string;
  readonly at: string | null;
  /** Files attached to the message (`attachments` and `files` together). Counted, never imported. */
  readonly attachments: number;
}

export interface RawConversation {
  readonly id: string;
  readonly title: string;
  readonly createdAt: string | null;
  /** The messages on the conversation's live thread, in order — see `liveThread`. */
  readonly turns: readonly RawTurn[];
  /** Messages left out because they sit on a branch she abandoned by editing or regenerating. */
  readonly abandoned: number;
}

export interface ReadExport {
  readonly conversations: readonly RawConversation[];
  /** Readable turns on the live threads, across every conversation. */
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
    const { turns, abandoned } = readTurns(record);
    const readable = turns.filter((turn) => turn.text !== '').length;
    if (readable === 0) {
      skipped += 1;
      return;
    }
    messages += readable;
    conversations.push({
      id: firstString(record, ['uuid', 'id', 'conversation_id']) ?? `conversation-${String(index + 1)}`,
      title: firstString(record, ['name', 'title']) ?? '',
      createdAt: isoDate(firstValue(record, ['created_at', 'createdAt', 'create_time'])),
      turns,
      abandoned,
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

interface LinkedTurn extends RawTurn {
  readonly parent: string | null;
}

function readTurns(conversation: Record<string, unknown>): { turns: RawTurn[]; abandoned: number } {
  const raw = firstValue(conversation, ['chat_messages', 'messages']);
  if (!Array.isArray(raw)) return { turns: [], abandoned: 0 };
  const linked: LinkedTurn[] = [];
  for (const item of raw) {
    const message = asRecord(item);
    if (message === null) continue;
    const role = turnRole(message);
    if (role === null) continue;
    const text = turnText(message).trim();
    const attachments = listLength(message['attachments']) + listLength(message['files']);
    if (text === '' && attachments === 0) continue;
    linked.push({
      id: firstString(message, ['uuid', 'id']),
      parent: firstString(message, ['parent_message_uuid', 'parent_id', 'parent']),
      role,
      text,
      at: isoDate(firstValue(message, ['created_at', 'createdAt', 'create_time'])),
      attachments,
    });
  }
  const thread = liveThread(linked);
  return {
    turns: thread.map(({ parent: _parent, ...turn }) => turn),
    abandoned: linked.length - thread.length,
  };
}

/**
 * The thread she ended up on, when the export records one.
 *
 * Editing a message or regenerating a reply in Claude forks the conversation,
 * and the export keeps both forks in one flat array, each message naming its
 * parent. Array order would splice the abandoned fork into the note. So where
 * parent links are present, start from the conversation's latest message and
 * walk the parents back: that chain is what she was looking at last. Where
 * they are absent — no message names a parent that is also in the
 * conversation — array order is all there is, and it is used as is.
 */
export function liveThread<T extends { id: string | null; parent: string | null; at: string | null }>(
  messages: readonly T[],
): T[] {
  const byId = new Map<string, T>();
  for (const message of messages) if (message.id !== null) byId.set(message.id, message);
  const linked = messages.some((m) => m.parent !== null && m.parent !== m.id && byId.has(m.parent));
  if (!linked) return [...messages];

  // The latest message, by timestamp; on a tie (or no timestamps), the later one in the array.
  let tip: T | undefined;
  for (const message of messages) {
    if (message.id === null) continue;
    if (tip === undefined || (message.at ?? '') >= (tip.at ?? '')) tip = message;
  }
  const chain: T[] = [];
  const seen = new Set<string>();
  for (let at = tip; at !== undefined && at.id !== null && !seen.has(at.id);) {
    seen.add(at.id);
    chain.push(at);
    at = at.parent === null ? undefined : byId.get(at.parent);
  }
  return chain.reverse();
}

function listLength(value: unknown): number {
  return Array.isArray(value) ? value.length : 0;
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

// --- Sessions ----------------------------------------------------------------

/**
 * A gap longer than this between two messages starts a new session.
 *
 * She keeps one long conversation per patient and comes back to it after
 * each session, so a conversation is months of sittings end to end. Six
 * hours is longer than any one sitting runs — a note drafted over a lunch
 * break or between two appointments stays whole — and shorter than the
 * time between two sessions with the same person, which in this practice
 * is days. A split in the wrong place costs her one merge or one skip in
 * review; the date on each piece is only ever labelled *recorded*.
 */
export const SESSION_GAP_HOURS = 6;
const SESSION_GAP_MS = SESSION_GAP_HOURS * 60 * 60 * 1000;

/**
 * The conversation cut at every gap longer than `SESSION_GAP_HOURS`. A
 * message without a timestamp stays in the session it follows.
 */
export function splitSessions(turns: readonly RawTurn[]): RawTurn[][] {
  const sessions: RawTurn[][] = [];
  let current: RawTurn[] = [];
  let last: number | null = null;
  for (const turn of turns) {
    const at = turn.at === null ? null : Date.parse(turn.at);
    if (at !== null && last !== null && at - last > SESSION_GAP_MS && current.length > 0) {
      sessions.push(current);
      current = [];
    }
    current.push(turn);
    if (at !== null) last = at;
  }
  if (current.length > 0) sessions.push(current);
  return sessions;
}

// --- Matching ----------------------------------------------------------------

/** A listed name mentioned fewer times than this is a passing mention, not her patient's chat. */
export const MIN_MENTIONS = 3;

/**
 * When two listed names both appear, the leader must be mentioned at least
 * this many times as often as the runner-up for the conversation to count as
 * the leader's. Below that it is ambiguous and is not imported.
 */
export const DOMINANCE = 3;

export type Assignment =
  | { readonly kind: 'assigned'; readonly patient: number; readonly by: 'title' | 'text' }
  | { readonly kind: 'skipped'; readonly reason: 'no_match' | 'weak_match' | 'ambiguous' };

/**
 * Which name on her list a conversation is about — or none. Spelled out here
 * and nowhere else, and it prefers skipping to guessing:
 *
 * 1. **The title.** If exactly one listed name is in the conversation's
 *    title, it is that patient's — unless another listed name is mentioned
 *    more often in the conversation itself, which makes it ambiguous. Two
 *    listed names in the title are ambiguous.
 * 2. **The text**, both sides of the live thread. Count each listed name's
 *    mentions. None at all: `no_match`. A leader that does not reach
 *    `DOMINANCE` times the runner-up: `ambiguous`. A clear leader mentioned
 *    fewer than `MIN_MENTIONS` times: `weak_match`. Otherwise, the leader's.
 *
 * A mention is the name as a whole word starting with a capital — "Will"
 * counts, "will" does not — and a listed full name also counts its first
 * name alone, unless another listed name shares that first name.
 */
export function assignConversation(
  conversation: Pick<RawConversation, 'title' | 'turns'>,
  names: readonly string[],
): Assignment {
  const patterns = names.map((name) => mentionPattern(name, names));
  const inTitle = patterns.map((pattern) => countMentions(conversation.title, pattern));
  const text = conversation.turns.map((turn) => turn.text).join('\n');
  const inText = patterns.map((pattern) => countMentions(text, pattern));

  const titled = inTitle.flatMap((count, index) => (count > 0 ? [index] : []));
  if (titled.length > 1) return { kind: 'skipped', reason: 'ambiguous' };
  if (titled.length === 1) {
    const patient = titled[0] as number;
    const own = inText[patient] ?? 0;
    const outnumbered = inText.some((count, index) => index !== patient && count > own);
    return outnumbered
      ? { kind: 'skipped', reason: 'ambiguous' }
      : { kind: 'assigned', patient, by: 'title' };
  }

  const ranked = inText.map((count, index) => ({ count, index })).sort((a, b) => b.count - a.count);
  const top = ranked[0];
  const second = ranked[1]?.count ?? 0;
  if (top === undefined || top.count === 0) return { kind: 'skipped', reason: 'no_match' };
  if (second > 0 && top.count < DOMINANCE * second) return { kind: 'skipped', reason: 'ambiguous' };
  if (top.count < MIN_MENTIONS) return { kind: 'skipped', reason: 'weak_match' };
  return { kind: 'assigned', patient: top.index, by: 'text' };
}

/** The words that count as a mention of `name`, longest first, as one case-insensitive pattern. */
function mentionPattern(name: string, everyone: readonly string[]): RegExp | null {
  const full = name.trim().replace(/\s+/g, ' ');
  if (full === '') return null;
  const forms = [full];
  const first = full.split(' ')[0] ?? '';
  const shared = everyone.some(
    (other) =>
      other.trim().toLowerCase() !== full.toLowerCase() &&
      (other.trim().split(/\s+/)[0] ?? '').toLowerCase() === first.toLowerCase(),
  );
  if (first !== full && first.length >= 3 && !shared) forms.push(first);
  const alternatives = forms.map((form) => form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+'));
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${alternatives.join('|')})(?![\\p{L}\\p{N}])`, 'giu');
}

function countMentions(text: string, pattern: RegExp | null): number {
  if (pattern === null) return 0;
  let count = 0;
  for (const match of text.matchAll(pattern)) {
    const initial = match[0].charAt(0);
    if (initial !== initial.toLowerCase()) count += 1;
  }
  return count;
}

// --- Provenance --------------------------------------------------------------

/**
 * The first line of an imported note's transcript: where it came from, down
 * to the messages, so the origin of an imported note is always answerable and
 * a second run can tell what the first one already wrote.
 */
export function provenanceLine(input: {
  readonly conversationId: string;
  readonly title: string;
  readonly session: number;
  readonly sessions: number;
  readonly recordedAt: string | null;
  readonly source: ImportNoteSource;
  readonly messageIds: readonly string[];
  readonly attachments: number;
}): string {
  const title = input.title.replace(/\s+/g, ' ').trim();
  const name = title === '' ? 'an untitled conversation' : `"${title}"`;
  const when = input.recordedAt === null ? '' : `, recorded ${instantToLocalDay(input.recordedAt)}`;
  const from = input.source === 'assistant' ? "Claude's last reply" : 'your own messages';
  const files =
    input.attachments === 0
      ? ''
      : `; ${String(input.attachments)} attached ${input.attachments === 1 ? 'file' : 'files'} not imported`;
  return (
    `[Imported from Claude conversation ${name} (${input.conversationId}), ` +
    `session ${String(input.session)} of ${String(input.sessions)}${when}; ` +
    `note from ${from}${files}; messages: ${input.messageIds.join(' ')}]`
  );
}

/** What earlier runs imported, read back from their transcripts' first lines. */
export interface ImportedKeys {
  /** Session keys (message ids) already imported. */
  readonly messages: ReadonlySet<string>;
  /** Conversations imported whole by the first version of this importer, which kept no message ids. */
  readonly conversations: ReadonlySet<string>;
  /** The patient each previously imported conversation landed on, so a re-run keeps adding to them. */
  readonly patients: ReadonlyMap<string, string>;
}

export function importedKeys(
  transcripts: Iterable<{ readonly raw_text: string; readonly patient_id: string }>,
): ImportedKeys {
  const messages = new Set<string>();
  const conversations = new Set<string>();
  const patients = new Map<string, string>();
  for (const { raw_text: raw, patient_id: patientId } of transcripts) {
    const line = raw.split('\n', 1)[0] ?? '';
    const conversation =
      /^\[Imported from Claude conversation (?:".*"|an untitled conversation) \(([^()\s]+)\)/.exec(line)?.[1];
    if (conversation === undefined) continue;
    patients.set(conversation, patientId);
    const listed = /; messages: ([^\]]*)\]$/.exec(line)?.[1];
    if (listed === undefined) conversations.add(conversation);
    else for (const id of listed.split(' ')) if (id !== '') messages.add(id);
  }
  return { messages, conversations, patients };
}

// --- Is this a patient's conversation? -------------------------------------------

/**
 * A patient qualifies when she has seen them since the cutoff: at least one
 * session of theirs has a message on or after that day (UTC). The cutoff picks
 * *patients*, not sessions — a qualifying patient is imported with every
 * session, however old.
 */
export function activeSince(turns: readonly RawTurn[], cutoff: string): boolean {
  return turns.some(
    (turn) => turn.at !== null && new Date(turn.at).toISOString().split('T', 1)[0]! >= cutoff,
  );
}

/**
 * Her patients are each one long conversation she comes back to after every
 * session; a chat about anything else is almost always one sitting. Fewer
 * sessions than this is not a patient's history.
 */
export const MIN_SESSIONS = 2;

/**
 * Headings a clinical note is written under, beyond the practice's own
 * formats (read from the database at import time). Matched as the start of a
 * heading line, case-insensitively, so "Presenting concerns" and "Risk
 * assessment" count. Short on purpose: each entry is a word Claude puts at
 * the head of a section in a therapy note, not one that merely occurs in one.
 */
export const COMMON_NOTE_HEADINGS: readonly string[] = [
  'Subjective',
  'Objective',
  'Assessment',
  'Plan',
  'Data',
  'Presenting',
  'Mental status',
  'Mental state',
  'MSE',
  'Risk',
  'Safety',
  'Interventions',
  'Intervention',
  'Session summary',
  'Summary of session',
  'Progress',
  'Response to',
  'Goals',
  'Treatment plan',
  'Formulation',
  'Observations',
  'Clinical impression',
  'Diagnosis',
  'Homework',
  'Next session',
  'Follow-up',
  'Themes',
];

/** A reply is note-shaped when it has at least this many distinct headings… */
export const MIN_HEADINGS_PER_REPLY = 2;
/** …and a conversation is clinical when at least this many of its sessions have a note-shaped reply. */
export const MIN_CLINICAL_SESSIONS = 2;

/**
 * The distinct known headings in a reply. A heading is a line that starts
 * with one — after optional Markdown `#`s, bold markers or a list bullet —
 * and then ends, or goes on with a colon or dash. "Plan: continue weekly"
 * is a heading; "We talked about her plan to move" is not.
 */
export function noteHeadings(text: string, headings: readonly string[]): Set<string> {
  const found = new Set<string>();
  for (const raw of text.split('\n')) {
    const line = raw
      .trim()
      .replace(/^(?:#{1,6}\s*|[-*•]\s+)?/, '')
      .replace(/^(?:\*\*|__)/, '')
      .trim();
    if (line === '') continue;
    for (const heading of headings) {
      const escaped = heading.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (escaped === '') continue;
      // The heading, then optionally a few more words of heading, then the end of the line or a separator.
      const pattern = new RegExp(
        `^${escaped}(?![\\p{L}\\p{N}])(?:[\\p{L}\\p{N} /&()'-]{0,40}?)(?:\\*\\*|__)?\\s*(?:$|[:–—-])`,
        'iu',
      );
      if (pattern.test(line)) found.add(heading.toLowerCase());
    }
  }
  return found;
}

/** Claude's replies look like clinical notes, in at least `MIN_CLINICAL_SESSIONS` sessions. */
export function looksClinical(
  sessions: readonly (readonly RawTurn[])[],
  headings: readonly string[],
): boolean {
  let shaped = 0;
  for (const session of sessions) {
    const noteLike = session.some(
      (turn) => turn.role === 'assistant' && noteHeadings(turn.text, headings).size >= MIN_HEADINGS_PER_REPLY,
    );
    if (noteLike) shaped += 1;
  }
  return shaped >= MIN_CLINICAL_SESSIONS;
}

/**
 * Words that start a title for reasons other than being someone's name. The
 * title's first capitalised word that is none of these, and is mentioned in
 * the conversation itself, is the guessed name. Anything this list misses is
 * caught by the other tests, flagged "name guessed — check", and one untick
 * away in the summary.
 */
const NOT_A_NAME = new Set([
  // Title words.
  'session',
  'sessions',
  'note',
  'notes',
  'patient',
  'patients',
  'client',
  'clients',
  'therapy',
  'therapist',
  'counselling',
  'counseling',
  'progress',
  'clinical',
  'draft',
  'drafts',
  'summary',
  'update',
  'updates',
  'follow',
  'followup',
  'case',
  'weekly',
  'intake',
  'initial',
  'assessment',
  'plan',
  'treatment',
  'review',
  'report',
  'letter',
  'referral',
  'supervision',
  'soap',
  'dap',
  'birp',
  'girp',
  'mse',
  'cbt',
  'dbt',
  'act',
  'emdr',
  'ifs',
  'writing',
  'write',
  'chat',
  'conversation',
  'untitled',
  'new',
  'help',
  'question',
  'questions',
  'ideas',
  'template',
  'format',
  'discussion',
  // Clinical topics that head a title.
  'anxiety',
  'depression',
  'trauma',
  'grief',
  'couples',
  'couple',
  'family',
  'child',
  'teen',
  'adolescent',
  'anger',
  'panic',
  'sleep',
  'stress',
  'mental',
  'health',
  'risk',
  'safety',
  'mood',
  // Function words.
  'the',
  'a',
  'an',
  'my',
  'our',
  'your',
  'for',
  'with',
  'about',
  'and',
  'of',
  're',
  'on',
  'to',
  'in',
  'from',
  'how',
  'what',
  'why',
  'can',
  'i',
  'we',
  'this',
  'next',
  'last',
  'first',
  'second',
  // Calendar.
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
  'jan',
  'feb',
  'mar',
  'apr',
  'jun',
  'jul',
  'aug',
  'sep',
  'sept',
  'oct',
  'nov',
  'dec',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
  'today',
  'tomorrow',
  'yesterday',
  'week',
  'month',
  // Names that are not people.
  'claude',
  'apunta',
  'chatgpt',
  'halaxy',
]);

/**
 * A patient name from the conversation's title, or null when it cannot be
 * told with confidence: the first word that starts with a capital, is a
 * word (letters, an inner hyphen or apostrophe), is not on the list above,
 * and is itself mentioned in the conversation — a title Claude generated
 * from her first message names someone who is in it.
 */
export function nameFromTitle(title: string, text: string): string | null {
  for (const raw of title.split(/[\s,.;:!?()[\]{}"/|–—]+/)) {
    const word = raw.replace(/['’]s$/u, '').replace(/^[-'’]+|[-'’]+$/gu, '');
    if (!/^\p{Lu}[\p{Ll}\p{Lu}]*(?:[-'’]\p{L}+)*$/u.test(word)) continue;
    if (word.length < 2 || NOT_A_NAME.has(word.toLowerCase())) continue;
    if (/^\p{Lu}+$/u.test(word) && word.length > 1) continue; // an acronym, not a name
    return countMentions(text, mentionPattern(word, [word])) > 0 ? word : null;
  }
  return null;
}

// --- The plan ------------------------------------------------------------------

export interface KnownPatient {
  readonly id: string;
  readonly name: string;
  /** Archived charts are retained for previous-import provenance but are not
   * candidates for a new name match. */
  readonly archived?: boolean;
}

function normalizedPatientName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

export interface ImportOptions {
  /** Her optional list: names to confirm and spell with, never a restriction. */
  readonly names: readonly string[];
  /** Every patient already in Apunta, archived or not. */
  readonly existing: readonly KnownPatient[];
  readonly imported: ImportedKeys;
  readonly source: ImportNoteSource;
  /** `YYYY-MM-DD`: import patients with a session on or after this day. */
  readonly cutoff: string;
  /** The practice's format section names; `COMMON_NOTE_HEADINGS` are always added. */
  readonly headings: readonly string[];
  /** Patient keys she unticked in the summary. */
  readonly exclude?: ReadonlySet<string>;
  /** Explicit preview choices, keyed by the stable report patient key. */
  readonly existingPatientIds?: ReadonlyMap<string, string | null>;
}

export interface PlannedNote {
  /** Index into the report's `patients`. */
  readonly patient: number;
  readonly recordedAt: string | null;
  readonly body: string;
  readonly provenance: string;
}

export interface ImportPlan {
  readonly report: Omit<ClaudeImportReport, 'batch_id'>;
  readonly notes: readonly PlannedNote[];
}

interface Qualified {
  readonly conversation: RawConversation;
  readonly sessions: readonly RawTurn[][];
  readonly name: {
    readonly source: ImportNameSource;
    readonly value: string;
    readonly patientId: string | null;
  };
}

/**
 * Everything the import would write, computed without writing: the preview
 * shows it, the run writes exactly it. Deterministic in its inputs, so the
 * summary she glanced at before pressing the button is what the button does.
 *
 * A conversation is imported only when it clears every test, in this order,
 * and the first it fails is the reason reported: activity since the cutoff,
 * at least `MIN_SESSIONS` sessions, Claude's replies shaped like notes, and
 * a confident name. A conversation imported by an earlier run keeps its
 * patient; otherwise the name comes from her list (see `assignConversation`),
 * falling back to the title (see `nameFromTitle`).
 */
export function planImport(read: ReadExport, options: ImportOptions): ImportPlan {
  const headings = [
    ...new Set([...options.headings, ...COMMON_NOTE_HEADINGS].map((h) => h.trim()).filter(Boolean)),
  ];
  const existingById = new Map(options.existing.map((patient) => [patient.id, patient]));
  const existingByName = new Map<string, KnownPatient[]>();
  for (const patient of options.existing) {
    if (patient.archived === true) continue;
    const key = normalizedPatientName(patient.name);
    const matches = existingByName.get(key);
    if (matches) matches.push(patient);
    else existingByName.set(key, [patient]);
  }
  let abandoned = 0;
  const dates: string[] = [];
  const skipped: ImportSkippedConversation[] = [];
  const qualified: Qualified[] = [];

  for (const conversation of read.conversations) {
    abandoned += conversation.abandoned;
    const first = conversation.turns.find((turn) => turn.at !== null)?.at ?? conversation.createdAt;
    const last = conversation.turns.findLast((turn) => turn.at !== null)?.at ?? first;
    if (first !== null) dates.push(first);
    if (last !== null) dates.push(last);
    const sessions = splitSessions(conversation.turns);
    const skip = (reason: ImportSkipReason): void => {
      skipped.push({
        reason,
        recorded_at: first,
        last_at: last,
        messages: conversation.turns.filter((turn) => turn.text !== '').length,
        sessions: sessions.length,
      });
    };

    if (!activeSince(conversation.turns, options.cutoff)) {
      skip('before_cutoff');
      continue;
    }
    if (sessions.length < MIN_SESSIONS) {
      skip('single_session');
      continue;
    }
    if (!looksClinical(sessions, headings)) {
      skip('not_clinical');
      continue;
    }

    const previous = options.imported.patients.get(conversation.id);
    const previousPatient = previous === undefined ? undefined : existingById.get(previous);
    if (previousPatient !== undefined) {
      qualified.push({
        conversation,
        sessions,
        name: { source: 'previous', value: previousPatient.name, patientId: previousPatient.id },
      });
      continue;
    }

    const listed = assignConversation(conversation, options.names);
    if (listed.kind === 'assigned') {
      const value = options.names[listed.patient] as string;
      const matches = existingByName.get(normalizedPatientName(value)) ?? [];
      const match = matches.length === 1 ? matches[0] : undefined;
      qualified.push({
        conversation,
        sessions,
        name: { source: 'list', value: match?.name ?? value, patientId: match?.id ?? null },
      });
      continue;
    }
    if (listed.reason === 'ambiguous') {
      skip('ambiguous');
      continue;
    }
    const guessed = nameFromTitle(conversation.title, conversation.turns.map((turn) => turn.text).join('\n'));
    if (guessed === null) {
      skip('no_name');
      continue;
    }
    qualified.push({ conversation, sessions, name: { source: 'title', value: guessed, patientId: null } });
  }

  // One patient per list name or existing patient; one per conversation for a guess. Two
  // conversations guessing the same name are not merged: each gets a numbered suffix, and
  // both are flagged — and an existing patient of that name is not assumed to be either.
  const guessCounts = new Map<string, number>();
  for (const { name } of qualified) {
    if (name.source !== 'title') continue;
    const key = normalizedPatientName(name.value);
    guessCounts.set(key, (guessCounts.get(key) ?? 0) + 1);
  }
  const guessSeen = new Map<string, number>();

  const patients: ImportPatientPlan[] = [];
  const patientIndex = new Map<string, number>();
  const notes: PlannedNote[] = [];
  let alreadyImported = 0;
  let withoutBody = 0;
  let attachments = 0;
  const matchedNames = new Set<string>();

  for (const { conversation, sessions, name } of qualified) {
    matchedNames.add(normalizedPatientName(name.value));
    let key: string;
    let plan: Omit<ImportPatientPlan, 'conversations' | 'notes'>;
    if (name.source === 'title') {
      const lower = normalizedPatientName(name.value);
      const clashes = (guessCounts.get(lower) ?? 0) > 1;
      const matches = existingByName.get(lower) ?? [];
      const existing = clashes || matches.length !== 1 ? undefined : matches[0];
      key = `title:${conversation.id}`;
      if (existing !== undefined) {
        plan = { key, name: existing.name, source: 'existing', patient_id: existing.id, name_guessed: false };
      } else {
        const n = (guessSeen.get(lower) ?? 0) + 1;
        guessSeen.set(lower, n);
        plan = {
          key,
          name: clashes ? `${name.value} (${String(n)})` : name.value,
          source: 'title',
          patient_id: null,
          name_guessed: true,
        };
      }
    } else {
      key =
        name.patientId !== null ? `patient:${name.patientId}` : `list:${normalizedPatientName(name.value)}`;
      plan = { key, name: name.value, source: name.source, patient_id: name.patientId, name_guessed: false };
    }

    const selectedPatientId = options.existingPatientIds?.get(key);
    if (selectedPatientId !== undefined) {
      if (selectedPatientId === null) {
        plan = {
          ...plan,
          patient_id: null,
          source: name.source === 'title' ? 'title' : 'list',
          name_guessed: name.source === 'title',
        };
      } else {
        const selectedPatient = existingById.get(selectedPatientId);
        if (selectedPatient === undefined || selectedPatient.archived === true)
          throw new Error('The selected import patient is not an active patient.');
        plan = {
          ...plan,
          name: selectedPatient.name,
          source: 'existing',
          patient_id: selectedPatient.id,
          name_guessed: false,
        };
      }
    }

    if (options.exclude?.has(key) === true) {
      const first = conversation.turns.find((turn) => turn.at !== null)?.at ?? conversation.createdAt;
      skipped.push({
        reason: 'excluded',
        recorded_at: first,
        last_at: conversation.turns.findLast((turn) => turn.at !== null)?.at ?? first,
        messages: conversation.turns.filter((turn) => turn.text !== '').length,
        sessions: sessions.length,
      });
      continue;
    }

    let index = patientIndex.get(key);
    if (index === undefined) {
      index = patients.length;
      patientIndex.set(key, index);
      patients.push({ ...plan, conversations: 0, notes: 0 });
    }
    const patient = patients[index] as ImportPatientPlan;
    patient.conversations += 1;

    sessions.forEach((session, at) => {
      const ids = session.flatMap((turn) => (turn.id === null ? [] : [turn.id]));
      const recordedAt =
        session.find((turn) => turn.at !== null)?.at ?? (at === 0 ? conversation.createdAt : null);
      const keys = ids.length > 0 ? ids : [`${conversation.id}@${String(at + 1)}`];
      if (
        options.imported.conversations.has(conversation.id) ||
        keys.some((id) => options.imported.messages.has(id))
      ) {
        alreadyImported += 1;
        return;
      }
      const body = sessionBody(session, options.source);
      if (body === '') {
        withoutBody += 1;
        return;
      }
      const files = session.reduce((sum, turn) => sum + turn.attachments, 0);
      attachments += files;
      patient.notes += 1;
      notes.push({
        patient: index,
        recordedAt,
        body,
        provenance: provenanceLine({
          conversationId: conversation.id,
          title: conversation.title,
          session: at + 1,
          sessions: sessions.length,
          recordedAt,
          source: options.source,
          messageIds: keys,
          attachments: files,
        }),
      });
    });
  }

  // A patient with nothing new to write is not created, and not shown as if it were.
  const shown = patients.filter((patient) => patient.notes > 0);
  const renumber = new Map(shown.map((patient) => [patients.indexOf(patient), shown.indexOf(patient)]));

  dates.sort();
  skipped.sort((a, b) => (a.recorded_at ?? '').localeCompare(b.recorded_at ?? ''));
  return {
    notes: notes.map((note) => ({ ...note, patient: renumber.get(note.patient) as number })),
    report: {
      source: options.source,
      cutoff: options.cutoff,
      patients: shown,
      patients_to_create: shown.filter((patient) => patient.patient_id === null).length,
      notes: notes.length,
      unmatched_names: options.names.filter((name) => !matchedNames.has(normalizedPatientName(name))),
      already_imported: alreadyImported,
      sessions_without_body: withoutBody,
      skipped,
      totals: {
        conversations: read.conversations.length + read.skipped,
        messages: read.messages,
        unreadable: read.skipped,
        abandoned,
        attachments,
      },
      date_range: { from: dates[0] ?? null, to: dates.at(-1) ?? null },
    },
  };
}

/**
 * The note: Claude's last reply in the session (her latest accepted
 * revision), or her own messages in order. The words are hers or Claude's,
 * unchanged; only the Markdown around them goes (`markdown.ts`), so the note,
 * its copy into Halaxy and every prompt it later reaches are plain text.
 */
export function sessionBody(session: readonly RawTurn[], source: ImportNoteSource): string {
  const side = session.filter((turn) => turn.role === source && turn.text !== '');
  const text =
    source === 'assistant' ? (side.at(-1)?.text ?? '') : side.map((turn) => turn.text).join('\n\n');
  return plainFromMarkdown(text);
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
