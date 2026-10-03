/**
 * Review-2, D1: adversarial probes of the shipped source-output mapping.
 *
 * Every call below runs the candidate's own `parseSourceTable`,
 * `classifySourceOutputs` and `classifyPactlReads`, extracted verbatim from
 * `scripts/v2/tauri-audio.test.mjs` (see `extract.mjs`). Inputs are fabricated
 * from the *observed* shape of this host's `pactl list short sources` /
 * `source-outputs` (`index name description…`, and `%u\t%u\t%s\t%s\t%s` for a
 * source-output). No pactl call, no audio, no app, no microphone is touched.
 */
import { loadFunctions, report, summary, thrown } from './extract.mjs';

const { parseSourceTable, classifySourceOutputs, classifyPactlReads, constants } = loadFunctions([
  'parseSourceTable',
  'classifySourceOutputs',
  'classifyPactlReads',
]);
const { SOURCE_NAME, REAL_MIC_PREFIX } = constants;

/** This host's real table shape (four sources, index + name + description words). */
const HOST_SOURCES = [
  '60 alsa_output.pci-0000_00_1f.3.analog-stereo Built-in Audio Analog Stereo Output',
  '61 alsa_input.usb-UGREEN_Camera_2K_UGREEN_Camera_2K_SN0001-02.analog-stereo USB Audio Analog Stereo',
  '62 alsa_output.usb-Generic_USB_Audio_Controller-00.analog-stereo USB Audio Analog Stereo Output',
  '63 alsa_input.pci-0000_00_1f.3.analog-stereo Built-in Audio Analog Stereo',
].join('\n');

/** Add the two modules this card owns, as the live read would see them. */
const withVirtual = (extra = '') =>
  [
    HOST_SOURCES,
    '64 apunta_p35_mic apunta_p35 module-source null',
    ...(extra === '' ? [] : [extra]),
  ].join('\n');

const ok = (code, stdout) => ({ code, stdout, stderr: '' });

// --- the exact defect review-1 raised: column [2] is a client index ----------

// A stream whose real source is the owner's microphone (index 61), and whose
// *client* index is 63 — which happens to be a different, harmless source. An
// implementation that compared a raw column to the mic prefix would see "63" and
// call it safe; the correct mapping resolves column [1] and sees the leak.
{
  const outputs = '12\t61\t63\t(null)\ts16le 2ch 44100Hz\n';
  const streams = classifySourceOutputs(outputs, withVirtual());
  report(
    'D1 client index that names another source cannot mask a real-microphone stream',
    streams.realMic.length === 1 && streams.realMic[0].sourceName.startsWith(REAL_MIC_PREFIX),
    JSON.stringify(streams.realMic.map((row) => row.sourceName)),
  );
  report(
    'D1 the leak row keeps its resolved name, not the client number',
    streams.realMic[0].clientId === 63 && streams.realMic[0].sourceId === 61,
    `sourceId=${String(streams.realMic[0].sourceId)} clientId=${String(streams.realMic[0].clientId)}`,
  );
}

// And the reverse: a client index that *looks* like the microphone, on a stream
// that is actually harmless. A raw-column comparison would raise a false alarm;
// the correct mapping must not.
{
  const outputs = '12\t64\t61\t(null)\ts16le 2ch 44100Hz\n';
  const streams = classifySourceOutputs(outputs, withVirtual());
  report(
    'D1 a microphone-shaped client index on a harmless stream is not a leak',
    streams.realMic.length === 0 && streams.virtual.length === 1,
    `realMic=${String(streams.realMic.length)} virtual=${String(streams.virtual.length)}`,
  );
}

// --- the ordinary cases, plus the empty read --------------------------------

{
  const streams = classifySourceOutputs('7\t64\t30\t(null)\ts16le 2ch 44100Hz\n', withVirtual());
  report(
    'D1 virtual only',
    streams.virtual.length === 1 && streams.realMic.length === 0 && streams.unrelated.length === 0,
    `v=${String(streams.virtual.length)} r=${String(streams.realMic.length)} u=${String(streams.unrelated.length)}`,
  );
}
{
  const streams = classifySourceOutputs(
    ['7\t64\t30\t(null)\ts16le 2ch 44100Hz', '8\t61\t31\t(null)\ts16le 2ch 44100Hz'].join('\n'),
    withVirtual(),
  );
  report(
    'D1 virtual plus a physical leak',
    streams.virtual.length === 1 && streams.realMic.length === 1,
    `v=${String(streams.virtual.length)} r=${String(streams.realMic.length)}`,
  );
}
{
  const streams = classifySourceOutputs(
    ['7\t60\t30\t(null)\ts16le 2ch 44100Hz', '8\t61\t31\t(null)\ts16le 2ch 44100Hz'].join('\n'),
    withVirtual(),
  );
  report(
    'D1 an unrelated source and a real leak are both reported, separately',
    streams.unrelated.length === 1 && streams.realMic.length === 1 && streams.virtual.length === 0,
    `u=${String(streams.unrelated.length)} r=${String(streams.realMic.length)}`,
  );
}
{
  // No streams at all: the capture stream is missing, which the live block turns
  // into a FAIL, not a pass. Nothing here may invent a virtual stream.
  const streams = classifySourceOutputs('', withVirtual());
  report(
    'D1 an empty source-outputs read yields no virtual stream (fail-closed at the assertion)',
    streams.all.length === 0 && streams.virtual.length === 0,
    `all=${String(streams.all.length)}`,
  );
}

// --- unknown / duplicate / malformed: must stop, never "safe" ---------------

const mustThrow = (label, outputs, sources) => {
  const error = thrown(() => classifySourceOutputs(outputs, sources));
  report(label, error !== null, error === null ? 'returned instead of throwing' : error.message);
};

mustThrow(
  'D1 a source-output naming a source index the table does not have throws',
  '7\t99\t30\t(null)\ts16le\n',
  withVirtual(),
);
mustThrow(
  'D1 a source-output naming source index 0, absent from the table, throws',
  '7\t0\t30\t(null)\ts16le\n',
  withVirtual(),
);
mustThrow('D1 a duplicated source index in the source table throws', '', `${HOST_SOURCES}\n61 second`);
mustThrow('D1 a source table row with one column throws', '', `${HOST_SOURCES}\n64`);
mustThrow('D1 a source-outputs row with two columns throws', '7\t61\n', withVirtual());
mustThrow(
  'D1 a non-numeric source-outputs column throws',
  '7\t61\tclient\t(null)\ts16le\n',
  withVirtual(),
);
mustThrow(
  'D1 a non-numeric source index in the table throws',
  '7\t64\t30\t(null)\ts16le\n',
  `${HOST_SOURCES}\nalsa_input.usb-nosuch analog stereo`,
);
mustThrow(
  'D1 a fractional source index throws',
  '7\t64\t30\t(null)\ts16le\n',
  `${HOST_SOURCES}\n61.5 apunta_p35_mic module`,
);

// --- `Number()` edge shapes: what actually happens, against real pactl ------
//
// `pactl list short sources` prints its index with `%u` and tab separators, so
// these shapes cannot be produced by pactl 17. They are recorded so the report
// says what the shipped code does with them rather than what we wish it did.
{
  const table = parseSourceTable('0x10 alsa_input.usb-UGREEN_x analog stereo');
  report(
    'D1 a hex-looking index is read as 16 (unreachable from `%u`, recorded not invented)',
    table.has(16),
    [...table.keys()].join(','),
  );
}
{
  const table = parseSourceTable('-1 alsa_input.usb-UGREEN_x analog stereo');
  report(
    'D1 a negative index is accepted as a key (unreachable from `%u`, recorded not invented)',
    table.has(-1),
    [...table.keys()].join(','),
  );
}
{
  // A whitespace-only column collapses under `split(/\s+/)`, so the row is read
  // with shifted columns. It still stops: index 30 is not in the table.
  const error = thrown(() => classifySourceOutputs('7\t  \t30\t(null)\ts16le\n', withVirtual()));
  report(
    'D1 a whitespace-only source column still stops the row (columns shift, resolution fails)',
    error !== null,
    error === null ? 'accepted' : error.message,
  );
}
{
  // PulseAudio source names with spaces are possible in principle. Truncation at
  // the first space can only under-match the virtual test (a FAIL) or
  // over-match the microphone prefix (a stop): never the unsafe direction.
  const spacedMic = classifySourceOutputs('7\t61\t30\t(null)\ts16le\n', `${HOST_SOURCES}\n70 alsa_input.usb-UGREEN Camera analog stereo`);
  report(
    'D1 a spaced microphone name still trips the leak test (over-match, safe direction)',
    spacedMic.realMic.length === 1,
    `r=${String(spacedMic.realMic.length)}`,
  );
  const spacedVirtual = classifySourceOutputs('7\t70\t30\t(null)\ts16le\n', `${HOST_SOURCES}\n70 ${SOURCE_NAME} extra words`);
  report(
    'D1 a spaced virtual name whose first token is the owned name is treated as the owned source',
    spacedVirtual.virtual.length === 1,
    `v=${String(spacedVirtual.virtual.length)}`,
  );
}

// --- the live read: both command statuses are checked before any row --------

{
  const good = ok(0, '7\t64\t30\t(null)\ts16le\n');
  const bad = ok(1, '');
  const error = thrown(() => classifyPactlReads(bad, good));
  report('D1 a failed source-outputs command throws', error !== null, error?.message ?? '');
  report(
    'D1 the failure names the failing command and its exit code',
    error !== null && /source-outputs exited 1/.test(error.message),
    error?.message ?? '',
  );
}
{
  const good = ok(0, '7\t64\t30\t(null)\ts16le\n');
  const bad = ok(1, '');
  const error = thrown(() => classifyPactlReads(good, bad));
  report(
    'D1 a failed sources command throws even when the outputs read succeeded',
    error !== null && /list short sources exited 1/.test(error.message),
    error?.message ?? '',
  );
}
{
  const killed = { code: null, stdout: '', stderr: '' };
  const error = thrown(() => classifyPactlReads(killed, killed));
  report(
    'D1 a killed pactl (null status) throws, never "no leak"',
    error !== null && /exited null/.test(error.message),
    error?.message ?? '',
  );
}
{
  // Both reads succeeded but the sources table is empty while a stream exists:
  // the mapping is unknown and must stop.
  const error = thrown(() => classifyPactlReads(ok(0, '7\t64\t30\t(null)\ts16le\n'), ok(0, '')));
  report(
    'D1 a stream with an empty source table throws rather than reading as safe',
    error !== null && /not in the/.test(error.message),
    error?.message ?? '',
  );
}
{
  // Two streams on the same source: the virtual test must still see them, and
  // the leak grouping must not collapse rows.
  const streams = classifySourceOutputs(
    ['7\t64\t30\t(null)\ts16le', '8\t64\t31\t(null)\ts16le'].join('\n'),
    withVirtual(),
  );
  report(
    'D1 two streams on the virtual source are both kept',
    streams.virtual.length === 2 && streams.all.length === 2,
    `v=${String(streams.virtual.length)}`,
  );
}

// --- the live block's call shape, read from the shipped file ----------------
{
  const body = (await import('node:fs')).readFileSync(
    new URL('../../scripts/v2/tauri-audio.test.mjs', import.meta.url),
    'utf8',
  );
  const liveBlock = body.slice(body.indexOf('// The containment read, while the recording is live'));
  const live = liveBlock.slice(0, liveBlock.indexOf("check(\n      `${step} a capture stream"));
  report(
    'D1 the live block reads both source-outputs and sources before classifying',
    live.includes("pactl(['list', 'short', 'source-outputs'])") &&
      live.includes("pactl(['list', 'short', 'sources'])"),
  );
  report(
    'D1 the live block classifies through classifyPactlReads, not a raw column',
    live.includes('classifyPactlReads(outputsRead, sourcesRead)'),
  );
  report(
    'D1 an unresolvable read is BLOCKED, not a pass',
    live.includes('blocked(') && live.includes('catch (error)') && live.includes('containment is unknown'),
  );
  report(
    'D1 the fail-closed path returns into the finally that stops the shell and tears down',
    live.includes('return;') &&
      body.includes('await containment.teardown();') &&
      body.includes('await stopPid(run.child.pid'),
  );
}

process.exitCode = summary('D1 numeric-mapping probes') === 0 ? 0 : 1;