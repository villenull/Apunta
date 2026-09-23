#!/usr/bin/env node
/**
 * Replay a local voice fixture through Apunta's live preview and final
 * transcription/drafting paths. The WAV and sidecar stay outside Git.
 *
 *   node tools/model-lab/replay-voice-fixture.mjs \
 *     --fixture ~/.local/share/apunta/model-lab/voice-fixtures/test1-owner-voice.wav \
 *     --base http://127.0.0.1:7730 --db ~/.local/share/apunta-sandbox/apunta.db \
 *     --out /tmp/preview-replay
 *
 * The sidecar is `${fixture}.json` and contains {script, expected:{...}}.
 * Preview replay is real-time by default; pass --fast for local iteration.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
const argv = process.argv.slice(2);
const arg = (name, fallback = '') => {
  const index = argv.indexOf(name);
  return index < 0 ? fallback : (argv[index + 1] ?? fallback);
};
const fixture = resolve(arg('--fixture'));
const base = arg('--base', 'http://127.0.0.1:7717').replace(/\/$/, '');
const dbPath = arg('--db', process.env.APUNTA_DB ?? '');
const out = resolve(arg('--out', '/tmp/preview-replay'));
const fast = argv.includes('--fast');
if (!fixture || fixture === resolve('.')) throw new Error('--fixture is required');

const wav = readFileSync(fixture);
const sidecarPath = `${fixture}.json`;
const sidecar = JSON.parse(readFileSync(sidecarPath, 'utf8'));
const meta = parseWav(wav);
const duration = meta.dataBytes / meta.byteRate;
const sleep = (ms) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function parseWav(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE')
    throw new Error('fixture is not RIFF/WAVE');
  let offset = 12;
  let format = null;
  let dataOffset = -1;
  let dataBytes = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === 'fmt ') {
      format = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bits: buffer.readUInt16LE(offset + 22),
        blockAlign: buffer.readUInt16LE(offset + 20),
      };
    } else if (id === 'data') {
      dataOffset = offset + 8;
      dataBytes = Math.min(size, buffer.length - dataOffset);
      break;
    }
    offset += 8 + size + (size & 1);
  }
  if (!format || dataOffset < 0 || format.audioFormat !== 1 || format.channels !== 1 || format.bits !== 16)
    throw new Error('fixture must be mono PCM16 WAV');
  return { ...format, dataOffset, dataBytes, byteRate: format.sampleRate * format.blockAlign };
}

function sliceWav(buffer, parsed, fromSeconds, toSeconds) {
  const start = Math.max(0, Math.min(parsed.dataBytes, Math.floor(fromSeconds * parsed.byteRate)));
  const end = Math.max(start + 1, Math.min(parsed.dataBytes, Math.floor(toSeconds * parsed.byteRate)));
  const bytes = end - start;
  const prefix = Buffer.from(buffer.subarray(0, parsed.dataOffset));
  const output = Buffer.concat([prefix, buffer.subarray(parsed.dataOffset + start, parsed.dataOffset + end)]);
  output.writeUInt32LE(output.length - 8, 4);
  output.writeUInt32LE(bytes, parsed.dataOffset - 4);
  return output;
}

function pausePoints(buffer, parsed) {
  const samples = new Int16Array(buffer.buffer, buffer.byteOffset + parsed.dataOffset, Math.floor(parsed.dataBytes / 2));
  const perBucket = Math.max(1, Math.floor(parsed.sampleRate / 10));
  const levels = [];
  for (let start = 0; start < samples.length; start += perBucket) {
    let peak = 0;
    for (let index = start; index < Math.min(samples.length, start + perBucket); index += 1)
      peak = Math.max(peak, Math.abs(samples[index]) / 32768);
    levels.push(peak);
  }
  return levels;
}

function cutPoint(levels, after, before) {
  const from = Math.max(0, Math.ceil(after * 10));
  const to = Math.min(levels.length, Math.floor(before * 10));
  if (to - from < 5) return null;
  let bestStart = -1;
  let bestLength = 0;
  let runStart = -1;
  for (let index = from; index <= to; index += 1) {
    const quiet = index < to && (levels[index] ?? 1) < 0.03;
    if (quiet) {
      if (runStart < 0) runStart = index;
    } else if (runStart >= 0) {
      const length = index - runStart;
      if (length > bestLength) {
        bestLength = length;
        bestStart = runStart;
      }
      runStart = -1;
    }
  }
  return bestLength >= 4 ? (bestStart + bestLength / 2) / 10 : null;
}

async function preview(wavBuffer, parsed, totalSeconds) {
  const levels = pausePoints(wavBuffer, parsed);
  const began = Date.now();
  const updates = [];
  let committedAt = 0;
  let target = 0.8;
  let committedText = '';
  let tentativeText = '';
  while (target <= totalSeconds + 0.001) {
    const waitFor = target * 1000 - (Date.now() - began);
    if (!fast && waitFor > 0) await sleep(waitFor);
    const pending = target - committedAt;
    let end = target;
    let kind = 'tail';
    if (pending >= 10) {
      end =
        cutPoint(levels, committedAt + 5, target - 1) ??
        (pending >= 20 ? (cutPoint(levels, committedAt + 5, target - 1) ?? target - 1) : target);
      kind = end < target ? 'commit' : 'tail';
    }
    const body = new FormData();
    body.set(
      'audio',
      new Blob([sliceWav(wavBuffer, parsed, committedAt, end)], { type: 'audio/wav' }),
      'preview.wav',
    );
    const requestedAt = Date.now();
    const response = await fetch(`${base}/api/transcribe/preview`, { method: 'POST', body });
    const result = response.ok ? await response.json() : { text: '' };
    const receivedAt = Date.now();
    const text = typeof result.text === 'string' ? result.text.trim() : '';
    const joinedBefore = joinWords(committedText, text, false);
    const stable = stableTail(tentativeText, text);
    const joinedAfter = joinWords(committedText, stable, true);
    updates.push({
      at: (receivedAt - began) / 1000,
      audioSeconds: target,
      requestedAt: (requestedAt - began) / 1000,
      kind,
      raw: text,
      before: joinedBefore,
      after: joinedAfter,
      latencyMs: receivedAt - requestedAt,
    });
    if (kind === 'commit') {
      committedText = joinedBefore;
      committedAt = end;
      tentativeText = '';
    } else {
      tentativeText = stable;
    }
    target += fast ? 0.25 : Math.max(0.25, (receivedAt - requestedAt) / 1000);
  }
  return updates;
}
function stableTail(previous, next) {
  const oldWords = previous.trim() === '' ? [] : previous.trim().split(/\s+/);
  const newWords = next.trim() === '' ? [] : next.trim().split(/\s+/);
  const stable = Math.max(0, oldWords.length - 4);
  if (stable === 0) return newWords.join(' ');
  const boundaryAgrees = stable <= newWords.length && key(oldWords[stable - 1]) === key(newWords[stable - 1]);
  const tail = boundaryAgrees ? newWords.slice(stable) : newWords.slice(-4);
  return `${oldWords.slice(0, stable).join(' ')} ${tail.join(' ')}`.trim();
}
function key(word) {
  return word.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
}
function joinWords(head, tail, dedupe) {
  const a = head.trim();
  const b = tail.trim();
  if (!a || !b) return a || b;
  if (!dedupe) return `${a} ${b}`;
  const left = a.split(/\s+/);
  const right = b.split(/\s+/);
  for (let size = Math.min(12, left.length, right.length); size >= 3; size -= 1) {
    const suffix = left.slice(-size).map(key);
    if (suffix.some((word) => !word) || new Set(suffix).size < 2) continue;
    if (suffix.every((word, index) => word === key(right[index]))) return `${a} ${right.slice(size).join(' ')}`.trim();
  }
  return `${a} ${b}`;
}

function words(text) {
  return text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
}
function stats(updates, variant) {
  let previous = '';
  let flickerUpdates = 0;
  let rewrittenWords = 0;
  let shownWords = 0;
  let repetitions = 0;
  for (const update of updates) {
    const current = update[variant];
    const before = words(previous);
    const now = words(current);
    let changed = 0;
    for (let i = 0; i < before.length; i += 1) if (now[i] !== before[i]) changed += 1;
    if (changed || now.length < before.length) flickerUpdates += 1;
    rewrittenWords += changed + Math.max(0, before.length - now.length);
    shownWords += before.length;
    repetitions += repeatedNgrams(now);
    previous = current;
  }
  return {
    updates: updates.length,
    flickerUpdates,
    flickerPercent: shownWords ? (rewrittenWords / shownWords) * 100 : 0,
    rewrittenWords,
    repetitions,
    maxLagSeconds: Math.max(0, ...updates.map((item) => item.at - item.audioSeconds)),
    meanLagSeconds: updates.length
      ? updates.reduce((sum, item) => sum + Math.max(0, item.at - item.audioSeconds), 0) / updates.length
      : 0,
  };
}
function repeatedNgrams(tokens) {
  let count = 0;
  for (let size = 2; size <= Math.min(10, Math.floor(tokens.length / 2)); size += 1) {
    for (let i = 0; i + size * 2 <= tokens.length; i += 1) {
      if (tokens.slice(i, i + size).every((token, j) => token === tokens[i + size + j])) count += 1;
    }
  }
  return count;
}

function expectedChecks(noteText, expected = {}) {
  const checks = [];
  const test = (label, pass, wording) => checks.push({ label, pass, wording });
  test('six hours kept', /six hours/i.test(noteText) && !/four hours/i.test(noteText), noteText.match(/[^.]*six hours[^.]*/i)?.[0] ?? 'missing');
  test('weekend aside omitted', !/weekend|not clinically relevant/i.test(noteText), 'omitted');
  test('cognitive restructuring', /cognitive restructuring/i.test(noteText), noteText.match(/[^.]*cognitive restructuring[^.]*/i)?.[0] ?? 'missing');
  test('risk denial retained', /denied|no thoughts of harming|suicid/i.test(noteText), noteText.match(/[^.]*\\b(denied|harming|suicid)[^.]*\\.?/i)?.[0] ?? 'missing');
  test('panic attacks down 3 to 1', /three.*one|3.*1|decreased|down/i.test(noteText) && /panic attacks/i.test(noteText), noteText.match(/[^.]*panic attacks[^.]*/i)?.[0] ?? 'missing');
  test('weekly cadence', /weekly|each week|every week/i.test(noteText), noteText.match(/[^.]*weekly[^.]*/i)?.[0] ?? 'missing');
  for (const [label, value] of Object.entries(expected)) {
    const pattern = new RegExp(String(value), 'i');
    const omitted = /omitted/i.test(label);
    const pass = omitted ? !pattern.test(noteText) : pattern.test(noteText);
    test(label, pass, omitted ? 'omitted' : noteText.match(new RegExp(`[^.]*${String(value)}[^.]*`, 'i'))?.[0] ?? 'missing');
  }
  return checks;
}

async function finalDraft(wavBuffer) {
  const patientsResponse = await fetch(`${base}/api/patients`);
  const formatsResponse = await fetch(`${base}/api/formats`);
  if (!patientsResponse.ok || !formatsResponse.ok) throw new Error('cannot list patients/formats');
  const patients = await patientsResponse.json();
  const formats = await formatsResponse.json();
  const patientId = arg('--patient', (patients.patients ?? patients)[0]?.id);
  const formatId = arg('--format', (formats.formats ?? formats)[0]?.id);
  if (!patientId || !formatId) throw new Error('no patient/format; pass --patient and --format');
  const form = new FormData();
  form.set('patient_id', patientId);
  form.set('format_id', formatId);
  form.set('title', 'Voice fixture replay');
  form.set('audio', new Blob([wavBuffer], { type: 'audio/wav' }), 'voice-fixture.wav');
  const response = await fetch(`${base}/api/transcribe`, { method: 'POST', body: form });
  const text = await response.text();
  const noteEvent = [...text.matchAll(/^event: note\ndata: (.+)$/gm)].at(-1)?.[1];
  if (!noteEvent) throw new Error(`final transcription/draft failed: ${text.slice(-500)}`);
  const note = JSON.parse(noteEvent).note ?? JSON.parse(noteEvent);
  let transcript = '';
  if (dbPath) {
    const query = `SELECT raw_text FROM transcripts WHERE note_id='${String(note.id).replaceAll("'", "''")}'`;
    try {
      transcript = execFileSync('sqlite3', ['-separator', '', resolve(dbPath), query], { encoding: 'utf8' }).trim();
    } catch {
      transcript = '';
    }
  }
  return { note, transcript };
}

function html(updates, title) {
  const data = JSON.stringify(updates).replace(/</g, '\\u003c');
  return `<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{font:16px system-ui;max-width:60rem;margin:2rem auto;padding:0 1rem}button{font:inherit;padding:.4rem .8rem}.time{color:#666}.preview{min-height:8rem;border:1px solid #aaa;padding:1rem;white-space:pre-wrap}.committed{color:#262620;font-style:normal}.tentative{color:#6e6c60;font-style:italic}</style><h1>${title}</h1><p><button id="play">Play</button> <button id="reset">Reset</button> <span class="time" id="time"></span></p><div class="preview" id="preview"></div><script>const u=${data};let i=0,timer;const p=document.querySelector('#preview'),time=document.querySelector('#time');function show(){const x=u[i];if(!x)return;const words=x.after.trim()===''?[]:x.after.trim().split(/\\s+/);const tail=x.kind==='tail'?words.splice(-4).join(' '):'';p.replaceChildren();const committed=document.createElement('span');committed.className='committed';committed.textContent=words.join(' ');p.append(committed);if(tail){if(committed.textContent)p.append(document.createTextNode(' '));const tentative=document.createElement('span');tentative.className='tentative';tentative.textContent=tail;p.append(tentative)}time.textContent='audio '+x.audioSeconds.toFixed(1)+'s · update '+x.at.toFixed(2)+'s · '+x.kind;i++}document.querySelector('#play').onclick=()=>{clearTimeout(timer);i=0;const step=()=>{if(i>=u.length)return;show();timer=setTimeout(step,Math.max(0,(u[i]?.at-u[i-1]?.at||0)*1000))};step()};document.querySelector('#reset').onclick=()=>{clearTimeout(timer);i=0;p.replaceChildren();time.textContent=''}</script>`;
}

const updates = await preview(wav, meta, duration);
const before = stats(updates, 'before');
const after = stats(updates, 'after');
const result = await finalDraft(wav);
const noteText = result.note.content ?? '';
const report = {
  fixture,
  durationSeconds: duration,
  transcript: result.transcript,
  note: noteText,
  wer: result.transcript ? wer(sidecar.script, result.transcript) : null,
  expected: expectedChecks(noteText, sidecar.expected),
  preview: { before, after, updates },
};
writeFileSync(`${out}-before.html`, html(updates.map((item) => ({ ...item, after: item.before })), 'Preview replay — before fix'));
writeFileSync(`${out}-after.html`, html(updates, 'Preview replay — after fix'));
writeFileSync(`${out}.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report, preview: { before, after }, html: [`${out}-before.html`, `${out}-after.html`] }, null, 2));

function wer(reference, hypothesis) {
  const a = words(reference);
  const b = words(hypothesis);
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const above = row[j];
      row[j] = a[i - 1] === b[j - 1] ? diagonal : 1 + Math.min(diagonal, row[j], row[j - 1]);
      diagonal = above;
    }
  }
  return { errors: row[b.length], referenceWords: a.length, rate: a.length ? row[b.length] / a.length : 0 };
}
