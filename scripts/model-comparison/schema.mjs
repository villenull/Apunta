/** Machine-readable record contract for the isolated comparison. */
/* eslint-disable no-restricted-syntax -- this URL is a JSON Schema identifier, never a network request. */
export const SCHEMA_VERSION = '1.1.0';
const nullableNumber = { anyOf: [{ type: 'number', minimum: 0 }, { type: 'null' }] };
export const RECORD_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  schemaVersion: SCHEMA_VERSION,
  type: 'object',
  required: [
    'schemaVersion',
    'experimentId',
    'startedAt',
    'environment',
    'model',
    'caseId',
    'input',
    'request',
    'output',
    'timings',
    'memory',
    'checks',
    'retries',
    'stopReason',
    'outcome',
    'limitations',
  ],
  properties: {
    schemaVersion: { const: SCHEMA_VERSION },
    experimentId: { type: 'string', minLength: 1 },
    startedAt: { type: 'string', minLength: 1 },
    environment: {
      type: 'object',
      required: ['host', 'os', 'runtime', 'backend', 'revision'],
      properties: {
        host: { type: 'string' },
        os: { type: 'string' },
        runtime: { type: 'string' },
        backend: { type: 'string' },
        revision: { type: 'string' },
      },
      additionalProperties: false,
    },
    model: {
      type: 'object',
      required: [
        'id',
        'runtimeModel',
        'file',
        'sha256',
        'template',
        'context',
        'decoding',
        'capabilities',
        'format',
      ],
      properties: {
        id: { type: 'string' },
        runtimeModel: { type: 'string' },
        file: { type: 'string' },
        sha256: { type: 'string' },
        template: { type: 'string' },
        context: { type: 'integer', minimum: 1 },
        decoding: { type: 'object' },
        capabilities: { type: 'array', items: { type: 'string' } },
        format: { type: ['string', 'null'] },
      },
      additionalProperties: false,
    },
    caseId: { type: 'string' },
    input: {
      type: 'object',
      required: ['sha256', 'promptKind', 'sourceWords'],
      properties: {
        sha256: { type: 'string' },
        promptKind: { type: 'string' },
        sourceWords: { type: 'integer', minimum: 0 },
      },
      additionalProperties: false,
    },
    request: { type: 'object' },
    output: {
      type: 'object',
      required: ['raw', 'sha256'],
      properties: { raw: { type: 'string' }, sha256: { type: 'string' } },
      additionalProperties: false,
    },
    timings: {
      type: 'object',
      required: [
        'coldMs',
        'warmMs',
        'endToEndMs',
        'promptEvalMs',
        'generationMs',
        'runs',
        'sampleCount',
        'coldCondition',
        'warmCondition',
      ],
      properties: {
        coldMs: nullableNumber,
        warmMs: nullableNumber,
        endToEndMs: nullableNumber,
        promptEvalMs: nullableNumber,
        generationMs: nullableNumber,
        runs: { type: 'integer', minimum: 0 },
        sampleCount: { type: 'integer', minimum: 0 },
        coldCondition: { type: 'string' },
        warmCondition: { type: 'string' },
      },
      additionalProperties: false,
    },
    memory: {
      type: 'object',
      required: [
        'method',
        'sampleCadenceMs',
        'processTree',
        'peakRssBytes',
        'peakVramBytes',
        'contextTokens',
        'gpuIsolation',
      ],
      // processIdentity and VRAM baselines were added after the retained corpus
      // run; new measurements emit them, but historical rows may omit them.
      // Historical daemon-only RSS/event timing is descriptive, not final perf.
      properties: {
        method: { type: 'string' },
        sampleCadenceMs: { type: 'number', minimum: 0 },
        processTree: { type: 'string' },
        processIdentity: { type: 'string' },
        peakRssBytes: nullableNumber,
        peakVramBytes: nullableNumber,
        baselineVramBytes: nullableNumber,
        peakVramDeltaBytes: nullableNumber,
        contextTokens: { type: 'integer', minimum: 1 },
        gpuIsolation: { type: 'string' },
      },
      additionalProperties: false,
    },
    checks: {
      type: 'array',
      items: {
        type: 'object',
        required: ['id', 'expected', 'observed', 'pass'],
        properties: { id: { type: 'string' }, expected: {}, observed: {}, pass: { type: 'boolean' } },
        additionalProperties: false,
      },
    },
    retries: { type: 'integer', minimum: 0 },
    stopReason: { type: 'string' },
    outcome: { enum: ['pass', 'fail', 'unsupported', 'unmeasured'] },
    limitations: { type: 'array', items: { type: 'string' } },
  },
  additionalProperties: false,
};

function finiteOrNull(value, name) {
  if (value === null) return;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0)
    throw new Error(`${name} must be a finite non-negative number or null`);
}
export function assertRecord(record) {
  for (const key of RECORD_SCHEMA.required) if (!(key in record)) throw new Error(`record missing ${key}`);
  if (record.schemaVersion !== SCHEMA_VERSION) throw new Error('record schemaVersion mismatch');
  if (!['pass', 'fail', 'unsupported', 'unmeasured'].includes(record.outcome))
    throw new Error('invalid outcome');
  if (typeof record.model?.id !== 'string' || typeof record.model?.runtimeModel !== 'string')
    throw new Error('model identity missing');
  if (typeof record.output?.raw !== 'string' || typeof record.output?.sha256 !== 'string')
    throw new Error('output missing');
  if (!Array.isArray(record.checks) || !Array.isArray(record.limitations))
    throw new Error('checks/limitations must be arrays');
  for (const check of record.checks)
    if (
      typeof check.id !== 'string' ||
      typeof check.pass !== 'boolean' ||
      !('expected' in check) ||
      !('observed' in check)
    )
      throw new Error('invalid check');
  for (const name of ['coldMs', 'warmMs', 'endToEndMs', 'promptEvalMs', 'generationMs'])
    finiteOrNull(record.timings?.[name], `timings.${name}`);
  for (const name of ['peakRssBytes', 'peakVramBytes', 'baselineVramBytes', 'peakVramDeltaBytes'])
    if (name in (record.memory ?? {})) finiteOrNull(record.memory[name], `memory.${name}`);
  if (!Number.isInteger(record.timings?.sampleCount) || record.timings.sampleCount < 0)
    throw new Error('timings.sampleCount must be a non-negative integer');
  if (!Number.isFinite(record.memory?.sampleCadenceMs) || record.memory.sampleCadenceMs < 0)
    throw new Error('memory.sampleCadenceMs must be finite non-negative');
  return record;
}
