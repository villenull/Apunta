import { createCipheriv, createDecipheriv, createHash, randomBytes, scryptSync } from 'node:crypto';

import { ENCRYPTED_PAYLOAD_NAME, EncryptionMetaSchema, type EncryptionMeta } from '@apunta/shared';

/**
 * Encryption for a backup that leaves the machine.
 *
 * The research's first recommendation is the container, not the file: point
 * the backup at an encrypted APFS volume and let macOS hold the key
 * (`docs/research/data-at-rest-2026-08.md` §5.5). This is the documented
 * fallback for the case the container cannot be encrypted — handing one file
 * to someone, or a shared drive — and it follows the two rules the research
 * attaches to building it at all:
 *
 * 1. `RESTORE.txt` stays **outside** the encrypted blob. Instructions locked
 *    inside the thing you cannot open are not instructions.
 * 2. The prompt says the quiet part: a lost passphrase means the archive is
 *    gone, and an unopenable backup in 2031 is worse than an unencrypted one
 *    in a drawer.
 *
 * A third rule follows from the first: the format has to be openable *without
 * Apunta*. AES-256-GCM with an scrypt KDF needs nothing but Node's standard
 * library, and `RESTORE.txt` carries the ~20-line script verbatim. That is why
 * this is not zip's own encryption — ZipCrypto is broken, and AES-zip would
 * need a library the recipient may not have.
 *
 * Everything here is deliberately synchronous and dependency-free. `scryptSync`
 * at these parameters takes well under a second on the target hardware, and a
 * backup is not on any latency path.
 */

/** Node's default `N` is 16384; 2^17 costs ~0.5s and ~128MB, which a backup can afford. */
export const SCRYPT_N = 131_072;
export const SCRYPT_R = 8;
export const SCRYPT_P = 1;
export const KEY_BYTES = 32;
const SALT_BYTES = 16;
/** 12 bytes is the GCM-native nonce length; longer nonces are rehashed and buy nothing. */
const IV_BYTES = 12;

/** scrypt's memory ceiling defaults below what N=2^17 needs, so it is raised explicitly. */
const SCRYPT_MAXMEM = 256 * 1024 * 1024;

export interface EncryptedPayload {
  readonly meta: EncryptionMeta;
  readonly ciphertext: Buffer;
}

export function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return scryptSync(passphrase, salt, KEY_BYTES, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
}

export function encryptPayload(plaintext: Buffer, passphrase: string): EncryptedPayload {
  const salt = randomBytes(SALT_BYTES);
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(passphrase, salt), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    ciphertext,
    meta: {
      algorithm: 'aes-256-gcm',
      kdf: 'scrypt',
      n: SCRYPT_N,
      r: SCRYPT_R,
      p: SCRYPT_P,
      key_bytes: KEY_BYTES,
      salt_base64: salt.toString('base64'),
      iv_base64: iv.toString('base64'),
      auth_tag_base64: cipher.getAuthTag().toString('base64'),
      payload: ENCRYPTED_PAYLOAD_NAME,
    },
  };
}

/** Throws when the passphrase is wrong — GCM's tag check is the whole point. */
export function decryptPayload(ciphertext: Buffer, meta: EncryptionMeta, passphrase: string): Buffer {
  const parsed = EncryptionMetaSchema.parse(meta);
  const salt = Buffer.from(parsed.salt_base64, 'base64');
  const key = scryptSync(passphrase, salt, parsed.key_bytes, {
    N: parsed.n,
    r: parsed.r,
    p: parsed.p,
    maxmem: SCRYPT_MAXMEM,
  });
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(parsed.iv_base64, 'base64'));
  decipher.setAuthTag(Buffer.from(parsed.auth_tag_base64, 'base64'));
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

export function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
