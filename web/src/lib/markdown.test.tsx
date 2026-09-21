import { render, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { Markdown } from './markdown.js';

function show(text: string): HTMLElement {
  const { container } = render(<Markdown text={text} />);
  return container;
}

describe('Markdown', () => {
  it('renders headings, bold, italic and lists as elements', () => {
    const root = show('# A thought\n\nSubjective **sleep** is *better*.\n\n- one\n- two');
    expect(root.querySelector('h3')?.textContent).toBe('A thought');
    expect(root.querySelector('strong')?.textContent).toBe('sleep');
    expect(root.querySelector('em')?.textContent).toBe('better');
    expect(root.querySelectorAll('li')).toHaveLength(2);
  });

  it('nests emphasis and keeps code spans literal', () => {
    const root = show('**bold with *italic* inside** and `**not bold**`');
    expect(root.querySelector('strong')?.textContent).toBe('bold with italic inside');
    expect(root.querySelector('em')?.textContent).toBe('italic');
    expect(root.querySelector('code')?.textContent).toBe('**not bold**');
  });

  it('shows a fenced block unformatted, and a link as text with its address', () => {
    const root = show('```\n**raw**\n```\n\nSee [the note](/notes) for detail.');
    expect(root.querySelector('pre')?.textContent).toContain('**raw**');
    expect(root.textContent).toContain('the note (/notes)');
    expect(root.querySelector('a')).toBeNull();
  });

  it('never turns markup that looks like HTML into elements', () => {
    const root = show('<script>alert(1)</script>\n\n<img src=x onerror=alert(1)>\n\n<a href="x">click</a>');
    expect(root.querySelector('script')).toBeNull();
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('a')).toBeNull();
    expect(root.textContent).toContain('<script>alert(1)</script>');
    expect(root.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('leaves unmatched markers as the literal characters she can read', () => {
    const root = show('a **bold start with no end and *one star');
    expect(root.textContent).toBe('a **bold start with no end and *one star');
    expect(root.querySelector('strong')).toBeNull();
    expect(root.querySelector('em')).toBeNull();
  });

  it('keeps single newlines as breaks inside one paragraph', () => {
    const root = show('first line\nsecond line');
    expect(root.querySelectorAll('p')).toHaveLength(1);
    expect(root.querySelector('br')).not.toBeNull();
  });

  it('renders quotes and numbered lists', () => {
    const root = show('> worth sitting with\n\n1. support\n2. session');
    expect(root.querySelector('blockquote')?.textContent).toBe('worth sitting with');
    const items = root.querySelectorAll('ol li');
    expect(items).toHaveLength(2);
    expect(within(root as HTMLElement).getByText('support')).toBeDefined();
  });

  it('renders an injection attempt through emphasis as text, not structure', () => {
    const root = show('**<img src=x onerror=alert(2)>**');
    expect(root.querySelector('img')).toBeNull();
    expect(root.querySelector('strong')?.textContent).toBe('<img src=x onerror=alert(2)>');
  });

  it('renders nothing for nothing', () => {
    const root = show('');
    expect(root.textContent).toBe('');
  });
});
