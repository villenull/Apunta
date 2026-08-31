#!/usr/bin/env node
/**
 * Draft the `e2e/fixtures/her-format/` fixtures through a running Apunta and
 * flag the routing failures a real model makes in the practice owner's own
 * seven-section format.
 *
 *   npm run check:format
 *   APUNTA_CHECK_URL=http://127.0.0.1:7720 npm run check:format
 *
 * This is not an eval — there is no rubric and no score. `npm run eval`
 * measures faithfulness against SOAP; this measures nothing at all, it only
 * catches four specific ways her format came back wrong on real output, and
 * prints every note so the flags are never the whole story. See the README
 * beside the fixtures for why it exists.
 *
 * It talks only to a loopback Apunta, which does the model call itself, so
 * this script needs no AI configuration of its own.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dir = join(root, 'e2e', 'fixtures', 'her-format');
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

/** The note is the last `data:` frame carrying one; the rest is progress. */
function noteFromStream(body) {
  let content = null;
  for (const frame of body.split('\n\n')) {
    const at = frame.indexOf('data:');
    if (at === -1 || !frame.includes('"note"')) continue;
    try {
      const parsed = JSON.parse(frame.slice(at + 5).trim());
      if (parsed?.note?.content) content = parsed.note.content;
    } catch {
      // A partial frame is not a note; keep looking.
    }
  }
  return content;
}

function splitSections(content, sections) {
  const found = {};
  let current = null;
  for (const line of (content ?? '').split('\n')) {
    const match = /^([A-Z][A-Za-z ]+):\s?(.*)$/.exec(line);
    if (match && sections.includes(match[1])) {
      current = match[1];
      found[current] = match[2];
    } else if (current !== null && line.trim() !== '') {
      found[current] += ` ${line.trim()}`;
    }
  }
  return found;
}

/**
 * Each rule is a failure that actually happened, not a style preference.
 * They are intentionally blunt: a flag says "read this note", never "this
 * note is wrong".
 */
function flagsFor(source, sections) {
  const flags = [];
  const at = (name) => (sections[name] ?? '').trim();
  const presentation = at('Client presentation');
  const discussion = at('Discussion');
  const forward = at('Note for next session');
  const risk = at('Risk review');
  const said = source.toLowerCase();

  if (/\breports?\b|\bsaid\b|\btalked about\b|\bdescribed\b/i.test(presentation)) {
    flags.push('reported content in Client presentation');
  }
  if (discussion === '' && source.split(/\s+/).length > 15) {
    flags.push('Discussion empty though the source has material');
  }
  if (/every two weeks|staying weekly|every other week/.test(said) && !/week/i.test(forward)) {
    flags.push('a stated cadence decision is missing from Note for next session');
  }
  if (/denied|safety|self harm/.test(said) && risk === 'None.') {
    flags.push('a risk review she carried out was flattened to "None."');
  }
  return flags;
}

const health = await (await api('/api/health')).json();
if (health.fakeAi) {
  console.error(
    'This is running in fake-AI mode, which says nothing about the model. Start Apunta without APUNTA_FAKE_AI.',
  );
  process.exit(2);
}

const { formats } = await (await api('/api/formats')).json();
const format = formats[0];
if (!format) {
  console.error('That Apunta has no note format yet.');
  process.exit(2);
}
const { patients } = await (await api('/api/patients')).json();
const patient = patients[0];
if (!patient) {
  console.error(
    'That Apunta has no patient to hang a draft on. Add one (any fabricated name) and run again.',
  );
  process.exit(2);
}

console.error(`Format: ${format.name} — ${format.sections.join(', ')}`);
console.error(`Model:  ${health.ollama.model}\n`);

const names = readdirSync(dir)
  .filter((name) => /^\d+-[a-z0-9-]+\.txt$/.test(name))
  .sort();

let total = 0;
const summary = [];
for (const name of names) {
  const source = readFileSync(join(dir, name), 'utf8').trim();
  const response = await api('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      patient_id: patient.id,
      format_id: format.id,
      typed_notes: source,
      title: `format check — ${name.replace(/\.txt$/, '')}`,
    }),
  });
  const content = noteFromStream(await response.text());
  const flags = flagsFor(source, splitSections(content, format.sections));
  total += flags.length;
  summary.push({ name, flags });

  console.log(`\n=== ${name} ===`);
  console.log(content ?? '(no note came back)');
  for (const flag of flags) console.log(`  ⚑ ${flag}`);
}

console.log('\n--- summary ---');
for (const { name, flags } of summary) {
  console.log(`${flags.length === 0 ? 'ok  ' : `${String(flags.length)} ⚑ `} ${name}`);
}
console.log(`\n${String(total)} flag(s) across ${String(names.length)} fixtures.`);
console.log('Flags are a prompt to read the note above, not a verdict.');
console.log('The drafts stay in the database; delete that patient to clear them.');
