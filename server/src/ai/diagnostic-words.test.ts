import { describe, expect, it } from 'vitest';

import { acceptsRewrite, novelDiagnosticWords } from './diagnostic-words.js';

const SOURCE =
  'She has been washing her hands until they crack, thirty to thirty-five times a day, since the winter. Presentation is consistent with panic attacks with early agoraphobic avoidance. My read is recurrent major depressive disorder.';

describe('novelDiagnosticWords', () => {
  it('finds a diagnostic word her notes never use', () => {
    expect(novelDiagnosticWords('Patient presents with hand-washing compulsions.', SOURCE)).toEqual([
      'compulsions',
    ]);
    expect(novelDiagnosticWords('Consistent with OCD and panic disorder.', SOURCE)).toEqual([
      'OCD',
      'panic disorder',
    ]);
  });

  it('lets a word she used, or its stem, stand', () => {
    expect(novelDiagnosticWords('Early agoraphobia with avoidance.', SOURCE)).toEqual([]);
    expect(novelDiagnosticWords('Working impression: recurrent major depressive disorder.', SOURCE)).toEqual(
      [],
    );
  });

  it('needs the exact phrase for any other "… disorder"', () => {
    expect(novelDiagnosticWords('Possible adjustment disorder.', SOURCE)).toEqual(['adjustment disorder']);
  });
});

describe('acceptsRewrite', () => {
  const original =
    'Patient presents with hand-washing compulsions, washing until her hands crack thirty to thirty-five times a day since winter.';

  it('keeps a rewrite that only lost the word', () => {
    expect(
      acceptsRewrite(
        original,
        'Patient presents with hand-washing, washing until her hands crack thirty to thirty-five times a day since winter.',
        SOURCE,
      ),
    ).toBe(true);
  });

  it('refuses a rewrite that kept the word, or brought another', () => {
    expect(acceptsRewrite(original, original, SOURCE)).toBe(false);
    expect(
      acceptsRewrite(
        original,
        'Patient presents with obsessive hand-washing until her hands crack thirty to thirty-five times a day since winter.',
        SOURCE,
      ),
    ).toBe(false);
  });

  it('refuses a rewrite that lost or changed a number, a month or a risk statement', () => {
    expect(
      acceptsRewrite(
        original,
        'Patient presents with hand-washing until her hands crack, many times a day.',
        SOURCE,
      ),
    ).toBe(false);
    expect(
      acceptsRewrite(
        'Hand-washing compulsions; she denied SI.',
        'Hand-washing; she reported thoughts of not waking up.',
        SOURCE,
      ),
    ).toBe(false);
  });

  it('refuses a rewrite much longer or shorter than the original', () => {
    expect(acceptsRewrite(original, `${original} ${original}`.replace(/compulsions/g, ''), SOURCE)).toBe(
      false,
    );
  });
});
