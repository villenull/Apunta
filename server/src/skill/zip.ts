import { MAX_SKILL_BYTES } from '@apunta/shared';
import { unzipSync } from 'fflate';

import { extractError, sniff } from '../extract/index.js';

/**
 * The `SKILL.md` inside an upload, which may be the markdown file itself or a
 * `.zip` of the whole skill folder.
 *
 * The zip guard is `originalSize`: fflate's `filter` sees the *uncompressed*
 * size of an entry before it decompresses anything, so an entry that claims to
 * expand to half a gigabyte is skipped rather than expanded and then rejected.
 */
export function readSkillMarkdown(buffer: Buffer): string {
  if (buffer.length > MAX_SKILL_BYTES) {
    throw extractError('too_large', 'That skill file is larger than 512 KB.');
  }

  const sniffed = sniff(buffer);

  if (sniffed === 'text') {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
    } catch {
      throw extractError('undecodable_text', "Apunta couldn't read that file as text.");
    }
  }

  if (sniffed !== 'zip' && sniffed !== 'docx' && sniffed !== 'pages') {
    throw extractError(
      'unsupported_type',
      "Upload the skill's SKILL.md file, or a .zip of the skill folder.",
    );
  }

  const candidates = new Map<string, Uint8Array>();
  try {
    const entries = unzipSync(new Uint8Array(buffer), {
      filter: (file) => /(^|\/)SKILL\.md$/i.test(file.name) && file.originalSize <= MAX_SKILL_BYTES,
    });
    for (const [name, bytes] of Object.entries(entries)) candidates.set(name, bytes);
  } catch {
    throw extractError('unsupported_type', "Apunta couldn't open that .zip.");
  }

  if (candidates.size === 0) {
    throw extractError(
      'unsupported_type',
      "That .zip doesn't contain a SKILL.md. Upload the skill folder, or the SKILL.md file on its own.",
    );
  }

  // The shallowest SKILL.md is the skill's own; anything deeper is a bundled
  // sub-skill. Ties break alphabetically so the choice is at least stable.
  const [name] = [...candidates.keys()].sort((left, right) => {
    const depth = left.split('/').length - right.split('/').length;
    return depth !== 0 ? depth : left.localeCompare(right);
  });

  const bytes = candidates.get(name as string);
  if (bytes === undefined) {
    throw extractError('unsupported_type', "That .zip doesn't contain a readable SKILL.md.");
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    throw extractError('undecodable_text', "Apunta couldn't read that SKILL.md as text.");
  }
}
