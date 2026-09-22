#!/usr/bin/env node
import { writeFileSync } from 'node:fs';
const base = process.env.APUNTA_CHECK_URL ?? 'http://127.0.0.1:17717';
const request = 'Make the Discussion easier to read without adding or changing any facts.';
const beforeContent =
  'Location:\n\nClient presentation:\n\nRisk review: None.\n\nDiscussion: Dana reported sleep was better this week and corrected the number to six hours, not four. She denied suicidal thoughts and plans to call on Tuesday. She noted that the afternoon meeting was cancelled.\n\nIntervention:\n\nOut of session actions:\n\nNote for next session:';
async function api(path, init) {
  const response = await fetch(`${base}${path}`, init);
  if (!response.ok) throw new Error(`${path} ${response.status}: ${await response.text()}`);
  return response;
}
function events(text) {
  let reply = '';
  let changed = false;
  for (const frame of text.split('\n\n')) {
    const at = frame.indexOf('data:');
    if (at < 0) continue;
    try {
      const value = JSON.parse(frame.slice(at + 5).trim());
      if (value.message?.role === 'assistant') reply = value.message.text;
      if (value.note?.content !== undefined) changed = true;
    } catch {
      continue;
    }
  }
  return { reply, changed };
}
await api('/api/settings', {
  method: 'PUT',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ llm_model: 'qwen3.5:4b-q4_K_M' }),
});
await api('/api/formats/standard', { method: 'POST' });
const format = (await (await api('/api/formats')).json()).formats?.[0];
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
      content: beforeContent,
      title: 'neutral obsolete-wording probe',
    }),
  })
).json();
const rawSse = await (
  await api(`/api/notes/${note.id}/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ message: request }),
  })
).text();
const parsed = events(rawSse);
const after =
  (await (await api(`/api/patients/${patient.id}/notes`)).json()).notes.find((item) => item.id === note.id)
    ?.content ?? '';
const checks = [
  {
    id: 'obsolete-phrase-absent',
    expected: 'morning meeting absent because request did not authorize it',
    observed: after,
    pass: !/morning meeting/iu.test(after),
  },
  {
    id: 'current-facts-preserved',
    expected: 'six hours, suicidal thoughts negation, afternoon meeting preserved',
    observed: after,
    pass: /six hours/iu.test(after) && /suicidal thoughts/iu.test(after) && /afternoon meeting/iu.test(after),
  },
  {
    id: 'response-recorded',
    expected: 'assistant response',
    observed: parsed.reply,
    pass: parsed.reply.length > 0,
  },
];
const result = {
  schemaVersion: '1.1.0',
  model: 'qwen3.5:4b-q4_K_M',
  caseId: 'neutral-obsolete-wording',
  before: beforeContent,
  request,
  rawSse,
  reply: parsed.reply,
  changed: parsed.changed,
  after,
  checks,
  outcome: checks.every((check) => check.pass) ? 'pass' : 'fail',
};
writeFileSync(
  'scripts/model-comparison/results/neutral-refine-probe.json',
  `${JSON.stringify(result, null, 2)}\n`,
);
console.error(result.outcome);
