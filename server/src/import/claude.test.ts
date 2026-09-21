import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  activeSince,
  assignConversation,
  COMMON_NOTE_HEADINGS,
  importedKeys,
  ImportFormatError,
  liveThread,
  looksClinical,
  nameFromTitle,
  noteHeadings,
  openExport,
  planImport,
  readConversations,
  sessionBody,
  splitSessions,
  type ImportOptions,
  type RawTurn,
  type ReadExport,
} from './claude.js';

/**
 * Two fabricated exports, prototype names only. `sample-export.zip` and its
 * `conversations.json` are the first, flat fixture: five one-sitting
 * conversations with no parent links. `patient-chats.json` is in the shape
 * the real export was probed to have (parent links from a root sentinel,
 * attachments, files) and holds the decoys the automatic import must refuse:
 * a long chat that is not clinical, a clinical-looking single sitting, a
 * clinical chat whose title names nobody, a patient last seen before the
 * cutoff — and the ones it must take: John, whose chat straddles the cutoff
 * and has a regenerated reply and an attachment, and two chats both titled
 * with the first name Maria.
 */
const FIXTURE = join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', 'claude-export');
const zip = (): Buffer => readFileSync(join(FIXTURE, 'sample-export.zip'));
const json = (): Buffer => readFileSync(join(FIXTURE, 'conversations.json'));
const chats = (): ReadExport =>
  readConversations(JSON.parse(readFileSync(join(FIXTURE, 'patient-chats.json'), 'utf8')) as unknown);

const CUTOFF = '2026-07-01';
const NONE = importedKeys([]);
function options(overrides: Partial<ImportOptions> = {}): ImportOptions {
  return {
    names: [],
    existing: [],
    imported: NONE,
    source: 'assistant',
    cutoff: CUTOFF,
    headings: [],
    ...overrides,
  };
}

let clock = Date.parse('2026-07-01T09:00:00Z');
function turn(role: RawTurn['role'], text: string, minutesLater = 1): RawTurn {
  clock += minutesLater * 60_000;
  return { id: `m-${String(clock)}`, role, text, at: new Date(clock).toISOString(), attachments: 0 };
}

describe('openExport', () => {
  it('reads the zip Claude sends, and the bare conversations.json alike', () => {
    for (const [upload, name] of [
      [zip(), 'data-2026-09-01.zip'],
      [json(), 'conversations.json'],
    ] as const) {
      const read = openExport(upload, name);
      expect(read.conversations).toHaveLength(5);
      expect(read.messages).toBe(12);
      expect(read.skipped).toBe(0);
    }
  });

  it('says what is wrong with a file that is not an export', () => {
    expect(() => openExport(Buffer.from('hello'), 'notes.txt')).toThrow(ImportFormatError);
    expect(() => openExport(Buffer.from('{"nothing": true}'), 'x.json')).toThrow('No conversations');
  });
});

describe('readConversations', () => {
  it('tolerates the other shapes an export might take', () => {
    const read = readConversations({
      conversations: [
        {
          id: 'c1',
          title: 'A',
          createdAt: 1_772_000_000,
          messages: [
            { role: 'user', content: [{ type: 'text', text: 'Saw Sam today.' }], create_time: 1_772_000_000 },
            { author: { role: 'assistant' }, content: 'Noted.' },
            { role: 'system', text: 'ignored' },
          ],
        },
        { id: 'c2', title: 'empty', messages: [] },
        'not even an object',
      ],
    });
    expect(read.conversations).toHaveLength(1);
    expect(read.conversations[0]?.turns.map((t) => t.role)).toEqual(['human', 'assistant']);
    expect(read.conversations[0]?.createdAt).toBe('2026-02-25T06:13:20.000Z');
    expect(read.skipped).toBe(2);
  });
});

describe('liveThread', () => {
  it('follows the parent links from the latest message, leaving an abandoned regeneration out', () => {
    const john = chats().conversations.find((c) => c.id === 'conv-john');
    expect(john?.turns.map((t) => t.id)).toEqual([
      'john-01',
      'john-02',
      'john-03',
      'john-04b',
      'john-05',
      'john-06',
      'john-07',
      'john-08',
    ]);
    expect(john?.abandoned).toBe(1);
    expect(john?.turns.map((t) => t.text).join('\n')).not.toContain('ABANDONED');
  });

  it('keeps array order when there are no parent links', () => {
    const read = openExport(json(), 'conversations.json');
    expect(read.conversations[0]?.turns.map((t) => t.id)).toEqual([
      'c-0001-m0',
      'c-0001-m1',
      'c-0001-m2',
      'c-0001-m3',
    ]);
    expect(read.conversations[0]?.abandoned).toBe(0);
  });

  it('keeps array order when the only parent named is a root outside the conversation', () => {
    const messages = [
      { id: 'a', parent: '00000000-0000-4000-8000-000000000000', at: '2026-07-01T10:00:00Z' },
      { id: 'b', parent: null, at: '2026-07-01T10:01:00Z' },
    ];
    expect(liveThread(messages).map((m) => m.id)).toEqual(['a', 'b']);
  });

  it('picks the later branch when an edited message forks the conversation', () => {
    const messages = [
      { id: 'q1', parent: 'root', at: '2026-07-01T10:00:00Z' },
      { id: 'r1', parent: 'q1', at: '2026-07-01T10:01:00Z' },
      { id: 'q2-old', parent: 'r1', at: '2026-07-01T10:02:00Z' },
      { id: 'r2-old', parent: 'q2-old', at: '2026-07-01T10:03:00Z' },
      { id: 'q2-edited', parent: 'r1', at: '2026-07-01T10:05:00Z' },
      { id: 'r2-new', parent: 'q2-edited', at: '2026-07-01T10:06:00Z' },
    ];
    expect(liveThread(messages).map((m) => m.id)).toEqual(['q1', 'r1', 'q2-edited', 'r2-new']);
  });
});

describe('splitSessions', () => {
  it('starts a new session after a gap of more than six hours, and not at six exactly', () => {
    clock = Date.parse('2026-07-01T09:00:00Z');
    const a = turn('human', 'one');
    const b = turn('assistant', 'two', 6 * 60);
    const c = turn('human', 'three', 6 * 60 + 1);
    const d = turn('assistant', 'four');
    expect(splitSessions([a, b, c, d]).map((s) => s.map((t) => t.text))).toEqual([
      ['one', 'two'],
      ['three', 'four'],
    ]);
  });

  it('keeps an undated message in the session it follows', () => {
    const undated: RawTurn = { id: 'x', role: 'human', text: 'undated', at: null, attachments: 0 };
    clock = Date.parse('2026-07-01T09:00:00Z');
    const a = turn('human', 'a');
    const b = turn('human', 'b', 24 * 60);
    expect(splitSessions([a, undated, b]).map((s) => s.map((t) => t.text))).toEqual([
      ['a', 'undated'],
      ['b'],
    ]);
  });

  it('cuts John into his three sessions', () => {
    const john = chats().conversations.find((c) => c.id === 'conv-john');
    expect(splitSessions(john?.turns ?? []).map((s) => s.length)).toEqual([2, 2, 4]);
  });
});

describe('sessionBody', () => {
  const session = [
    turn('human', 'Draft a note.'),
    turn('assistant', 'First draft.'),
    turn('human', 'Shorter please.'),
    turn('assistant', 'Final draft.'),
  ];
  it("takes Claude's last reply, verbatim", () => {
    expect(sessionBody(session, 'assistant')).toBe('Final draft.');
  });
  it('or her own messages, in order', () => {
    expect(sessionBody(session, 'human')).toBe('Draft a note.\n\nShorter please.');
  });
  it('is empty when the chosen side said nothing', () => {
    expect(sessionBody([turn('human', 'Only me.')], 'assistant')).toBe('');
  });
});

describe('activeSince', () => {
  it('counts a message on the cutoff day, and not one the day before', () => {
    const on: RawTurn = { id: 'a', role: 'human', text: 'x', at: '2026-07-01T00:30:00.000Z', attachments: 0 };
    const before: RawTurn = { ...on, at: '2026-06-30T23:59:00.000Z' };
    expect(activeSince([before, on], CUTOFF)).toBe(true);
    expect(activeSince([before], CUTOFF)).toBe(false);
  });
});

describe('noteHeadings and looksClinical', () => {
  it('finds headings at the start of a line, in the shapes Claude writes them', () => {
    const reply = [
      '## Subjective',
      '**Assessment:** stable',
      '- Plan — continue weekly',
      'Presenting concerns: low mood',
      'Mental status examination: alert',
    ].join('\n');
    expect([...noteHeadings(reply, COMMON_NOTE_HEADINGS)].sort()).toEqual(
      ['assessment', 'mental status', 'plan', 'presenting', 'subjective'].sort(),
    );
  });

  it('does not take a word inside a sentence for a heading', () => {
    expect(
      noteHeadings('We talked about her plan to move, and the risk of it.', COMMON_NOTE_HEADINGS).size,
    ).toBe(0);
    expect(noteHeadings('Planning the garden: tomatoes', COMMON_NOTE_HEADINGS).size).toBe(0);
  });

  it("uses the practice's own format sections too", () => {
    expect(
      noteHeadings('Sleep hygiene: reviewed\nRelapse signature: none', ['Sleep hygiene', 'Relapse signature'])
        .size,
    ).toBe(2);
  });

  it('calls a conversation clinical only when two sessions have a note-shaped reply', () => {
    const noteShaped = 'Subjective: fine\nPlan: weekly';
    const one = [[turn('human', 'x'), turn('assistant', noteShaped)]];
    const two = [...one, [turn('human', 'y'), turn('assistant', noteShaped)]];
    const oneHeadingEach = [
      [turn('human', 'x'), turn('assistant', 'Plan: water less')],
      [turn('human', 'y'), turn('assistant', 'Plan: shade')],
    ];
    expect(looksClinical(one, COMMON_NOTE_HEADINGS)).toBe(false);
    expect(looksClinical(two, COMMON_NOTE_HEADINGS)).toBe(true);
    expect(looksClinical(oneHeadingEach, COMMON_NOTE_HEADINGS)).toBe(false);
  });
});

describe('nameFromTitle', () => {
  it('takes the first capitalised word that is not a title word, when the chat mentions it', () => {
    expect(nameFromTitle('John — session notes', 'John came in.')).toBe('John');
    expect(nameFromTitle("Clinical notes for Maria's sessions", 'Maria reports…')).toBe('Maria');
    expect(nameFromTitle('Session notes, July', 'The client…')).toBeNull();
    expect(nameFromTitle('CBT worksheet ideas', 'CBT…')).toBeNull();
    expect(nameFromTitle('', 'John')).toBeNull();
  });

  it('refuses a title word the conversation never mentions as a name', () => {
    expect(nameFromTitle('Recipe ideas', 'What can I cook with chickpeas?')).toBeNull();
  });
});

describe('assignConversation', () => {
  const conversation = (title: string, ...texts: string[]): { title: string; turns: RawTurn[] } => ({
    title,
    turns: texts.map((text) => turn('human', text)),
  });
  const names = ['John Smith', 'Maria Ruiz', 'Ana Torres'];

  it('assigns on a title that names exactly one listed patient', () => {
    expect(assignConversation(conversation('John — notes', 'He came in.'), names)).toEqual({
      kind: 'assigned',
      patient: 0,
      by: 'title',
    });
  });

  it('calls it ambiguous when two listed names share the title, or the text outnumbers the title', () => {
    expect(assignConversation(conversation('John and Maria', ''), names)).toEqual({
      kind: 'skipped',
      reason: 'ambiguous',
    });
    expect(assignConversation(conversation('John', 'Maria. Maria. Maria.'), names)).toEqual({
      kind: 'skipped',
      reason: 'ambiguous',
    });
  });

  it('assigns on the text only when one name clearly dominates', () => {
    const dominant = conversation(
      'Notes',
      'Maria Ruiz today.',
      'Maria said…',
      'Maria again.',
      'Ana mentioned once.',
    );
    expect(assignConversation(dominant, names)).toEqual({ kind: 'assigned', patient: 1, by: 'text' });
    const close = conversation('Notes', 'Maria. Maria. Maria.', 'Ana. Ana.');
    expect(assignConversation(close, names)).toEqual({ kind: 'skipped', reason: 'ambiguous' });
  });

  it('calls a passing mention weak and silence no match', () => {
    expect(assignConversation(conversation('Notes', 'Maria said hi.'), names)).toEqual({
      kind: 'skipped',
      reason: 'weak_match',
    });
    expect(assignConversation(conversation('Recipe', 'Chickpeas.'), names)).toEqual({
      kind: 'skipped',
      reason: 'no_match',
    });
  });

  it('counts a name only with its capital, so an ordinary word is not a patient', () => {
    const list = ['Will'];
    expect(assignConversation(conversation('Notes', 'I will, you will, we will.'), list)).toEqual({
      kind: 'skipped',
      reason: 'no_match',
    });
  });

  it('does not let a shared first name count for either patient', () => {
    const list = ['John Smith', 'John Doe'];
    expect(assignConversation(conversation('John', 'John. John. John.'), list)).toEqual({
      kind: 'skipped',
      reason: 'no_match',
    });
    expect(assignConversation(conversation('John Doe', 'John Doe again.'), list)).toEqual({
      kind: 'assigned',
      patient: 1,
      by: 'title',
    });
  });
});

describe('planImport', () => {
  it('imports every qualifying patient with their whole history, and nothing else', () => {
    const { report, notes } = planImport(chats(), options());

    expect(report.patients.map((p) => [p.name, p.source, p.name_guessed, p.notes])).toEqual([
      ['John', 'title', true, 3],
      ['Maria (1)', 'title', true, 2],
      ['Maria (2)', 'title', true, 2],
    ]);
    expect(report.patients_to_create).toBe(3);
    expect(report.notes).toBe(7);

    // John straddles the cutoff: his May and June sessions come too.
    const john = notes.filter((n) => n.patient === 0);
    expect(john.map((n) => n.recordedAt?.slice(0, 10))).toEqual(['2026-05-12', '2026-06-09', '2026-07-14']);
    // Claude's last reply in each session, the live branch, verbatim.
    expect(john[1]?.body).toContain('John reports sleeping six hours.');
    expect(john[2]?.body).toBe('**Subjective:** Sleep steady.\n\n**Plan:** Fortnightly.');
    expect(notes.map((n) => n.body).join('\n')).not.toContain('ABANDONED');
    expect(report.totals.abandoned).toBe(1);
    expect(report.totals.attachments).toBe(1);
  });

  it('reports every decoy by reason, date and count — never by title or text', () => {
    const { report } = planImport(chats(), options());
    const reasons = Object.fromEntries(report.skipped.map((s) => [s.reason, s]));
    expect(Object.keys(reasons).sort()).toEqual([
      'before_cutoff',
      'no_name',
      'not_clinical',
      'single_session',
    ]);
    expect(reasons['not_clinical']).toEqual({
      reason: 'not_clinical',
      recorded_at: '2026-07-05T09:00:00.000Z',
      last_at: '2026-08-01T09:01:00.000Z',
      messages: 6,
      sessions: 3,
    });
    const shown = JSON.stringify(report.skipped);
    for (const secret of ['Garden', 'Emily', 'Ana', 'Session notes', 'Jane', 'tomatoes']) {
      expect(shown).not.toContain(secret);
    }
  });

  it('names patients from her list, merging conversations her list says are one person', () => {
    const { report } = planImport(chats(), options({ names: ['John Smith', 'Maria Ruiz', 'Nobody Here'] }));
    expect(report.patients.map((p) => [p.name, p.source, p.name_guessed, p.conversations, p.notes])).toEqual([
      ['John Smith', 'list', false, 1, 3],
      ['Maria Ruiz', 'list', false, 2, 4],
    ]);
    expect(report.unmatched_names).toEqual(['Nobody Here']);
  });

  it('lands on a patient she already has, and never merges two guesses into one', () => {
    const existing = [
      { id: 'p-john', name: 'john' },
      { id: 'p-maria', name: 'Maria' },
    ];
    const { report } = planImport(chats(), options({ existing }));
    expect(report.patients.map((p) => [p.name, p.source, p.patient_id])).toEqual([
      ['john', 'existing', 'p-john'],
      ['Maria (1)', 'title', null],
      ['Maria (2)', 'title', null],
    ]);
    expect(report.patients_to_create).toBe(2);
  });

  it('leaves out a patient she unticked, and says so', () => {
    const { report } = planImport(chats(), options({ exclude: new Set(['title:conv-maria-b']) }));
    expect(report.patients.map((p) => p.name)).toEqual(['John', 'Maria (1)']);
    expect(report.skipped.filter((s) => s.reason === 'excluded')).toHaveLength(1);
  });

  it('takes her own messages when she asks for them', () => {
    const { notes } = planImport(chats(), options({ source: 'human' }));
    expect(notes[2]?.body).toBe(
      'John, first session after the break. Sleep steady. Worksheet attached.\n\nShorter please.',
    );
  });

  it('moves the cutoff back and the old patient comes in', () => {
    const { report } = planImport(chats(), options({ cutoff: '2026-03-01' }));
    expect(report.patients.map((p) => p.name)).toContain('Jane');
  });

  it('skips on a second run what the first one imported, and keeps the patient', () => {
    const first = planImport(chats(), options());
    const imported = importedKeys(
      first.notes.map((note) => ({
        raw_text: `${note.provenance}\n\n${note.body}`,
        patient_id: `p-${String(note.patient)}`,
      })),
    );
    const existing = [
      { id: 'p-0', name: 'John' },
      { id: 'p-1', name: 'Maria (1)' },
      { id: 'p-2', name: 'Maria (2)' },
    ];
    const second = planImport(chats(), options({ imported, existing }));
    expect(second.notes).toHaveLength(0);
    expect(second.report.patients).toEqual([]);
    expect(second.report.already_imported).toBe(7);
  });

  it('writes provenance that names the conversation, the session and its messages', () => {
    const { notes } = planImport(chats(), options());
    expect(notes[2]?.provenance).toBe(
      '[Imported from Claude conversation "John — session notes" (conv-john), session 3 of 3, recorded 2026-07-14; ' +
        "note from Claude's last reply; 1 attached file not imported; messages: john-05 john-06 john-07 john-08]",
    );
  });
});

describe('importedKeys', () => {
  it('reads the first importer’s whole-conversation provenance too', () => {
    const keys = importedKeys([
      {
        raw_text: '[Imported from Claude conversation "A (b)" (c-0001), recorded 2026-03-04]\n\nwords',
        patient_id: 'p1',
      },
      { raw_text: 'not an import', patient_id: 'p2' },
    ]);
    expect([...keys.conversations]).toEqual(['c-0001']);
    expect(keys.patients.get('c-0001')).toBe('p1');
    expect(keys.messages.size).toBe(0);
  });
});
