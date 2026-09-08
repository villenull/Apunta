import { describe, expect, it } from 'vitest';

import {
  documentInterventions,
  extractInterventionLabels,
  mapInterventions,
  NO_INFERENCE_CASES,
} from './interventions.js';

describe('mapInterventions', () => {
  it('maps an explicit clinician technique to a general label and safe documentation', () => {
    const matches = mapInterventions(
      'The therapist used cognitive restructuring to examine an unhelpful thought.',
    );

    expect(matches).toEqual([
      {
        label: 'CBT',
        signals: ['cbt-cognitive-restructuring'],
        evidence: 'distinctive-technique-plus-action',
        documentation: 'Cognitive restructuring was explicitly used as a CBT intervention.',
      },
    ]);
  });

  it('maps a named modality only when its delivery is explicitly recorded', () => {
    expect(extractInterventionLabels('CBT was used in session for cognitive restructuring.')).toEqual([
      'CBT',
    ]);
    expect(extractInterventionLabels('The therapist delivered ACT in session.')).toEqual(['ACT']);
    expect(extractInterventionLabels('The note mentions CBT as a possible approach.')).toEqual([]);
    expect(extractInterventionLabels('The clinician recommended ACT for a future session.')).toEqual([]);
  });

  it('supports multiple explicitly recorded interventions without returning source excerpts', () => {
    const source =
      'The clinician guided values clarification. During the session, the therapist practiced DEAR MAN.';
    const matches = mapInterventions(source);

    expect(matches.map((match) => match.label)).toEqual(['ACT', 'DBT']);
    expect(matches.flatMap((match) => match.signals)).toEqual([
      'act-values-clarification',
      'dbt-distinctive-skill',
    ]);
    expect(JSON.stringify(matches)).not.toContain(source);
  });

  it('requires child context for child-specific labels', () => {
    expect(extractInterventionLabels('The therapist used a token economy with a child.')).toEqual([
      'Behavioral therapy',
    ]);
    expect(extractInterventionLabels('The therapist used a token economy.')).toEqual(['Behavioral therapy']);
    expect(extractInterventionLabels('The therapist practiced wise mind with a child.')).toEqual(['DBT']);
    expect(
      extractInterventionLabels('The therapist delivered DBT-C and practiced wise mind with a child.'),
    ).toEqual(['DBT-C']);
    expect(extractInterventionLabels('The therapist delivered CBT-C in a child-focused session.')).toEqual([
      'CBT for children',
    ]);
  });

  it('does not infer an intervention from a shared skill without a framework', () => {
    expect(mapInterventions('The therapist practiced mindfulness and paced breathing in session.')).toEqual(
      [],
    );
    expect(mapInterventions('The client reported using grounding between sessions.')).toEqual([]);
  });

  it('rejects negated actions and future or hypothetical language', () => {
    expect(mapInterventions('The therapist did not use EMDR.')).toEqual([]);
    expect(mapInterventions('The therapist plans to use CBT next time.')).toEqual([]);
    expect(mapInterventions('ACT might help with values work.')).toEqual([]);
  });

  it('keeps the integration contract generic and explicit', () => {
    expect(NO_INFERENCE_CASES.length).toBeGreaterThanOrEqual(5);
    expect(documentInterventions('The therapist used bilateral stimulation in session.')).toEqual([
      'Bilateral stimulation was explicitly used as an EMDR intervention.',
    ]);
  });
});
