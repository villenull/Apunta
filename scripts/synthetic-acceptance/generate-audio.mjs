#!/usr/bin/env node
/**
 * Generate the disposable synthetic dictation used by the 2026-09-22
 * acceptance run. This intentionally invokes a locally acquired Piper binary;
 * it never calls a browser speech API or a cloud service.
 *
 * Usage:
 *   PIPER_BIN=/tmp/apunta-piper/piper/piper \
 *   PIPER_MODEL=/tmp/apunta-piper/en_US-lessac-medium.onnx \
 *   node scripts/synthetic-acceptance/generate-audio.mjs /tmp/apunta-synthetic-dictation.wav
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const output = resolve(process.argv[2] ?? '/tmp/apunta-synthetic-dictation.wav');
const piper = process.env.PIPER_BIN;
const model = process.env.PIPER_MODEL;
if (!piper || !model) {
  throw new Error('PIPER_BIN and PIPER_MODEL are required; keep both outside the repository');
}
const script = readFileSync(
  resolve(root, 'e2e/fixtures/synthetic-acceptance/dictation-script.txt'),
  'utf8',
).trim();
mkdirSync(dirname(output), { recursive: true });
const result = spawnSync(piper, ['--model', model, '--output_file', output], {
  input: `${script}\n`,
  env: { ...process.env, LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? dirname(piper) },
  stdio: ['pipe', 'inherit', 'inherit'],
});
if (result.error) throw result.error;
if (result.status !== 0) throw new Error(`Piper exited ${String(result.status)}`);
const padSeconds = Number(process.env.PIPER_PAD_SECONDS ?? '0');
if (Number.isFinite(padSeconds) && padSeconds > 0) {
  const wav = readFileSync(output);
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Piper output is not a RIFF/WAVE file');
  }
  const sampleRate = wav.readUInt32LE(24);
  const bytesPerSample = wav.readUInt16LE(34) / 8;
  const channels = wav.readUInt16LE(22);
  const silence = Buffer.alloc(Math.round(sampleRate * padSeconds) * bytesPerSample * channels);
  const padded = Buffer.concat([wav, silence]);
  padded.writeUInt32LE(padded.length - 8, 4);
  padded.writeUInt32LE(padded.length - 44, 40);
  writeFileSync(output, padded);
}
writeFileSync(`${output}.sha256`, `${spawnSync('sha256sum', [output], { encoding: 'utf8' }).stdout}`);
console.log(output);
