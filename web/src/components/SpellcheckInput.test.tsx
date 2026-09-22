import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Speller } from '../lib/spelling.js';
import { SpellcheckInput } from './SpellcheckInput.js';
import { SpellingContext, type Spelling } from './SpellingProvider.js';

const speller: Speller = {
  correct: (word) => word.toLowerCase() === 'the',
  suggest: (word) => (word.toLowerCase() === 'teh' ? ['the'] : []),
};

function renderInput(value: string, overrides: Partial<Spelling> = {}): void {
  const spelling: Spelling = {
    speller,
    accepted: new Set(),
    addWord: vi.fn(),
    ignoreWord: vi.fn(),
    ...overrides,
  };
  render(
    <SpellingContext.Provider value={spelling}>
      <SpellcheckInput aria-label="Name" value={value} onChange={() => {}} allowWords={['Qvplum']} />
    </SpellingContext.Provider>,
  );
}

describe('SpellcheckInput', () => {
  it('marks a typo, offers a suggestion, and adds the word through the shared menu', async () => {
    const addWord = vi.fn();
    renderInput('Teh Qvplum', { addWord });

    const input = screen.getByRole('textbox', { name: 'Name' });
    await waitFor(() => {
      expect(screen.getAllByText('Teh', { selector: '.misspelt' })).toHaveLength(1);
      expect(screen.queryByText('Qvplum', { selector: '.misspelt' })).toBeNull();
    });
    expect(input.getAttribute('spellcheck')).toBe('false');

    (input as HTMLInputElement).setSelectionRange(1, 1);
    fireEvent.click(input, { clientX: 24, clientY: 16 });
    const menu = await screen.findByTestId('spelling-menu');
    expect(menu.textContent).toContain('The');

    fireEvent.click(screen.getByRole('menuitem', { name: 'Add to dictionary' }));
    expect(addWord).toHaveBeenCalledWith('Teh');
  });
});
