#!/usr/bin/env node
/**
 * Give an empty sandbox Apunta the one thing `scripts/check-note-format.mjs`
 * needs before it will do anything: a note format and a patient to hang a
 * draft on. Without this the check script refuses at its `no note format yet`
 * pre-flight and never reaches a measurement, so a `--expect-fixtures` count
 * would be asserting against a run that measured nothing.
 *
 *   node scripts/v2/sandbox.mjs run --port 7801 -- bash -c \
 *     "node scripts/v2/seed-check-instance.mjs && node scripts/check-note-format.mjs"
 *
 * Everything here is fabricated (HS-8): the patient is the prototype's sample
 * person, `John Smith`. Nothing is read from any data folder but the sandbox's
 * own, through its HTTP API — this process never opens a database.
 *
 * It is safe to run twice, which is the point: the second run finds both
 * records and creates neither, so a check that seeds again does not double its
 * fixtures. Exit 0 when the instance is ready, 2 on any refusal or failed
 * request.
 */

const BASE = process.env['APUNTA_CHECK_URL'] ?? 'http://127.0.0.1:7717';

/** The four sections the check script's rules read, in the order it reads them. */
const SECTIONS = ['Client presentation', 'Discussion', 'Risk review', 'Note for next session'];

const INSTRUCTIONS = [
  "Draft in the practice owner's own format and nothing else.",
  '',
  '"Client presentation": "The client arrived on time and settled into the session without any difficulty at all."',
].join('\n');

const PATIENT = 'John Smith';

function checkPort(url) {
  try {
    const parsed = new URL(url);
    return parsed.port === '' ? null : Number(parsed.port);
  } catch {
    return null;
  }
}

function refuse(message) {
  console.error(message);
  process.exit(2);
}

// Under the sandbox wrapper (APUNTA_V2=1) this must run through
// scripts/v2/sandbox.mjs against a sandbox server: an unset APUNTA_CHECK_URL
// would fall back to the live port, and 7717 is never a check target.
if (process.env['APUNTA_V2'] === '1') {
  const raw = process.env['APUNTA_CHECK_URL'];
  if (raw === undefined || raw === '' || checkPort(raw) === 7717) {
    refuse(
      'Under APUNTA_V2=1, run this through scripts/v2/sandbox.mjs so APUNTA_CHECK_URL points at the sandbox server (never port 7717).',
    );
  }
}

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
  refuse(`Refusing to talk to ${BASE}: this only ever speaks to a local Apunta.`);
}

async function api(path, init) {
  const response = await fetch(`${BASE}${path}`, init);
  if (!response.ok) throw new Error(`${path} answered ${String(response.status)}`);
  return response;
}

const post = (path, body) =>
  api(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

async function seed() {
  let formats;
  let patients;
  try {
    formats = (await (await api('/api/formats')).json()).formats;
    patients = (await (await api('/api/patients')).json()).patients;
  } catch (error) {
    refuse(
      `That Apunta at ${BASE} would not answer: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const created = [];
  if (formats.length === 0) {
    const format = await post('/api/formats', {
      name: 'Check instance format',
      sections: SECTIONS,
      instructions: INSTRUCTIONS,
    });
    if (!format?.id) refuse('That Apunta took the format and returned no id for it.');
    created.push(`format ${format.name}`);
  }
  if (patients.length === 0) {
    const patient = await post('/api/patients', { name: PATIENT });
    if (!patient?.id) refuse('That Apunta took the patient and returned no id for it.');
    created.push(`patient ${patient.name}`);
  }

  console.log(
    created.length === 0
      ? `Nothing to seed: ${BASE} already has ${String(formats.length)} format(s) and ${String(patients.length)} patient(s).`
      : `Seeded ${created.join(' and ')} for the check scripts on ${BASE}.`,
  );
}

try {
  await seed();
} catch (error) {
  refuse(`Seeding failed: ${error instanceof Error ? error.message : String(error)}`);
}

process.exit(0);
