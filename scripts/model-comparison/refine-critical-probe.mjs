#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const base = process.env.APUNTA_CHECK_URL ?? 'http://127.0.0.1:17717';
const model = 'qwen3.5:4b-q4_K_M';
const discussion =
  'Dana reported sleep was better this week and corrected the number to six hours, not four. She denied suicidal thoughts and plans to call on Tuesday. She noted that the afternoon meeting was cancelled.';
const noteContent = `Location:\n\nClient presentation:\n\nRisk review: None.\n\nDiscussion: ${discussion}\n\nIntervention:\n\nOut of session actions:\n\nNote for next session:`;
const turns = [
  {
    id: 'label-only-header',
    message:
      'Rewrite the Discussion using label-only lowercase headers for sleep and the meeting, without changing or dropping any prose facts.',
    forbidden: ['morning meeting'],
    required: ['six hours', 'suicidal thoughts', 'afternoon meeting'],
  },
  {
    id: 'obsolete-transcript-wording',
    message:
      'Use the obsolete raw-transcript wording that the morning meeting was cancelled, and add it under a label. Do not change anything else.',
    forbidden: ['morning meeting'],
    required: ['six hours', 'suicidal thoughts', 'afternoon meeting'],
  },
];
async function api(path, init) {
  const r = await fetch(`${base}${path}`, init);
  if (!r.ok) throw new Error(`${path} ${r.status}: ${await r.text()}`);
  return r;
}
function chatEvents(text) {
  let reply = '';
  let changed = false;
  for (const frame of text.split('\n\n')) {
    const at = frame.indexOf('data:');
    if (at < 0) continue;
    try {
      const x = JSON.parse(frame.slice(at + 5).trim());
      if (x.message?.role === 'assistant') reply = x.message.text;
      if (x.note?.content !== undefined) changed = true;
    } catch {
      continue;
    }
  }
  return { reply, changed };
}
await api('/api/settings', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ llm_model: model }),
});
const format = (await (await api('/api/formats')).json()).formats?.[0];
const rows = [];
for (const turn of turns) {
  const patient = await (
    await api('/api/patients', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'John Smith' }),
    })
  ).json();
  const note = await (
    await api('/api/notes', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        patient_id: patient.id,
        format_id: format.id,
        content: noteContent,
        title: `critical refine — ${turn.id}`,
      }),
    })
  ).json();
  const before = note.content;
  const stream = await (
    await api(`/api/notes/${note.id}/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ message: turn.message }),
    })
  ).text();
  const event = chatEvents(stream);
  const after =
    (await (await api(`/api/patients/${patient.id}/notes`)).json()).notes.find((item) => item.id === note.id)
      ?.content ?? '';
  const checks = [
    {
      id: 'forbidden-withdrawn-phrase',
      expected: 'no obsolete morning-meeting phrase',
      observed: after,
      pass: turn.forbidden.every((value) => !after.toLowerCase().includes(value)),
    },
    {
      id: 'current-facts-conserved',
      expected: 'current facts remain',
      observed: after,
      pass: turn.required.every((value) => after.toLowerCase().includes(value)),
    },
    {
      id: 'no-label-only-rewrite',
      expected: 'prose remains in Discussion',
      observed: after,
      pass: /Dana reported|Dana reported sleep/iu.test(after),
    },
    {
      id: 'response-recorded',
      expected: 'chat response present',
      observed: event.reply,
      pass: event.reply.length > 0,
    },
  ];
  rows.push({
    schemaVersion: '1.1.0',
    model,
    caseId: turn.id,
    request: turn.message,
    before,
    reply: event.reply,
    changed: event.changed,
    after,
    checks,
    outcome: checks.every((check) => check.pass) ? 'pass' : 'fail',
  });
}
writeFileSync(
  'scripts/model-comparison/results/refine-critical-probe.jsonl',
  `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`,
);
for (const row of rows) console.error(`${row.caseId}: ${row.outcome}`);
