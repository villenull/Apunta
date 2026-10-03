// AM-190 application checks for src-tauri/tauri.conf.json.
//
// Non-runtime verification only. Reads the committed config at c8abfc5, the config
// as it now stands on disk, the test overlay, the locally installed
// @tauri-apps/cli schema and `git status`/`git diff` metadata. Nothing is
// installed, built, bundled, previewed, launched or written outside stdout: no
// tauri command, no cargo, no app, no server, no database, no model, no audio,
// no microphone, no pactl, no network and no port 7717.
//
// The baseline is taken from git (`c8abfc5:src-tauri/tauri.conf.json`), not from
// the scratch copy, so the check does not trust any file this session wrote.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = (line) => process.stdout.write(line + '\n');

// Content is returned verbatim (trailing newlines included); listing commands
// strip their own trailing newline where they compare against a set.
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
function hash(text) {
  return execFileSync('sha256sum', ['-'], { input: text }).toString().split(' ')[0];
}

const CONFIG = 'src-tauri/tauri.conf.json';
const OVERLAY = 'src-tauri/tauri.test.conf.json';
const EXPECTED_PATH = 'bundle.linux.appimage.bundleMediaFramework';
const EXPECTED_VALUE = true;

let failures = 0;
const check = (label, ok, detail = '') => {
  if (!ok) failures += 1;
  out(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  return ok;
};

// --- baseline: the committed config at c8abfc5, plus the working-tree copy --------
const baselineText = git('show', `c8abfc5:${CONFIG}`);
const currentText = readFileSync(CONFIG, 'utf8');
const overlayText = readFileSync(OVERLAY, 'utf8');
const overlayHead = git('show', `c8abfc5:${OVERLAY}`);

const baseline = JSON.parse(baselineText);
const current = JSON.parse(currentText);

out(`node ${process.version}`);
out(`baseline ${CONFIG}@c8abfc5 sha256 ${hash(baselineText)}`);
out(`current  ${CONFIG}      sha256 ${hash(currentText)}`);
out('--- semantic delta, baseline -> current ---');

// --- A. the delta is exactly one key ----------------------------------------
// Recursive structural diff, reported as explicit path-level entries so the
// assertion is about meaning and not about whitespace or key order.
const MISSING = Symbol('missing');
// Paths are built with a trailing separator and trimmed only where a leaf is
// recorded, so an added subtree is reported leaf by leaf.
const trimPath = (p) => p.replace(/\.$/, '');
const diff = (a, b, prefix = '') => {
  const changes = [];
  const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  // A missing key is compared against the new value so an added subtree is
  // reported leaf by leaf, not as one opaque object.
  if (isObj(b) && (a === MISSING || isObj(a))) {
    const left = a === MISSING ? {} : a;
    for (const key of Object.keys(b)) {
      if (!(key in left)) changes.push(...diff(MISSING, b[key], prefix + key + '.'));
      else changes.push(...diff(left[key], b[key], prefix + key + '.'));
    }
    for (const key of Object.keys(left)) {
      if (!(key in b)) changes.push({ op: 'removed', path: trimPath(prefix + key), value: left[key] });
    }
    return changes;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (JSON.stringify(a) !== JSON.stringify(b)) changes.push({ op: 'replaced', path: trimPath(prefix), value: b });
    return changes;
  }
  if (a === MISSING) changes.push({ op: 'added', path: trimPath(prefix), value: b });
  else if (a !== b || typeof a !== typeof b) changes.push({ op: 'replaced', path: trimPath(prefix), value: b });
  return changes;
};

const changes = diff(baseline, current);
for (const c of changes) out(`${c.op} ${c.path} = ${JSON.stringify(c.value)}`);
if (changes.length === 0) out('(no differences)');

const added = changes.filter((c) => c.op === 'added');
const others = changes.filter((c) => c.op !== 'added');
check('exactly one added key', added.length === 1, `count=${added.length}`);
check('the added key is bundle.linux.appimage.bundleMediaFramework', added[0]?.path === EXPECTED_PATH, added[0]?.path ?? 'none');
check('the added value is boolean true', added[0]?.value === EXPECTED_VALUE, `${typeof added[0]?.value} ${JSON.stringify(added[0]?.value)}`);
check('no key removed or value replaced anywhere in the file', others.length === 0, `${others.length} other change(s)`);

// Reconstructing the baseline with exactly that one key must reproduce the
// current document. Compared on canonical JSON, because the file on disk is
// prettier-formatted (inline arrays) and byte comparison would be asserting
// this session's formatting rather than its meaning.
const rebuilt = structuredClone(baseline);
rebuilt.bundle.linux = { appimage: { bundleMediaFramework: EXPECTED_VALUE } };
check('baseline + that one key reproduces the current document exactly', JSON.stringify(rebuilt) === JSON.stringify(current));
check('the file on disk is still well-formed JSON ending in one newline', currentText.endsWith('}\n') && !currentText.endsWith('}\n\n'));
check('the added key sits under bundle.linux.appimage, as the schema and the proposal spell it', current.bundle?.linux?.appimage?.bundleMediaFramework === true);

// --- B. what must not have moved --------------------------------------------
const same = (label, path) => {
  const get = (o) => path.split('.').reduce((acc, k) => (acc == null ? acc : acc[k]), o);
  const a = get(baseline);
  const b = get(current);
  return check(`${label} unchanged`, JSON.stringify(a) === JSON.stringify(b), JSON.stringify(b));
};

same('bundle.resources mapping', 'bundle.resources');
same('app.security (csp and capabilities)', 'app.security');
same('app.withGlobalTauri', 'app.withGlobalTauri');
same('app.windows', 'app.windows');
same('build.frontendDist', 'build.frontendDist');
same('identifier', 'identifier');
same('productName', 'productName');
same('version', 'version');
same('bundle.active', 'bundle.active');
same('bundle.targets', 'bundle.targets');
same('bundle.category', 'bundle.category');
same('bundle.icon', 'bundle.icon');
same('bundle.longDescription', 'bundle.longDescription');

check('no appimage.files mapping was introduced', current.bundle?.appimage?.files === undefined);
check('app.security.csp is still null', current.app?.security?.csp === null);
check('app.security.capabilities is still an empty list', Array.isArray(current.app?.security?.capabilities) && current.app.security.capabilities.length === 0);

// The test overlay must be byte-identical to c8abfc5: the approved variant is
// Option A, so the overlay keeps no key of its own.
check(`${OVERLAY} is byte-identical to c8abfc5 (no overlay edit)`, overlayText === overlayHead, overlayText === overlayHead ? '' : `sha256 ${hash(overlayText)}`);

// Nothing outside the one config file was touched: no permissions, no main.rs,
// no build.rs, no helper or build script, no web/server/shared/installer.
const tracked = ['src-tauri', 'scripts', 'web', 'server', 'shared', 'installer'].map((p) => git('status', '--porcelain', '--', p)).filter(Boolean);
const changedPaths = tracked.map((l) => l.slice(3).trim());
check('the only changed file under src-tauri, scripts, web, server, shared, installer is the shipping config', changedPaths.length === 1 && changedPaths[0] === CONFIG, changedPaths.join(' ') || 'none');
check('nothing is staged', git('diff', '--cached', '--name-only') === '');
check('the modified config file has no untracked sibling', git('status', '--porcelain', '--', 'src-tauri').split('\n').filter((l) => l.includes('??')).length === 0);

// --- C. installed schema validation -----------------------------------------
const schemaPath = 'node_modules/@tauri-apps/cli/config.schema.json';
const schemaText = readFileSync(schemaPath, 'utf8');
const schema = JSON.parse(schemaText);
const Ajv = require('ajv');
const ajv = new Ajv({ strict: false, allErrors: true });
// The Tauri schema declares numeric formats ajv does not ship. Registering each
// as a finite number is an accommodation of the validator only; nothing here
// turns on a numeric format, and no threshold is relaxed.
const formats = new Set();
JSON.stringify(schema, (k, v) => {
  if (k === 'format' && typeof v === 'string') formats.add(v);
  return v;
});
for (const name of formats) ajv.addFormat(name, { type: 'number', validate: Number.isFinite });
const validate = ajv.compile(schema);

const cliVersion = JSON.parse(readFileSync('node_modules/@tauri-apps/cli/package.json', 'utf8')).version;
out(`--- installed schema: @tauri-apps/cli ${cliVersion}, ajv ${JSON.parse(readFileSync('node_modules/ajv/package.json', 'utf8')).version} ---`);

const results = [];
const validateOne = (label, config, expectValid) => {
  const ok = validate(config);
  const errors = ok ? [] : validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`);
  results.push({ label, ok });
  check(`${expectValid ? 'VALID' : 'INVALID'}: ${label}`, ok === expectValid, errors.join('; ') || (ok ? 'no errors' : ''));
};

validateOne(`${CONFIG} as it now stands on disk`, current, true);

// Negative controls: without them "VALID" above would mean nothing.
const c1 = structuredClone(current);
c1.bundle.linux.appimage.bundleMediaFramework = 'true';
validateOne('control: string "true" must be rejected', c1, false);
const c2 = structuredClone(current);
c2.bundle.linux.appimage.unknownKey = 1;
validateOne('control: extra key in appimage must be rejected', c2, false);
const c3 = structuredClone(current);
c3.bundle.linux.appimage.bundleMediaFramework = false;
validateOne('control: boolean false is accepted by the schema', c3, true);

// The overlay, untouched, must still validate on its own.
validateOne(`${OVERLAY} as shipped`, JSON.parse(overlayText), true);
// And the baseline, for the record.
validateOne(`${CONFIG}@c8abfc5 (before the key)`, baseline, true);

// The installed schema itself declares the key, which is what makes the one-key
// delta a supported option rather than a guess.
check('the installed schema declares bundleMediaFramework', schemaText.includes('"bundleMediaFramework"'));
out(`info schema text mentions a default of false for the key: ${/bundleMediaFramework[\s\S]{0,400}?"default":\s*false/.test(schemaText)}`);

// The approved text is Option A's "After" block in the proposal. Comparing the
// tail of the file against that block verbatim ties this edit to the wording the
// owner approved rather than to my reading of it.
const proposal = readFileSync('docs/v2/state/P3.5-ENVIRONMENT-PROPOSAL.md', 'utf8');
const afterBlock = proposal.match(/After \(delta is exactly one key\):\s*```json\n([\s\S]*?)```/)?.[1] ?? '';
check('the proposal Option A "After" block was found', afterBlock.trim().length > 0);
check('the file tail is the approved Option A "After" block, verbatim', currentText.endsWith(afterBlock));

// --- D. the delta check discriminates (negative controls) --------------------
// Synthetic pairs only, in memory. If the diff reported one change for every
// input, the three assertions above would mean nothing.
const synthetic = (label, a, b, expect) => {
  const got = diff(a, b).map((c) => `${c.op} ${c.path}`);
  check(`delta check: ${label}`, JSON.stringify(got) === JSON.stringify(expect), got.join(' | ') || 'none');
};
const withTwoKeys = structuredClone(current);
withTwoKeys.bundle.extraSetting = true;
synthetic('an added second key is reported as a second change', baseline, withTwoKeys, [
  'added bundle.linux.appimage.bundleMediaFramework',
  'added bundle.extraSetting',
]);
synthetic('a changed existing value is reported as a replacement', baseline, { ...structuredClone(baseline), productName: 'Changed' }, [
  'replaced productName',
]);
const dropped = structuredClone(baseline);
delete dropped.version;
synthetic('a deleted key is reported as removed', baseline, dropped, ['removed version']);
synthetic('a wrong-typed value is still a replacement, not an addition', { x: 1 }, { x: '1' }, ['replaced x']);
synthetic('an identical document yields no changes at all', baseline, structuredClone(baseline), []);

out(failures === 0 ? 'ALL CHECKS PASS' : `${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;