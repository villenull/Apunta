#!/usr/bin/env node
/* eslint-disable no-restricted-syntax -- this isolated acquisition script uses only its loopback Ollama URL; model downloads are explicitly allowlisted. */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../..');
const manifest = JSON.parse(readFileSync(resolve(root, 'scripts/model-comparison/artifacts.json'), 'utf8'));
const args = process.argv.slice(2);
const dataDir = resolve(args[args.indexOf('--data-dir') + 1] ?? '/tmp/apunta-four-model-ollama');
const artifactDir = resolve(args[args.indexOf('--artifact-dir') + 1] ?? resolve(dataDir, 'artifacts'));
const port = Number(args[args.indexOf('--port') + 1] ?? 11435);
const host = `127.0.0.1:${String(port)}`;
const allowed = new Set(manifest.allowlist);

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: acquire.mjs --data-dir DIR --artifact-dir DIR --port PORT');
  process.exit(message ? 2 : 0);
}
if (args.includes('--help')) usage();
if (!Number.isInteger(port) || port < 1024 || port > 65535) usage('invalid port');
mkdirSync(dataDir, { recursive: true });
mkdirSync(artifactDir, { recursive: true });

function hostOf(url) {
  return new URL(url).hostname;
}
async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try {
      const response = await fetch(`http://${host}/api/version`);
      if (response.ok) return;
    } catch {
      /* starting */
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 500));
  }
  throw new Error('isolated Ollama did not become ready');
}
function run(command, commandArgs, env) {
  const result = spawnSync(command, commandArgs, {
    env: { ...process.env, ...env },
    cwd: root,
    encoding: 'utf8',
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error(`${command} failed with ${String(result.status)}`);
}
async function download(entry, destination) {
  if (!allowed.has(hostOf(entry.source))) throw new Error(`source host not allowlisted: ${entry.source}`);
  const response = await fetch(entry.source, { redirect: 'follow' });
  if (!response.ok || response.body === null)
    throw new Error(`download failed ${response.status}: ${entry.source}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  const digest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.byteLength !== entry.bytes || digest !== entry.sha256)
    throw new Error(`checksum mismatch for ${entry.source}: ${bytes.byteLength} bytes ${digest}`);
  writeFileSync(destination, bytes, { flag: 'wx' });
  console.error(`verified ${destination}: ${bytes.byteLength} bytes sha256=${digest}`);
}

const env = { OLLAMA_HOST: host, OLLAMA_MODELS: resolve(dataDir, 'models') };
const service = spawn('ollama', ['serve'], {
  env: { ...process.env, ...env },
  cwd: root,
  stdio: ['ignore', 'ignore', 'inherit'],
});
try {
  await waitForServer();
  const qwen = manifest.models['qwen3.5:2b-q4_K_M'];
  run('ollama', ['pull', qwen.runtimeAlias], env);
  run('ollama', ['pull', manifest.models['qwen3.5:4b-q4_K_M'].runtimeAlias], env);
  const qwenTags = await (await fetch(`http://${host}/api/tags`)).json();
  const tagRows = Array.isArray(qwenTags.models) ? qwenTags.models : [];
  for (const candidate of ['qwen3.5:4b-q4_K_M', 'qwen3.5:2b-q4_K_M']) {
    const entry = manifest.models[candidate];
    const row = tagRows.find((item) => item.name === candidate);
    if (!row) throw new Error(`isolated Ollama did not expose ${candidate} after pull`);
    if (entry.expectedDigest !== null && row.digest !== entry.expectedDigest)
      throw new Error(`${candidate} digest mismatch: expected ${entry.expectedDigest}, got ${row.digest}`);
  }
  writeFileSync(resolve(artifactDir, 'ollama-tags.json'), `${JSON.stringify(qwenTags, null, 2)}\n`);
  for (const [candidate, entry] of Object.entries(manifest.models)) {
    if (entry.kind !== 'gguf') continue;
    const destination = resolve(
      artifactDir,
      candidate.includes('8B') ? 'Bonsai-8B-Q1_0.gguf' : 'Bonsai-4B-Q1_0.gguf',
    );
    try {
      statSync(destination);
      console.error(`using existing ${destination}`);
    } catch {
      await download(entry, destination);
    }
    const modelfile = resolve(
      artifactDir,
      `${candidate.includes('8B') ? 'bonsai-8b' : 'bonsai-4b'}.Modelfile`,
    );
    writeFileSync(
      modelfile,
      `FROM ${destination}\nPARAMETER num_ctx ${String(entry.context ?? 16384)}\n`,
      'utf8',
    );
    run('ollama', ['create', entry.runtimeAlias, '-f', modelfile], env);
  }
  const tags = await (await fetch(`http://${host}/api/tags`)).json();
  writeFileSync(resolve(artifactDir, 'final-tags.json'), `${JSON.stringify(tags, null, 2)}\n`);
  console.log(
    JSON.stringify({ host: `http://${host}`, dataDir, artifactDir, pid: service.pid, tags }, null, 2),
  );
} finally {
  service.kill('SIGTERM');
}
