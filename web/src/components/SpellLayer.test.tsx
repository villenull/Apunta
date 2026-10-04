import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import type { Speller } from '../lib/spelling.js';
import { SpellLayer } from './SpellLayer.js';
import { SpellingContext, type Spelling } from './SpellingProvider.js';

const speller: Speller = {
  correct: (word) => word.toLowerCase() === 'the',
  suggest: (word) => (word.toLowerCase() === 'teh' ? ['the'] : []),
};

function renderInput(value: string, overrides: Partial<Spelling> = {}): void {
  const spelling: Spelling = {
    speller,
    error: null,
    accepted: new Set(),
    addWord: vi.fn(),
    ignoreWord: vi.fn(),
    ...overrides,
  };
  render(
    <SpellingContext.Provider value={spelling}>
      <SpellLayer as="input" aria-label="Name" value={value} onChange={() => {}} allowWords={['Qvplum']} />
    </SpellingContext.Provider>,
  );
}

describe('SpellLayer input', () => {
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

/**
 * S6.1's one rendered alert: one per mounted spell surface, in that surface's
 * own wrap (D4.4).
 */
describe('SpellLayer with a dictionary that could not load', () => {
  it('says nothing when there is no error, and one alert per mounted surface when there is', () => {
    const { unmount } = render(
      <SpellingContext.Provider
        value={{ speller: null, error: null, accepted: new Set(), addWord: vi.fn(), ignoreWord: vi.fn() }}
      >
        <SpellLayer as="input" aria-label="One" value="" onChange={() => {}} />
      </SpellingContext.Provider>,
    );
    expect(screen.queryByRole('alert')).toBeNull();
    unmount();

    // A note page with the chat open mounts two surfaces, and either can fail.
    render(
      <SpellingContext.Provider
        value={{
          speller: null,
          error: 'spelling.loadFailed',
          accepted: new Set(),
          addWord: vi.fn(),
          ignoreWord: vi.fn(),
        }}
      >
        <SpellLayer as="input" aria-label="One" value="" onChange={() => {}} />
        <SpellLayer as="textarea" aria-label="Two" value="" onChange={() => {}} />
      </SpellingContext.Provider>,
    );
    const alerts = screen.getAllByRole('alert');
    expect(alerts).toHaveLength(2);
    for (const alert of alerts) expect(alert.textContent).toBe('Spell check is unavailable');
    // In the field's own wrap, never in the menu.
    expect(screen.queryByTestId('spelling-menu')).toBeNull();
  });
});
