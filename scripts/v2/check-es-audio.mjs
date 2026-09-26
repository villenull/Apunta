#!/usr/bin/env node
/**
 * The synthetic Spanish corpus's own checker (S4a.1, contract C-STT@1).
 *
 *   node scripts/v2/check-es-audio.mjs --audio <sandbox run folder>/audio-es
 *
 * `--audio` is a directory `generate-es-audio.mjs` wrote. Exit 0 and print the
 * population table when every assertion holds; exit 1 and print one `FAIL` line
 * per problem otherwise.
 *
 * ## What it is for
 *
 * S4a.2 points whisper.cpp at this corpus and reads numbers off it, so a
 * silently wrong corpus is worse than no corpus. The three ways it can be
 * wrong are the three things checked here:
 *
 *   1. **Format.** Every clip must be 16 kHz mono 16-bit PCM — the convention
 *     `e2e/fixtures/audio/README.md` set, and the rate the benchmark's real-time
 *     factor is measured against. One 22.05 kHz file left in the directory
 *      would halve the reported speed while looking like a pass.
 *   2. **Shape.** `reference.json` must have the pinned shape, the pinned
 *     generation constants, and legal values in all six fields of every clip —
 *     no invented `source`, no `category` from the wrong trap type, no
 *     `voice` on a silence clip, no text where there is none.
 *   3. **Coverage, both ways.** Every `*.wav` in the directory is listed and
 *     every listed file exists, so a removed clip fails (verification V3) and
 *     so does an extra one nobody scored. The population counts are re-derived
 *     and compared against the pinned split, and the 55 dictations are matched
 *     back to the corpus they came from, text included.
 *
 * The 10 non-speech clips are checked for content as well as format: the five
 * silence clips must be digital silence and the five tone clips must not be.
 * A tone arm that is accidentally silent is a benchmark that measures nothing.
 *
 * `--fixtures` points at the fixture root the corpus is matched against; it
 * defaults to `e2e/fixtures` in this repository. Nothing is written anywhere.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(fileURLToPath(new URL('../..', import.meta.url)));
const defaultFixtures = join(repoRoot, 'e2e', 'fixtures');

/* ------------------------------------------------------- the pinned expectations */

const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;
const VOICE = 'es_MX-ald-medium';
const NOISE_COLOUR = 'white';
const NOISE_SNR_DB = 20;
const FAST_RATE = 1.15;
const SOURCE_RATE = 22050;

/**
 * V1's precondition, read back out of `reference.json`: the vocoder noise
 * pinned to 0 and single-threaded inference. If any of these moves, two runs
 * stop being byte-identical, so the corpus's reproducibility claim is void.
 */
const NOISE_SCALE = 0;
const NOISE_W = 0;
const THREADS = 1;

const TRAP_TYPES = [
  'clean-control',
  'dose-and-number',
  'english-loanword',
  'experiencer',
  'invented-negation',
  'lost-negation',
  'past-vs-current-risk',
  'section-never-covered',
  'spoken-correction',
  'uncertainty',
  'unclear-speech',
];
const CLINICAL_CLASSES = ['drugs', 'doses', 'negation', 'numbers'];
const SOURCES = ['tuning', 'heldout', 'clinical', 'silence', 'tone'];
const SPEECH_SOURCES = ['tuning', 'heldout', 'clinical'];
const VARIANTS = ['clean', 'noise', 'fast'];
const CLIP_KEYS = ['file', 'text', 'voice', 'variant', 'source', 'category'];

/**
 * The flat file names the generator writes, as patterns. Checking the name as
 * well as the fields means a renamed or double-numbered clip is a failure, not
 * a row in `reference.json` nobody reads.
 */
const FILE_PATTERNS = {
  tuning: /^tuning-[a-z0-9]+(?:-[a-z0-9]+)*-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.(clean|noise|fast)\.wav$/u,
  heldout: /^heldout-[a-z0-9]+(?:-[a-z0-9]+)*-\d{2}-[a-z0-9]+(?:-[a-z0-9]+)*\.(clean|noise|fast)\.wav$/u,
  clinical: /^clinical-(drugs|doses|negation|numbers)-(0[1-9]|10)\.(clean|noise|fast)\.wav$/u,
  silence: /^silence-0[1-5]\.wav$/u,
  tone: /^tone-0[1-5]\.wav$/u,
};

/**
 * The population the card's inputs pin: 33 tuning and 22 held-out dictations
 * three variants each, 40 clinical sentences three variants each, and five
 * silence and five tone clips in the `clean` variant only.
 */
const EXPECTED_POPULATION = [
  ['tuning', 99],
  ['heldout', 66],
  ['clinical', 120],
  ['silence', 5],
  ['tone', 5],
  ['total', 295],
];

/** 20 dB of noise under a speech-active region, from two independent syntheses. */
const NOISE_SNR_TOLERANCE_DB = 3;

const problems = [];
function fail(message) {
  problems.push(message);
}

/* ------------------------------------------------------------------ the wav files */

/** Chunk walk over a RIFF/WAVE file: `{ format, dataOffset, dataBytes, chunks }`. */
function readWavHeader(path) {
  const bytes = readFileSync(path);
  if (bytes.length < 44)
    throw new Error(`${displayPath(path)}: ${String(bytes.length)} bytes is too short for a WAV header`);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${displayPath(path)}: not a RIFF/WAVE file`);
  }
  let offset = 12;
  let format = null;
  let data = null;
  const chunks = [];
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > bytes.length) {
      throw new Error(
        `${displayPath(path)}: chunk "${id}" runs ${String(body + size - bytes.length)} bytes past the end`,
      );
    }
    chunks.push(id);
    if (id === 'fmt ') {
      format = {
        audioFormat: bytes.readUInt16LE(body),
        channels: bytes.readUInt16LE(body + 2),
        sampleRate: bytes.readUInt32LE(body + 4),
        bitsPerSample: bytes.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = { offset: body, bytes: size };
    }
    offset = body + size + (size % 2);
  }
  if (format === null) throw new Error(`${displayPath(path)}: no "fmt " chunk`);
  if (data === null) throw new Error(`${displayPath(path)}: no "data" chunk`);
  if (offset !== bytes.length) {
    throw new Error(
      `${displayPath(path)}: ${String(bytes.length - offset)} trailing bytes after the last chunk — the file was rewritten with different tooling`,
    );
  }
  return { format, data, chunks };
}

/** Mean square and peak of a 16-bit PCM body, read straight out of the buffer. */
function measurePcm(bytes) {
  let total = 0;
  let peak = 0;
  const count = Math.floor(bytes.length / 2);
  for (let i = 0; i < count; i += 1) {
    const value = bytes.readInt16LE(i * 2);
    total += value * value;
    if (Math.abs(value) > peak) peak = Math.abs(value);
  }
  return { meanSquare: total / Math.max(1, count), peak, samples: count };
}

/**
 * How a path is named in a message: relative to the repository when it is
 * inside it, absolute otherwise. A sandbox path is not under the repository, and
 * a failure has to name the file it is about — a `../../../..` chain does not.
 */
function displayPath(path) {
  const relativePath = relative(repoRoot, path);
  return relativePath.startsWith('..') ? path : relativePath;
}

/** A path inside a checked output directory, named by its entry `file`. */
function fileRelative(root, path) {
  return relative(root, path).split('\\').join('/');
}

/* ------------------------------------------------------------------ the reference */

/** Assertion 2 — the pinned shape, the pinned constants, six legal fields a clip. */
function checkReference(reference) {
  if (reference === null || typeof reference !== 'object' || Array.isArray(reference)) {
    fail('reference.json: not a JSON object');
    return null;
  }
  for (const key of ['version', 'piper', 'synthesis', 'voices', 'clips']) {
    if (!(key in reference)) fail(`reference.json: no "${key}" block`);
  }
  if (reference.version !== 1)
    fail(`reference.json: version is ${JSON.stringify(reference.version)}, expected 1`);
  if (typeof reference.piper !== 'string' || reference.piper.trim() === '') {
    fail(`reference.json: "piper" must be the Piper version, found ${JSON.stringify(reference.piper)}`);
  }

  if (reference.voices !== undefined) {
    if (!Array.isArray(reference.voices) || reference.voices.length === 0) {
      fail('reference.json: "voices" must be a non-empty array');
    } else {
      for (const voice of reference.voices) {
        const keys = Object.keys(voice);
        if (keys.slice().sort().join(',') !== 'bytes,name,sha256') {
          fail(`reference.json: a voices[] entry has keys ${keys.join(', ')}, expected name, sha256, bytes`);
        }
        if (typeof voice.name !== 'string' || voice.name === '')
          fail('reference.json: a voices[] entry has no name');
        if (!/^[0-9a-f]{64}$/u.test(String(voice.sha256))) {
          fail(`reference.json: voice "${voice.name}" sha256 is not a 64-character hex digest`);
        }
        if (!Number.isInteger(voice.bytes) || voice.bytes <= 0) {
          fail(
            `reference.json: voice "${voice.name}" bytes is ${JSON.stringify(voice.bytes)}, expected a positive integer`,
          );
        }
      }
    }
  }

  if (reference.synthesis !== undefined) {
    const s = reference.synthesis;
    if (s.noise_scale !== NOISE_SCALE) {
      fail(
        `reference.json: synthesis.noise_scale is ${JSON.stringify(s.noise_scale)}, expected ${String(NOISE_SCALE)} (V1's precondition)`,
      );
    }
    if (s.noise_w !== NOISE_W) {
      fail(
        `reference.json: synthesis.noise_w is ${JSON.stringify(s.noise_w)}, expected ${String(NOISE_W)} (V1's precondition)`,
      );
    }
    if (s.threads !== THREADS) {
      fail(
        `reference.json: synthesis.threads is ${JSON.stringify(s.threads)}, expected ${String(THREADS)} (V1's precondition)`,
      );
    }
    if (typeof s.threadSetting !== 'string' || s.threadSetting.trim() === '') {
      fail('reference.json: synthesis.threadSetting must say how the thread limit was applied');
    }
    if (!Number.isInteger(s.seed))
      fail(`reference.json: synthesis.seed is ${JSON.stringify(s.seed)}, expected an integer`);
    if (s.noiseColour !== NOISE_COLOUR) {
      fail(
        `reference.json: synthesis.noiseColour is ${JSON.stringify(s.noiseColour)}, expected "${NOISE_COLOUR}"`,
      );
    }
    if (s.noiseSnrDb !== NOISE_SNR_DB) {
      fail(
        `reference.json: synthesis.noiseSnrDb is ${JSON.stringify(s.noiseSnrDb)}, expected ${String(NOISE_SNR_DB)}`,
      );
    }
    if (s.fastRate !== FAST_RATE) {
      fail(
        `reference.json: synthesis.fastRate is ${JSON.stringify(s.fastRate)}, expected ${String(FAST_RATE)}`,
      );
    }
    if (typeof s.length_scale !== 'number' || Math.abs(s.length_scale - 1 / FAST_RATE) > 1e-9) {
      fail(
        `reference.json: synthesis.length_scale is ${JSON.stringify(s.length_scale)}, expected 1/${String(FAST_RATE)}`,
      );
    }
    if (s.sourceSampleRate !== SOURCE_RATE) {
      fail(
        `reference.json: synthesis.sourceSampleRate is ${JSON.stringify(s.sourceSampleRate)}, expected ${String(SOURCE_RATE)}`,
      );
    }
    if (s.sampleRate !== SAMPLE_RATE)
      fail(
        `reference.json: synthesis.sampleRate is ${JSON.stringify(s.sampleRate)}, expected ${String(SAMPLE_RATE)}`,
      );
    if (s.channels !== CHANNELS)
      fail(
        `reference.json: synthesis.channels is ${JSON.stringify(s.channels)}, expected ${String(CHANNELS)}`,
      );
    if (s.bitsPerSample !== BITS_PER_SAMPLE) {
      fail(
        `reference.json: synthesis.bitsPerSample is ${JSON.stringify(s.bitsPerSample)}, expected ${String(BITS_PER_SAMPLE)}`,
      );
    }
  }

  if (!Array.isArray(reference.clips)) {
    fail('reference.json: "clips" must be an array');
    return null;
  }

  const seen = new Set();
  for (const clip of reference.clips) {
    if (clip === null || typeof clip !== 'object' || Array.isArray(clip)) {
      fail('reference.json: a clips[] entry is not an object');
      continue;
    }
    const where = `reference.json: ${String(clip.file)}`;
    const keys = Object.keys(clip);
    if (keys.slice().sort().join(',') !== CLIP_KEYS.slice().sort().join(',')) {
      fail(`${where}: entry keys are ${keys.join(', ')}, expected ${CLIP_KEYS.join(', ')}`);
      continue;
    }
    if (typeof clip.file !== 'string' || clip.file === '') {
      fail('reference.json: a clips[] entry has no file');
      continue;
    }
    if (clip.file.startsWith('/') || clip.file.split('/').includes('..')) {
      fail(`${where}: "file" must be relative to the output directory`);
    }
    if (seen.has(clip.file)) fail(`${where}: listed twice`);
    seen.add(clip.file);

    if (!SOURCES.includes(clip.source)) {
      fail(`${where}: source "${clip.source}" is not one of ${SOURCES.join(', ')}`);
      continue;
    }
    if (!FILE_PATTERNS[clip.source].test(clip.file)) {
      fail(
        `${where}: file name does not match the ${clip.source} pattern ${FILE_PATTERNS[clip.source].source}`,
      );
    }
    const speech = SPEECH_SOURCES.includes(clip.source);
    if (speech) {
      if (clip.voice !== VOICE) fail(`${where}: voice is ${JSON.stringify(clip.voice)}, expected "${VOICE}"`);
      if (typeof clip.text !== 'string' || clip.text.trim() === '') {
        fail(`${where}: text is empty, but a ${clip.source} clip is spoken`);
      }
      if (!VARIANTS.includes(clip.variant)) {
        fail(`${where}: variant "${clip.variant}" is not one of ${VARIANTS.join(', ')}`);
      }
      const allowed = clip.source === 'clinical' ? CLINICAL_CLASSES : TRAP_TYPES;
      if (!allowed.includes(clip.category)) {
        fail(
          `${where}: category "${clip.category}" is not one of the ${String(allowed.length)} for source ${clip.source}`,
        );
      }
    } else {
      if (clip.voice !== 'none')
        fail(`${where}: voice is ${JSON.stringify(clip.voice)}, expected "none" for a non-speech clip`);
      if (clip.text !== '') fail(`${where}: text is not "" for a non-speech clip`);
      if (clip.variant !== 'clean') {
        fail(
          `${where}: variant "${clip.variant}", but the 10 non-speech clips exist in the clean variant only`,
        );
      }
      if (clip.category !== clip.source) {
        fail(`${where}: category "${clip.category}" does not match source "${clip.source}"`);
      }
    }
  }
  return reference;
}

/** The flat output name for a speech clip, re-derived from the corpus. */
function expectedSpeechFile(source, category, stem, variant) {
  return `${source}-${category}-${stem}.${variant}.wav`;
}

/**
 * The 95 dictations and sentences the corpus must contain, matched back to
 * their sources. The `text` is compared too: a transcript that lost its line
 * breaks is not the same reference text the gold expectations were written
 * against, and nothing downstream would notice.
 */
function corpusInventory(fixtures) {
  const rows = [];
  for (const split of ['tuning', 'heldout']) {
    for (const trap of TRAP_TYPES) {
      const dir = join(fixtures, 'eval-es', split, trap);
      if (!existsSync(dir)) {
        fail(`${displayPath(dir)}: missing — the ${split} corpus split must be present to check against`);
        continue;
      }
      for (const name of readdirSync(dir)
        .filter((entry) => entry.endsWith('.txt'))
        .sort()) {
        const stem = name.replace(/\.txt$/u, '');
        const text = readFileSync(join(dir, name), 'utf8').replace(/\s+/gu, ' ').trim();
        for (const variant of VARIANTS) {
          rows.push({
            file: expectedSpeechFile(split, trap, stem, variant),
            text,
            source: split,
            category: trap,
            variant,
          });
        }
      }
    }
  }
  return rows;
}

/* ----------------------------------------------------------------------- the run */

function usage() {
  return [
    'Usage: node scripts/v2/check-es-audio.mjs --audio <dir> [--fixtures <dir>] [--help]',
    '',
    '  --audio <dir>     a directory generate-es-audio.mjs wrote',
    '  --fixtures <dir>  root holding eval-es/, for the corpus cross-check.',
    '                    Default: e2e/fixtures in this repository.',
    '  --help            this text',
    '',
    'Exit 0 and print the population table when every assertion holds; exit 1 and',
    'print one line per failure otherwise.',
  ].join('\n');
}

function main(argv) {
  let audio = null;
  let fixtures = defaultFixtures;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      process.stdout.write(`${usage()}\n`);
      return 0;
    }
    if (arg === '--audio') {
      if (argv[i + 1] === undefined) {
        process.stderr.write('check-es-audio: --audio needs a directory\n');
        return 1;
      }
      audio = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    if (arg === '--fixtures') {
      if (argv[i + 1] === undefined) {
        process.stderr.write('check-es-audio: --fixtures needs a directory\n');
        return 1;
      }
      fixtures = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    process.stderr.write(`check-es-audio: unknown argument ${arg}\n\n${usage()}\n`);
    return 1;
  }
  if (audio === null) {
    process.stderr.write(`check-es-audio: --audio is required\n\n${usage()}\n`);
    return 1;
  }
  if (!existsSync(audio) || !statSync(audio).isDirectory()) {
    process.stderr.write(`FAIL ${displayPath(audio)}: not a directory\n\ncheck-es-audio: 1 problem(s)\n`);
    return 1;
  }

  const referencePath = join(audio, 'reference.json');
  if (!existsSync(referencePath)) {
    process.stderr.write(
      `FAIL ${displayPath(referencePath)}: missing — the generator writes one reference.json per output directory\n` +
        '\ncheck-es-audio: 1 problem(s)\n',
    );
    return 1;
  }
  let reference;
  try {
    reference = JSON.parse(readFileSync(referencePath, 'utf8'));
  } catch (error) {
    process.stderr.write(
      `FAIL ${displayPath(referencePath)}: does not parse: ${String(error)}\n\ncheck-es-audio: 1 problem(s)\n`,
    );
    return 1;
  }
  if (checkReference(reference) === null) {
    for (const problem of problems) process.stderr.write(`FAIL ${problem}\n`);
    process.stderr.write(`\ncheck-es-audio: ${String(problems.length)} problem(s)\n`);
    return 1;
  }

  /* ------------------------------------------------- every file on disk, every clip */
  const listed = new Map();
  for (const clip of reference.clips) listed.set(clip.file, clip);

  const onDisk = readdirSync(audio).sort();
  const wavFiles = onDisk.filter((name) => name.toLowerCase().endsWith('.wav'));
  const unexpected = onDisk.filter(
    (name) => !name.toLowerCase().endsWith('.wav') && name !== 'reference.json',
  );
  for (const name of unexpected)
    fail(`${name}: in the output directory but neither a .wav nor reference.json`);

  const totals = new Map();
  const perCategory = new Map();
  const snr = [];

  for (const file of wavFiles) {
    const where = fileRelative(audio, join(audio, file));
    if (!listed.has(file)) {
      fail(`${where}: present in the output directory but absent from reference.json`);
      continue;
    }
    const clip = listed.get(file);

    // Assertion 1 — format, on every clip.
    let header;
    try {
      header = readWavHeader(join(audio, file));
    } catch (error) {
      fail(error instanceof Error ? error.message : String(error));
      continue;
    }
    if (header.format.audioFormat !== 1) {
      fail(`${where}: audio format ${String(header.format.audioFormat)}, expected 1 (uncompressed PCM)`);
    }
    if (header.format.channels !== CHANNELS)
      fail(`${where}: ${String(header.format.channels)} channels, expected 1`);
    if (header.format.sampleRate !== SAMPLE_RATE) {
      fail(`${where}: ${String(header.format.sampleRate)} Hz, expected ${String(SAMPLE_RATE)}`);
    }
    if (header.format.bitsPerSample !== BITS_PER_SAMPLE) {
      fail(`${where}: ${String(header.format.bitsPerSample)}-bit, expected ${String(BITS_PER_SAMPLE)}`);
    }
    if (header.data.bytes === 0) fail(`${where}: the data chunk is empty`);
    if (header.data.bytes % 2 !== 0)
      fail(`${where}: ${String(header.data.bytes)} data bytes is not whole 16-bit samples`);

    totals.set(clip.source, (totals.get(clip.source) ?? 0) + 1);
    perCategory.set(clip.category, (perCategory.get(clip.category) ?? 0) + 1);

    const measured = measurePcm(
      readFileSync(join(audio, file)).subarray(header.data.offset, header.data.offset + header.data.bytes),
    );

    if (clip.source === 'silence' && measured.peak !== 0) {
      fail(
        `${where}: a silence clip has a peak sample of ${String(measured.peak)}; it is not digital silence`,
      );
    }
    if (clip.source === 'tone') {
      if (measured.peak === 0)
        fail(`${where}: a tone clip is silent, so the negative control measures nothing`);
      const seconds = measured.samples / SAMPLE_RATE;
      if (seconds < 0.5) fail(`${where}: ${seconds.toFixed(3)} s is too short to be a tone clip`);
    }

    // The noise arm, coarsely: the added noise is 20 dB under a clip of the same
    // text and the same `length_scale`, so their RMS values should be close
    // even though the two Piper runs are independent. It cannot measure the SNR
    // exactly — see the generator, which does, from the pair it holds.
    if (clip.variant === 'noise') {
      const cleanName = file.replace(/\.noise\.wav$/u, '.clean.wav');
      if (!listed.has(cleanName)) {
        fail(`${where}: a noise clip with no clean counterpart ${cleanName}`);
      } else {
        const cleanHeader = readWavHeader(join(audio, cleanName));
        const cleanMeasured = measurePcm(
          readFileSync(join(audio, cleanName)).subarray(
            cleanHeader.data.offset,
            cleanHeader.data.offset + cleanHeader.data.bytes,
          ),
        );
        const ratio = 10 * Math.log10(measured.meanSquare / Math.max(1e-9, cleanMeasured.meanSquare));
        if (Math.abs(ratio) > NOISE_SNR_TOLERANCE_DB) {
          fail(
            `${where}: RMS is ${ratio >= 0 ? '+' : ''}${ratio.toFixed(2)} dB against ${cleanName}, ` +
              `outside the +/-${String(NOISE_SNR_TOLERANCE_DB)} dB band a ${String(NOISE_SNR_DB)} dB SNR noise arm should land in`,
          );
        }
        snr.push(ratio);
      }
    }
  }

  // Assertion 3, one way: every clip the reference lists is on disk.
  for (const file of listed.keys()) {
    if (!wavFiles.includes(file))
      fail(`${file}: listed in reference.json but missing from the output directory`);
  }

  /* ------------------------------------------------- the population and the corpus */
  for (const [source, expected] of EXPECTED_POPULATION) {
    if (source === 'total') {
      const total = [...totals.values()].reduce((a, b) => a + b, 0);
      if (total !== expected) fail(`${String(total)} clips on disk, expected ${String(expected)}`);
      continue;
    }
    const actual = totals.get(source) ?? 0;
    if (actual !== expected) fail(`${String(actual)} ${source} clips, expected ${String(expected)}`);
  }
  for (const trap of TRAP_TYPES) {
    if (!perCategory.has(trap)) fail(`no clip carries category "${trap}"`);
  }
  for (const category of CLINICAL_CLASSES) {
    const found = (reference.clips ?? []).filter((clip) => clip.category === category).length;
    if (found !== 30)
      fail(`${String(found)} clips carry category "${category}", expected 30 (10 sentences x 3 variants)`);
  }

  const inventory = new Map(corpusInventory(fixtures).map((row) => [row.file, row]));
  for (const [file, expected] of inventory) {
    const clip = listed.get(file);
    if (clip === undefined) {
      fail(`${file}: the corpus dictation this clip comes from is not in the output directory`);
      continue;
    }
    if (clip.text !== expected.text) {
      fail(
        `${file}: text does not match ${expected.source}/${expected.category} — ` +
          `"${String(clip.text).slice(0, 48)}" against "${String(expected.text).slice(0, 48)}"`,
      );
    }
  }
  // The other direction, for the 55 dictations only: the clinical sentences live
  // as a literal array in the generator, so re-deriving them here would make a
  // second source of truth to drift from. Their 30 clips per class, their file
  // names and their six fields are checked above instead.
  for (const file of listed.keys()) {
    const source = file.split('-')[0];
    if ((source === 'tuning' || source === 'heldout') && !inventory.has(file)) {
      fail(`${file}: a ${source} clip that matches no dictation in the corpus`);
    }
  }

  /* ------------------------------------------------------------------- the table */
  const out = [];
  const say = (line = '') => out.push(line);
  const width = 22;
  const rule = '-'.repeat(66);

  say();
  say('Synthetic Spanish audio — corpus check');
  say();
  say(`audio:      ${displayPath(audio)}`);
  say(`fixtures:   ${fixtures === defaultFixtures ? 'e2e/fixtures (shipped)' : displayPath(fixtures)}`);
  say(`piper:      ${String(reference.piper)}`);
  const synthesis = reference.synthesis ?? {};
  say(
    `synthesis:  ${String(synthesis.sampleRate ?? '?')} Hz mono ${String(synthesis.bitsPerSample ?? '?')}-bit, ` +
      `seed ${String(synthesis.seed ?? '?')}, ${String(synthesis.noiseColour ?? '?')} noise at ${String(synthesis.noiseSnrDb ?? '?')} dB SNR, ` +
      `length_scale ${String(synthesis.length_scale ?? '?')}`,
  );
  say(
    `determinism: noise_scale ${String(synthesis.noise_scale ?? '?')}, noise_w ${String(synthesis.noise_w ?? '?')}, ` +
      `${String(synthesis.threadSetting ?? `threads ${String(synthesis.threads ?? '?')}`)}`,
  );
  for (const voice of reference.voices ?? []) {
    say(`voice:      ${String(voice.name)}  sha256 ${String(voice.sha256)}  ${String(voice.bytes)} bytes`);
  }
  say();
  say(`${'source'.padEnd(width)}${'clips'.padStart(10)}  ${'expected'.padStart(8)}`);
  say(rule);
  for (const [source, expected] of EXPECTED_POPULATION) {
    const actual =
      source === 'total' ? [...totals.values()].reduce((a, b) => a + b, 0) : (totals.get(source) ?? 0);
    say(`${source.padEnd(width)}${String(actual).padStart(10)}  ${String(expected).padStart(8)}`);
  }
  say(rule);
  const byVariant = new Map();
  for (const clip of reference.clips) byVariant.set(clip.variant, (byVariant.get(clip.variant) ?? 0) + 1);
  say(
    `variants:   ${VARIANTS.map((variant) => `${variant} ${String(byVariant.get(variant) ?? 0)}`).join(', ')}`,
  );
  say(`categories: ${String(perCategory.size)} distinct`);
  if (snr.length > 0) {
    const mean = snr.reduce((a, b) => a + b, 0) / snr.length;
    say(
      `noise arm:  ${String(snr.length)} clips, RMS ${Math.min(...snr).toFixed(2)}..${Math.max(...snr).toFixed(2)} dB ` +
        `(mean ${mean.toFixed(2)} dB) against their clean counterparts`,
    );
  }
  say();

  process.stdout.write(`${out.join('\n')}\n`);
  if (problems.length > 0) {
    for (const problem of problems) process.stderr.write(`FAIL ${problem}\n`);
    process.stderr.write(`\ncheck-es-audio: ${String(problems.length)} problem(s)\n`);
    return 1;
  }
  return 0;
}

process.exitCode = main(process.argv.slice(2));
