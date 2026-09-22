import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  applyDiscussionSubheadings,
  renderClinicalKnowledgeGuide,
  sectionForRole,
  sectionRole,
} from './integration.js';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../e2e/fixtures/clinical-knowledge/acceptance.json',
);
interface DiscussionFixture {
  sections: string[];
  source: string;
  drafted: string;
  expected: string;
  expectedHeadings: string[];
}
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  discussionOneTopic: DiscussionFixture;
  discussionTopics: DiscussionFixture;
  discussionGenericHeadings: DiscussionFixture;
};

describe('clinical-knowledge drafting integration', () => {
  it('routes only to authored aliases and gives custom Presentation precedence over Objective', () => {
    expect(sectionRole('Presentation')).toBe('presentation');
    expect(sectionRole('mental_status')).toBe('presentation');
    expect(sectionRole('Interventions')).toBe('interventions');
    expect(sectionRole('Risk')).toBeNull();
    expect(sectionForRole(['Objective', 'Presentation', 'Plan'], 'presentation')).toBe('Objective');

    const guide = renderClinicalKnowledgeGuide('Fictional progress format', [
      'Subjective',
      'Presentation',
      'Objective',
      'Risk',
      'Plan',
    ]);
    expect(guide).toContain('"Presentation"');
    expect(guide).not.toContain('"Objective"');
    expect(guide).not.toContain('Risk');
  });

  it('abstains from clinical guidance when no applicable destination is named', () => {
    expect(
      renderClinicalKnowledgeGuide('Intake note', ['Presenting problem', 'History', 'Formulation', 'Plan']),
    ).toBe(
      '## Local clinical vocabulary guidance for "Intake note"\nVocabulary version: 2026-09-07.1.\n\nPlan routing: use the authored section "Plan" only for stated future actions, follow-up, or interventions; do not add a modality or technique that the source does not state.',
    );
    expect(renderClinicalKnowledgeGuide('Free form', ['Context', 'Risk'])).toBe('');
  });

  it.each([
    ['one topic under a lone subheading becomes prose', 'discussionOneTopic', 'single'],
    ['distinct topics keep her lowercase subheadings', 'discussionTopics', 'kept'],
    [
      'generic category headings are not her words and become prose',
      'discussionGenericHeadings',
      'ungrounded',
    ],
  ] as const)('%s', (_name, key, outcome) => {
    const fixture = fixtures[key];
    const sections = { Discussion: fixture.drafted, Plan: 'Fictional client will return.' };
    const result = applyDiscussionSubheadings(sections, fixture.sections, fixture.source);
    expect(result.outcome).toBe(outcome);
    expect(result.sections.Discussion).toBe(fixture.expected);
    expect(result.sections.Plan).toBe(sections.Plan);
    for (const heading of fixture.expectedHeadings) {
      expect(result.sections.Discussion.split(`\n`)).toContain(`${heading}:`);
    }
    // The model's sentences survive exactly: only heading lines change.
    for (const line of fixture.drafted.split('\n').filter((l) => l.startsWith('Fictional'))) {
      expect(result.sections.Discussion.split(line)).toHaveLength(2);
    }
    // The refine chat applies this again to its own output: nothing moves.
    expect(applyDiscussionSubheadings(result.sections, fixture.sections, fixture.source).sections).toBe(
      result.sections,
    );
  });

  it('asks the model for subheadings in her words, and only for distinct topics', () => {
    const guide = renderClinicalKnowledgeGuide('Progress note', ['Discussion', 'Intervention']);
    expect(guide).toContain('genuinely distinct topics');
    expect(guide).toContain('lowercase words taken from her own words');
    expect(guide).toContain('single block of prose with no subheading');
    expect(guide).toContain('never use a general category');
    expect(guide).not.toMatch(/catch-all|neutral title|###/);
  });

  it('leaves an unnamed Discussion-like section untouched', () => {
    const sections = { Notes: 'sleep:\nA fictional client discussed sleep.' };
    expect(applyDiscussionSubheadings(sections, ['Notes'], 'sleep').sections).toBe(sections);
  });
});
