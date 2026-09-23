import { StrictMode } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SpellingProvider, useSpellingContext } from './SpellingProvider.js';
import { useSpelling } from '../hooks/useSpelling.js';
import type { Speller } from '../lib/spelling.js';

const TEST_SPELLER: Speller = {
  correct: () => true,
  suggest: () => [],
};

function SpellingProbe(): React.JSX.Element {
  useSpelling('');
  const { speller } = useSpellingContext();
  return <output data-testid="speller-state">{speller === null ? 'pending' : 'ready'}</output>;
}

describe('SpellingProvider', () => {
  it('publishes a dictionary loaded during StrictMode effect replay', async () => {
    let resolveLoad: (speller: Speller) => void = () => {};
    const load = () =>
      new Promise<Speller>((resolve) => {
        resolveLoad = resolve;
      });

    render(
      <StrictMode>
        <SpellingProvider load={load}>
          <SpellingProbe />
        </SpellingProvider>
      </StrictMode>,
    );

    expect(screen.getByTestId('speller-state').textContent).toBe('pending');
    await act(async () => {
      resolveLoad(TEST_SPELLER);
    });
    await waitFor(() => expect(screen.getByTestId('speller-state').textContent).toBe('ready'));
  });
});
