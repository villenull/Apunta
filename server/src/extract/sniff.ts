import { unzipSync } from 'fflate';

/**
 * What a buffer actually is, from its first bytes.
 *
 * The browser's `File.type` comes from the OS's extension mapping and the
 * extension is whatever the user typed, so neither is evidence. Reading the
 * magic bytes is fifteen lines and needs no dependency, and it is what lets a
 * `.docx` that is really a Pages export fail with the right instructions
 * instead of a parser stack trace.
 */
export type Sniffed = 'docx' | 'pdf' | 'pages' | 'zip' | 'ole' | 'rtf' | 'image' | 'text';

function startsWith(buffer: Buffer, bytes: readonly number[]): boolean {
  if (buffer.length < bytes.length) return false;
  return bytes.every((byte, index) => buffer[index] === byte);
}

/**
 * Names inside a zip, read from the central directory without decompressing
 * anything: `filter` sees each entry and we always answer `false`, so a zip
 * bomb never expands. `unzipSync` throws on data that is not really a zip.
 */
function zipEntryNames(buffer: Buffer): string[] {
  const names: string[] = [];
  try {
    unzipSync(new Uint8Array(buffer), {
      filter: (file) => {
        names.push(file.name);
        return false;
      },
    });
  } catch {
    // Not a readable zip after all. An empty list falls through to `zip`,
    // which the caller rejects with the generic unsupported-type copy.
  }
  return names;
}

export function sniff(buffer: Buffer): Sniffed {
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'pdf'; // %PDF-
  if (startsWith(buffer, [0xd0, 0xcf, 0x11, 0xe0])) return 'ole'; // .doc/.xls
  if (startsWith(buffer, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return 'rtf'; // {\rtf
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47])) return 'image'; // PNG
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image'; // JPEG
  if (startsWith(buffer, [0x47, 0x49, 0x46, 0x38])) return 'image'; // GIF8

  if (startsWith(buffer, [0x50, 0x4b, 0x03, 0x04])) {
    const names = zipEntryNames(buffer);
    if (names.includes('word/document.xml')) return 'docx';
    if (names.some((name) => name.startsWith('Index/'))) return 'pages';
    return 'zip';
  }

  return 'text';
}
