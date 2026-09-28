// Canonical serialization and digests for extraction evidence.
//
// One rule, used everywhere a byte-for-byte comparison is claimed: JSON is
// written with object keys in ascending code-unit order, arrays in the order
// the producer chose, no insignificant whitespace, and `undefined` properties
// omitted. Two independent code paths in this directory (this one and
// `fixtures/expected.mjs`) must produce the same digest for the same value, and
// a test asserts it, so a digest in the manifest is evidence and not a
// self-fulfilling number.

import { createHash } from 'node:crypto';

/** JSON with sorted object keys and no insignificant whitespace. */
export function canonicalJson(value) {
  return write(value);
}

function write(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string') return JSON.stringify(value);
  if (type === 'boolean') return value ? 'true' : 'false';
  if (type === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value))
    return `[${value.map((item) => write(item === undefined ? null : item)).join(',')}]`;
  if (type === 'object') {
    const keys = Object.keys(value)
      .filter((key) => value[key] !== undefined)
      .sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${write(value[key])}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: unsupported value of type ${type}`);
}

/** Lowercase hex SHA-256 of a UTF-8 string. */
export function sha256Hex(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Lowercase hex SHA-256 of a value's canonical form. */
export function digestOf(value) {
  return sha256Hex(canonicalJson(value));
}

/** `sha256:<64 hex>`, the form written into manifests. */
export function taggedDigest(value) {
  return `sha256:${digestOf(value)}`;
}
