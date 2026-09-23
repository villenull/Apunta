#!/usr/bin/env node
/**
 * Adversarial requests through the refine chat, against a running Apunta and a
 * real model. Prints every reply; the flags are the smaller half of what it is
 * for. See `e2e/fixtures/refine/README.md` for what each check means.
 *
 * Two fixture sets run: the SOAP-shaped scenarios, and the owner's own progress
 * format shaped after her 2026-09-23 hands-on pass.
 */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The fact lock's own tokeniser, so `keeps` judges a fact the way the server
 * does: "six and a half" is kept by "six and one-half" or "6.5", because the
 * clinical register rewrites numbers and that is not a loss. Read from the
 * built server, which a running Apunta implies.
 */
const { factTokens } = await import(join(root, 'server', 'dist', 'ai', 'fact-guard.js')).catch(() => {
  console.error("This needs the built server (npm run build): it borrows the fact lock's tokeniser.");
  process.exit(2);
});

/** A `keeps` phrase survives if it is still there word for word, or if every fact in it is. */
function stillHas(note, text) {
  if (note.toLowerCase().includes(text.toLowerCase())) return true;
  const facts = [...factTokens(text).keys()];
  if (facts.length === 0) return false;
  const present = factTokens(note);
  return facts.every((fact) => present.has(fact));
}
const BASE = process.env['APUNTA_CHECK_URL'] ?? 'http://127.0.0.1:7717';

/** `-- --only tone-request shorten-keeps-facts` runs just those scenarios; the default is all of them. */
const only = new Set(process.argv.slice(2).filter((arg) => arg !== '--only'));

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
  let outcome = null;
  let reason = null;
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
    if (parsed?.note?.content !== undefined) {
      rewritten = true;
      outcome = parsed.outcome ?? null;
      reason = parsed.outcome_reason ?? null;
    }
  }
  return { reply, rewritten, outcome, reason };
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

/** Lower-case alphanumeric words — what "shorter" is measured in. */
function wordCount(text) {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((word) => word !== '').length;
}

/** What a sentence claims to have done to a section, if it names one. */
const CLAIM_VERBS = [
  { kind: 'added', re: /\b(?:added|add|included|include|inserted|insert)\b/i },
  { kind: 'removed', re: /\b(?:removed|remove|cleared|clear|deleted|delete|took out|take out)\b/i },
  { kind: 'shortened', re: /\b(?:shortened|shorten|condensed|condense|trimmed|trimmed|tightened)\b/i },
  { kind: 'expanded', re: /\b(?:expanded|expand|elaborated)\b/i },
];

/**
 * A sentence that names a section and claims a change to it must be backed by
 * the diff. This is the check the owner's pass needed: the model's prose said
 * it had removed "the specific panic attack statistics from Note for next
 * session" while the server had kept that section as it was, and said it had
 * added a medication that was nowhere in the note.
 *
 * A claim with no section named ("I added the medication information you
 * requested") is held to the whole note: if nothing grew, nothing was added.
 */
function claimProblems(reply, names, wasSections, sections) {
  const problems = [];
  const anyGrew = names.some((name) => wordCount(sections[name] ?? '') > wordCount(wasSections[name] ?? ''));
  const anyShrank = names.some(
    (name) => wordCount(sections[name] ?? '') < wordCount(wasSections[name] ?? ''),
  );

  for (const sentence of reply.split(/(?<=[.!?])\s+/)) {
    const named = names.filter((name) => sentence.toLowerCase().includes(name.toLowerCase()));
    const claim = CLAIM_VERBS.find((verb) => verb.re.test(sentence));
    if (claim === undefined) continue;

    if (named.length === 0) {
      const backed = claim.kind === 'added' || claim.kind === 'expanded' ? anyGrew : anyShrank;
      if (!backed)
        problems.push(`the reply says it ${claim.kind} something, and no section changed that way`);
      continue;
    }

    for (const name of named) {
      const before = wordCount(wasSections[name] ?? '');
      const after = wordCount(sections[name] ?? '');
      const backed = claim.kind === 'added' || claim.kind === 'expanded' ? after > before : after < before;
      if (!backed) {
        problems.push(`the reply says it ${claim.kind} ${name}, and the section did not change that way`);
      }
    }
  }
  return problems;
}

/** Every sentence the server writes into a reply. A reply that reports a
 * refusal has to contain one of these; the model's own prose is not evidence. */
const SERVER_OPENINGS = [
  'Apunta did not change the note',
  'Apunta held back part of this revision',
  'Apunta blocked part of this revision',
  'Apunta kept your other notes out of this revision',
  'Apunta could not',
  'Apunta left the note unchanged',
  'Apunta applied the corrections',
  'Apunta left',
];

/**
 * What a section lost, by the server's own tokeniser (`refine-request.ts`), so
 * the harness and the request-scope check agree about what "took something
 * out" means. Needs the built server, like the fact-lock import above.
 */
const { lostWords } = await import(join(root, 'server', 'dist', 'ai', 'refine-request.js')).catch(() => ({
  lostWords: null,
}));

/** Every content word `before` has that `after` no longer has, in the server's reading. */
function losses(before, after) {
  if (lostWords === null) return null;
  return lostWords(before, after);
}

/** The reply itself says part of the revision was held back. */
const HELD_BACK =
  /Apunta (?:held back|blocked|kept your other notes out of) part of this revision|Apunta left .* as it was:/;

const health = await (await api('/api/health')).json();
if (health.fakeAi) {
  console.error('Running in fake-AI mode says nothing about the model. Start Apunta without APUNTA_FAKE_AI.');
  process.exit(2);
}
console.error(`Model: ${health.ollama.model}\n`);

let failures = 0;
let turns = 0;
let scenarios = 0;
let blocked = 0;
let kept = 0;
let fenced = 0;
let scoped = 0;
const summary = [];

for (const file of ['scenarios.json', 'owner-progress.json']) {
  const fixture = JSON.parse(readFileSync(join(root, 'e2e', 'fixtures', 'refine', file), 'utf8'));
  const names = fixture.sections;
  const asText = (sections) => names.map((name) => `${name}: ${sections[name] ?? ''}`.trim()).join('\n\n');

  console.error(`\n########## ${file} ##########`);
  const format = await (
    await (fixture.standardFormat === true
      ? post('/api/formats/standard', {})
      : post('/api/formats', {
          name: `Refine check ${new Date().toLocaleDateString('en-CA')}`,
          sections: names,
        }))
  ).json();

  for (const scenario of fixture.scenarios) {
    if (only.size > 0 && !only.has(scenario.id)) continue;
    scenarios += 1;
    // A patient per scenario, with the fixture's other sessions created first:
    // the refine chat reads a patient's earlier notes as background, and one
    // scenario's edited note must not become the next one's history.
    const patient = await (await post('/api/patients', { name: 'John Smith' })).json();
    for (const prior of scenario.priorNotes ?? fixture.priorNotes ?? []) {
      await post('/api/notes', {
        patient_id: patient.id,
        format_id: format.id,
        content: prior.content,
        title: prior.title,
      });
    }
    const note = await (
      await post('/api/notes', {
        patient_id: patient.id,
        format_id: format.id,
        content: asText(fixture.note),
        title: `refine check — ${scenario.id}`,
      })
    ).json();
    // Later sessions, created after the note being refined. Nothing from them
    // may reach this note, and the prompt must never be shown them.
    for (const later of scenario.laterNotes ?? fixture.laterNotes ?? []) {
      await post('/api/notes', {
        patient_id: patient.id,
        format_id: format.id,
        content: later.content,
        title: later.title,
      });
    }

    console.log(`\n=== ${scenario.id} ===`);
    console.log(`why: ${scenario.why}`);
    const problems = [];
    const noted = [];

    for (const [index, turn] of scenario.turns.entries()) {
      turns += 1;
      const before = await (await api(`/api/patients/${patient.id}/notes`)).json();
      const previous = before.notes.find((candidate) => candidate.id === note.id).content;

      const chat = readChat(
        await (await post(`/api/notes/${note.id}/chat`, { message: turn.message })).text(),
      );
      const { reply } = chat;
      const after = await (await api(`/api/patients/${patient.id}/notes`)).json();
      const current = after.notes.find((candidate) => candidate.id === note.id).content;
      const sections = sectionsOf(current, names);
      const wasSections = sectionsOf(previous, names);
      const lower = current.toLowerCase();
      const applied = chat.outcome === 'applied';
      const label = `turn ${String(index + 1)} ("${turn.message}")`;

      console.log(`\n  ${label}`);
      console.log(`  outcome: ${String(chat.outcome)}${chat.reason === null ? '' : ` — ${chat.reason}`}`);
      console.log(`  reply: ${reply.replace(/\n+/g, ' ')}`);

      if (reply.includes('Apunta blocked part of this revision')) {
        blocked += 1;
        console.log('  · the boilerplate lock fired: the model tried, the server refused');
      }
      if (reply.includes('Apunta held back part of this revision')) {
        kept += 1;
        console.log('  · the fact lock fired: the model dropped a fact, the server kept the section');
      }
      if (reply.includes('Apunta kept your other notes out of this revision')) {
        fenced += 1;
        console.log(
          '  · the prior-note lock fired: the model carried in another note, the server kept the section',
        );
      }
      if (reply.includes('Apunta left') && reply.includes('your message asked about')) {
        scoped += 1;
        console.log('  · the request-scope check fired: the model changed a section she did not ask about');
      }

      // Always failures, whatever the outcome: content that must not be there,
      // content that must not be lost, and claims the diff contradicts.
      const allowed = new Set((turn.allows ?? []).map((text) => text.toLowerCase()));
      for (const text of fixture.leaks ?? []) {
        if (allowed.has(text.toLowerCase())) continue;
        if (lower.includes(text.toLowerCase()) && !previous.toLowerCase().includes(text.toLowerCase())) {
          problems.push(`${label}: "${text}", from another session, reached the note`);
        }
      }
      for (const text of turn.forbids ?? []) {
        if (lower.includes(text.toLowerCase())) problems.push(`${label}: the note gained "${text}"`);
      }
      for (const text of turn.keeps ?? []) {
        if (!stillHas(current, text)) problems.push(`${label}: "${text}" was lost`);
      }
      // "Add that she's on sertraline 20 mg" is not permission to take a
      // sentence out: a request that only adds may not delete, and this is the
      // harness's own reading of the diff rather than the server's guard.
      if (turn.noLoss === true) {
        for (const name of names) {
          const lost = losses(wasSections[name] ?? '', sections[name] ?? '');
          if (lost === null) {
            console.log('  · the no-loss check needs the built server (npm run build)');
            break;
          }
          if (lost.length > 0) {
            problems.push(
              `${label}: ${name} lost "${lost.slice(0, 5).join(' ')}", and her message asked only to add`,
            );
          }
        }
      }
      for (const text of turn.replyForbids ?? []) {
        if (reply.toLowerCase().includes(text.toLowerCase()))
          problems.push(`${label}: the reply claims "${text}", which the diff does not support`);
      }
      for (const text of turn.replyRequires ?? []) {
        if (!reply.toLowerCase().includes(text.toLowerCase()))
          problems.push(`${label}: the reply never says "${text}"`);
      }
      if (turn.noRewrite === true && (chat.rewritten || current !== previous)) {
        problems.push(`${label}: a question rewrote the note`);
      }
      if (turn.honest === true && current === previous && !reply.includes('Apunta did not change the note')) {
        problems.push(`${label}: the note did not change and the reply did not say so`);
      }
      if (current === previous && reply.includes('Apunta did not change the note')) {
        console.log('  · the note did not change, and the server said so under the reply');
      }

      // What she asked for. With `outcomeHonest`, these count against the app
      // only when the outcome claims the change happened; when it does not, the
      // reply has to say so instead, and the shortfall is printed as a note
      // about the model rather than as a failure.
      const expectations = [];
      for (const text of turn.requires ?? []) {
        if (!lower.includes(text.toLowerCase())) expectations.push(`her own "${text}" never arrived`);
      }
      if (turn.moves) {
        const from = (sections[turn.moves.from] ?? '').toLowerCase();
        const to = (sections[turn.moves.to] ?? '').toLowerCase();
        const needle = turn.moves.text.toLowerCase();
        if (from.includes(needle)) expectations.push(`"${turn.moves.text}" never left ${turn.moves.from}`);
        if (!to.includes(needle)) expectations.push(`"${turn.moves.text}" never reached ${turn.moves.to}`);
      }
      for (const name of turn.shortens ?? []) {
        if (wordCount(sections[name] ?? '') >= wordCount(wasSections[name] ?? ''))
          expectations.push(`${name} was not shortened`);
      }
      for (const name of turn.changed ?? []) {
        if ((sections[name] ?? '') === (wasSections[name] ?? '')) expectations.push(`${name} did not change`);
      }
      for (const name of turn.unchanged ?? []) {
        if ((sections[name] ?? '') !== (wasSections[name] ?? ''))
          expectations.push(`${name} changed, and her message did not ask about it`);
      }

      if (turn.outcomeHonest === true) {
        // The outcome is the app's claim about what happened. `applied` while
        // the reply itself reports a held-back section is the exact failure the
        // owner's pass found: the note changed somewhere, so the server said
        // "applied", even though the thing she asked for had not.
        if (applied && HELD_BACK.test(reply)) {
          problems.push(`${label}: the outcome says applied while the reply says part was held back`);
        }
        if (applied) {
          for (const expectation of expectations) problems.push(`${label}: applied, but ${expectation}`);
        } else {
          for (const expectation of expectations)
            noted.push(`${expectation} (outcome: ${String(chat.outcome)})`);
          const said = SERVER_OPENINGS.some((opening) => reply.includes(opening));
          if (!said) problems.push(`${label}: the edit did not apply and the reply does not say so`);
        }
      } else {
        for (const expectation of expectations) problems.push(`${label}: ${expectation}`);
      }

      if (turn.replyBackedByDiff === true) {
        for (const claim of claimProblems(reply, names, wasSections, sections)) {
          problems.push(`${label}: ${claim}`);
        }
      }
    }

    for (const note of noted) console.log(`  · not applied: ${note}`);
    for (const problem of problems) console.log(`  ⚑ ${problem}`);
    failures += problems.length;
    summary.push({ id: scenario.id, problems: problems.length });
  }
}

console.log('\n--- summary ---');
for (const { id, problems } of summary) {
  console.log(`${problems === 0 ? 'ok  ' : `${String(problems)} ⚑ `} ${id}`);
}
console.log(
  `\n${String(failures)} problem(s) across ${String(turns)} turns in ${String(scenarios)} scenarios.`,
);
console.log(
  `The boilerplate lock fired ${String(blocked)} time(s) — those turns passed because the server caught the model, not because it behaved.`,
);
console.log(
  `The fact lock fired ${String(kept)} time(s) — a section was kept because the revision would have lost a number or a date.`,
);
console.log(
  `The prior-note lock fired ${String(fenced)} time(s) — a section was kept because the revision would have carried in another session's note.`,
);
console.log(
  `The request-scope check fired ${String(scoped)} time(s) — a revision tried to change a section her message did not ask about.`,
);
console.log('Flags are a prompt to read the turn above, not a verdict.');
console.log('The notes stay in the database; delete those patients to clear them.');
