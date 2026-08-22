import { randomBytes } from 'node:crypto';

/**
 * UUIDv7 (RFC 9562 §5.7): 48-bit big-endian Unix millisecond timestamp, then
 * version + 74 bits of entropy. Ids therefore sort by creation time as plain
 * strings, which is what makes "newest first" listings and stable seed
 * ordering work without a secondary sort key.
 *
 * Node's `crypto.randomUUID()` only produces v4, and the one-function
 * dependencies that produce v7 are not worth an extra supply-chain surface for
 * an app whose whole point is that nothing leaves the machine.
 */

/** Layout: `rand_a` is 12 bits, so it counts 0..4095 within one millisecond. */
const MAX_SEQUENCE = 0xfff;

let lastTimestamp = -1;
let sequence = 0;

function hex(value: number, digits: number): string {
  return value.toString(16).padStart(digits, '0');
}

/**
 * Generate a UUIDv7. Monotonic: ids minted in the same millisecond keep
 * increasing via the `rand_a` counter, and a clock that steps backwards is
 * clamped rather than allowed to emit an out-of-order id.
 */
export function uuidv7(now: number = Date.now()): string {
  const timestamp = Math.max(now, lastTimestamp);

  if (timestamp === lastTimestamp) {
    sequence += 1;
    if (sequence > MAX_SEQUENCE) {
      // Exhausted this millisecond's counter: move to the next one.
      lastTimestamp = timestamp + 1;
      sequence = 0;
      return uuidv7(lastTimestamp);
    }
  } else {
    lastTimestamp = timestamp;
    sequence = randomBytes(2).readUInt16BE(0) & 0x0ff; // leave headroom to count up
  }

  const timeHigh = Math.floor(timestamp / 0x1_0000); // top 32 bits of the 48-bit ms value
  const timeLow = timestamp % 0x1_0000;

  const rand = randomBytes(8);
  // Variant bits (10xxxxxx) in the first byte of rand_b.
  rand[0] = ((rand[0] ?? 0) & 0x3f) | 0x80;
  const randHex = rand.toString('hex');

  return [
    hex(timeHigh, 8),
    hex(timeLow, 4),
    hex(0x7000 | sequence, 4), // version 7 + rand_a counter
    randHex.slice(0, 4),
    randHex.slice(4, 16),
  ].join('-');
}
