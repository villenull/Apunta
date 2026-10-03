const SOURCE_NAME = 'apunta_p35_mic';
const REAL_MIC_PREFIX = 'alsa_input.usb-UGREEN';

function parseSourceTable(text) {
  const table = new Map();
  for (const raw of text.split('\n')) {
    if (raw.trim() === '') continue;
    const columns = raw.trim().split(/\s+/);
    if (columns.length < 2) throw new Error(`malformed pactl sources row: ${JSON.stringify(raw)}`);
    const index = Number(columns[0]);
    if (!Number.isInteger(index)) {
      throw new Error(`non-numeric source index in pactl sources: ${JSON.stringify(raw)}`);
    }
    if (table.has(index)) {
      throw new Error(`duplicate source index ${String(index)} in pactl sources: ${JSON.stringify(raw)}`);
    }
    const name = columns[1];
    if (name === '') throw new Error(`empty source name in pactl sources: ${JSON.stringify(raw)}`);
    table.set(index, name);
  }
  return table;
}

/**
 * Resolve `pactl list short source-outputs` through the source table.
 *
 * Every row must resolve to a known source index; a source index that is not in
 * the table (a stream whose source appeared between the two reads, or a stale
 * index) is an error, not an "unrelated, so safe" row. The result groups the
 * resolved streams so the caller can assert the virtual capture is present, no
 * stream is on the owner's real microphone, and every other stream is named.
 */
function classifySourceOutputs(outputsText, sourcesText) {
  const sources = parseSourceTable(sourcesText);
  const all = [];
  for (const raw of outputsText.split('\n')) {
    if (raw.trim() === '') continue;
    const columns = raw.trim().split(/\s+/);
    if (columns.length < 3) throw new Error(`malformed pactl source-outputs row: ${JSON.stringify(raw)}`);
    const streamId = Number(columns[0]);
    const sourceId = Number(columns[1]);
    // Only the literal `-` means "no client"; any other client-column value
    // must still be a plain integer, exactly as before.
    const clientId = columns[2] === '-' ? null : Number(columns[2]);
    if (
      ![streamId, sourceId].every((value) => Number.isInteger(value)) ||
      (clientId !== null && !Number.isInteger(clientId))
    ) {
      throw new Error(`non-numeric source-outputs column: ${JSON.stringify(raw)}`);
    }
    if (!sources.has(sourceId)) {
      throw new Error(
        `source-output ${String(streamId)} names source index ${String(sourceId)}, which is not in the ` +
          'pactl sources table; the mapping is unknown and the row must not assume it is safe',
      );
    }
    all.push({ streamId, sourceId, clientId, sourceName: sources.get(sourceId), raw: raw.trim() });
  }
  return {
    all,
    virtual: all.filter((output) => output.sourceName === SOURCE_NAME),
    realMic: all.filter((output) => output.sourceName.startsWith(REAL_MIC_PREFIX)),
    unrelated: all.filter(
      (output) => output.sourceName !== SOURCE_NAME && !output.sourceName.startsWith(REAL_MIC_PREFIX),
    ),
  };
}
