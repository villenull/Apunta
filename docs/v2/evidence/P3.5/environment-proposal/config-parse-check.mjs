// Synthetic config check for the P3.5 environment proposal.
// Reads the shipped configs and the locally installed CLI schema, merges the
// proposed one-key addition, and validates with ajv. No build, no app, no
// network, no tauri invocation, nothing written outside stdout.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const out = (line) => process.stdout.write(line + '\n');

const schemaPath = 'node_modules/@tauri-apps/cli/config.schema.json';
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const Ajv = require('ajv');
const ajv = new Ajv({ strict: false, allErrors: true });
// The Tauri schema uses numeric formats ajv does not ship. They are declared as
// finite numbers here so validation can run at all; nothing in this proposal
// turns on a numeric format.
const formats = new Set();
JSON.stringify(schema, (k, v) => {
  if (k === 'format' && typeof v === 'string') formats.add(v);
  return v;
});
for (const name of formats) ajv.addFormat(name, { type: 'number', validate: Number.isFinite });
const validate = ajv.compile(schema);

const base = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const test = JSON.parse(readFileSync('src-tauri/tauri.test.conf.json', 'utf8'));

const results = [];
const check = (label, config) => {
  const ok = validate(config);
  results.push({ label, ok, errors: ok ? [] : validate.errors.map((e) => `${e.instancePath || '/'} ${e.message}`) });
};

check('as shipped: tauri.conf.json', base);
check('as shipped: tauri.test.conf.json', test);

// Proposal option A: one key in the shipping config.
const a = structuredClone(base);
a.bundle.linux = { appimage: { bundleMediaFramework: true } };
check('proposed: tauri.conf.json + bundle.linux.appimage.bundleMediaFramework=true', a);

// Proposal option B: same key in the test-only overlay.
const b = structuredClone(test);
b.bundle = { linux: { appimage: { bundleMediaFramework: true } } };
check('proposed: tauri.test.conf.json + same key', b);

// A wrong shape, to prove the schema actually rejects rather than passing all.
const c = structuredClone(base);
c.bundle.linux = { appimage: { bundleMediaFramework: 'true' } };
check('control: string value (must be invalid)', c);

const d = structuredClone(base);
d.bundle.linux = { appimage: { bundleMediaFramework: true, unknownKey: 1 } };
check('control: extra key in appimage (must be invalid)', d);

for (const r of results) {
  out(`${r.ok ? 'VALID  ' : 'INVALID'} ${r.label}`);
  for (const e of r.errors) out(`    ${e}`);
}

// The exact merged objects, so the before/after in the proposal is checkable.
out('--- merged shipping config, bundle object ---');
out(JSON.stringify(a.bundle, null, 2));
process.exitCode = results.every((r) => r.ok === !r.label.startsWith('control:')) ? 0 : 1;