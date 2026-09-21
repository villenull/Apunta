import type { ReactNode } from 'react';

/**
 * The model's Markdown, rendered without ever parsing HTML.
 *
 * Every string here becomes a React text node, which React escapes — so a
 * reply containing `<script>`, `<img onerror=…>` or any other tag renders as
 * the literal characters, never as an element. There is no
 * `dangerouslySetInnerHTML` anywhere on this path, by construction rather
 * than by review.
 *
 * Deliberately small: headings, bold, italic, code (span and fence), lists,
 * quotes, and `[text](url)` shown as text with its address. Anything else —
 * tables, raw links, images — arrives as plain text, which is a fine way to
 * read a thought.
 */

interface Block {
  readonly kind: 'heading' | 'paragraph' | 'list' | 'ordered' | 'quote' | 'code';
  readonly level: number;
  readonly lines: readonly string[];
}

function toBlocks(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let index = 0;

  const isSpecial = (line: string): boolean =>
    line.trim() === '' ||
    line.trim().startsWith('```') ||
    /^#{1,3}\s+/.test(line) ||
    /^[-*]\s+/.test(line) ||
    /^\d+[.)]\s+/.test(line) ||
    line.startsWith('> ') ||
    line === '>';

  while (index < lines.length) {
    const line = lines[index] ?? '';
    if (line.trim() === '') {
      index += 1;
      continue;
    }
    if (line.trim().startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !(lines[index] ?? '').trim().startsWith('```')) {
        code.push(lines[index] ?? '');
        index += 1;
      }
      index += 1;
      blocks.push({ kind: 'code', level: 0, lines: code });
      continue;
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', level: heading[1]?.length ?? 1, lines: [heading[2] ?? ''] });
      index += 1;
      continue;
    }
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^[-*]\s+/, ''));
        index += 1;
      }
      blocks.push({ kind: 'list', level: 0, lines: items });
      continue;
    }
    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+[.)]\s+/.test(lines[index] ?? '')) {
        items.push((lines[index] ?? '').replace(/^\d+[.)]\s+/, ''));
        index += 1;
      }
      blocks.push({ kind: 'ordered', level: 0, lines: items });
      continue;
    }
    if (line.startsWith('> ') || line === '>') {
      const quoted: string[] = [];
      while (
        index < lines.length &&
        ((lines[index] ?? '').startsWith('> ') || (lines[index] ?? '') === '>')
      ) {
        quoted.push((lines[index] ?? '').replace(/^> ?/, ''));
        index += 1;
      }
      blocks.push({ kind: 'quote', level: 0, lines: quoted });
      continue;
    }
    const paragraph: string[] = [];
    while (index < lines.length && !isSpecial(lines[index] ?? '')) {
      paragraph.push(lines[index] ?? '');
      index += 1;
    }
    blocks.push({ kind: 'paragraph', level: 0, lines: paragraph });
  }

  return blocks;
}

/** The first `**` at or after `from`, or -1. */
function findStrongCloser(text: string, from: number): number {
  return text.indexOf('**', from);
}

/** The first `*` at or after `from` that is not half of a `**`, or -1. */
function findEmCloser(text: string, from: number): number {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] !== '*') continue;
    if (text[index + 1] === '*' || text[index - 1] === '*') continue;
    return index;
  }
  return -1;
}

const LINK_AT_START = /^\[([^\]]+)\]\(([^)\s]+)\)/;

function parseInline(text: string, keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  let literal = '';
  let serial = 0;
  const key = (): string => `${keyBase}-${String(serial++)}`;
  const flush = (): void => {
    if (literal !== '') {
      out.push(literal);
      literal = '';
    }
  };

  let index = 0;
  while (index < text.length) {
    if (text.startsWith('`', index)) {
      const closer = text.indexOf('`', index + 1);
      if (closer === -1) {
        literal += '`';
        index += 1;
        continue;
      }
      flush();
      out.push(<code key={key()}>{text.slice(index + 1, closer)}</code>);
      index = closer + 1;
      continue;
    }
    if (text.startsWith('**', index)) {
      const closer = findStrongCloser(text, index + 2);
      if (closer === -1) {
        literal += '**';
        index += 2;
        continue;
      }
      flush();
      const innerKey = key();
      out.push(<strong key={innerKey}>{parseInline(text.slice(index + 2, closer), innerKey)}</strong>);
      index = closer + 2;
      continue;
    }
    if (text[index] === '*') {
      const closer = findEmCloser(text, index + 1);
      if (closer === -1) {
        literal += '*';
        index += 1;
        continue;
      }
      flush();
      const innerKey = key();
      out.push(<em key={innerKey}>{parseInline(text.slice(index + 1, closer), innerKey)}</em>);
      index = closer + 1;
      continue;
    }
    if (text[index] === '[') {
      const link = LINK_AT_START.exec(text.slice(index));
      if (link) {
        flush();
        const innerKey = key();
        out.push(
          <span key={innerKey}>
            {parseInline(link[1] ?? '', innerKey)}
            {` (${link[2] ?? ''})`}
          </span>,
        );
        index += link[0].length;
        continue;
      }
      literal += '[';
      index += 1;
      continue;
    }
    literal += text[index];
    index += 1;
  }
  flush();
  return out;
}

function withBreaks(lines: readonly string[], keyBase: string): ReactNode[] {
  const out: ReactNode[] = [];
  lines.forEach((line, index) => {
    if (index > 0) out.push(<br key={`${keyBase}-br-${String(index)}`} />);
    for (const node of parseInline(line, `${keyBase}-l${String(index)}`)) out.push(node);
  });
  return out;
}

/** A model's Markdown reply, as elements. See the file comment for the safety story. */
export function Markdown({ text }: { text: string }): React.JSX.Element {
  const blocks = toBlocks(text);
  return (
    <>
      {blocks.map((block, index) => {
        const keyBase = `md-${String(index)}`;
        switch (block.kind) {
          case 'heading':
            return block.level === 1 ? (
              <h3 key={keyBase} className="md-heading">
                {parseInline(block.lines[0] ?? '', keyBase)}
              </h3>
            ) : (
              <h4 key={keyBase} className="md-heading">
                {parseInline(block.lines[0] ?? '', keyBase)}
              </h4>
            );
          case 'list':
            return (
              <ul key={keyBase} className="md-list">
                {block.lines.map((item, itemIndex) => (
                  <li key={`${keyBase}-i${String(itemIndex)}`}>
                    {parseInline(item, `${keyBase}-i${String(itemIndex)}`)}
                  </li>
                ))}
              </ul>
            );
          case 'ordered':
            return (
              <ol key={keyBase} className="md-list">
                {block.lines.map((item, itemIndex) => (
                  <li key={`${keyBase}-i${String(itemIndex)}`}>
                    {parseInline(item, `${keyBase}-i${String(itemIndex)}`)}
                  </li>
                ))}
              </ol>
            );
          case 'quote':
            return (
              <blockquote key={keyBase} className="md-quote">
                {withBreaks(block.lines, keyBase)}
              </blockquote>
            );
          case 'code':
            return (
              <pre key={keyBase} className="md-code">
                {block.lines.join('\n')}
              </pre>
            );
          case 'paragraph':
            return (
              <p key={keyBase} className="md-paragraph">
                {withBreaks(block.lines, keyBase)}
              </p>
            );
        }
      })}
    </>
  );
}
