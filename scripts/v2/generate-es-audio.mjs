#!/usr/bin/env node
/**
 * Synthetic Spanish dictation generator (S4a.1, contract C-STT@1).
 *
 *   PIPER_BIN=/home/you/.local/share/apunta-piper/venv/bin/piper \
 *   PIPER_MODEL=/home/you/.local/share/apunta-piper/voices/es_MX-ald-medium.onnx \
 *   node scripts/v2/generate-es-audio.mjs --out <sandbox run folder>/audio-es
 *
 * `--out` takes a directory inside a sandbox run folder — the one from
 * `node scripts/v2/sandbox.mjs env --port 7807`, i.e. `$(dirname
 * "$APUNTA_DATA_DIR")/audio-es`. The script refuses an output path inside this
 * repository and refuses a path directly under `/tmp/apunta-v2`, because
 * generated audio is never committed (L-POLICY row 4: no voice's model card
 * permits redistributing generated audio — see `docs/research/es-mx-speech.md`
 * §5.4) and `/tmp/apunta-v2` is the sandbox's own namespace.
 *
 * ## What it produces
 *
 * 295 clips and one `reference.json`, all flat in the output directory:
 *
 * | Population | Clips | `source` | `category` |
 * | --- | --- | --- | --- |
 * | 33 tuning dictations x 3 variants | 99 | `tuning` | the trap type |
 * | 22 held-out dictations x 3 variants | 66 | `heldout` | the trap type |
 * | 40 clinical sentences x 3 variants | 120 | `clinical` | `drugs`/`doses`/`negation`/`numbers` |
 * | 5 silence + 5 tone, `clean` only | 10 | `silence`/`tone` | `silence`/`tone` |
 *
 * One voice for the whole corpus — `es_MX-ald-medium`, 22,050 Hz — and every
 * clip 16,000 Hz mono 16-bit PCM. The 5 silence and 5 tone clips are written
 * directly at 16,000 Hz; everything else is resampled with `ffmpeg`.
 *
 * The three variants are `clean` (Piper as found), `noise` (room noise at
 * 20 dB SNR, white, seeded per clip) and `fast` (`length_scale` 1/1.15, i.e.
 * 1.15x faster). `noise` is **derived from the `clean` synthesis of the same
 * run** rather than synthesised again, so the noise arm differs from its
 * control only by the noise and one third of the Piper work is saved.
 *
 * Every constant that decides a sample is written into `reference.json` (the
 * seed, the noise colour, the `length_scale`, the two pinned vocoder-noise
 * values, the thread setting, the sample rates, the Piper version), so two runs
 * of this script on one machine are byte-identical file by file.
 * `check-es-audio.mjs` asserts the shape and the constants.
 *
 * ## Why the synthesis is pinned
 *
 * Piper's VITS draws its vocoder noise inside the ONNX graph and piper-tts
 * exposes no seed, so at the voice's own `noise_scale` 0.667 / `noise_w` 0.8 no
 * two syntheses of one sentence are alike. Every call therefore passes
 * `--noise_scale 0 --noise_w 0` and runs with `OMP_NUM_THREADS=1` (plus
 * `--num_threads 1` on a CLI that has it, which 1.8.0 does not). The cost is
 * flatter prosody; the corpus is synthetic ASR material, and both values are in
 * `reference.json` so the trade can be revisited.
 *
 * Piper and `ffmpeg` are development-only. Nothing here is imported by
 * `server/`, `web/` or `shared/`, and no runtime path touches them.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/* ------------------------------------------------------- the pinned constants */

/** The one voice for the whole corpus (`es-mx-speech.md` §5.4, A10). */
const VOICE = 'es_MX-ald-medium';
/** Every es_MX voice in rhasspy/piper-voices is 22,050 Hz (model card §Samplerate). */
const SOURCE_RATE = 22050;
/** The benchmark's convention, as in `e2e/fixtures/audio/README.md`. */
const SAMPLE_RATE = 16000;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/** Room noise: 20 dB SNR, white, one seed constant mixed per clip. */
const NOISE_SNR_DB = 20;
const NOISE_COLOUR = 'white';
/**
 * The seed constant. Any integer works; the value is recorded in
 * `reference.json`, and a per-clip seed is derived from it (see
 * `perClipSeed`), so it is the only entropy the corpus has.
 */
const SEED = 20260926;
/** Speech-active region for the SNR reference: |s| at or above peak - 40 dBFS. */
const ACTIVE_GATE_DBFS = -40;

/** `fast` is 1.15x faster, which in VITS is `length_scale` 1/1.15. */
const FAST_RATE = 1.15;
const LENGTH_SCALE = 1 / FAST_RATE;

/**
 * The pinned determinism settings, and V1's precondition.
 *
 * Piper's VITS draws its vocoder randomness **inside the ONNX graph**: the voice
 * takes `scales` and no noise tensor, and piper-tts exposes no seed, so with the
 * model's own `noise_scale` (0.667) and `noise_w` (0.8) every synthesis differs
 * from the last — in the samples *and*, because `noise_w` is the duration
 * predictor's width noise, in the clip's length. Both are pinned to 0 here and
 * inference is forced to one thread, which is what makes two runs of this script
 * byte-identical.
 *
 * The trade is deliberate and recorded rather than hidden: zero vocoder noise
 * flattens prosody. The corpus is synthetic ASR material, and the values are in
 * `reference.json` so a later card can revisit them.
 */
const NOISE_SCALE = 0;
const NOISE_W = 0;
const THREADS = 1;

/** The five non-speech clips per arm, in seconds; no voice, no text. */
const SILENCE_SECONDS = [1, 2, 3, 4, 5];
const TONE_SECONDS = [1, 2, 3, 4, 5];
const TONE_HZ = [220, 330, 440, 550, 660];
const TONE_AMPLITUDE = 0.25;
/** 20 ms raised-cosine fades, so a tone clip has no click transient to transcribe. */
const TONE_FADE_SAMPLES = Math.round(0.02 * SAMPLE_RATE);

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
const VARIANTS = ['clean', 'noise', 'fast'];

/** The sandbox namespace itself: writing straight into it is refused. */
const SANDBOX_ROOT = '/tmp/apunta-v2';

/**
 * The 40 clinical-term sentences, 10 per class, as a literal array — the card
 * names this file as their only home, so there is no data file to drift from.
 * Drug names come from `docs/research/es-mx-clinical-glossary.json` (category
 * `medication`), doses and units from its `unit`/`number` categories, and the
 * four names from `e2e/fixtures/eval-es/NAMES.md`. Every sentence is invented;
 * no real patient text is involved (HS-8).
 *
 * `negation` holds ten risk statements with an internal 5 + 5 split, in this
 * order: 01-05 carry an explicit negation the transcript must retain, 06-10
 * state the risk affirmatively, so a negation that appears in the transcript
 * but not in `text` is an insertion. C-STT@1 measures "negations retained" and
 * "inserted negations" separately, and the split is derivable from `category`
 * and `text` without any extra field.
 */
const CLINICAL_SENTENCES = {
  drugs: [
    'Le indico tomar sertralina cincuenta miligramos cada veinticuatro horas.',
    'Aumentamos la fluoxetina a cuarenta miligramos al día.',
    'Le receto quetiapina veinticinco miligramos por la noche.',
    'Mantenemos el omeprazol veinte miligramos en ayunas.',
    'Sustituimos la bupropión por buspirona en el mismo horario.',
    'El frasco que trae es de amitriptilina de veinticinco miligramos.',
    'César Xicará Pantoja trae el frasco de alprazolam y la receta anterior.',
    'Bárbara Arredondo Higareda pregunta por la dosis de la levotiroxina.',
    'Doroteo Xicará Quezada dejó el frasco de lorazepam sobre la mesa.',
    'Anaías Godoy Ruiz trae la metformina de ochocientos miligramos en su lista.',
  ],
  doses: [
    'Subimos a cero coma cinco miligramos cada noche.',
    'La dosis es de uno coma veinticinco miligramos.',
    'Le indico dos coma cinco mililitros por cada toma.',
    'Partimos la pastilla: queda cero coma veinticinco miligramos.',
    'Son diez gotas, cero coma cinco mililitros, debajo de la lengua.',
    'Le indico cinco unidades sublinguales.',
    'El suero va a cinco litros, con la vía abierta.',
    'Damos seis y media horas de ayuno antes de la prueba.',
    'La dosis máxima es de ochenta miligramos al día.',
    'Le indico treinta y siete coma cinco microgramos por cada kilo.',
  ],
  negation: [
    'Me dice que no ha tenido ideas de hacerse daño.',
    'Reporta que no consume alcohol ni fuma.',
    'Nunca ha tomado la pastilla para dormir.',
    'No ha tenido conductas de autolesión este mes.',
    'No expresa intenciones de hacer daño a terceros.',
    'Tuvo un intento de hacerse daño en dos mil diecinueve.',
    'Hay un antecedente de autolesión en la adolescencia.',
    'El reporte de la escuela describe autolesiones repetidas.',
    'En el expediente de la clínica aparece un intento previo.',
    'Trae una nota que habla de un periodo de consumo intenso de alcohol.',
  ],
  numbers: [
    'Tomó diecinueve días completos de registro.',
    'Pesaba ochenta y dos kilos la primera vez.',
    'Dormía seis y media horas antes de la crisis.',
    'Vino tres veces a la semana durante cuatro semanas.',
    'Salió de alta después de doce sesiones.',
    'Sus pesos bajaron de noventa y cuatro a ochenta y dos kilos.',
    'Conté treinta y nueve pensamientos intrusivos en la semana.',
    'La cita es el jueves a las nueve de la mañana.',
    'Redujo la frecuencia de dos veces al día a una vez al día.',
    'Le pedí que trajera el registro de siete días.',
  ],
};

/* ------------------------------------------------------------------ arguments */

function usage() {
  return [
    'usage: node scripts/v2/generate-es-audio.mjs --out <dir> [--help]',
    '',
    '  --out <dir>   output directory, inside a sandbox run folder and outside',
    '                 this repository. Parent directories are created. The run is',
    '                 all-or-nothing: on any failure the target is left absent.',
    '  --help        this text',
    '',
    'Environment:',
    '  PIPER_BIN     the piper console script, or a `python3 -m piper` prefix',
    '  PIPER_MODEL   the es_MX-ald-medium .onnx path',
    '',
    'Both must be set and must live outside this repository.',
  ].join('\n');
}

/** Parsed argv, or a thrown message the caller turns into exit 2. */
function parseArgs(argv) {
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') return { help: true };
    if (arg === '--out') {
      if (argv[i + 1] === undefined) throw new Error('--out needs a directory');
      out = resolve(argv[i + 1]);
      i += 1;
      continue;
    }
    throw new Error(`unknown argument ${arg}`);
  }
  if (out === null) throw new Error('--out is required');
  return { out };
}

/* ----------------------------------------------------------------- validation */

/** True when `path` is inside `root`, comparing resolved paths. */
function inside(path, root) {
  return path === root || path.startsWith(root.endsWith(sep) ? root : root + sep);
}

/**
 * Everything checked before a single byte is written, so a refusal (V3's
 * `PIPER_MODEL=/nonexistent.onnx` case) leaves no output directory at all.
 */
function validate(out) {
  const piper = process.env.PIPER_BIN;
  const model = process.env.PIPER_MODEL;
  if (piper === undefined || piper === '' || model === undefined || model === '') {
    throw new Error('PIPER_BIN and PIPER_MODEL are required; keep both outside the repository (A09, A10)');
  }
  if (!existsSync(model)) throw new Error(`PIPER_MODEL does not exist: ${model}`);
  if (model.endsWith('.json')) {
    throw new Error(`PIPER_MODEL must be the .onnx voice, not its config: ${model}`);
  }
  // `python3 -m piper` is a two-word PIPER_BIN; only the first word is a path.
  const piperPath = resolve(piper.split(' ')[0]);
  if (!existsSync(piperPath)) throw new Error(`PIPER_BIN does not exist: ${piper}`);
  if (inside(out, repoRoot)) {
    throw new Error(`refusing ${out}: generated audio is never written into the repository (L-POLICY row 4)`);
  }
  if (dirname(out) === SANDBOX_ROOT) {
    throw new Error(`refusing ${out}: write inside a sandbox run folder, not directly under ${SANDBOX_ROOT}`);
  }
  if (existsSync(out)) {
    throw new Error(`refusing ${out}: it already exists; remove it or choose another --out`);
  }
  return { piper, piperPath, model: resolve(model) };
}

/**
 * The Piper version, for `reference.json`. `piper --version` is not an option in
 * piper-tts 1.8.0, so the installed distribution is asked directly: a python
 * next to PIPER_BIN first (a venv's own interpreter is the right one), then
 * `$PIPER_PYTHON`, then `python3`.
 */
function piperVersion(piperPath) {
  const script = 'import importlib.metadata as m; print(m.version("piper-tts"))';
  const candidates = [
    join(dirname(piperPath), 'python3'),
    join(dirname(piperPath), 'python'),
    process.env.PIPER_PYTHON,
    'python3',
  ].filter((candidate) => candidate !== undefined && candidate !== '');
  for (const candidate of candidates) {
    const probe = spawnSync(candidate, ['-c', script], { encoding: 'utf8' });
    if (probe.status === 0) {
      const version = probe.stdout.trim();
      if (version !== '') return version;
    }
  }
  throw new Error(
    'could not read the installed piper-tts version; set PIPER_PYTHON to the ' +
      'interpreter that owns PIPER_BIN, or make PIPER_BIN a venv console script',
  );
}

function ffmpegVersion() {
  const probe = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' });
  if (probe.status !== 0 || probe.error !== undefined) {
    throw new Error('ffmpeg is required (ACQUISITION §2) and was not found on PATH');
  }
  return (probe.stdout.split('\n')[0] ?? '').trim();
}

/**
 * Whether this Piper's CLI exposes `--num_threads`, asked once per run. The card
 * wants the flag "if the CLI exposes it"; piper-tts 1.8.0 does not, so on that
 * version the single-thread setting is carried by `OMP_NUM_THREADS` alone. The
 * answer is recorded in `reference.json` either way, so the record never claims a
 * flag the invocation did not use. A probe that cannot run is treated as "not
 * exposed": the setting is then applied by the environment variable, which is
 * always available.
 */
let numThreadsFlag;
function piperExposesNumThreads(piper) {
  if (numThreadsFlag !== undefined) return numThreadsFlag;
  const probe = spawnSync(piper, ['--help'], { encoding: 'utf8' });
  const usage = `${probe.stdout ?? ''}\n${probe.stderr ?? ''}`;
  numThreadsFlag = probe.error === undefined && /--num[-_]threads/u.test(usage);
  return numThreadsFlag;
}

/* ------------------------------------------------------------------- the corpus */

/** Every `<split>/<trap-type>/<name>.txt` under a corpus split, in a stable order. */
function corpusDictations(split) {
  const splitRoot = join(repoRoot, 'e2e', 'fixtures', 'eval-es', split);
  const found = [];
  for (const trap of TRAP_TYPES) {
    const dir = join(splitRoot, trap);
    if (!existsSync(dir)) throw new Error(`missing corpus directory: ${relative(repoRoot, dir)}`);
    const names = readdirSync(dir)
      .filter((name) => name.endsWith('.txt'))
      .sort();
    for (const name of names) {
      found.push({
        id: `${split}/${trap}/${name.replace(/\.txt$/u, '')}`,
        source: split,
        category: trap,
        stem: name.replace(/\.txt$/u, ''),
        text: readFileSync(join(dir, name), 'utf8').replace(/\s+/gu, ' ').trim(),
      });
    }
  }
  return found;
}

/** The 40 clinical sentences as clips, in the fixed class order. */
function clinicalSentences() {
  const found = [];
  for (const category of CLINICAL_CLASSES) {
    const sentences = CLINICAL_SENTENCES[category];
    if (!Array.isArray(sentences) || sentences.length !== 10) {
      throw new Error(`clinical class "${category}" does not hold exactly 10 sentences`);
    }
    sentences.forEach((text, index) => {
      found.push({
        id: `clinical/${category}/${String(index + 1).padStart(2, '0')}`,
        source: 'clinical',
        category,
        stem: String(index + 1).padStart(2, '0'),
        text,
      });
    });
  }
  return found;
}

/** The ten non-speech clips: five silence, five tone, `clean` variant only. */
function nonSpeechClips() {
  const found = [];
  for (const [i, seconds] of SILENCE_SECONDS.entries()) {
    found.push({
      id: `silence/${String(i + 1).padStart(2, '0')}`,
      source: 'silence',
      kind: 'silence',
      stem: String(i + 1).padStart(2, '0'),
      seconds,
    });
  }
  for (const [i, seconds] of TONE_SECONDS.entries()) {
    found.push({
      id: `tone/${String(i + 1).padStart(2, '0')}`,
      source: 'tone',
      kind: 'tone',
      stem: String(i + 1).padStart(2, '0'),
      seconds,
      hz: TONE_HZ[i],
    });
  }
  return found;
}

/** The flat output name for a speech clip; the same rule the checker re-derives. */
function speechFileName(clip, variant) {
  return `${clip.source}-${clip.category}-${clip.stem}.${variant}.wav`;
}

/* ------------------------------------------------------------------ wav and pcm */

/** A canonical 44-byte RIFF/WAVE header for 16-bit PCM. */
function wavHeader(sampleRate, dataBytes) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + dataBytes, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(CHANNELS, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * CHANNELS * (BITS_PER_SAMPLE / 8), 28);
  header.writeUInt16LE(CHANNELS * (BITS_PER_SAMPLE / 8), 32);
  header.writeUInt16LE(BITS_PER_SAMPLE, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(dataBytes, 40);
  return header;
}

/** Reads a 16-bit PCM WAV, walking the chunks rather than trusting offsets. */
function readWavPcm16(path) {
  const bytes = readFileSync(path);
  if (bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error(`${path}: not a RIFF/WAVE file`);
  }
  let offset = 12;
  let format = null;
  let data = null;
  while (offset + 8 <= bytes.length) {
    const id = bytes.toString('ascii', offset, offset + 4);
    const size = bytes.readUInt32LE(offset + 4);
    const body = offset + 8;
    if (body + size > bytes.length) throw new Error(`${path}: chunk ${id} runs past the end`);
    if (id === 'fmt ') {
      format = {
        audioFormat: bytes.readUInt16LE(body),
        channels: bytes.readUInt16LE(body + 2),
        sampleRate: bytes.readUInt32LE(body + 4),
        bitsPerSample: bytes.readUInt16LE(body + 14),
      };
    } else if (id === 'data') {
      data = bytes.subarray(body, body + size);
    }
    offset = body + size + (size % 2);
  }
  if (format === null || data === null) throw new Error(`${path}: no fmt or data chunk`);
  return { format, samples: new Int16Array(data.buffer, data.byteOffset, data.length / 2) };
}

/** Mean square of `samples` over `[from, to]`. */
function meanSquare(samples, from, to) {
  let total = 0;
  for (let i = from; i < to; i += 1) total += samples[i] * samples[i];
  return total / Math.max(1, to - from);
}

/** The loudest absolute sample value in the clip. */
function peak(samples) {
  let peakValue = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const magnitude = Math.abs(samples[i]);
    if (magnitude > peakValue) peakValue = magnitude;
  }
  return peakValue;
}

/* ------------------------------------------------------------------- the noise */

/**
 * A 32-bit xorshift generator. Written out here rather than taken from a library
 * so the corpus depends on no PRNG implementation and on no implementation-
 * approximated libm call: only integer arithmetic, `+ - * /` and `Math.sqrt`
 * (which ECMA-262 requires to be correctly rounded). Same script, same machine,
 * same bytes — which is the property V1 tests.
 */
function xorshift32(seed) {
  let state = seed >>> 0;
  if (state === 0) state = 0x9e3779b9;
  return () => {
    state ^= (state << 13) >>> 0;
    state >>>= 0;
    state ^= state >>> 17;
    state ^= (state << 5) >>> 0;
    state >>>= 0;
    return state;
  };
}

/** FNV-1a over a string, so a clip id maps to a stable 32-bit seed. */
function hashString(text) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** The per-clip seed: the constant mixed with the clip's own id. */
function perClipSeed(clipId) {
  const mixed = (xorshift32(SEED ^ hashString(clipId))() ^ hashString(clipId)) >>> 0;
  return mixed;
}

/**
 * Adds white room noise to a 16 kHz mono clip in place, at `NOISE_SNR_DB` SNR
 * measured against the clip's speech-active region.
 *
 * The active region is the first through the last sample at or above
 * `ACTIVE_GATE_DBFS` of the clip's peak, which excludes the digital silence
 * Piper pads a dictation with. Signal power is the mean square over that
 * region, noise power is that divided by 10^(SNR/10) = 100, and the noise
 * itself is uniform in [-1, 1) — white — scaled so its measured mean square is
 * the target. The noise is added across the whole clip, because room noise is
 * in a recording whether or not anyone is speaking.
 */
function addRoomNoise(samples, clipId) {
  const gate = peak(samples) * 10 ** (ACTIVE_GATE_DBFS / 20);
  let first = -1;
  let last = -1;
  for (let i = 0; i < samples.length; i += 1) {
    if (Math.abs(samples[i]) >= gate) {
      if (first === -1) first = i;
      last = i;
    }
  }
  if (first === -1) {
    throw new Error(`${clipId}: the clip has no samples above the active gate; it is silent`);
  }
  const signalPower = meanSquare(samples, first, last + 1);
  if (signalPower === 0) throw new Error(`${clipId}: active region is digital silence`);

  const random = xorshift32(perClipSeed(clipId));
  const uniform = new Float64Array(samples.length);
  let uniformPower = 0;
  for (let i = 0; i < samples.length; i += 1) {
    // 32 bits of entropy mapped onto [-1, 1).
    const value = (random() / 0x1_0000_0000) * 2 - 1;
    uniform[i] = value;
    uniformPower += value * value;
  }
  uniformPower /= uniform.length;
  const targetNoisePower = signalPower / 10 ** (NOISE_SNR_DB / 10);
  const gain = Math.sqrt(targetNoisePower / uniformPower);

  let clipped = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const sum = samples[i] + gain * uniform[i];
    if (sum > 32767 || sum < -32768) clipped += 1;
    samples[i] = Math.max(-32768, Math.min(32767, Math.round(sum)));
  }

  // The added noise is recoverable from the pair, so the achieved SNR is
  // measured, not assumed.
  let added = 0;
  for (let i = first; i <= last; i += 1) added += (gain * uniform[i]) ** 2;
  added /= last + 1 - first;
  return {
    snrDb: 10 * Math.log10(signalPower / added),
    clipped,
  };
}

/* ------------------------------------------------------------------- synthesis */

/**
 * One Piper call: text on stdin, a 22,050 Hz WAV at `outWav`, exactly as
 * `scripts/synthetic-acceptance/generate-audio.mjs` does it. `lengthScale` is
 * left unset for every variant but `fast`.
 *
 * The two vocoder-noise flags are passed on **every** call, not only the ones
 * that need a flag of their own, so no call can silently fall back to the voice
 * config's 0.667/0.8. `OMP_NUM_THREADS=1` goes into the child's environment and
 * `--num_threads 1` is added when this CLI has it; both are V1's precondition.
 */
function piperSynthesise(piper, model, text, outWav, lengthScale, useNumThreadsFlag) {
  const args = [
    '--model',
    model,
    '--output_file',
    outWav,
    '--noise_scale',
    String(NOISE_SCALE),
    '--noise_w',
    String(NOISE_W),
  ];
  if (lengthScale !== undefined) args.push('--length_scale', String(lengthScale));
  if (useNumThreadsFlag) args.push('--num_threads', String(THREADS));
  const result = spawnSync(piper, args, {
    input: `${text}\n`,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: process.env.LD_LIBRARY_PATH ?? dirname(piper),
      OMP_NUM_THREADS: String(THREADS),
    },
    stdio: ['pipe', 'inherit', 'inherit'],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Piper exited ${String(result.status)} for ${outWav}`);
}

/**
 * 22,050 Hz to 16,000 Hz mono 16-bit PCM, with `ffmpeg`. The `bitexact` flags
 * suppress the encoder's LIST/INFO chunk, so the output is the canonical
 * 44-byte header and nothing about the ffmpeg build leaks into a sample.
 */
function resampleTo16k(inWav, outWav) {
  const result = spawnSync(
    'ffmpeg',
    [
      '-hide_banner',
      '-nostdin',
      '-loglevel',
      'error',
      '-y',
      '-i',
      inWav,
      '-ar',
      String(SAMPLE_RATE),
      '-ac',
      String(CHANNELS),
      '-c:a',
      'pcm_s16le',
      '-map_metadata',
      '-1',
      '-fflags',
      '+bitexact',
      '-flags:a',
      '+bitexact',
      outWav,
    ],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`ffmpeg exited ${String(result.status)} for ${outWav}`);
}

/** Writes the 5 silence and 5 tone clips, in PCM at 16,000 Hz directly. */
function writeNonSpeech(kind, seconds, outWav, hz) {
  const total = Math.round(seconds * SAMPLE_RATE);
  const samples = new Int16Array(total);
  if (kind === 'tone') {
    for (let i = 0; i < total; i += 1) {
      const envelope =
        i < TONE_FADE_SAMPLES
          ? 0.5 - 0.5 * Math.cos((Math.PI * i) / TONE_FADE_SAMPLES)
          : i >= total - TONE_FADE_SAMPLES
            ? 0.5 - 0.5 * Math.cos((Math.PI * (total - 1 - i)) / TONE_FADE_SAMPLES)
            : 1;
      samples[i] = Math.round(
        TONE_AMPLITUDE * envelope * Math.sin((2 * Math.PI * hz * i) / SAMPLE_RATE) * 32767,
      );
    }
  }
  writeFileSync(outWav, Buffer.concat([wavHeader(SAMPLE_RATE, total * 2), Buffer.from(samples.buffer)]));
}

/* ------------------------------------------------------------------- the plan */

/** The 95 dictations and sentences the run will synthesise, in output order. */
function dictationList() {
  return [...corpusDictations('tuning'), ...corpusDictations('heldout'), ...clinicalSentences()];
}

/** The ten non-speech clips, in output order. */
function nonSpeechList() {
  return nonSpeechClips();
}

/** The full `reference.json` clip list, in output order, before anything is created. */
function buildPlan() {
  const clips = [];
  for (const clip of dictationList()) {
    for (const variant of VARIANTS) {
      clips.push({
        file: speechFileName(clip, variant),
        text: clip.text,
        voice: VOICE,
        variant,
        source: clip.source,
        category: clip.category,
      });
    }
  }
  for (const clip of nonSpeechList()) {
    clips.push({
      file: `${clip.source}-${clip.stem}.wav`,
      text: '',
      voice: 'none',
      variant: 'clean',
      source: clip.source,
      category: clip.source,
    });
  }
  return clips;
}

/* ----------------------------------------------------------------------- main */

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (error) {
    process.stderr.write(`generate-es-audio: ${error.message}\n\n${usage()}\n`);
    return 2;
  }
  if (parsed.help) {
    process.stdout.write(`${usage()}\n`);
    return 0;
  }
  const out = parsed.out;

  let options;
  try {
    options = validate(out);
  } catch (error) {
    process.stderr.write(`generate-es-audio: ${error.message}\n`);
    return 1;
  }

  let plan;
  let voice;
  let piper;
  let ffmpeg;
  try {
    plan = buildPlan();
    voice = {
      name: VOICE,
      sha256: createHash('sha256').update(readFileSync(options.model)).digest('hex'),
      bytes: statSync(options.model).size,
    };
    piper = piperVersion(options.piperPath);
    ffmpeg = ffmpegVersion();
  } catch (error) {
    process.stderr.write(`generate-es-audio: ${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }

  // Staging next to the target, so the run is all-or-nothing: a failure at any
  // point leaves the target path absent and only removes its own staging folder.
  const staging = join(dirname(out), `.${VOICE}-staging-${String(process.pid)}`);
  const scratch = join(staging, '.scratch');
  const stats = { snr: [], clipped: 0, synthesised: 0, resampled: 0 };
  const useNumThreadsFlag = piperExposesNumThreads(options.piper);
  const threadSetting = useNumThreadsFlag
    ? `OMP_NUM_THREADS=${String(THREADS)} and --num_threads ${String(THREADS)}`
    : `OMP_NUM_THREADS=${String(THREADS)}; this piper CLI exposes no --num_threads flag`;

  try {
    rmSync(staging, { recursive: true, force: true });
    mkdirSync(scratch, { recursive: true });

    const dictations = dictationList();

    dictations.forEach((clip, index) => {
      const raw = join(scratch, `raw-${String(index)}.wav`);
      piperSynthesise(options.piper, options.model, clip.text, raw, undefined, useNumThreadsFlag);
      stats.synthesised += 1;
      const clean = join(staging, speechFileName(clip, 'clean'));
      resampleTo16k(raw, clean);
      stats.resampled += 1;

      // `noise` is the `clean` arm of this same run plus room noise, so the two
      // arms of a dictation differ only by the noise.
      const read = readWavPcm16(clean);
      if (
        read.format.audioFormat !== 1 ||
        read.format.channels !== CHANNELS ||
        read.format.sampleRate !== SAMPLE_RATE ||
        read.format.bitsPerSample !== BITS_PER_SAMPLE
      ) {
        throw new Error(`${clean}: ffmpeg did not produce ${String(SAMPLE_RATE)} Hz mono 16-bit PCM`);
      }
      const samples = Int16Array.from(read.samples);
      const measured = addRoomNoise(samples, clip.id);
      stats.snr.push(measured.snrDb);
      stats.clipped += measured.clipped;
      writeFileSync(
        join(staging, speechFileName(clip, 'noise')),
        Buffer.concat([wavHeader(SAMPLE_RATE, samples.length * 2), Buffer.from(samples.buffer)]),
      );

      piperSynthesise(options.piper, options.model, clip.text, raw, LENGTH_SCALE, useNumThreadsFlag);
      stats.synthesised += 1;
      resampleTo16k(raw, join(staging, speechFileName(clip, 'fast')));
      stats.resampled += 1;
    });

    for (const clip of nonSpeechList()) {
      writeNonSpeech(clip.kind, clip.seconds, join(staging, `${clip.source}-${clip.stem}.wav`), clip.hz);
    }

    const reference = {
      version: 1,
      piper,
      synthesis: {
        noise_scale: NOISE_SCALE,
        noise_w: NOISE_W,
        threads: THREADS,
        threadSetting,
        length_scale: LENGTH_SCALE,
        seed: SEED,
        noiseColour: NOISE_COLOUR,
        noiseSnrDb: NOISE_SNR_DB,
        noisePowerReference: `speech-active region, gate ${String(ACTIVE_GATE_DBFS)} dBFS of clip peak`,
        fastRate: FAST_RATE,
        sourceSampleRate: SOURCE_RATE,
        sampleRate: SAMPLE_RATE,
        channels: CHANNELS,
        bitsPerSample: BITS_PER_SAMPLE,
        resampler: ffmpeg,
      },
      voices: [voice],
      clips: plan.map(({ file, text, voice: name, variant, source, category }) => ({
        file,
        text,
        voice: name,
        variant,
        source,
        category,
      })),
    };
    writeFileSync(join(staging, 'reference.json'), `${JSON.stringify(reference, null, 2)}\n`);
    rmSync(scratch, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });
    renameSync(staging, out);
  } catch (error) {
    rmSync(staging, { recursive: true, force: true });
    process.stderr.write(
      `generate-es-audio: ${error instanceof Error ? error.message : String(error)}\n` +
        `no output directory was left at ${out}\n`,
    );
    return 1;
  }

  const snr = stats.snr;
  const lines = [
    `voice:       ${VOICE}  sha256 ${voice.sha256}  ${String(voice.bytes)} bytes`,
    `piper:       ${piper}`,
    `ffmpeg:      ${ffmpeg}`,
    `clips:       ${String(plan.length)} (${String(stats.synthesised)} Piper calls, ${String(stats.resampled)} resamples)`,
    `rate:        ${String(SOURCE_RATE)} Hz -> ${String(SAMPLE_RATE)} Hz mono ${String(BITS_PER_SAMPLE)}-bit`,
    `seed:        ${String(SEED)}  noise ${NOISE_COLOUR} at ${String(NOISE_SNR_DB)} dB SNR  length_scale ${String(LENGTH_SCALE)}`,
    `determinism: noise_scale ${String(NOISE_SCALE)}  noise_w ${String(NOISE_W)}  ${threadSetting}`,
  ];
  if (snr.length > 0) {
    lines.push(
      `noise arm:   ${String(snr.length)} clips, achieved SNR ${Math.min(...snr).toFixed(3)}..${Math.max(...snr).toFixed(3)} dB, ` +
        `${String(stats.clipped)} clipped samples`,
    );
  }
  lines.push(`output:      ${out}`);
  process.stdout.write(`${lines.join('\n')}\n`);
  return 0;
}

process.exitCode = main(process.argv.slice(2));
