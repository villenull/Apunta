import { describe, expect, it } from 'vitest';

import {
  PRESENTATION_MSE_KNOWLEDGE,
  renderPresentationMse,
  type PresentationMseFact,
} from './presentation.js';

const fact = (
  signal: PresentationMseFact['signal'],
  status: PresentationMseFact['status'],
  source: PresentationMseFact['source'],
  detail?: string,
): PresentationMseFact => ({ signal, status, source, ...(detail === undefined ? {} : { detail }) });

describe('renderPresentationMse', () => {
  it('maps explicit observations to ordered clinical wording', () => {
    const result = renderPresentationMse([
      fact('thought-process.linear', 'present', 'observed'),
      fact('mood.self-report', 'present', 'reported', 'anxious'),
      fact('appearance.well-groomed', 'present', 'observed'),
      fact('thought-content.suicidal-ideation', 'absent', 'reported'),
      fact('affect.range-full', 'present', 'observed'),
    ]);

    expect(result.text).toBe(
      'Appearance was well-groomed. Mood was reported as "anxious". ' +
        'Affect was full-range. Thought process was linear. Suicidal ideation was denied.',
    );
    expect(result.omitted).toEqual([]);
  });

  it('does not fill an unmentioned MSE with normal findings', () => {
    const result = renderPresentationMse([]);

    expect(result.entries).toEqual([]);
    expect(result.text).toBe('');
  });

  it('renders a negative only when the caller supplies an explicit absence fact', () => {
    const result = renderPresentationMse([
      fact('appearance.well-groomed', 'absent', 'observed'),
      fact('speech.rate-rapid', 'absent', 'observed'),
    ]);

    expect(result.entries).toEqual([]);
    expect(result.omitted.map(({ signal, reason }) => ({ signal, reason }))).toEqual([
      { signal: 'appearance.well-groomed', reason: 'absence-not-supported' },
      { signal: 'speech.rate-rapid', reason: 'absence-not-supported' },
    ]);
  });

  it('uses dedicated negative mappings for explicit denial signals', () => {
    const result = renderPresentationMse([
      fact('perception.hallucinations', 'absent', 'observed'),
      fact('thought-content.suicidal-ideation', 'absent', 'reported'),
      fact('thought-content.delusions', 'absent', 'observed'),
    ]);

    expect(result.text).toBe(
      'No hallucinations were reported or observed. ' +
        'Suicidal ideation was denied. No delusions were reported or observed.',
    );
  });

  it('omits uncertain findings, including uncertain positives', () => {
    const result = renderPresentationMse([
      fact('speech.rate-rapid', 'uncertain', 'observed'),
      fact('thought-content.paranoia', 'uncertain', 'reported'),
    ]);

    expect(result.text).toBe('');
    expect(result.omitted).toEqual([
      { signal: 'speech.rate-rapid', reason: 'uncertain' },
      { signal: 'thought-content.paranoia', reason: 'uncertain' },
    ]);
  });

  it('requires detail for subjective or content-specific mappings', () => {
    const result = renderPresentationMse([
      fact('mood.self-report', 'present', 'reported'),
      fact('thought-content.preoccupation', 'present', 'reported', '   '),
      fact('thought-content.preoccupation', 'present', 'reported', 'work demands'),
    ]);

    expect(result.text).toBe('Thought content included preoccupation with "work demands".');
    expect(result.omitted).toEqual([
      { signal: 'mood.self-report', reason: 'detail-required' },
      { signal: 'thought-content.preoccupation', reason: 'detail-required' },
    ]);
  });

  it('does not relabel reported material as an observed finding', () => {
    const result = renderPresentationMse([
      fact('behavior.cooperative', 'present', 'reported'),
      fact('mood.self-report', 'present', 'observed', 'calm'),
      fact('thought-content.suicidal-ideation', 'present', 'observed'),
    ]);

    expect(result.text).toBe('');
    expect(result.omitted).toEqual([
      { signal: 'behavior.cooperative', reason: 'evidence-source-mismatch' },
      { signal: 'mood.self-report', reason: 'evidence-source-mismatch' },
      { signal: 'thought-content.suicidal-ideation', reason: 'evidence-source-mismatch' },
    ]);
  });

  it('contains general mappings across the major Presentation/MSE domains', () => {
    const domains = new Set(PRESENTATION_MSE_KNOWLEDGE.map((mapping) => mapping.domain));

    expect(domains).toEqual(
      new Set([
        'appearance-behavior',
        'speech',
        'mood',
        'affect',
        'perception',
        'thought-process',
        'thought-content',
        'cognition-sensorium',
        'insight-judgment',
      ]),
    );
  });
});
