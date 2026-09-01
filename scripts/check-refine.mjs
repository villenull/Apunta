#!/usr/bin/env node
/**
 * Adversarial requests through the refine chat, against a running Apunta and a
 * real model.
 *
 *   npm run check:refine
 *   APUNTA_CHECK_URL=http://127.0.0.1:7720 npm run check:refine
 *
 * Why this exists: the refine chat is the practice owner's primary repair path
 * (`docs/feedback/2026-08-22-owner-answers.md`, design question 4) and it had
 * no automated quality coverage at all. Three separate faults were found in it
 * by a person clicking — a register request adding mental-status boilerplate, a
 * question rewriting a note nobody asked to change, and a move that copied
 * instead of moving. Each was fixed and then only a unit test on the prompt
 * text stood behind it, which proves the wording exists, not that the model
 * obeys it.
 *
 * What it measures, and what it does not: this drives the real endpoint, so it
 * sees what she would see — *after* the server's boilerplate lock
 * (`server/src/ai/refine-guard.ts`) has had its say. A scenario that passes
 * because the lock caught the model is reported as passing **and** noted as
 * blocked, because those are different facts about the app and only one of
 * them is about the model.
 *
 * It is a check, not an eval: no rubric, no score, no fabrication rate.
 * `npm run eval` remains the faithfulness instrument for drafting.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const fixture = JSON.parse(readFileSync(join(root, 'e2e', 'fixtures', 'refine', 'scenarios.json'), 'utf8'));
const BASE = process.env['APUNTA_CHECK_URL'] ?? 'http://127.0.0.1:7717';

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  console.error(`Refusing to talk to ${BASE}: this only ever speaks to a local Apunta.`);
  process.exit(2);
}

async function api(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) throw new Error(`${path} answered ${String(response.status)}`);
  return response;
}

const post = (path, body) =>
  api(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

/** The chat streams; the last `message` from the assistant is its reply. */
function readChat(body) {
  let reply = '';
  let rewritten = false;
  for (const frame of body.split('\n\n')) {
    const at = frame.indexOf('data:');
    if (at === -1) continue;
    let parsed;
    try {
      parsed = JSON.parse(frame.slice(at + 5).trim());
    } catch {
      continue;
    }
    if (parsed?.message?.role === 'assistant') reply = parsed.message.text;
    if (parsed?.note?.content !== undefined) rewritten = true;
  }
  return { reply, rewritten };
}

function sectionsOf(content, names) {
  const found = Object.fromEntries(names.map((name) => [name, '']));
  let current = null;
  for (const line of content.split('\n')) {
    const match = /^([A-Z][A-Za-z ]+):\s?(.*)$/.exec(line);
    if (match && names.includes(match[1])) {
      current = match[1];
      found[current] = match[2];
    } else if (current !== null && line.trim() !== '') {
      found[current] += ` ${line.trim()}`;
    }
  }
  return found;
}

const names = fixture.sections;
const asText = (sections) => names.map((name) => `${name}: ${sections[name] ?? ''}`.trim()).join('\n\n');

const health = await (await api('/api/health')).json();
if (health.fakeAi) {
  console.error('Running in fake-AI mode says nothing about the model. Start Apunta without APUNTA_FAKE_AI.');
  process.exit(2);
}
console.error(`Model: ${health.ollama.model}\n`);

const format = await (
  await post('/api/formats', {
    name: `Refine check ${new Date().toISOString().slice(0, 10)}`,
    sections: names,
  })
).json();
const patient = await (await post('/api/patients', { name: 'John Smith' })).json();

let failures = 0;
let blocked = 0;
const summary = [];

for (const scenario of fixture.scenarios) {
  const note = await (
    await post('/api/notes', {
      patient_id: patient.id,
      format_id: format.id,
      content: asText(fixture.note),
      title: `refine check — ${scenario.id}`,
    })
  ).json();

  console.log(`\n=== ${scenario.id} ===`);
  console.log(`why: ${scenario.why}`);
  const problems = [];

  for (const [index, turn] of scenario.turns.entries()) {
    const before = await (await api(`/api/patients/${patient.id}/notes`)).json();
    const previous = before.notes.find((candidate) => candidate.id === note.id).content;

    const { reply, rewritten } = readChat(
      await (await post(`/api/notes/${note.id}/chat`, { message: turn.message })).text(),
    );
    const after = await (await api(`/api/patients/${patient.id}/notes`)).json();
    const current = after.notes.find((candidate) => candidate.id === note.id).content;
    const sections = sectionsOf(current, names);
    const lower = current.toLowerCase();
    const label = `turn ${String(index + 1)} ("${turn.message}")`;

    console.log(`\n  ${label}`);
    console.log(`  reply: ${reply.replace(/\n+/g, ' ')}`);

    if (reply.includes('Apunta blocked part of this revision')) {
      blocked += 1;
      console.log('  · the boilerplate lock fired: the model tried, the server refused');
    }

    if (turn.noRewrite === true && (rewritten || current !== previous)) {
      problems.push(`${label}: a question rewrote the note`);
    }
    for (const text of turn.forbids ?? []) {
      if (lower.includes(text.toLowerCase())) problems.push(`${label}: the note gained "${text}"`);
    }
    for (const text of turn.keeps ?? []) {
      if (!lower.includes(text.toLowerCase())) problems.push(`${label}: "${text}" was lost`);
    }
    for (const text of turn.requires ?? []) {
      if (!lower.includes(text.toLowerCase())) problems.push(`${label}: her own "${text}" never arrived`);
    }
    if (turn.moves) {
      const from = (sections[turn.moves.from] ?? '').toLowerCase();
      const to = (sections[turn.moves.to] ?? '').toLowerCase();
      const needle = turn.moves.text.toLowerCase();
      if (from.includes(needle))
        problems.push(`${label}: "${turn.moves.text}" never left ${turn.moves.from}`);
      if (!to.includes(needle))
        problems.push(`${label}: "${turn.moves.text}" never reached ${turn.moves.to}`);
    }
  }

  for (const problem of problems) console.log(`  ⚑ ${problem}`);
  failures += problems.length;
  summary.push({ id: scenario.id, problems: problems.length });
}

console.log('\n--- summary ---');
for (const { id, problems } of summary) {
  console.log(`${problems === 0 ? 'ok  ' : `${String(problems)} ⚑ `} ${id}`);
}
console.log(`\n${String(failures)} problem(s) across ${String(fixture.scenarios.length)} scenarios.`);
console.log(
  `The boilerplate lock fired ${String(blocked)} time(s) — those turns passed because the server caught the model, not because it behaved.`,
);
console.log('The notes stay in the database; delete that patient to clear them.');
