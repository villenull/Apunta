import { describe, expect, it } from 'vitest';

import { suggestInterventionApproach } from './clinical-guidance.js';

describe('suggestInterventionApproach', () => {
  it('suggests CBT for Socratic questioning with verbatim anchored evidence', () => {
    const body = 'Explored automatic thoughts with Socratic questioning and reviewed the evidence together.';
    const result = suggestInterventionApproach(body);
    expect(result).toEqual({
      approach: 'CBT (Cognitive Behavioral Therapy)',
      evidence: 'Socratic questioning',
    });
    expect(result !== null && body.includes(result.evidence)).toBe(true);
  });

  it('suggests EMDR for bilateral stimulation', () => {
    const body = 'Processed the target memory using bilateral stimulation with breaks as needed.';
    expect(suggestInterventionApproach(body)).toEqual({
      approach: 'EMDR',
      evidence: 'bilateral stimulation',
    });
  });

  it('suggests ACT for values clarification', () => {
    const body = 'Completed a values clarification exercise to name what mattered most.';
    expect(suggestInterventionApproach(body)).toEqual({
      approach: 'Acceptance and Commitment Therapy (ACT)',
      evidence: 'values clarification',
    });
  });

  it('suggests solution-focused/narrative therapy for externalizing conversations', () => {
    const body = 'Held externalizing conversations to separate the person from the problem.';
    expect(suggestInterventionApproach(body)).toEqual({
      approach: 'Solution-focused/Narrative Therapy',
      evidence: 'externalizing conversations',
    });
  });

  it('suggests the psychodynamic approach for transference', () => {
    const body = 'Explored transference reactions toward the therapist in the room.';
    expect(suggestInterventionApproach(body)).toEqual({
      approach: 'Key Psychodynamic Interventions',
      evidence: 'transference',
    });
  });

  it('suggests Terapia Conductual for modelamiento', () => {
    const body = 'Aplicó modelamiento con ejemplos guiados en sesión.';
    expect(suggestInterventionApproach(body)).toEqual({
      approach: 'Terapia Conductual',
      evidence: 'modelamiento',
    });
  });

  it('suggests DBT for DEAR MAN without child context', () => {
    const body = 'Practiced DEAR MAN steps to ask for help assertively.';
    expect(suggestInterventionApproach(body)).toEqual({
      approach: 'Dialectical Behaviour Therapy (DBT)',
      evidence: 'DEAR MAN',
    });
  });

  it('suggests DBT-C for the same DBT skill with explicit child context', () => {
    const body = 'With the child, practiced DEAR MAN steps to ask for help assertively.';
    expect(suggestInterventionApproach(body)).toEqual({
      approach: 'DBT-C',
      evidence: 'DEAR MAN',
    });
  });

  it('suggests child CBT for a token economy with explicit child context', () => {
    const body = 'With the child, used a token economy to reinforce practice between meetings.';
    expect(suggestInterventionApproach(body)).toEqual({
      approach: 'Cognitive Behavioral Therapy (CBT) for Children',
      evidence: 'token economy',
    });
  });

  it('abstains on generic material shared by several modalities', () => {
    expect(
      suggestInterventionApproach('Practiced deep breathing and mindfulness together in session.'),
    ).toBeNull();
  });

  it('abstains when the technique was negated', () => {
    expect(suggestInterventionApproach('Did not use thought records today.')).toBeNull();
  });

  it('abstains on future plans and hypotheticals', () => {
    expect(
      suggestInterventionApproach('Will use thought records next session to review evidence.'),
    ).toBeNull();
    expect(suggestInterventionApproach('If we used thought records, the belief might shift.')).toBeNull();
  });

  it('abstains on quoted and other-person reported text', () => {
    expect(
      suggestInterventionApproach(
        'Reviewed coping strategies. Client noted "thought records helped last year".',
      ),
    ).toBeNull();
    expect(suggestInterventionApproach('Client said thought records helped at home.')).toBeNull();
  });

  it('abstains when the approach is already named', () => {
    expect(suggestInterventionApproach('Used CBT thought records to review the evidence today.')).toBeNull();
    expect(
      suggestInterventionApproach(
        'Explored automatic thoughts with Socratic questioning in dialectical behaviour therapy.',
      ),
    ).toBeNull();
  });

  it('abstains when cues point at more than one approach', () => {
    expect(
      suggestInterventionApproach('Used Socratic questioning and DEAR MAN to prepare for the conversation.'),
    ).toBeNull();
  });

  it('abstains when child context is missing or mismatched', () => {
    expect(suggestInterventionApproach('Used a token economy to reinforce participation.')).toBeNull();
    expect(suggestInterventionApproach('Used cognitive restructuring with the child today.')).toBeNull();
  });

  it('abstains on empty input', () => {
    expect(suggestInterventionApproach('')).toBeNull();
    expect(suggestInterventionApproach('   ')).toBeNull();
  });
});
