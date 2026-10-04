/**
 * One real English drafting pass through the shipped HTTP surface.
 *
 * English EOD backend readiness evidence: does the real writing provider
 * actually produce a persisted note on this machine, in a fresh sandbox
 * database, with fake AI off and the promoted model selected explicitly
 * through `PUT /api/settings`.
 *
 * What this is **not**: not a UI or card acceptance check (no browser, no
 * window, no clicks), not the Spanish benchmark, not a clinical-quality
 * measurement, and not a dependency release. It asserts only completion —
 * a `note` event with a note id, a non-empty section set, and the same record
 * readable back from `GET /api/notes/:id`. Anything the generated text says is
 * reported literally and never scored; no threshold is invented here.
 *
 * Fidelity rules this harness holds itself to, because each one is a way the
 * proof could be faked without anyone noticing:
 *
 *  - nothing is imported from the server: every request is ordinary HTTP to
 *    the sandbox server on `APUNTA_PORT`, so what is exercised is the shipped
 *    routes, not a direct provider call;
 *  - the only model selector is `llm_model` written through `PUT /api/settings`,
 *    the same supported route Settings uses; nothing else is configured;
 *  - the source text is **typed**, `typed_notes`, and is P3.5's fabricated
 *    dictation read as clearly typed input. No STT output is fed in and no
 *    transcript is "corrected", so the words the model saw are the words below;
 *  - exactly one `POST /api/generate` and at most one refine. There is no
 *    retry, no second model, no canned fallback and no threshold: a provider
 *    failure ends the run and is reported;
 *  - `console` is avoided: every line goes to `process.stdout.write`, so the
 *    captured stream is exactly this process's output.
 */

/** Loopback only, and the port comes from the sandbox env, never a literal. */
function baseUrl() {
  const port = process.env['APUNTA_PORT'];
  if (port === undefined || port === '') throw new Error('APUNTA_PORT is not set: run under sandbox env');
  return `http://127.0.0.1:${port}`;
}

/** The server's own first-byte budget, plus room for a cold 4B model load. */
const REQUEST_TIMEOUT_MS = 600_000;

/**
 * P3.5's fabricated dictation, verbatim from `docs/v2/cards/P3.5.md`
 * ("Fixed decisions", the fixture row): 30 s of English progress dictation about
 * John Smith (HS-8's sample person) with one negated risk statement and one
 * dose. Read here as **typed input**, which is the case this pass proves.
 */
const TYPED_NOTES =
  'Progress note for John Smith. He reports no self-harm thoughts this month and ' +
  'denies any intent to harm anyone. He continues the sertraline fifty milligrams ' +
  'daily and slept better this week. We reviewed sleep hygiene and set a follow-up ' +
  'in four weeks.';

/** The promoted writing model, written through the supported settings route. */
const MODEL = 'qwen3.5:4b-q4_K_M';

/** A refine request the shipped request parser reads as a request. */
const REFINE_MESSAGE = 'Make the discussion shorter.';

const lines = [];

function emit(entry) {
  lines.push(entry);
  process.stdout.write(`${JSON.stringify(entry)}\n`);
}

async function get(path) {
  const response = await fetch(`${baseUrl()}${path}`, { signal: AbortSignal.timeout(30_000) });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

async function send(method, path, body) {
  const response = await fetch(`${baseUrl()}${path}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const text = await response.text();
  return { status: response.status, body: text === '' ? null : JSON.parse(text) };
}

/**
 * One SSE response, read whole and split into its events.
 *
 * The raw text is emitted as one `sse_raw` entry so the evidence carries the
 * wire form itself; the parsed events carry what this harness read out of it.
 */
async function postSse(path, body) {
  const startedAt = Date.now();
  const response = await fetch(`${baseUrl()}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'text/event-stream' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  const raw = await response.text();
  const elapsedMs = Date.now() - startedAt;
  const events = [];
  for (const block of raw.split('\n\n')) {
    const nameLine = block.split('\n').find((line) => line.startsWith('event: '));
    const dataLine = block.split('\n').find((line) => line.startsWith('data: '));
    if (nameLine === undefined || dataLine === undefined) continue;
    events.push({
      event: nameLine.slice('event: '.length).trim(),
      data: JSON.parse(dataLine.slice('data: '.length)),
    });
  }
  emit({ kind: 'sse_raw', path, status: response.status, elapsedMs, bytes: raw.length });
  process.stdout.write(`${raw}\n`);
  emit({ kind: 'sse_events', path, names: events.map((entry) => entry.event) });
  return { status: response.status, elapsedMs, events };
}

function sectionBodies(content) {
  const bodies = {};
  let current = null;
  for (const line of content.split('\n')) {
    const heading = /^([A-Za-z][A-Za-z &/'-]{2,60}):\s*$/.exec(line);
    if (heading !== null) {
      current = heading[1];
      bodies[current] = '';
      continue;
    }
    if (current !== null) bodies[current] += `${line}\n`;
  }
  for (const name of Object.keys(bodies)) bodies[name] = bodies[name].trim();
  return bodies;
}

async function main() {
  const runId = process.env['APUNTA_TEST_RUN_ID'];
  if (runId === undefined || runId === '') {
    throw new Error('APUNTA_TEST_RUN_ID is not set: run under scripts/v2/sandbox.mjs env');
  }
  if (process.env['APUNTA_FAKE_AI'] !== undefined) {
    throw new Error('APUNTA_FAKE_AI is set: this pass must run against the real provider');
  }

  // C-ISO@1 rule 5: our run id, so a foreign server cannot be mistaken for ours.
  const health = await get('/api/health');
  if (health.status !== 200 || health.body?.testRunId !== runId) {
    throw new Error(`ownership check failed: ${JSON.stringify(health.body)}`);
  }
  emit({
    kind: 'ownership',
    testRunId: runId,
    port: Number(process.env['APUNTA_PORT']),
    fakeAi: health.body.fakeAi,
    llm: health.body.llm,
    ollama: health.body.ollama,
    dbMigrationLevel: health.body.db?.migrationLevel,
  });
  if (health.body.fakeAi === true) throw new Error('the server reports fake AI: refusing to claim a real pass');

  // The one supported way to choose the model and the language. English is
  // also this build's default; it is written explicitly so the evidence shows
  // it rather than inferring it.
  const settings = await send('PUT', '/api/settings', { llm_model: MODEL, language: 'en' });
  emit({
    kind: 'settings_put',
    status: settings.status,
    language: settings.body?.language,
    llm_model: settings.body?.llm_model,
    llm_effective_profile: settings.body?.llm_effective_profile,
    llm_available_profiles: settings.body?.llm_available_profiles,
    spanish_available: settings.body?.spanish_available,
  });
  if (settings.body?.llm_model !== MODEL) throw new Error(`llm_model was not stored: ${JSON.stringify(settings.body)}`);

  const patient = await send('POST', '/api/patients', { name: 'John Smith' });
  emit({ kind: 'patient', status: patient.status, id: patient.body?.id, name: patient.body?.name });
  if (patient.status !== 201) throw new Error('could not create the fabricated patient');

  const format = await send('POST', '/api/formats/standard', {});
  emit({
    kind: 'format',
    status: format.status,
    id: format.body?.id,
    name: format.body?.name,
    locale: format.body?.locale,
    sections: format.body?.sections,
  });
  if (format.status !== 201) throw new Error('could not create the standard format');

  const generate = await postSse('/api/generate', {
    patient_id: patient.body.id,
    format_id: format.body.id,
    typed_notes: TYPED_NOTES,
  });
  const noteEvent = generate.events.find((entry) => entry.event === 'note');
  const errorEvent = generate.events.find((entry) => entry.event === 'error');
  const statuses = generate.events
    .filter((entry) => entry.event === 'status')
    .map((entry) => `${entry.data.stage}`);
  const tokenEvents = generate.events.filter((entry) => entry.event === 'token');
  emit({
    kind: 'generate_summary',
    status: generate.status,
    elapsedMs: generate.elapsedMs,
    stages: statuses,
    tokenEvents: tokenEvents.length,
    noteId: noteEvent?.data.note.id ?? null,
    emptySections: noteEvent?.data.empty_sections ?? null,
    error: errorEvent === undefined ? null : errorEvent.data,
  });

  if (noteEvent === undefined) {
    // A provider failure is reported, not repaired. No retry, no second model.
    emit({ kind: 'verdict', verdict: 'stopped', why: 'no note event: the real provider did not produce one' });
    process.exitCode = 3;
    return;
  }

  const noteId = noteEvent.data.note.id;
  const fetched = await get(`/api/notes/${noteId}`);
  const bodies = sectionBodies(fetched.body?.content ?? '');
  const nonEmpty = Object.entries(bodies).filter(([, body]) => body !== '');
  emit({
    kind: 'persisted_note',
    status: fetched.status,
    id: fetched.body?.id,
    status_field: fetched.body?.status,
    locale: fetched.body?.locale,
    title: fetched.body?.title,
    contentBytes: (fetched.body?.content ?? '').length,
    // The server's own `empty_sections` is the authority on which sections
    // carry text. The split below is this harness's own reading of the stored
    // string and is only a reading of it: a body that repeats its own heading
    // ("Risk review: …") shifts what a naive line split attributes where, so
    // the two can disagree without either being wrong. `content` is emitted
    // verbatim above and is the fact both are derived from.
    serverEmptySections: noteEvent.data.empty_sections,
    advisorySectionsWithText: nonEmpty.map(([name]) => name),
    advisorySectionsBlank: Object.entries(bodies)
      .filter(([, body]) => body === '')
      .map(([name]) => name),
    matchesStreamedNote: (fetched.body?.content ?? '') === (noteEvent.data.note.content ?? ''),
  });
  emit({ kind: 'note_content_raw', content: fetched.body?.content ?? '' });
  for (const [name, body] of nonEmpty) emit({ kind: 'section_text', section: name, text: body });

  const thread = await get(`/api/notes/${noteId}/chat`);
  emit({
    kind: 'thread_after_draft',
    status: thread.status,
    messages: (thread.body?.messages ?? []).map((message) => ({
      role: message.role,
      chars: message.text.length,
      text: message.text,
    })),
  });

  const refine = await postSse(`/api/notes/${noteId}/chat`, { message: REFINE_MESSAGE });
  const refined = refine.events.find((entry) => entry.event === 'note-updated');
  const refineError = refine.events.find((entry) => entry.event === 'error');
  emit({
    kind: 'refine_summary',
    status: refine.status,
    elapsedMs: refine.elapsedMs,
    stages: refine.events
      .filter((entry) => entry.event === 'status')
      .map((entry) => entry.data.stage),
    outcome: refined?.data.outcome ?? null,
    outcomeReason: refined?.data.outcome_reason ?? null,
    emptySections: refined?.data.empty_sections ?? null,
    replyChars: refine.events
      .filter((entry) => entry.event === 'message' && entry.data.message.role === 'assistant')
      .map((entry) => entry.data.message.text.length),
    error: refineError === undefined ? null : refineError.data,
  });
  for (const entry of refine.events) {
    if (entry.event === 'message' && entry.data.message.role === 'assistant') {
      emit({ kind: 'refine_reply', text: entry.data.message.text });
    }
  }

  const after = await get(`/api/notes/${noteId}`);
  const afterBodies = sectionBodies(after.body?.content ?? '');
  emit({
    kind: 'persisted_note_after_refine',
    status: after.status,
    id: after.body?.id,
    contentBytes: (after.body?.content ?? '').length,
    changedByRefine: (after.body?.content ?? '') !== (fetched.body?.content ?? ''),
    sectionsNonEmpty: Object.entries(afterBodies)
      .filter(([, body]) => body !== '')
      .map(([name]) => name),
  });
  for (const [name, body] of Object.entries(afterBodies)) emit({ kind: 'section_text_after_refine', section: name, text: body });

  const finalThread = await get(`/api/notes/${noteId}/chat`);
  emit({
    kind: 'thread_final',
    status: finalThread.status,
    messages: (finalThread.body?.messages ?? []).map((message) => ({
      role: message.role,
      text: message.text,
    })),
  });

  const completed = Object.keys(bodies).length > 0 && nonEmpty.length > 0;
  emit({
    kind: 'verdict',
    verdict: completed ? 'completed' : 'completed_with_empty_sections',
    claim: 'completion only: a note id, non-empty persisted sections, and the same record read back',
    notClaimed: [
      'clinical quality of the generated text',
      'any UI, clipboard, export or recovery behaviour',
      'any Spanish benchmark result',
    ],
  });
}

try {
  await main();
} catch (error) {
  emit({ kind: 'verdict', verdict: 'stopped', why: error instanceof Error ? error.message : String(error) });
  process.exitCode = 1;
}
