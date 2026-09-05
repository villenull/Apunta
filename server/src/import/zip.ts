import { inflateRawSync } from 'node:zlib';

/**
 * Just enough ZIP to open a data export, and nothing more.
 *
 * A Claude export arrives as a zip of a few JSON files. Reading it needs the
 * central directory and DEFLATE, both of which Node has (`node:zlib`), so
 * this is ~80 lines rather than a dependency — a privacy-first app that
 * reads clinical material should carry as little third-party code on that
 * path as it can. What it does not do, and says so: ZIP64 (archives over
 * 4 GB, or with more than 65 535 entries) and encryption. A data export is
 * neither.
 */

export class ZipFormatError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipFormatError';
  }
}

export interface ZipEntry {
  readonly name: string;
  readonly bytes: number;
  /** Inflate on demand: an export can hold files nobody asked for. */
  read(): Buffer;
}

const EOCD_SIGNATURE = 0x06054b50;
const CENTRAL_SIGNATURE = 0x02014b50;
const LOCAL_SIGNATURE = 0x04034b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;
const STORED = 0;
const DEFLATED = 8;

export function readZip(archive: Buffer): ZipEntry[] {
  const eocd = findEndOfCentralDirectory(archive);
  const entries = archive.readUInt16LE(eocd + 10);
  const directoryOffset = archive.readUInt32LE(eocd + 16);
  if (entries === 0xffff || directoryOffset === 0xffffffff) {
    throw new ZipFormatError('ZIP64 archives are not supported');
  }

  const found: ZipEntry[] = [];
  let cursor = directoryOffset;
  for (let index = 0; index < entries; index += 1) {
    if (cursor + 46 > archive.length || archive.readUInt32LE(cursor) !== CENTRAL_SIGNATURE) {
      throw new ZipFormatError('central directory is damaged');
    }
    const method = archive.readUInt16LE(cursor + 10);
    const compressedBytes = archive.readUInt32LE(cursor + 20);
    const bytes = archive.readUInt32LE(cursor + 24);
    const nameLength = archive.readUInt16LE(cursor + 28);
    const extraLength = archive.readUInt16LE(cursor + 30);
    const commentLength = archive.readUInt16LE(cursor + 32);
    const localOffset = archive.readUInt32LE(cursor + 42);
    const name = archive.toString('utf8', cursor + 46, cursor + 46 + nameLength);
    cursor += 46 + nameLength + extraLength + commentLength;

    if (bytes === 0xffffffff || compressedBytes === 0xffffffff) {
      throw new ZipFormatError('ZIP64 archives are not supported');
    }
    found.push({
      name,
      bytes,
      read: () => readEntry(archive, localOffset, method, compressedBytes, bytes, name),
    });
  }
  return found;
}

function findEndOfCentralDirectory(archive: Buffer): number {
  const floor = Math.max(0, archive.length - EOCD_MIN - MAX_COMMENT);
  for (let offset = archive.length - EOCD_MIN; offset >= floor; offset -= 1) {
    if (archive.readUInt32LE(offset) === EOCD_SIGNATURE) return offset;
  }
  throw new ZipFormatError('not a zip file');
}

function readEntry(
  archive: Buffer,
  localOffset: number,
  method: number,
  compressedBytes: number,
  bytes: number,
  name: string,
): Buffer {
  if (localOffset + 30 > archive.length || archive.readUInt32LE(localOffset) !== LOCAL_SIGNATURE) {
    throw new ZipFormatError(`entry "${name}" is damaged`);
  }
  const nameLength = archive.readUInt16LE(localOffset + 26);
  const extraLength = archive.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const end = start + compressedBytes;
  if (end > archive.length) throw new ZipFormatError(`entry "${name}" runs past the end of the file`);
  const raw = archive.subarray(start, end);

  if (method === STORED) return Buffer.from(raw);
  if (method === DEFLATED) {
    const inflated = inflateRawSync(raw);
    if (inflated.length !== bytes)
      throw new ZipFormatError(`entry "${name}" did not inflate to its declared size`);
    return inflated;
  }
  throw new ZipFormatError(`entry "${name}" uses an unsupported compression method`);
}
