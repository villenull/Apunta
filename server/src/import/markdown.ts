import { isLabelText } from '@apunta/shared';

/**
 * Claude's Markdown, as the plain text an Apunta note is.
 *
 * Claude writes `**Location:** Online`, `## Risk review`, `- item` and
 * `*italic*`. The note body is a plain textarea, the copy into Halaxy is
 * plain text, and the drafting and refine prompts are written for plain
 * text, so the import converts once, before anything is stored (owner,
 * 2026-09-21). What was emphasis becomes a `Label:` line where it was a
 * label — the editor shows those in bold — and otherwise just goes away.
 *
 * Every rule is conservative about what it touches: an asterisk or an
 * underscore only counts as Markdown when it opens and closes a span the way
 * Markdown means it, so `2*3*4`, `file_name_v2.txt` and `snake_case` pass
 * through untouched. Code spans keep their content verbatim.
 *
 * Numbered lists stay as they are; bullets become `- `, the shape Apunta's
 * own notes already use.
 */
export function plainFromMarkdown(text: string): string {
  const out: string[] = [];
  let fenced = false;

  for (const line of text.replace(/\r\n?/g, '\n').split('\n')) {
    // Fenced code: the fences go, the content stays exactly as written.
    if (/^\s*(```|~~~)/.test(line)) {
      fenced = !fenced;
      continue;
    }
    if (fenced) {
      out.push(line);
      continue;
    }

    // Horizontal rules, and a table's |---|---| separator row.
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) continue;
    if (/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?\s*$/.test(line)) continue;

    // `# Heading` → `Heading:` when it reads as a label, otherwise its text.
    const heading = /^\s{0,3}#{1,6}\s+(.*?)(?:\s+#+)?\s*$/.exec(line);
    if (heading) {
      out.push(asLabel(inline(heading[1] ?? '')));
      continue;
    }
    // A line that is nothing but a bold span is a heading in all but name.
    const boldLine = /^\s*(\*\*|__)(?!\s)(.+?)(?<!\s)\1\s*$/.exec(line);
    if (boldLine) {
      out.push(asLabel(inline(boldLine[2] ?? '')));
      continue;
    }

    // Blockquotes lose their marker.
    let body = line.replace(/^(\s*)>\s?/, '$1');

    // Bullets: `*`, `+` or `-`, then a space. Indentation (nesting) is kept.
    const bullet = /^(\s*)[*+-]\s+(.*)$/.exec(body);
    if (bullet) body = `${bullet[1] ?? ''}- ${inline(bullet[2] ?? '')}`;
    else body = inline(body);

    out.push(body.replace(/\s+$/, ''));
  }

  return out
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** `Risk review` → `Risk review:`; anything that is not label-shaped as is. */
function asLabel(text: string): string {
  const trimmed = text.trim();
  if (trimmed.endsWith(':')) return trimmed;
  return isLabelText(trimmed) ? `${trimmed}:` : trimmed;
}

/** Private-use characters stand in for escaped and code text while the spans are rewritten. */
const HOLD = '\uE000';
const RELEASE = '\uE001';

/** Inline spans on one line: code, images, links, bold, italic, escapes. */
function inline(line: string): string {
  const held: string[] = [];
  const hold = (value: string): string => {
    held.push(value);
    return `${HOLD}${String(held.length - 1)}${RELEASE}`;
  };

  let text = line
    // Backslash escapes are literal characters, not Markdown.
    .replace(/\\([\\`*_{}[\]()#+\-.!|~>])/g, (_, char: string) => hold(char))
    // Code spans: the backticks go, the content is kept verbatim.
    .replace(/(`+)(?!`)(.+?)(?<!`)\1(?!`)/g, (_, _ticks: string, code: string) => hold(code.trim()));

  text = text
    // Images, then links: the text stays, the address goes.
    .replace(/!\[([^\]]*)\]\([^)\s]*(?:\s+"[^"]*")?\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)\s]*(?:\s+"[^"]*")?\)/g, '$1')
    // Bold. `**` needs no word boundary; `__` does, so snake__case survives.
    .replace(/\*\*(?!\s)(.+?)(?<!\s)\*\*/g, '$1')
    .replace(/(?<![\p{L}\p{N}_])__(?!\s)(.+?)(?<!\s)__(?![\p{L}\p{N}_])/gu, '$1')
    // Italic, only when the span sits between non-word characters: `2*3*4`
    // and `file_name_v2` are left alone.
    .replace(/(?<![\p{L}\p{N}*\\])\*(?![\s*])(.+?)(?<![\s*])\*(?![\p{L}\p{N}*])/gu, '$1')
    .replace(/(?<![\p{L}\p{N}_])_(?![\s_])(.+?)(?<![\s_])_(?![\p{L}\p{N}_])/gu, '$1')
    // Strikethrough.
    .replace(/~~(?!\s)(.+?)(?<!\s)~~/g, '$1');

  return text.replace(
    new RegExp(`${HOLD}(\\d+)${RELEASE}`, 'g'),
    (_, index: string) => held[Number(index)] ?? '',
  );
}
