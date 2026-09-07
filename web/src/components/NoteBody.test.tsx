import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Speller } from '../lib/spelling.js';
import { NoteBody } from './NoteBody.js';
import { SpellingContext, type Spelling } from './SpellingProvider.js';

/**
 * The spelling layer on the note body (2026-09-07), against a dictionary of
 * a dozen words so the behaviour is what is under test: the wavy mark, the
 * menu on a click, the replacement, and the two ways to accept a word.
 */

const KNOWN = new Set([
  'subjective',
  'the',
  'client',
  'slept',
  'well',
  'plan',
  'continue',
  'continues',
  'weekly',
  'saw',
  'and',
]);
const speller: Speller = {
  correct: (word) => KNOWN.has(word.toLowerCase()),
  suggest: (word) => (word.toLowerCase() === 'teh' ? ['the', 'ten'] : []),
};

function renderBody(
  value: string,
  overrides: Partial<Spelling> = {},
  props: Partial<React.ComponentProps<typeof NoteBody>> = {},
): { onChange: ReturnType<typeof vi.fn> } {
  const onChange = vi.fn();
  const spelling: Spelling = {
    speller,
    accepted: new Set(),
    addWord: vi.fn(),
    ignoreWord: vi.fn(),
    ...overrides,
  };
  render(
    <SpellingContext.Provider value={spelling}>
      <NoteBody
        value={value}
        sections={['Subjective', 'Plan']}
        readOnly={false}
        refined={false}
        refining={false}
        onChange={onChange}
        onBlur={() => {}}
        onSelect={() => {}}
        {...props}
      />
    </SpellingContext.Provider>,
  );
  return { onChange };
}

function marks(): string[] {
  return Array.from(document.querySelectorAll('.misspelt')).map((node) => node.textContent ?? '');
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('spelling on the note body', () => {
  it('marks the words the dictionary does not know, a beat after the text settles', async () => {
    renderBody('Subjective: Teh client slept well.\n\nPlan: Continue weekly.');
    await waitFor(() => {
      expect(marks()).toEqual(['Teh']);
    });
    // The textarea and the backdrop carry the same characters.
    expect(screen.getByTestId('note-highlights').textContent).toBe(
      'Subjective: Teh client slept well.\n\nPlan: Continue weekly.\n',
    );
  });

  it('offers suggestions on a click in the word, and swaps the pick into the text', async () => {
    const { onChange } = renderBody('Subjective: Teh client slept well.');
    await waitFor(() => {
      expect(marks()).toEqual(['Teh']);
    });

    const body = screen.getByTestId('note-body') as HTMLTextAreaElement;
    body.setSelectionRange(13, 13);
    fireEvent.click(body, { clientX: 40, clientY: 20 });

    const menu = await screen.findByTestId('spelling-menu');
    expect(menu.textContent).toContain('The');
    expect(menu.textContent).toContain('Ten');
    fireEvent.click(screen.getByRole('menuitem', { name: 'The' }));

    expect(onChange).toHaveBeenCalledWith('Subjective: The client slept well.');
    expect(screen.queryByTestId('spelling-menu')).toBeNull();
  });

  it('opens nothing on a click in a word it knows, or on a selection', async () => {
    renderBody('Subjective: Teh client slept well.');
    await waitFor(() => {
      expect(marks()).toEqual(['Teh']);
    });
    const body = screen.getByTestId('note-body') as HTMLTextAreaElement;
    body.setSelectionRange(20, 20);
    fireEvent.click(body);
    expect(screen.queryByTestId('spelling-menu')).toBeNull();
    body.setSelectionRange(12, 15);
    fireEvent.click(body);
    expect(screen.queryByTestId('spelling-menu')).toBeNull();
  });

  it('never flags the patient’s name or a word she accepted, and Add to dictionary asks for that', async () => {
    const addWord = vi.fn();
    renderBody(
      'Subjective: Saw Zebediah and Kirsty. Sertraline continues.',
      { addWord, accepted: new Set(['kirsty']) },
      {
        allowWords: ['Zebediah Quill'],
      },
    );
    await waitFor(() => {
      expect(marks()).toEqual(['Sertraline']);
    });

    const body = screen.getByTestId('note-body') as HTMLTextAreaElement;
    body.setSelectionRange(38, 38);
    fireEvent.click(body);
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Add to dictionary' }));
    expect(addWord).toHaveBeenCalledWith('Sertraline');
  });

  it('draws no marks, and asks nothing, without a dictionary', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderBody('Subjective: Teh client.', { speller: null });
    await act(async () => {
      vi.advanceTimersByTime(600);
      await Promise.resolve();
    });
    expect(marks()).toEqual([]);
  });
});
