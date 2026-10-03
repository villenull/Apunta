// Pure verification for the P3.5 environment-proposal repair, second family.
//
// This file is a byte-for-byte copy of
// `../environment-proposal-repair/verify.mjs` (sha256
// 2c6d0c0c87e289ee0c07025376e536fd8d37a40cbe6024e3c97e1561a26abdee) with exactly
// one change: the `step 0 prereq read` snippet is fail-closed (IR2-01). Every
// other check is unchanged from the first family, which is left intact.
//
// process.stdout.write only: docs/v2/evidence is linted with `no-console` on.
// No app, server, build, database, model, audio, microphone, input, display,
// network, download, install or port 7717 is used. The only subprocess is
// `bash -n` on a string, which parses shell syntax and executes nothing.
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const out = (line) => process.stdout.write(line + '\n');
let failures = 0;
const check = (label, ok, detail = '') => {
  out(`${ok ? 'PASS' : 'FAIL'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures += 1;
};

out(`node ${process.versions.node}`);

// ---------------------------------------------------------------------------
// 1. The proposed config key validates in both variants; negative controls are
//    rejected; each variant's delta is exactly one key.
// ---------------------------------------------------------------------------
const schemaPath = 'node_modules/@tauri-apps/cli/config.schema.json';
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
const Ajv = require('ajv');
const ajv = new Ajv({ strict: false, allErrors: true });
const formats = new Set();
JSON.stringify(schema, (k, v) => {
  if (k === 'format' && typeof v === 'string') formats.add(v);
  return v;
});
for (const name of formats) ajv.addFormat(name, { type: 'number', validate: Number.isFinite });
const validate = ajv.compile(schema);

const base = JSON.parse(readFileSync('src-tauri/tauri.conf.json', 'utf8'));
const test = JSON.parse(readFileSync('src-tauri/tauri.test.conf.json', 'utf8'));

const variantA = structuredClone(base);
variantA.bundle.linux = { appimage: { bundleMediaFramework: true } };
const variantB = structuredClone(test);
variantB.bundle = { linux: { appimage: { bundleMediaFramework: true } } };

check('option A (shipping config) validates', validate(variantA));
check('option B (test overlay) validates', validate(variantB));

const negString = structuredClone(base);
negString.bundle.linux = { appimage: { bundleMediaFramework: 'true' } };
check('negative control: string value rejected', !validate(negString));
const negExtra = structuredClone(base);
negExtra.bundle.linux = { appimage: { bundleMediaFramework: true, extra: 1 } };
check('negative control: extra key rejected', !validate(negExtra));

check(
  'option A delta is exactly the one key',
  JSON.stringify(variantA.bundle.linux) === '{"appimage":{"bundleMediaFramework":true}}',
);
check(
  'option B delta is exactly the one key',
  JSON.stringify(variantB.bundle) === '{"linux":{"appimage":{"bundleMediaFramework":true}}}',
);
check('base bundle has no linux key today', base.bundle.linux === undefined);
check('test overlay has no bundle key today', test.bundle === undefined);

// ---------------------------------------------------------------------------
// 2. `appimage.files` semantics, from the installed `tauri-utils` primary.
//    The struct is read; the direction is reported, not guessed.
// ---------------------------------------------------------------------------
const registryRoot = join(homedir(), '.cargo', 'registry', 'src');
let utilConfigPath = null;
if (existsSync(registryRoot)) {
  for (const indexDir of readdirSync(registryRoot)) {
    const full = join(registryRoot, indexDir);
    for (const crate of readdirSync(full)) {
      if (crate.startsWith('tauri-utils-')) {
        const candidate = join(full, crate, 'src', 'config.rs');
        if (existsSync(candidate)) utilConfigPath = candidate;
      }
    }
  }
}
check('installed tauri-utils config.rs found', utilConfigPath !== null, utilConfigPath ?? '');
if (utilConfigPath) {
  const src = readFileSync(utilConfigPath, 'utf8');
  const block = src.slice(src.indexOf('pub struct AppImageConfig'));
  const end = block.indexOf('\n}');
  const struct = end >= 0 ? block.slice(0, end + 2) : block;
  out('--- installed AppImageConfig ---');
  out(struct.trimEnd());
  check('files field is HashMap<PathBuf, PathBuf>', struct.includes('files: HashMap<PathBuf, PathBuf>'));
  check('files doc says "files to include"', struct.includes('The files to include in the Appimage Binary'));
  const directional = /\b(target|source|destination|destination path|source path)\b/i.test(struct);
  check(
    'installed primary states no target/source direction for appimage.files',
    !directional,
    directional ? 'directional wording present' : 'no direction in the installed primary',
  );
}

// ---------------------------------------------------------------------------
// 3. The cached plugin script supports `GSTREAMER_HELPERS_DIR`.
// ---------------------------------------------------------------------------
const pluginScript = join(homedir(), '.cache', 'tauri', 'linuxdeploy-plugin-gstreamer.sh');
check('cached linuxdeploy-plugin-gstreamer.sh present', existsSync(pluginScript), pluginScript);
if (existsSync(pluginScript)) {
  const lines = readFileSync(pluginScript, 'utf8').split('\n');
  check('help line 23 documents GSTREAMER_HELPERS_DIR', lines[22].includes('GSTREAMER_HELPERS_DIR'));
  const selection = lines.findIndex((l) => l.includes('if [ "$GSTREAMER_HELPERS_DIR" != "" ]'));
  check(
    'selection branch reads GSTREAMER_HELPERS_DIR',
    selection >= 0 && lines[selection + 1].includes('helpers_dir="${GSTREAMER_HELPERS_DIR}"'),
    `line ${selection + 1}`,
  );
  const helpersTarget = lines.findIndex((l) => l.startsWith('helpers_target_dir='));
  const hookScanner = lines.findIndex((l) => l.includes('GST_PLUGIN_SCANNER_1_0='));
  check('helpers_target_dir line found', helpersTarget >= 0, `line ${helpersTarget + 1}`);
  check('hook scanner line found', hookScanner >= 0, `line ${hookScanner + 1}`);
  if (helpersTarget >= 0 && hookScanner >= 0) {
    // The script sets GSTREAMER_VERSION="${GSTREAMER_VERSION:-1.0}" (line 72);
    // resolve it so the target dir can be compared with the literal hook path.
    const targetDir = lines[helpersTarget]
      .split('"$APPDIR"')[1]
      .replace(/"/g, '')
      .replaceAll('$GSTREAMER_VERSION', '1.0');
    const hookPath = lines[hookScanner].split('${APPDIR}')[1].replace(/"/g, '');
    check(
      'hook scanner path sits under helpers_target_dir',
      hookPath.startsWith(targetDir),
      `${hookPath} under ${targetDir}`,
    );
    out(`scanner target: $APPDIR${targetDir}/gst-plugin-scanner`);
  }
}

// ---------------------------------------------------------------------------
// 4. The host scanner exists and is executable (fixed-path compare).
// ---------------------------------------------------------------------------
const hostScanner = '/usr/lib/gstreamer-1.0/gst-plugin-scanner';
check('host scanner exists', existsSync(hostScanner), hostScanner);
if (existsSync(hostScanner)) {
  const mode = statSync(hostScanner).mode;
  check('host scanner is executable', (mode & 0o111) !== 0, `mode ${(mode & 0o777).toString(8)}`);
}

// ---------------------------------------------------------------------------
// 5. Shell syntax of the prepared commands, parsed but never executed.
// ---------------------------------------------------------------------------
const snippets = {
  // IR2-01: fail-closed. Every check asserts its own exit and stops the read at
  // the first failure. The prepared form was `command -v … || echo …` and
  // `… && echo … || echo …`, which is always exit 0 and so printed failures and
  // went on to step 1. The scanner is asserted with `test -x`, not `test -f`.
  'step 0 prereq read': `set -e
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"
node --version
command -v patchelf >/dev/null 2>&1 || { echo "FAIL: patchelf absent"; exit 1; }
for e in appsink autoaudiosrc alsasrc pulsesrc; do
  gst-inspect-1.0 "$e" >/dev/null 2>&1 || { echo "FAIL: $e not visible"; exit 1; }
  echo "OK $e"
done
test -x /usr/lib/gstreamer-1.0/gst-plugin-scanner || { echo "FAIL: scanner missing or not executable"; exit 1; }
echo "scanner present"
echo "STEP-0 PASS: prerequisites satisfied"`,
  'step 1 scanner prep + rebuild env': `set -e
mkdir -p build/p3.5-env-repair/gst-helpers
cp /usr/lib/gstreamer-1.0/gst-plugin-scanner build/p3.5-env-repair/gst-helpers/
export GSTREAMER_HELPERS_DIR="$PWD/build/p3.5-env-repair/gst-helpers"
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$HOME/.cargo/bin:$PATH"
npm run tauri:build:test`,
  'step 2 four separate dry inspections': `set -e
A="src-tauri/target/release/bundle/appimage/Apunta (test).AppDir"
S="$A/usr/lib/gstreamer1.0/gstreamer-1.0/gst-plugin-scanner"
test -x "$S" || { echo "FAIL: scanner not bundled"; exit 1; }
for e in appsink autoaudiosrc alsasrc pulsesrc; do
  R="build/p3.5-env-repair/registry-$e.bin"
  rm -f "$R"
  GST_REGISTRY="$R" LD_LIBRARY_PATH="$A/usr/lib" \\
    GST_PLUGIN_SYSTEM_PATH_1_0="$A/usr/lib/gstreamer-1.0" \\
    GST_PLUGIN_PATH_1_0="$A/usr/lib/gstreamer-1.0" \\
    GST_REGISTRY_REUSE_PLUGIN_SCANNER=no \\
    GST_PLUGIN_SCANNER_1_0="$S" \\
    gst-inspect-1.0 "$e" >/dev/null 2>&1 || { echo "FAIL: $e not visible"; exit 1; }
  echo "OK $e"
done`,
  'V0 default-source fail-closed read': `set -e
DEF=$(pactl get-default-source) || { echo "FAIL: pactl get-default-source exited nonzero"; exit 1; }
test -n "$DEF" || { echo "FAIL: pactl get-default-source printed nothing"; exit 1; }
printf '%s\\n' "default source: $DEF"
test "$DEF" != "apunta_p35_mic" || { echo "FAIL: the default source is this run's virtual source"; exit 1; }`,
  'V1 30s fixture loop + ffprobe': `set -e
A="\${APUNTA_DATA_DIR%/}/../audio-en"
ffmpeg -hide_banner -nostdin -loglevel error -y -stream_loop -1 -i "$A/raw-22050.wav" -t 30 \\
  -ar 16000 -ac 1 -c:a pcm_s16le -map_metadata -1 -fflags +bitexact -flags:a +bitexact "$A/dictation-30s.wav"
ffprobe -v error -show_entries format=duration -of default=nw=1:nk=1 "$A/dictation-30s.wav"`,
};
for (const [name, snippet] of Object.entries(snippets)) {
  const r = spawnSync('bash', ['-n'], { input: snippet, encoding: 'utf8' });
  check(`shell syntax: ${name}`, r.status === 0, r.status === 0 ? 'bash -n exit 0' : (r.stderr ?? '').trim());
}

out(failures === 0 ? 'ALL CHECKS PASS' : `${failures} CHECK(S) FAILED`);
process.exitCode = failures === 0 ? 0 : 1;
