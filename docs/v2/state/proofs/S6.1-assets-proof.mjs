#!/usr/bin/env node
// S6.1 asset-evidence pipeline PROOF (synthetic). Node builtins only.
// A: asserts the ORIGINAL V9/V3/V6 behaviour reviews/S6.1-v2-ir3.md calls wrong.
// B: asserts the PROPOSED corrected pipeline, each gate failing closed.
// Synthetic records and synthetic asset BYTES only. No browser, no Vite run, no
// dictionary install, no server, no network, no git write, no licence research.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const REPO = resolve(import.meta.dirname, '../../../..');
// mkdtemp inside gitignored `test-results/` (.gitignore:9): this process created this one
// directory and only ever removes that one. Never os.tmpdir(), never a fixed shared path.
const SCRATCH = mkdtempSync(join(REPO, 'test-results', 's6.1-assets-proof-'));
// Remove exactly the directory this process created, including on an assertion failure, so a
// failing run leaves no debris for the next one. Nothing else is ever removed.
process.on('exit', () => rmSync(SCRATCH, { recursive: true, force: true }));

const read = (p) => readFileSync(p, 'utf8');
/** FULL digests, never a truncated prefix: a 16-hex-char fingerprint is not a digest. */
const sha = (body) => createHash('sha256').update(body).digest('hex');
const write = (p, body) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body);
};
const sh = (cmd) => execFileSync('bash', ['-c', cmd], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
let checks = 0;
const section = (t) => process.stdout.write(`\n## ${t}\n`);
const ok = (n) => (checks++, process.stdout.write(`  ok  ${n}\n`));
// Any non-zero from a shell row is data here, not a throw: A1/A2 assert exit 0.
const run = (cmd) => {
  try {
    return { exit: 0, out: sh(cmd) };
  } catch (e) {
    return { exit: e.status ?? -1, out: `${String(e.stdout ?? '')}${String(e.stderr ?? '')}` };
  }
};

// ---- shipped contracts, read not assumed -------------------------------------
// MODULE_BY_LOCALE is derived from source: es-MX from
// shared/src/i18n/locales.ts LOCALE_SETTINGS.dictionary (null for en, no
// dictionary ships today), English from web/src/lib/speller.ts's two constants.
function localeDictionaries(src) {
  const out = {};
  for (const m of src.matchAll(/(?:^|\n)\s*'?([\w-]+)'?:\s*Object\.freeze\(\{([\s\S]*?)\}\)/g)) {
    const d = /dictionary:\s*(null|'[^']*')/.exec(m[2]);
    if (d) out[m[1]] = d[1] === 'null' ? null : d[1].slice(1, -1);
  }
  return out;
}
const LOCALE_DICT = localeDictionaries(read(join(REPO, 'shared/src/i18n/locales.ts')));
const EN_MODULE = /node_modules\/(dictionary-en)\/index\.aff/.exec(read(join(REPO, 'web/src/lib/speller.ts')))?.[1];
const MODULE_BY_LOCALE = { en: EN_MODULE, 'es-MX': LOCALE_DICT['es-MX'] };
const ROW_LOCALE = { 'es-MX': 'es-MX', chromium: 'en' }; // each row's declared stored locale
// Part A's names only: hardcoded, cosmetic, and NOT build facts. Every name Part B asserts anything
// about is derived by `namesFor()` from the build id and the module.
const EN_PAIR = ['index-B2yR7tLp.aff', 'index-Dq1xK9ab.dic'];
const ES_PAIR = ['index-Hh5TzQ01.aff', 'index-Rm8Wc3vd.dic'];
const EMITTED_A = [...EN_PAIR, ...ES_PAIR];

// ======================= A: ORIGINAL pipeline, wrong behaviour asserted ========
// V9's command transcribed from S6.1-AMENDMENT-PROPOSAL-v2.md §9 row V9: the gate chain is verbatim,
// and two things are NOT — the row's leading `export PATH="…"` is dropped, and `OBS` is redirected
// into scratch. Neither can change a gate: the export is environment setup and the assignment sits
// inside the `&&` chain, before `chain=$?`. Every gate is content-shape only.
const v9 = (obs) =>
  run(`sort -c -u "${obs}/observed-es-MX.txt" && sort -c -u "${obs}/observed-chromium.txt" &&
   comm -23 "${obs}/observed-es-MX.txt" "${obs}/observed-chromium.txt" > "${obs}/spanish-pair.txt";
   chain=$?; echo "sorted-and-comm-exit=$chain"; echo "es-MX minus chromium:";
   cat "${obs}/spanish-pair.txt"; n="$(wc -l < "${obs}/spanish-pair.txt")";
   m="$(grep -cxF -f "${obs}/spanish-pair.txt" "${obs}/emitted-dictionary-assets.txt")";
   echo "difference-lines=$n emitted-matches=$m";
   test "$chain" -eq 0 && test "$n" -eq 2 && test "$m" -eq 2; rc=$?; echo "exit=$rc"; exit $rc`);

section('A. Original pipeline — asserting the WRONG behaviour (D-02, D-03, D-04, D-05)');
{
  // A1: three files from an earlier execution, neither row run in this session.
  const o = join(SCRATCH, 'A1-stale');
  write(join(o, 'observed-es-MX.txt'), `${ES_PAIR.join('\n')}\n`);
  write(join(o, 'observed-chromium.txt'), `${EN_PAIR.join('\n')}\n`);
  write(join(o, 'emitted-dictionary-assets.txt'), `${EMITTED_A.join('\n')}\n`);
  const r = v9(o);
  assert.equal(r.exit, 0, 'D-02: V9 passed on files it cannot date');
  assert.match(r.out, /difference-lines=2 emitted-matches=2/);
  ok('D-02 reproduced: foreign-session files satisfy every V9 gate (exit 0)');
}
{
  // A2: two builds; the Spanish pair hashed differently in the second.
  const o = join(SCRATCH, 'A2-two-builds');
  const es2 = ['index-AAAaff11.aff', 'index-BBBdic22.dic'];
  write(join(o, 'observed-es-MX.txt'), `${es2.join('\n')}\n`);
  write(join(o, 'observed-chromium.txt'), `${EN_PAIR.join('\n')}\n`);
  write(join(o, 'emitted-dictionary-assets.txt'), `${[...EN_PAIR, ...es2].join('\n')}\n`);
  const r = v9(o);
  assert.equal(r.exit, 0, 'D-03: V9 cannot tell a build difference from a locale difference');
  assert.match(r.out, /difference-lines=2 emitted-matches=2/);
  ok('D-03 reproduced: two builds differing only in hashes pass (exit 0, 2 lines)');
}
{
  // A3: V3/V6's tail after Playwright; rc is the only propagated status.
  const logs = join(SCRATCH, 'A3-run', 'logs');
  const obs = join(SCRATCH, 'A3-run', 'observed');
  mkdirSync(obs, { recursive: true });
  const r = run(`rc=0; sort -u "${logs}/observed-es-MX.txt" > "${obs}/observed-es-MX.txt";
    cp "${logs}/v3-dictionary-assets.txt" "${obs}/emitted-dictionary-assets.txt";
    echo "observed-es-MX, sorted and de-duplicated for V9:"; cat "${obs}/observed-es-MX.txt"; exit $rc`);
  assert.equal(r.exit, 0, 'D-05: green although no copy happened');
  assert.equal(read(join(obs, 'observed-es-MX.txt')).length, 0, 'the copy is 0 bytes');
  ok('D-05 reproduced: lost sort/cp never reaches the row exit (exit 0, 0-byte copy)');
}
{
  // A4: && short-circuits before the redirect, so a stale spanish-pair.txt
  // survives and is printed, counted and grepped as if comm had produced it.
  const o = join(SCRATCH, 'A4-stale-pair');
  write(join(o, 'observed-es-MX.txt'), 'index-Zz9.dic\nindex-Hh5TzQ01.aff\n');
  write(join(o, 'observed-chromium.txt'), `${EN_PAIR.join('\n')}\n`);
  write(join(o, 'emitted-dictionary-assets.txt'), `${EMITTED_A.join('\n')}\n`);
  write(join(o, 'spanish-pair.txt'), `${ES_PAIR.join('\n')}\n`);
  const r = v9(o);
  assert.match(r.out, /disorder/);
  assert.match(r.out, /sorted-and-comm-exit=1/);
  assert.match(r.out, /difference-lines=2 emitted-matches=2/, 'D-04: stale difference printed');
  ok('D-04 reproduced: failed chain still prints a two-line difference (row exit 1, bounded)');
}

// ======================= B: PROPOSED corrected pipeline =======================
const RECORD_SCHEMA = 'apunta.s6.1.asset-observation@1';
const MANIFEST_SCHEMA = 'apunta.s6.1.asset-manifest@1';
const BUILD_SCHEMA = 'apunta.s6.1.build-manifest@1';
const GOOD = { session: 'sess-0001', statuses: { collect: 0, write: 0, compare: 0 }, publication: 'complete' };
const reject = (code, detail) => ({ ok: false, code, detail });

// ---- the synthetic build fixture: real asset bytes, one authoritative mapping ----
// Two builds of the same two modules. The bytes below are fabricated Hunspell-shaped stubs; no
// dictionary was installed and none of this is a claim about any real dictionary.
const ASSET_STUB = (moduleName, kind, tag) => `SET UTF-8\n# ${moduleName} ${kind} — synthetic fixture, tag ${tag}\n`;
/** Hashed-looking names, derived from the build id and the module: two builds never collide. */
const namesFor = (buildId, moduleName) => {
  const tag = sha(`${buildId}:${moduleName}`).slice(0, 4);
  return { aff: `index-${tag}aa11.aff`, dic: `index-${tag}bb22.dic` };
};

/** Exclusive create for a fixture file: O_EXCL, so a second write is refused, not merged. */
const writeExclusive = (p, body) => {
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, body, { flag: 'wx' });
};
// ---- shape contracts ----------------------------------------------------------
// `JSON.parse` succeeding says nothing about the SHAPE, and every gate below dereferences what it
// parsed. A null/array/primitive manifest, a missing nested field or a non-string digest must be a
// NAMED refusal BEFORE the dereference, not a TypeError out of a "fails closed" validator. Each
// spec is `field -> 'string' | 'object' | ['string'] | {field: spec}`; `requireShape` reports the
// first offending path by name and never inspects a value it has not type-checked.
const isPlainObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
const shapeName = (v) => (v === null ? 'null' : Array.isArray(v) ? 'an array' : typeof v);
const shapeAt = (value, spec) => {
  if (Array.isArray(spec))
    return Array.isArray(value) && value.every((v) => typeof v === 'string') ? null : 'array of strings';
  if (spec === 'string') return typeof value === 'string' ? null : 'string';
  if (spec === 'object') return isPlainObject(value) ? null : `object, not ${shapeName(value)}`;
  if (!isPlainObject(value)) return `object, not ${shapeName(value)}`;
  if ('__each' in spec) {
    for (const [key, entry] of Object.entries(value)) {
      const bad = shapeAt(entry, spec.__each);
      if (bad) return `modules.${key}: ${bad}`;
    }
    return null;
  }
  for (const [field, sub] of Object.entries(spec)) {
    const bad = shapeAt(value[field], sub);
    if (bad) return `${bad.startsWith('modules.') ? '' : `${field}: `}${bad}`;
  }
  return null;
};
const requireShape = (value, spec, what) => {
  const bad = shapeAt(value, spec);
  return bad === null ? { ok: true } : reject('E-SHAPE', `${what}: ${bad}`);
};
const DIGEST = /^[0-9a-f]{64}$/;
const ASSET_PAIR_SHAPE = { aff: { path: 'string', sha256: 'string' }, dic: { path: 'string', sha256: 'string' } };
const BUILD_SHAPE = { schema: 'string', buildId: 'string', modules: { __each: ASSET_PAIR_SHAPE }, emitted: ['string'] };
const MANIFEST_SHAPE = { schema: 'string', sessionId: 'string', runId: 'string', project: 'string', statuses: 'object', publication: 'string', artifacts: 'object' };
const RECORD_SHAPE = { schema: 'string', sessionId: 'string', runId: 'string', project: 'string', storedLanguage: 'string', attributionBasis: 'string', dictionaryModule: 'string', statuses: 'object', publication: 'string', build: { sourceHash: 'string', buildManifestHash: 'string', emittedListHash: 'string' } };

/**
 Two paths, and only two: CREATE writes every file with `O_EXCL`, and
 * REUSE writes nothing at all — it re-hashes what is on disk against the manifest and refuses on
 * any mismatch, so a tampered build is reported, never silently repaired. "Immutable" is therefore
 * a measured property here, not a comment: a reuse rewrites no bytes and a tamper survives the
 * refusal. `modules` is the authoritative module -> {aff,dic} mapping every observed name is
 * checked against: a Vite output has hashed filenames and NO module prefix in the URL, so the
 * relation is carried by this manifest, not by a string in an asset path.
 */
function mintBuild(buildId) {
  const root = join(SCRATCH, 'builds', buildId);
  const manifestPath = join(root, 'manifest.json');
  // REUSE: verify only. No mkdir, no write, no repair.
  if (existsSync(manifestPath)) {
    let onDisk;
    try {
      onDisk = JSON.parse(read(manifestPath));
    } catch (error) {
      return reject('E-BUILD-TAMPER', `build ${buildId}: manifest is unparseable: ${String(error.message).split('\n')[0]}`);
    }
    const shape = requireShape(onDisk, BUILD_SHAPE, `build ${buildId} manifest`);
    if (!shape.ok) return shape;
    for (const [moduleName, pair] of Object.entries(onDisk.modules))
      for (const kind of ['aff', 'dic']) {
        const rel = pair[kind].path;
        const abs = resolve(root, rel);
        if (abs !== root && !abs.startsWith(root + sep)) return reject('E-BUILD-TAMPER', `${rel} escapes ${root}`);
        if (!existsSync(abs)) return reject('E-BUILD-TAMPER', `${rel} is gone: the build on disk is not the one minted`);
        if (sha(read(abs)) !== pair[kind].sha256)
          return reject('E-BUILD-TAMPER', `${moduleName} ${kind} bytes differ from the manifest`);
      }
    return { ok: true, reused: true, root, manifestRel: 'manifest.json', modules: onDisk.modules, emitted: onDisk.emitted };
  }
  // CREATE: exclusive, so a second mint can never half-overwrite a build another case holds.
  const modules = {};
  const emitted = [];
  for (const moduleName of Object.values(MODULE_BY_LOCALE)) {
    const names = namesFor(buildId, moduleName);
    const pair = {};
    for (const kind of ['aff', 'dic']) {
      const rel = `dist/assets/${names[kind]}`;
      writeExclusive(join(root, rel), ASSET_STUB(moduleName, kind, buildId));
      pair[kind] = { path: rel, sha256: sha(ASSET_STUB(moduleName, kind, buildId)) };
      emitted.push(names[kind]);
    }
    modules[moduleName] = pair;
  }
  const body = `${JSON.stringify({ schema: BUILD_SCHEMA, buildId, modules, emitted: emitted.sort() }, null, 2)}\n`;
  writeExclusive(manifestPath, body);
  return { ok: true, reused: false, root, manifestRel: 'manifest.json', modules, emitted };
}
/** Every file in a tree with its digest: the observation used to prove a reuse wrote nothing. */
function treeSnapshot(root) {
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
      .sort();
  return walk(root).map((abs) => `${relative(root, abs).split(sep).join('/')}\0${sha(readFileSync(abs))}`).join('\n');
}
/** sourceHash over the whole built tree: sorted `rel\0digest` lines, from the BYTES on disk. */
function sourceHashOf(root) {
  const distRoot = join(root, 'dist');
  const walk = (dir) =>
    readdirSync(dir, { withFileTypes: true })
      .flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]))
      .sort();
  const lines = walk(distRoot).map((abs) => `${relative(root, abs).split(sep).join('/')}\0${sha(readFileSync(abs))}`);
  return sha(`${lines.join('\n')}\n`);
}

/**
 * Proposed collector. Writes into ONE exclusively created run folder; nothing is shared, pooled
 * or cleared, and publication is an exclusive create.
 */
function collect({ session, project, runId, build, storedLanguage, spanishAvailable, names, module, statuses, publication }) {
  // `module` is the row's CLAIM; validate() checks it against the assets, never trusts it.
  const runFolder = join(SCRATCH, 'runs', runId);
  if (existsSync(runFolder)) return reject('E-EXISTS', `run folder already exists: ${runFolder}`);
  // the emitted list is the WHOLE build's dictionary assets, so one row cannot present a list
  // that only contains its own pair
  const emittedBody = `${[...build.emitted].sort().join('\n')}\n`;
  const record = {
    schema: RECORD_SCHEMA,
    sessionId: session,
    runId,
    project,
    case: 'no dictionary asset is requested until a spell surface mounts',
    storedLanguage,
    spanishAvailable,
    attributionBasis: 'GET /api/settings:language',
    dictionaryModule: module,
    // the authoritative mapping this row read, named as a path inside this run's own scratch
    buildRoot: relative(SCRATCH, build.root),
    build: {
      sourceHash: sourceHashOf(build.root),
      buildManifestHash: sha(read(join(build.root, build.manifestRel))),
      emittedListHash: sha(emittedBody),
    },
    observedInArrivalOrder: names,
    statuses,
    publication,
  };
  write(join(runFolder, 'logs/emitted-dictionary-assets.txt'), emittedBody);
  // The sealed observation LOG: the arrival-order list exactly as the row wrote it down, kept so a
  // later reader can see what the collector claimed before anything was sorted. It is NOT the
  // authoritative data — the authoritative pair is `evidence/observed-<project>.raw.json`
  // (arrival order, compared by E-DERIVATION and E-DUPLICATE) and `evidence/observed-<project>.txt`
  // (the sorted-unique copy, compared by E-KIND and E-UNSORTED). The log is sealed by the manifest
  // digest walk and by nothing else, which is why no gate derives a decision from it.
  write(join(runFolder, `logs/observed-${project}.txt`), `${names.join('\n')}\n`);
  // The original record AND its sorted-unique copy are both kept, per project.
  write(join(runFolder, `evidence/observed-${project}.raw.json`), `${JSON.stringify(record, null, 2)}\n`);
  write(join(runFolder, `evidence/observed-${project}.txt`), `${[...new Set(names)].sort().join('\n')}\n`);
  const rels = [
    `logs/observed-${project}.txt`,
    'logs/emitted-dictionary-assets.txt',
    `evidence/observed-${project}.raw.json`,
    `evidence/observed-${project}.txt`,
  ];
  const manifest = {
    schema: MANIFEST_SCHEMA,
    sessionId: session,
    runId,
    project,
    statuses,
    publication,
    artifacts: Object.fromEntries(rels.map((r) => [r, sha(read(join(runFolder, r)))])),
  };
  try {
    // Publication is an exclusive create: nothing may publish over a sealed run.
    writeFileSync(join(runFolder, `evidence/manifest-${project}.json`), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  } catch (error) {
    if (error.code === 'EEXIST') return reject('E-PUBLISHED', `run ${runId} is already published`);
    throw error;
  }
  return runFolder;
}

/** Path safety BEFORE the read, on every read, including the comparator's own. */
function safeRead(root, rel, what) {
  if (typeof rel !== 'string' || rel === '') return reject('E-PATH', `${what}: not a relative path`);
  if (isAbsolute(rel)) return reject('E-PATH', `${what}: absolute path ${rel}`);
  const base = resolve(root);
  const abs = resolve(base, rel);
  if (abs !== base && !abs.startsWith(base + sep)) return reject('E-PATH', `${what}: ${rel} escapes ${base}`);
  return { ok: true, abs };
}
const readText = (root, rel, what) => {
  const p = safeRead(root, rel, what);
  if (!p.ok) return p;
  if (!existsSync(p.abs)) return reject('E-MISSING', `${what}: ${rel}`);
  if (!statSync(p.abs).isFile()) return reject('E-PATH', `${what}: ${rel} is not a file`);
  return { ok: true, body: read(p.abs) };
};
const parseJson = (root, rel, what) => {
  const t = readText(root, rel, what);
  if (!t.ok) return t;
  let value;
  try {
    value = JSON.parse(t.body);
  } catch (error) {
    return reject('E-UNPARSEABLE', `${what}: ${rel}: ${String(error.message).split('\n')[0]}`);
  }
  // Parseable is not shaped. A null, an array or a primitive is refused HERE, before any caller
  // dereferences `.schema`, so no entrypoint can reach a TypeError through this path.
  if (!isPlainObject(value)) return reject('E-SHAPE', `${what}: ${rel}: object, not ${shapeName(value)}`);
  return { ok: true, value };
};

/** Proposed validator. Fails closed; every gate carries a named code. */
function validate({ session, project, runFolder }) {
  // 1. Ownership, resolved FIRST — before any read, in this function and in the comparator.
  const owned = safeRead(SCRATCH, relative(SCRATCH, resolve(runFolder)), 'runFolder');
  if (!owned.ok) return reject('E-PATH', `run folder outside this session's owned scratch: ${runFolder}`);
  if (!existsSync(owned.abs)) return reject('E-MISSING', `run folder: ${runFolder}`);

  const MANIFEST = `evidence/manifest-${project}.json`;
  const RECORD = `evidence/observed-${project}.raw.json`;
  const COPY = `evidence/observed-${project}.txt`;
  const LOG = `logs/observed-${project}.txt`;
  const EMITTED = 'logs/emitted-dictionary-assets.txt';
  // 2. Manifest completeness BEFORE the digest walk: a manifest may not shrink its own scope.
  const man = parseJson(owned.abs, MANIFEST, 'manifest');
  if (!man.ok) return man;
  const manShape = requireShape(man.value, MANIFEST_SHAPE, 'manifest');
  if (!manShape.ok) return manShape;
  if (man.value.schema !== MANIFEST_SCHEMA) return reject('E-SCHEMA', `manifest schema ${String(man.value.schema)}`);
  const expectedKeys = [COPY, EMITTED, RECORD, LOG].sort();
  // Each digest is a FULL sha256 string, checked before the walk compares against it.
  for (const [rel, digest] of Object.entries(man.value.artifacts))
    if (!DIGEST.test(digest)) return reject('E-SHAPE', `manifest artifacts.${rel}: sha256 digest, not ${JSON.stringify(digest)}`);
  const keys = Object.keys(man.value.artifacts).sort();
  if (JSON.stringify(keys) !== JSON.stringify(expectedKeys))
    return reject('E-MANIFEST-KEYS', `${keys.join(',')} != ${expectedKeys.join(',')}`);
  for (const k of keys) {
    const safe = safeRead(owned.abs, k, 'manifest key');
    if (!safe.ok) return reject('E-TRAVERSAL', `manifest key ${k}: ${safe.detail}`);
  }

  const rec = parseJson(owned.abs, RECORD, 'record');
  if (!rec.ok) return rec;
  const record = rec.value;
  const recShape = requireShape(record, RECORD_SHAPE, 'record');
  if (!recShape.ok) return recShape;
  for (const [field, digest] of Object.entries(record.build))
    if (!DIGEST.test(digest)) return reject('E-SHAPE', `record build.${field}: sha256 digest, not ${JSON.stringify(digest)}`);
  if (record.schema !== RECORD_SCHEMA) return reject('E-SCHEMA', String(record.schema));
  if (record.sessionId !== session || man.value.sessionId !== session)
    return reject('E-SESSION', `${String(record.sessionId)} != ${session}`);
  if (basename(owned.abs) !== record.runId || record.runId !== man.value.runId)
    return reject('E-RUN', `${basename(owned.abs)} != ${String(record.runId)}`);
  // interrupted publication; every postprocessing status counts (D-04, D-05)
  if (record.publication !== 'complete' || man.value.publication !== 'complete')
    return reject('E-PUBLICATION', String(record.publication));
  for (const step of ['collect', 'write', 'compare']) {
    if (record.statuses[step] !== 0) return reject('E-STATUS', `${step}=${String(record.statuses[step])}`);
    if (man.value.statuses[step] !== 0) return reject('E-STATUS', `${step}=${String(man.value.statuses[step])}`);
  }
  // 3. Tampering: every manifest-listed artefact, digest recomputed from its bytes.
  for (const [rel, digest] of Object.entries(man.value.artifacts)) {
    const t = readText(owned.abs, rel, 'artefact');
    if (!t.ok) return t;
    if (sha(t.body) !== digest) return reject('E-ARTIFACT', `${rel} changed after publication`);
  }
  // 5. Observations: arrival order present and duplicate-free; the sorted copy must be DERIVED
  // from it, ascending, and exactly one .aff + one .dic. All independent of the manifest, so
  // re-sealing cannot hide any of them.
  const seen = record.observedInArrivalOrder;
  if (!Array.isArray(seen) || seen.length === 0) return reject('E-MISSING', 'observedInArrivalOrder');
  if (new Set(seen).size !== seen.length) return reject('E-DUPLICATE', seen.join(','));
  const copy = readText(owned.abs, COPY, 'observation copy');
  if (!copy.ok) return copy;
  const names = copy.body.split('\n').filter(Boolean);
  if (!names.every((nm, i) => i === 0 || names[i - 1] < nm)) return reject('E-UNSORTED', names.join(','));
  const suffixes = names.map((nm) => nm.split('.').pop()).sort();
  if (JSON.stringify(suffixes) !== JSON.stringify(['aff', 'dic'])) return reject('E-KIND', `${suffixes.join(',')}`);
  if (JSON.stringify([...new Set(seen)].sort()) !== JSON.stringify(names))
    return reject('E-DERIVATION', `${names.join(',')} != sorted ${seen.join(',')}`);
  // 6. Build identity, recomputed from the build's OWN bytes and manifest (D-03).
  const bm = safeRead(SCRATCH, String(record.buildRoot), 'buildRoot');
  if (!bm.ok) return reject('E-PATH', `build root: ${bm.detail}`);
  const bmText = readText(bm.abs, 'manifest.json', 'build manifest');
  if (!bmText.ok) return bmText;
  let build;
  try {
    build = JSON.parse(bmText.body);
  } catch (error) {
    return reject('E-UNPARSEABLE', `build manifest: ${String(error.message).split('\n')[0]}`);
  }
  const buildShape = requireShape(build, BUILD_SHAPE, 'build manifest');
  if (!buildShape.ok) return buildShape;
  for (const [moduleName, pair] of Object.entries(build.modules))
    for (const kind of ['aff', 'dic'])
      if (!DIGEST.test(pair[kind].sha256))
        return reject('E-SHAPE', `build modules.${moduleName}.${kind}.sha256: not a digest`);
  if (build.schema !== BUILD_SCHEMA) return reject('E-SCHEMA', `build schema ${String(build.schema)}`);
  if (sha(bmText.body) !== record.build.buildManifestHash)
    return reject('E-BUILD', `buildManifestHash ${String(record.build.buildManifestHash)}`);
  if (sourceHashOf(bm.abs) !== record.build.sourceHash)
    return reject('E-BUILD', `sourceHash ${String(record.build.sourceHash)}`);
  const emittedText = readText(owned.abs, EMITTED, 'emitted list');
  if (emittedText.ok && sha(emittedText.body) !== record.build.emittedListHash) return reject('E-BUILD', 'emittedListHash');
  // 7. The module -> asset relation: the observed names must BE this module's pair, in this build.
  const pair = build.modules[record.dictionaryModule];
  if (!pair) return reject('E-MODULE', `build has no module ${String(record.dictionaryModule)}`);
  const wanted = [basename(pair.aff.path), basename(pair.dic.path)].sort();
  if (JSON.stringify(names) !== JSON.stringify(wanted))
    return reject('E-MODULE-ASSET', `observed ${names.join(',')} != ${record.dictionaryModule} ${wanted.join(',')}`);
  for (const [kind, asset] of Object.entries(pair)) {
    const assetRead = readText(bm.abs, asset.path, `asset ${kind}`);
    if (!assetRead.ok) return assetRead;
    if (sha(assetRead.body) !== asset.sha256) return reject('E-ASSET-BYTES', `${kind} bytes differ from the build manifest`);
    if (!build.emitted.includes(basename(asset.path))) return reject('E-NOT-EMITTED', basename(asset.path));
  }
  // 7. Language: the CURRENT STORED value, never Spanish availability (D-01)
  if (record.attributionBasis !== 'GET /api/settings:language') return reject('E-BASIS', String(record.attributionBasis));
  if (record.storedLanguage !== ROW_LOCALE[project]) return reject('E-STORED', `${project} stored ${String(record.storedLanguage)}`);
  const expected = MODULE_BY_LOCALE[record.storedLanguage];
  if (!expected) return reject('E-NO-MODULE', String(record.storedLanguage));
  if (record.dictionaryModule !== expected) return reject('E-MODULE', `${String(record.dictionaryModule)} != ${expected}`);
  return { ok: true, project, sessionId: session, runId: record.runId, storedLanguage: record.storedLanguage,
    spanishAvailable: record.spanishAvailable, dictionaryModule: record.dictionaryModule,
    build: { ...record.build, buildId: build.buildId }, names };
}

/** Proposed comparison row: two bound runs, ONE recorded build, disjoint pairs. */
function compareIdentity({ session, es, en }) {
  // E-PATH first, for BOTH folders, before any read of either.
  for (const [label, folder] of [['es-MX', es], ['chromium', en]]) {
    const owned = safeRead(SCRATCH, relative(SCRATCH, resolve(String(folder))), `${label} run folder`);
    if (!owned.ok) return reject('E-PATH', `${label}: ${owned.detail}`);
  }
  const a = validate({ session, project: 'es-MX', runFolder: es });
  if (!a.ok) return a;
  const b = validate({ session, project: 'chromium', runFolder: en });
  if (!b.ok) return b;
  if (a.dictionaryModule === b.dictionaryModule) return reject('E-SAME-DICTIONARY', String(a.dictionaryModule));
  // same build: the two rows must name one build by identity, not by assertion
  for (const k of ['sourceHash', 'buildManifestHash'])
    if (a.build[k] !== b.build[k]) return reject('E-BUILD', `${k}: ${a.build[k]} != ${b.build[k]}`);
  const overlap = a.names.filter((n) => b.names.includes(n));
  if (overlap.length > 0) return reject('E-OVERLAP', overlap.join(','));
  const side = (r) => ({ storedLanguage: r.storedLanguage, module: r.dictionaryModule, names: r.names });
  return { ok: true, sessionId: session, difference: a.names, build: a.build,
    attribution: { 'es-MX': side(a), chromium: side(b) } };
}

let n = 0;
function fixture(over = {}) {
  n++;
  const runId = (p) => `${p}-run-${String(n).padStart(4, '0')}`;
  const b1 = mintBuild('b1');
  const wanted2 = [over.esBuild, over.enBuild].filter((b) => b !== undefined && b !== 'b1');
  const builds = Object.fromEntries(wanted2.map((b) => [b, mintBuild(b)]));
  // A refused mint (a tampered build on disk) must surface here, not as a half-built fixture: the
  // reuse path REFUSES rather than repairing, so `ok: false` is a real outcome this helper asserts.
  for (const [id, build] of [['b1', b1], ...Object.entries(builds)])
    assert.equal(build.ok, true, `mintBuild(${id}) refused: ${String(build.code)} ${String(build.detail)}`);
  const args = (p, runId_, build, stored, avail, names) => ({
    session: over.session ?? GOOD.session,
    project: p,
    runId: runId_,
    build,
    storedLanguage: stored,
    spanishAvailable: avail,
    names,
    module: over[`${p === 'es-MX' ? 'es' : 'en'}Module`] ?? MODULE_BY_LOCALE[stored],
    statuses: over[`${p === 'es-MX' ? 'es' : 'en'}Statuses`] ?? GOOD.statuses,
    publication: over[`${p === 'es-MX' ? 'es' : 'en'}Publication`] ?? GOOD.publication,
  });
  const esBuild = builds[over.esBuild] ?? b1;
  const enBuild = builds[over.enBuild] ?? b1;
  const pairOf = (buildId, locale) => {
    const p = namesFor(buildId, MODULE_BY_LOCALE[locale]);
    return [p.aff, p.dic];
  };
  return {
    session: over.session ?? GOOD.session,
    // arrival order is reversed for the es-MX row: the copy is sorted, the record is not
    es: collect(args('es-MX', runId('es'), esBuild, over.esStored ?? 'es-MX', true,
      over.esNames ?? pairOf('b1', 'es-MX').reverse())),
    en: collect(args('chromium', runId('en'), enBuild, over.enStored ?? 'en', false,
      over.enNames ?? pairOf('b1', 'en'))),
  };
}/** Re-seal a manifest after a deliberate edit, so a digest gate cannot be the thing under test. */
function reseal(runFolder, project, rel, body) {
  write(join(runFolder, rel), body);
  const m = join(runFolder, `evidence/manifest-${project}.json`);
  const man = JSON.parse(read(m));
  man.artifacts[rel] = sha(read(join(runFolder, rel)));
  write(m, `${JSON.stringify(man, null, 2)}\n`);
}
function expectCode(label, args, code) {
  const r = compareIdentity(args);
  assert.equal(r.ok, false, `${label}: expected rejection, got ${JSON.stringify(r)}`);
  assert.equal(r.code, code, `${label}: expected ${code}, got ${r.code} (${r.detail})`);
  ok(`${label} -> ${code}`);
}
/** Re-seal a manifest after a deliberate edit to a manifest-LISTED artefact, so a digest gate
 *  cannot be the thing under test. The manifest itself is not listed, so editing it needs no
 *  re-seal — see `tamperManifest`. */
function tamperJson(runFolder, project, rel, mutate) {
  const body = JSON.parse(read(join(runFolder, rel)));
  const next = mutate(body);
  reseal(runFolder, project, rel, `${JSON.stringify(next === undefined ? body : next, null, 2)}\n`);
}
const tamperManifest = (runFolder, project, mutate) => {
  const m = join(runFolder, `evidence/manifest-${project}.json`);
  const body = JSON.parse(read(m));
  const next = mutate(body);
  write(m, `${JSON.stringify(next === undefined ? body : next, null, 2)}\n`);
};

section('B. Corrected pipeline — positive case and every fail-closed gate');
assert.deepEqual(LOCALE_DICT, { en: null, 'es-MX': 'dictionary-es-mx@2.0.0' });
ok(`module->dictionary relation derived from shipped contracts: ${JSON.stringify(MODULE_BY_LOCALE)} (pin asserted, not derived)`);
{
  const f = fixture();
  const r = compareIdentity(f);
  assert.equal(r.ok, true, `positive: ${JSON.stringify(r)}`);
  const esNames = namesFor('b1', MODULE_BY_LOCALE['es-MX']);
  assert.deepEqual(r.difference, [esNames.aff, esNames.dic].sort());
  assert.match(r.build.sourceHash, /^[0-9a-f]{64}$/, 'sourceHash is a full digest');
  assert.match(r.build.buildManifestHash, /^[0-9a-f]{64}$/, 'buildManifestHash is a full digest');
  ok(`positive: session ${r.sessionId}, runs ${basename(f.es)} + ${basename(f.en)}, build ${r.build.buildId}, ` +
    `stored-locale attribution ${r.attribution['es-MX'].storedLanguage}/${r.attribution['es-MX'].module} vs ` +
    `${r.attribution.chromium.storedLanguage}/${r.attribution.chromium.module}, diff=${r.difference.join(',')}`);
}
{
  // Swapped pairs: each row observes the OTHER module's assets. Nothing self-declared changes.
  const f = fixture({ esNames: [namesFor('b1', MODULE_BY_LOCALE.en).aff, namesFor('b1', MODULE_BY_LOCALE.en).dic],
    enNames: [namesFor('b1', MODULE_BY_LOCALE['es-MX']).aff, namesFor('b1', MODULE_BY_LOCALE['es-MX']).dic] });
  expectCode('N1 the two rows observe each other\'s pair', f, 'E-MODULE-ASSET');
}
{
  // A different build, re-sealed end to end: every field self-consistent, one build off.
  const f = fixture({ esBuild: 'b2', esNames: [namesFor('b2', MODULE_BY_LOCALE['es-MX']).aff, namesFor('b2', MODULE_BY_LOCALE['es-MX']).dic] });
  expectCode('N2 resealed different build on one row (D-03)', f, 'E-BUILD');
}
{
  const f = fixture();
  reseal(f.es, 'es-MX', `evidence/observed-es-MX.raw.json`,
    read(join(f.es, 'evidence/observed-es-MX.raw.json')).replace(/"sourceHash": "[0-9a-f]{64}"/, `"sourceHash": "${'0'.repeat(64)}"`));
  expectCode('N3 recorded build digest no longer matches the built tree', f, 'E-BUILD');
}
{
  const f = fixture();
  const m = join(f.es, 'evidence/manifest-es-MX.json');
  const man = JSON.parse(read(m));
  delete man.artifacts['evidence/observed-es-MX.txt'];
  write(m, `${JSON.stringify(man, null, 2)}\n`);
  expectCode('N4 manifest missing the observation copy', f, 'E-MANIFEST-KEYS');
}
{
  const f = fixture();
  const m = join(f.es, 'evidence/manifest-es-MX.json');
  const man = JSON.parse(read(m));
  man.schema = 'apunta.s6.1.asset-manifest@999';
  write(m, `${JSON.stringify(man, null, 2)}\n`);
  expectCode('N5 manifest schema is not its own', f, 'E-SCHEMA');
}
{
  const f = fixture();
  const m = join(f.es, 'evidence/manifest-es-MX.json');
  const man = JSON.parse(read(m));
  man.artifacts['../../../../etc/passwd'] = 'f'.repeat(64);
  write(m, `${JSON.stringify(man, null, 2)}\n`);
  const trav = compareIdentity(f);
  assert.equal(trav.code, 'E-MANIFEST-KEYS', 'a traversing key is refused by the key-set check');
  assert.equal(trav.ok, false);
  ok('N6 manifest key traverses out of the run folder -> E-MANIFEST-KEYS (key-set equality; the safeRead traversal guard is defence in depth)');
}
{
  const f = fixture({ esNames: [namesFor('b1', MODULE_BY_LOCALE['es-MX']).aff, namesFor('b1', MODULE_BY_LOCALE['es-MX']).aff] });
  expectCode('N7 duplicate observation', f, 'E-DUPLICATE');
}
{
  const f = fixture();
  const lines = read(join(f.es, 'evidence/observed-es-MX.txt')).split('\n').filter(Boolean);
  reseal(f.es, 'es-MX', 'evidence/observed-es-MX.txt', `${[lines[1], lines[0]].join('\n')}\n`);
  expectCode('N8 unsorted observation copy', f, 'E-UNSORTED');
}
{
  const f = fixture();
  const rec = JSON.parse(read(join(f.es, 'evidence/observed-es-MX.raw.json')));
  rec.observedInArrivalOrder = [...rec.observedInArrivalOrder, 'index-Third.aff', 'index-Third.dic'];
  reseal(f.es, 'es-MX', 'evidence/observed-es-MX.raw.json', `${JSON.stringify(rec, null, 2)}\n`);
  expectCode('N9 sorted copy is not derived from the arrival-order record', f, 'E-DERIVATION');
}
{
  const f = fixture({ esNames: [namesFor('b1', MODULE_BY_LOCALE['es-MX']).aff, 'index-Hh5TzQ01.txt'] });
  expectCode('N10 wrong extensions', f, 'E-KIND');
}
{
  const f = fixture();
  rmSync(join(f.es, 'evidence/observed-es-MX.txt'));
  expectCode('N11 missing observation copy', f, 'E-MISSING');
}
expectCode('N12 observation is not an aff/dic pair', fixture({ esNames: [namesFor('b1', MODULE_BY_LOCALE['es-MX']).aff] }), 'E-KIND');
expectCode('N13 observed name the build never emitted',
  fixture({ esNames: [namesFor('b1', MODULE_BY_LOCALE['es-MX']).aff, 'index-Zzz.dic'] }), 'E-MODULE-ASSET');
for (const step of ['collect', 'write', 'compare'])
  expectCode(`N14 lost postprocessing status (${step}, D-05)`,
    fixture({ esStatuses: { collect: 0, write: 0, compare: 0, [step]: 2 } }), 'E-STATUS');
expectCode('N15 interrupted publication (D-04 corrected)', fixture({ esPublication: 'partial' }), 'E-PUBLICATION');
{
  const f = fixture();
  write(join(f.en, 'logs/emitted-dictionary-assets.txt'), 'tampered-after-publication\n');
  expectCode('N16 artefact changed after publication', f, 'E-ARTIFACT');
}
{
  const f = fixture();
  const p = 'evidence/observed-es-MX.raw.json';
  reseal(f.es, 'es-MX', p, '{not json\n');
  expectCode('N17 malformed record JSON', f, 'E-UNPARSEABLE');
}
{
  // N18 tampers with the BUILD, not with a run. It gets its own build id for exactly that
  // reason: b1 is immutable and shared, so an in-place edit would silently invalidate every
  // digest the other cases compare.
  const f = fixture({ esBuild: 'b3', enBuild: 'b3',
    esNames: [namesFor('b3', MODULE_BY_LOCALE['es-MX']).aff, namesFor('b3', MODULE_BY_LOCALE['es-MX']).dic],
    enNames: [namesFor('b3', MODULE_BY_LOCALE.en).aff, namesFor('b3', MODULE_BY_LOCALE.en).dic] });
  const root = join(SCRATCH, 'builds', 'b3');
  const bm = JSON.parse(read(join(root, 'manifest.json')));
  bm.modules[MODULE_BY_LOCALE['es-MX']].aff.sha256 = 'f'.repeat(64);
  write(join(root, 'manifest.json'), `${JSON.stringify(bm, null, 2)}\n`);
  const rec = 'evidence/observed-es-MX.raw.json';
  reseal(f.es, 'es-MX', rec,
    read(join(f.es, rec)).replace(/"buildManifestHash": "[0-9a-f]{64}"/, `"buildManifestHash": "${sha(read(join(root, 'manifest.json')))}"`));
  expectCode('N18 build manifest resealed around different asset bytes', f, 'E-ASSET-BYTES');
  assert.equal(validate({ session: GOOD.session, project: 'es-MX', runFolder: f.es }).code, 'E-ASSET-BYTES');
}
expectCode('N19 run folder outside this session\'s owned scratch', { ...fixture(), en: join(SCRATCH, '..', 'foreign') }, 'E-PATH');
{
  // The comparator must resolve BOTH folders before it reads either: the review's CE7b had a
  // foreign record read and trusted first, returning E-SAME-DICTIONARY from outside the scratch.
  // The refusal target is created by `mkdtemp` in a SECOND mkdtemp parent, so it is a path this
  // process created — no fixed name, no pid, no chance of colliding with or adopting anyone else's
  // directory — and it is removed in a `finally` whether or not the assertion below holds. It must
  // sit OUTSIDE this run's scratch to be a refusal target at all, hence the second parent.
  const foreignParent = mkdtempSync(join(REPO, 'test-results', 's6.1-assets-proof-foreign-'));
  try {
    const foreign = mkdtempSync(join(foreignParent, 'run-'));
    const f = fixture();
    expectCode('N19b a foreign folder is refused for BOTH rows before any read', { ...f, es: foreign }, 'E-PATH');
    assert.ok(existsSync(foreign), 'and the refusal leaves the foreign folder exactly as it found it');
  } finally {
    rmSync(foreignParent, { recursive: true, force: true });
  }
  assert.equal(existsSync(foreignParent), false, 'and the parent this process created is gone');
}
{
  const f = fixture({ esBuild: 'b4', enBuild: 'b4',
    esNames: [namesFor('b4', MODULE_BY_LOCALE['es-MX']).aff, namesFor('b4', MODULE_BY_LOCALE['es-MX']).dic],
    enNames: [namesFor('b4', MODULE_BY_LOCALE.en).aff, namesFor('b4', MODULE_BY_LOCALE.en).dic] });
  write(join(SCRATCH, 'builds', 'b4', 'manifest.json'), '{not json\n');
  expectCode('N19c malformed build-manifest JSON', f, 'E-UNPARSEABLE');
}
expectCode('N20 stale session id', { ...fixture({ session: 'sess-0000' }), session: GOOD.session }, 'E-SESSION');
expectCode('N21 a row naming a module its observed pair is not', fixture({ enModule: MODULE_BY_LOCALE['es-MX'] }), 'E-MODULE-ASSET');
{
  // The comparator's same-dictionary invariant is now unreachable: with the module bound to the
  // observed ASSETS, two individually valid rows cannot name one module. Asserted rather than
  // asserted-in-prose, because an unreachable gate is exactly the kind of thing a later edit
  // silently re-opens.
  const esPair = [namesFor('b1', MODULE_BY_LOCALE['es-MX']).aff, namesFor('b1', MODULE_BY_LOCALE['es-MX']).dic];
  const codes = new Set();
  for (const o of [{ enModule: MODULE_BY_LOCALE['es-MX'] }, { enModule: MODULE_BY_LOCALE['es-MX'], enNames: esPair },
    { enStored: 'es-MX', enModule: MODULE_BY_LOCALE['es-MX'], enNames: esPair },
    { enStored: 'es-MX', enNames: esPair }, { esModule: MODULE_BY_LOCALE.en },
    { esModule: MODULE_BY_LOCALE.en, esNames: [namesFor('b1', MODULE_BY_LOCALE.en).aff, namesFor('b1', MODULE_BY_LOCALE.en).dic] }])
    codes.add(compareIdentity(fixture(o)).code);
  assert.equal(codes.has('E-SAME-DICTIONARY'), false, `E-SAME-DICTIONARY is unreachable: ${[...codes].join(',')}`);
  ok(`N22 the same-dictionary invariant is unreachable by construction (${[...codes].join(', ')})`);
  const blocked = [];
  for (const o of [{ esNames: [namesFor('b1', MODULE_BY_LOCALE.en).aff, namesFor('b1', MODULE_BY_LOCALE.en).dic] },
    { enNames: [namesFor('b1', MODULE_BY_LOCALE['es-MX']).aff, namesFor('b1', MODULE_BY_LOCALE['es-MX']).dic] }])
    blocked.push(compareIdentity(fixture(o)).code);
  assert.deepEqual(blocked, ['E-MODULE-ASSET', 'E-MODULE-ASSET'], 'either row observing the wrong pair is refused at the per-row gate');
  ok('N22b swapped pairs are refused before anything is attributed (E-MODULE-ASSET)');
}
expectCode('N23 es-MX row naming a module the pinned contract does not carry',
  fixture({ esModule: 'dictionary-es-mx@1.0.0' }), 'E-MODULE');
expectCode('N24 attribution basis is availability, not the stored setting', (() => {
  const f = fixture();
  const p = 'evidence/observed-es-MX.raw.json';
  const rec = JSON.parse(read(join(f.es, p)));
  rec.attributionBasis = 'APUNTA_DEV_SPANISH';
  reseal(f.es, 'es-MX', p, `${JSON.stringify(rec, null, 2)}\n`);
  return f;
})(), 'E-BASIS');
expectCode('N25 wrong stored locale behind a Spanish offer (D-01)', (() => {
  const f = fixture();
  const p = 'evidence/observed-es-MX.raw.json';
  const rec = JSON.parse(read(join(f.es, p)));
  rec.storedLanguage = 'en';
  reseal(f.es, 'es-MX', p, `${JSON.stringify(rec, null, 2)}\n`);
  return f;
})(), 'E-STORED');
{
  // Ownership: a run id is minted once and a sealed run cannot be republished or re-collected.
  const runId = `reuse-run-${String(n + 1).padStart(4, '0')}`;
  const build = mintBuild('b1');
  assert.equal(build.reused, true, 'the build fixture is reused, not re-minted');
  const names = [namesFor('b1', MODULE_BY_LOCALE['es-MX']).aff, namesFor('b1', MODULE_BY_LOCALE['es-MX']).dic];
  const args = { session: GOOD.session, project: 'es-MX', runId, build, storedLanguage: 'es-MX',
    spanishAvailable: true, names: [...names].reverse(), module: MODULE_BY_LOCALE['es-MX'],
    statuses: GOOD.statuses, publication: GOOD.publication };
  const first = collect(args);
  assert.equal(typeof first, 'string', 'the first mint of a run id succeeds');
  const again = collect(args);
  assert.equal(again.code, 'E-EXISTS', 'a second collect into the same run id is refused');
  ok('N26 a run id is minted once -> E-EXISTS');
  const man = join(first, 'evidence/manifest-es-MX.json');
  assert.throws(() => writeFileSync(man, 'x', { flag: 'wx' }), /EEXIST/, 'publication is an exclusive create');
  ok('N27 a sealed run cannot be republished -> EEXIST');
  assert.equal(validate({ session: GOOD.session, project: 'es-MX', runFolder: first }).ok, true, 'and the run still validates');
}

section('B1b. Malformed shapes — every one refused by name, none throws');
{
  /** Drive one malformed shape and assert the validator REFUSED it. `assert.doesNotThrow` is the
   *  explicit no-throw check; it hides nothing, because a TypeError or a failed assertion inside
   *  still fails the proof loudly. There is deliberately NO broad try/catch around the pipeline. */
  const refused = (label, f, code, detail) => {
    let r;
    assert.doesNotThrow(() => { r = compareIdentity(f); }, `${label}: the validator THREW instead of refusing`);
    assert.equal(r.ok, false, `${label}: expected rejection, got ${JSON.stringify(r)}`);
    assert.equal(r.code, code, `${label}: expected ${code}, got ${r.code} (${r.detail})`);
    if (detail) assert.match(String(r.detail), detail, `${label}: ${r.detail}`);
    ok(`${label} -> ${code}`);
  };
  const RECORD_REL = 'evidence/observed-es-MX.raw.json';
  const manifestCase = (label, mutate, code, detail) => {
    const f = fixture();
    tamperManifest(f.es, 'es-MX', mutate);
    refused(label, f, code, detail);
  };
  const recordCase = (label, mutate, code, detail) => {
    const f = fixture();
    tamperJson(f.es, 'es-MX', RECORD_REL, mutate);
    refused(label, f, code, detail);
  };
  // 1. Parseable, but not an object at all — the round-2 TypeError, at all three entrypoints.
  manifestCase('N28a manifest JSON is null', () => null, 'E-SHAPE', /not null/);
  manifestCase('N28b manifest JSON is an array', () => [], 'E-SHAPE', /an array/);
  manifestCase('N28c manifest JSON is a number', () => 3, 'E-SHAPE', /number/);
  manifestCase('N28d manifest JSON is a string', () => '"complete"', 'E-SHAPE', /string/);
  recordCase('N28e record JSON is null', () => null, 'E-SHAPE', /not null/);
  // 2. Right shape, wrong or missing nested field — each named by its own path.
  manifestCase('N29a manifest has no sessionId', (m) => ({ ...m, sessionId: undefined }), 'E-SHAPE', /sessionId: string/);
  manifestCase('N29b manifest statuses is null', (m) => ({ ...m, statuses: null }), 'E-SHAPE', /statuses: object, not null/);
  manifestCase('N29c manifest publication is a number', (m) => ({ ...m, publication: 3 }), 'E-SHAPE', /publication: string/);
  manifestCase('N29d manifest has no artifacts map', (m) => ({ ...m, artifacts: null }), 'E-SHAPE', /artifacts: object, not null/);
  manifestCase('N29e an artifacts digest is truncated, not a digest', (m) => {
    m.artifacts['evidence/observed-es-MX.txt'] = 'f'.repeat(16);
    return m;
  }, 'E-SHAPE', /sha256 digest/);
  recordCase('N30a record has no build map', (r) => ({ ...r, build: undefined }), 'E-SHAPE', /build: object, not undefined/);
  recordCase('N30b record build is null', (r) => ({ ...r, build: null }), 'E-SHAPE', /build: object, not null/);
  recordCase('N30c record build has no sourceHash', (r) => ({ ...r, build: { ...r.build, sourceHash: undefined } }), 'E-SHAPE', /sourceHash: string/);
  recordCase('N30d a recorded digest is a number', (r) => ({ ...r, build: { ...r.build, sourceHash: 3 } }), 'E-SHAPE', /sourceHash: string/);
  recordCase('N30d2 a recorded digest is a truncated string', (r) => ({ ...r, build: { ...r.build, sourceHash: 'f'.repeat(16) } }), 'E-SHAPE', /sha256 digest/);
  recordCase('N30e record statuses is missing', (r) => ({ ...r, statuses: undefined }), 'E-SHAPE', /statuses: object, not undefined/);
  recordCase('N30f attributionBasis is a number', (r) => ({ ...r, attributionBasis: 3 }), 'E-SHAPE', /attributionBasis: string/);
  recordCase('N30g observedInArrivalOrder is a string', (r) => ({ ...r, observedInArrivalOrder: 'index-a.aff' }), 'E-MISSING', /observedInArrivalOrder/);
  // 3. The build manifest, through the same validator. A fresh build id per case: the reuse path
  //    REFUSES a tampered build (N32), so a shared id would stop minting and the fixture would
  //    never be created — which is exactly how a reviewer ends up "testing" an earlier gate.
  let buildCaseN = 0;
  const buildCase = (label, mutate, code, detail) => {
    const id = `bs${String(++buildCaseN).padStart(2, '0')}`;
    const names = (locale) => { const p = namesFor(id, MODULE_BY_LOCALE[locale]); return [p.aff, p.dic]; };
    const f = fixture({ esBuild: id, enBuild: id, esNames: names('es-MX'), enNames: names('en') });
    const m = join(SCRATCH, 'builds', id, 'manifest.json');
    const body = JSON.parse(read(m));
    const next = mutate(body);
    write(m, `${JSON.stringify(next === undefined ? body : next, null, 2)}\n`);
    refused(label, f, code, detail);
  };
  buildCase('N31a build manifest is null', () => null, 'E-SHAPE', /not null/);
  buildCase('N31b build manifest is an array', () => [], 'E-SHAPE', /an array/);
  buildCase('N31c build has no modules map', (b) => ({ ...b, modules: null }), 'E-SHAPE', /modules: object, not null/);
  buildCase('N31d a module pair has no dic digest', (b) => {
    b.modules[MODULE_BY_LOCALE['es-MX']].dic.sha256 = undefined;
    return b;
  }, 'E-SHAPE', /modules\..*dic: sha256: string/);
  buildCase('N31e a module digest is truncated', (b) => {
    b.modules[MODULE_BY_LOCALE['es-MX']].aff.sha256 = 'f'.repeat(8);
    return b;
  }, 'E-SHAPE', /aff\.sha256: not a digest/);
  buildCase('N31f emitted is not a list', (b) => ({ ...b, emitted: 'index-a.aff' }), 'E-SHAPE', /emitted: array of strings/);
}

section('B1c. Build immutability — a reuse writes nothing, a tamper is refused, not repaired');
{
  const b1 = mintBuild('b1');
  assert.equal(b1.ok, true, 'b1 mints');
  const root = join(SCRATCH, 'builds', 'b1');
  const before = treeSnapshot(root);
  const stamps = readdirSync(join(root, 'dist', 'assets')).map((f) => `${f}:${String(statSync(join(root, 'dist', 'assets', f)).mtimeMs)}`);
  const again = mintBuild('b1');
  assert.equal(again.reused, true, 'the second mint REUSES');
  assert.equal(treeSnapshot(root), before, 'and every file in the build is byte-identical afterwards');
  assert.deepEqual(readdirSync(join(root, 'dist', 'assets')).map((f) => `${f}:${String(statSync(join(root, 'dist', 'assets', f)).mtimeMs)}`), stamps, 'no asset mtime moved either: the reuse path writes nothing');
  ok('N32a re-minting a shared build writes no bytes and moves no mtime (reuse is verify-only)');
  // A tamper from OUTSIDE, then a re-mint: the refusal must leave the tampered bytes exactly as
  // they are. Round 2 wrote the assets before the reuse check, so this silently repaired them.
  const asset = join(root, b1.modules[MODULE_BY_LOCALE['es-MX']].aff.path);
  const goodBytes = read(asset);
  writeFileSync(asset, `${goodBytes}TAMPERED\n`);
  const tamperedBytes = read(asset);
  const tamperedStamp = statSync(asset).mtimeMs;
  const refusedMint = mintBuild('b1');
  assert.equal(refusedMint.ok, false, 'a tampered build is REFUSED');
  assert.equal(refusedMint.code, 'E-BUILD-TAMPER');
  assert.equal(read(asset), tamperedBytes, 'and the refused mint did not repair it: the tampered bytes are still there');
  assert.equal(statSync(asset).mtimeMs, tamperedStamp, 'and the file was not rewritten');
  writeFileSync(asset, goodBytes); // this worker undoes its own tamper, for the cases that follow
  assert.equal(mintBuild('b1').ok, true, 'with the bytes restored the build mints again');
  ok('N32b a tampered build is refused with E-BUILD-TAMPER and left untouched (no silent repair)');
}

section('B2. D-06 — NFC projections agree while the raw offsets differ');
{
  // The D-06 argument is about representations, so the fixture drives the
  // proposed Unicode WORD shape (§7) over both encodings of one sentence.
  // Nothing here claims what the shipped tokeniser does.
  // HONEST SCANNER SHAPE: `\\p{M}` is a strict SUPERSET of an explicit U+0300..U+036F range — it
  // also matches U+0483, U+05B0, U+0903, U+093C, U+1AB0, U+FE0F. It is written this way because it
  // is the readable spelling of "a combining mark", not because any lint rule forced it:
  // `no-misleading-character-class` is NOT enabled in this repo (`eslint.config.js` uses
  // `js.configs.recommended`), and forcing it on by hand still reports nothing for either a regex
  // literal or a string here — both measured locally. The superset relation is measured below
  // rather than asserted, and it changes nothing for this clause's Latin text.
  const scanWith = (cls) => (t) => [...t.matchAll(new RegExp(`${cls}+(?:['’]${cls}+)*`, 'gu'))]
    .map((m) => ({ start: m.index, end: m.index + m[0].length, word: m[0] }));
  const L = '[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\\p{M}]';
  const scan = scanWith(L);
  // The broader set really is broader, and the two agree exactly on this sentence.
  const broader = new RegExp('\\p{M}', 'u');
  const narrower = new RegExp('[\\u0300-\\u036F]', 'u');
  const outside = [0x483, 0x5b0, 0x903, 0x93c, 0x1ab0, 0xfe0f].map((cp) => String.fromCodePoint(cp));
  assert.ok(outside.every((c) => broader.test(c) && !narrower.test(c)), '`\\p{M}` matches marks U+0300..U+036F does not');
  const narrowScan = scanWith('[A-Za-zÁÉÍÓÚÜÑáéíóúüñ\\u0300-\\u036F]');
  const nfc = 'Vino a la sesión con José mañana';
  const nfd = nfc.normalize('NFD');
  assert.deepEqual(scan(nfc), narrowScan(nfc), 'and the two shapes agree exactly on the NFC sentence');
  assert.deepEqual(scan(nfd), narrowScan(nfd), 'and on its NFD form');
  ok('scanner shape stated honestly: \\p{M} is a strict superset of U+0300..U+036F (6 sampled marks), identical on this fixture, and no enabled lint rule required the rewrite');
  assert.notEqual(nfc, nfd);
  const a = scan(nfc);
  const b = scan(nfd);
  assert.notDeepEqual(a.map((x) => x.word), b.map((x) => x.word), 'raw flagged sets differ');
  assert.deepEqual(a.map((x) => x.end - x.start), [4, 1, 2, 6, 3, 4, 6], 'NFC lengths');
  assert.deepEqual(b.map((x) => x.end - x.start), [4, 1, 2, 7, 3, 5, 7], 'NFD: +1 per accented word');
  assert.notDeepEqual(a.map((x) => [x.start, x.end]), b.map((x) => [x.start, x.end]));
  for (const [t, found] of [[nfc, a], [nfd, b]])
    for (const m of found) {
      assert.equal(t.slice(m.start, m.end), m.word, 'slice === word, per input');
      assert.equal(m.end - m.start, m.word.length, 'end - start === length, per input');
    }
  assert.deepEqual(a.map((m) => m.word.normalize('NFC')).sort(), b.map((m) => m.word.normalize('NFC')).sort());
  ok('D-06 measured: raw words and raw offsets differ; per-input offsets exact; NFC projections equal');
  ok('minimal wording fix: delete "and the flagged sets are equal", or read "and the flagged sets, as `{plainWord(m.word)}` sets, are equal"');
}

rmSync(SCRATCH, { recursive: true, force: true });
process.stdout.write(`\n${String(checks)} checks passed\n`);