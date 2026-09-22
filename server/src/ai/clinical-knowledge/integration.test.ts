import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
  applyDiscussionThemes,
  renderClinicalKnowledgeGuide,
  sectionForRole,
  sectionRole,
} from './integration.js';

const fixturePath = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../../../e2e/fixtures/clinical-knowledge/acceptance.json',
);
interface DiscussionFixture {
  facts: string[];
  expectedTitles: string[];
}
const fixtures = JSON.parse(readFileSync(fixturePath, 'utf8')) as {
  discussion: DiscussionFixture;
  discussionSubtopics: DiscussionFixture;
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

  it('leaves a single-theme Discussion as prose with no subheading', () => {
    const sections = {
      Subjective: 'A fictional client discussed sleep.',
      Discussion: fixtures.discussion.facts.join(' '),
      Plan: '',
    };
    expect(fixtures.discussion.expectedTitles).toEqual([]);
    const result = applyDiscussionThemes(sections, ['Subjective', 'Discussion', 'Plan']);
    expect(result).toBe(sections);
    expect(result.Discussion).not.toContain('#');
  });

  it('keeps several subtopics as subheadings without changing other sections or duplicating facts', () => {
    const sections = {
      Subjective: 'A fictional client discussed sleep.',
      Discussion: fixtures.discussionSubtopics.facts.join(' '),
      Plan: '',
    };
    const [first, second] = fixtures.discussionSubtopics.expectedTitles;
    const result = applyDiscussionThemes(sections, ['Subjective', 'Discussion', 'Plan']);
    expect(result.Subjective).toBe(sections.Subjective);
    expect(result.Plan).toBe('');
    expect(result.Discussion).toBe(
      `### ${String(first)}\nFictional client discussed sleep at home.\nFictional client reported waking early.\n\n### ${String(second)}\nFictional client described conflict with a partner.\nFictional client discussed support from a friend.`,
    );
    for (const fact of fixtures.discussionSubtopics.facts) {
      expect(result.Discussion.split(fact)).toHaveLength(2);
    }
    expect(result.Discussion).not.toMatch(/diagnos|caus|severity|risk/i);
    // The refine chat applies this again to its own output: nothing moves.
    expect(applyDiscussionThemes(result, ['Subjective', 'Discussion', 'Plan'])).toBe(result);
  });

  it('leaves an unnamed Discussion-like section untouched', () => {
    const sections = { Notes: 'A fictional client discussed sleep.' };
    expect(applyDiscussionThemes(sections, ['Notes'])).toBe(sections);
  });
});
