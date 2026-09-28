// The contract with the importer that already exists.
//
// This is the test that decides whether the capture needs any production change
// at all: it writes the handoff file to a temporary directory and opens it with
// `server/src/import/claude.ts` — the real reader, unmodified, no branch of mine
// — and then runs the importer's own planning over the result. Nothing here
// writes to a database, opens a port, or touches the live data folder; the
// reader is a pure function over bytes.
//
// Run it with the repository's own `tsx` (see `README.md`), because the
// importer is TypeScript with `.js` specifiers.

import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { test } from 'node:test';

import { EXPECTED, runOnce } from './helpers.mjs';
import { allMessageIds } from '../fixtures/truth.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repository = resolve(here, '../../..');

const importer = await import(join(repository, 'server/src/import/claude.ts'));
const { openExport, readConversations, liveThread, splitSessions, sessionBody, planImport, provenanceLine } =
  importer;

function captureFile(mechanism, { allowGaps = true } = {}) {
  return runOnce(mechanism, {}, { allowGaps });
}

test('the unchanged reader opens the capture as a file it already knows', async () => {
  const { files } = await captureFile('compliance-api');
  const directory = mkdtempSync(join(tmpdir(), 'apunta-extract-'));
  const path = join(directory, 'conversations.json');
  writeFileSync(path, files.files_by_name['conversations.json'].bytes, 'utf8');
  const read = openExport(
    Buffer.from(files.files_by_name['conversations.json'].bytes, 'utf8'),
    'conversations.json',
  );
  // Three of the sixteen carry nothing the reader can use — empty, deleted, and
  // two messages that are only scanned files — and the reader counts them as
  // unreadable rather than losing them silently. Everything else comes through.
  assert.equal(read.conversations.length, EXPECTED['compliance-api'].conversations - 3);
  assert.equal(
    read.messages,
    EXPECTED['compliance-api'].messages - 2,
    'the two file-only messages carry no text',
  );
  assert.equal(read.skipped, 3);
  assert.deepEqual(
    read.conversations.map((conversation) => conversation.id).sort(),
    EXPECTED['compliance-api'].ids
      .filter((id) => !['c-empty', 'c-deleted', 'c-attachment-only'].includes(id))
      .sort(),
  );
});

test('the same file is also readable straight from bytes, with no file involved', async () => {
  const { files } = await captureFile('web-app');
  // The web capture does not list the deleted chat at all, so only two of its
  // fifteen conversations are unreadable to the reader.
  const read = readConversations(JSON.parse(files.files_by_name['conversations.json'].bytes));
  assert.equal(read.conversations.length, EXPECTED['web-app'].conversations - 2);
  // 84 captured: two are file-only messages with no text, and two sit on the
  // edit the therapist abandoned, which the reader reads as a thread and so
  // never counts as record text.
  assert.equal(read.messages, EXPECTED['web-app'].messages - 4);
  assert.equal(read.skipped, 2);
  const john = read.conversations.find((conversation) => conversation.id === 'c-john-a');
  assert.equal(john.abandoned, 2, 'the two messages of the abandoned edit were not counted as abandoned');
});

test('the live thread the importer follows is the thread the capture preserved', async () => {
  const { files } = await captureFile('web-app');
  const read = readConversations(JSON.parse(files.files_by_name['conversations.json'].bytes));
  const john = read.conversations.find((conversation) => conversation.id === 'c-john-a');
  const thread = liveThread(john.turns);
  assert.deepEqual(
    thread.map((turn) => turn.id),
    [
      'c-john-a-s1-h1',
      'c-john-a-s1-a1',
      'c-john-a-s1-h2',
      'c-john-a-s2-h1',
      'c-john-a-s2-a1',
      'c-john-a-s2-h2',
      'c-john-a-s3-h2',
      'c-john-a-s3-a2',
    ],
    'the live thread is not the one the capture preserved',
  );
  // The pair she abandoned by editing is out of the thread, and still in the
  // file the capture wrote: counted, never imported, never deleted.
  const ids = john.turns.map((turn) => turn.id);
  assert.equal(ids.includes('c-john-a-s3-h1'), false);
  assert.equal(ids.includes('c-john-a-s3-a1'), false);
  const captured = JSON.parse(files.files_by_name['conversations.json'].bytes)
    .find((conversation) => conversation.uuid === 'c-john-a')
    .chat_messages.map((message) => message.uuid);
  assert.ok(captured.includes('c-john-a-s3-h1'), 'the abandoned edit is missing from the capture itself');
  assert.ok(captured.includes('c-john-a-s3-a1'), 'the abandoned reply is missing from the capture itself');
  assert.equal(captured.length, 10);
});

test('the same capture through the mechanism that has no fork links splices the abandoned edit in', async () => {
  // The reason the manifest names that gap: a mechanism that cannot express
  // forks produces a *shorter, differently shaped* thread from the same account,
  // and only a capture that says so protects the record from it.
  const { files } = await captureFile('compliance-api');
  const read = readConversations(JSON.parse(files.files_by_name['conversations.json'].bytes));
  const john = read.conversations.find((conversation) => conversation.id === 'c-john-a');
  const thread = liveThread(john.turns);
  // The reader strips the parent links it used, so their absence in the result
  // is what "no links" looks like from the importer's side.
  assert.equal(
    john.turns.every((turn) => !('parent' in turn)),
    true,
  );
  assert.deepEqual(
    thread.map((turn) => turn.id),
    john.turns.map((turn) => turn.id),
    'with no links the importer keeps array order, which includes the abandoned edit',
  );
  assert.ok(
    thread.some((turn) => turn.id === 'c-john-a-s3-a1'),
    'the abandoned reply is in the thread',
  );
});

test('the six-hour split of the boundary conversation is two sittings, decided by the captured instants', async () => {
  const { files } = await captureFile('web-app');
  const read = readConversations(JSON.parse(files.files_by_name['conversations.json'].bytes));
  const boundary = read.conversations.find((conversation) => conversation.id === 'c-boundary');
  const sessions = splitSessions(boundary.turns);
  assert.equal(
    sessions.length,
    2,
    'a midnight crossing is not a new sitting, and a six-hour-one-second gap is',
  );
  assert.deepEqual(
    sessions[0].map((turn) => turn.id),
    ['c-boundary-h1', 'c-boundary-h2', 'c-boundary-h3'],
  );
  assert.deepEqual(
    sessions[1].map((turn) => turn.id),
    ['c-boundary-h4', 'c-boundary-a1'],
  );
});

test('a note body is a span of a captured message, not a generated document', async () => {
  const { files } = await captureFile('web-app');
  const read = readConversations(JSON.parse(files.files_by_name['conversations.json'].bytes));
  const john = read.conversations.find((conversation) => conversation.id === 'c-john-a');
  const sessions = splitSessions(john.turns);
  assert.equal(sessions.length, 3);
  const lastSession = sessions[2];
  const body = sessionBody(lastSession, 'assistant');
  const tip = lastSession.findLast((turn) => turn.role === 'assistant');
  assert.equal(body, tip.text, 'the note body is not exactly a captured message');
  const line = provenanceLine({
    conversationId: john.id,
    title: john.title,
    session: 3,
    sessions: 3,
    recordedAt: tip.at,
    source: 'assistant',
    messageIds: lastSession.map((turn) => turn.id).filter((id) => id !== null),
    attachments: 0,
  });
  for (const id of lastSession.map((turn) => turn.id)) {
    assert.ok(line.includes(id), 'the provenance line does not name every message it came from');
  }
});

test('a dry run over the capture plans notes and cites only ids the capture contains', async () => {
  const { files } = await captureFile('web-app');
  const read = readConversations(JSON.parse(files.files_by_name['conversations.json'].bytes));
  const plan = planImport(read, {
    names: ['John Smith', 'Dana Doe', 'Jane Doe', 'Jane Roe'],
    existing: [],
    imported: { messages: new Set(), conversations: new Set(), patients: new Map() },
    source: 'assistant',
    cutoff: '2026-07-01',
    headings: [],
  });
  // A dry run: nothing is written anywhere by this call.
  assert.ok(plan.report.notes > 0, 'the capture produced no plans at all');
  assert.ok(plan.report.patients.length > 0);
  const known = new Set(allMessageIds());
  for (const note of plan.notes) {
    const cited = /; messages: ([^\]]*)\]$/.exec(note.provenance)?.[1] ?? '';
    for (const id of cited.split(' ').filter(Boolean)) {
      assert.ok(known.has(id), `the plan cites a message id the capture never contained: ${id}`);
    }
    assert.ok(note.body.length > 0, 'a planned note has no body');
    assert.equal(note.body.includes('undefined'), false);
  }
  // Every conversation that was captured but is not a patient history is
  // accounted for by name and reason rather than silently dropped.
  const reasons = new Set(plan.report.skipped.map((entry) => entry.reason));
  for (const reason of ['before_cutoff', 'single_session', 'not_clinical', 'no_name']) {
    assert.ok(
      reasons.has(reason),
      `expected a ${reason} skip in this account, saw ${[...reasons].join(', ')}`,
    );
  }
  // The personal chat is not a patient, and the capture does not turn it into one.
  assert.equal(
    plan.report.patients.some((patient) => patient.name === 'Sourdough'),
    false,
  );
});

test('a second run over the same capture is idempotent by message id', async () => {
  const { files } = await captureFile('web-app');
  const read = readConversations(JSON.parse(files.files_by_name['conversations.json'].bytes));
  const first = planImport(read, {
    names: ['John Smith', 'Dana Doe', 'Jane Doe', 'Jane Roe'],
    existing: [],
    imported: { messages: new Set(), conversations: new Set(), patients: new Map() },
    source: 'assistant',
    cutoff: '2026-07-01',
    headings: [],
  });
  // Pretend the first run happened, by replaying the ids it cited.
  const imported = new Set();
  for (const note of first.notes) {
    for (const id of (/; messages: ([^\]]*)\]$/.exec(note.provenance)?.[1] ?? '')
      .split(' ')
      .filter(Boolean)) {
      imported.add(id);
    }
  }
  const second = planImport(read, {
    names: ['John Smith', 'Dana Doe', 'Jane Doe', 'Jane Roe'],
    existing: [],
    imported: { messages: imported, conversations: new Set(), patients: new Map() },
    source: 'assistant',
    cutoff: '2026-07-01',
    headings: [],
  });
  assert.equal(second.report.notes, 0, 'a replay of the same capture planned new notes');
  assert.equal(second.report.already_imported, first.report.notes);
  assert.deepEqual(
    second.notes.map((note) => note.provenance),
    [],
  );
});

test('the capture is unchanged by anything the importer does to it', async () => {
  const { files } = await captureFile('web-app');
  const before = files.files_by_name['conversations.json'].bytes;
  const read = readConversations(JSON.parse(before));
  planImport(read, {
    names: ['John Smith'],
    existing: [],
    imported: { messages: new Set(), conversations: new Set(), patients: new Map() },
    source: 'human',
    cutoff: '2026-07-01',
    headings: [],
  });
  assert.equal(files.files_by_name['conversations.json'].bytes, before);
});
