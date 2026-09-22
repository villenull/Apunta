import { CLINICAL_GUIDANCE_VERSION, INTERVENTION_MODALITIES, PRESENTATION_MSE_DOMAINS } from '@apunta/shared';

import { renderDiscussionThemes } from './discussion-themes.js';
import { INTERVENTION_KNOWLEDGE } from './interventions.js';
import { PRESENTATION_MSE_KNOWLEDGE } from './presentation.js';

/**
 * The integration boundary for the closed clinical vocabulary.
 *
 * This file deliberately contains no patient text and never reads the source
 * note.  It only decides whether a format has an explicitly named destination
 * for a kind of material and renders short, auditable instructions for the
 * local drafting prompt.  The source remains the only evidence for a finding.
 */

export type ClinicalSectionRole = 'presentation' | 'interventions' | 'discussion' | 'plan';

const PRESENTATION_ALIASES = new Set([
  'objective',
  'presentation',
  'mental status',
  'mental status examination',
  'mental state',
  'mse',
]);

const INTERVENTION_ALIASES = new Set([
  'intervention',
  'interventions',
  'treatment',
  'treatment provided',
  'therapeutic interventions',
]);

const DISCUSSION_ALIASES = new Set(['discussion', 'session discussion', 'discussion themes']);
const PLAN_ALIASES = new Set(['plan', 'next steps', 'next step', 'out of session actions']);

function normaliseSectionName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, ' ');
}

/** Match only authored section names; never invent a destination section. */
export function sectionRole(name: string): ClinicalSectionRole | null {
  const normalised = normaliseSectionName(name);
  if (PRESENTATION_ALIASES.has(normalised)) return 'presentation';
  if (INTERVENTION_ALIASES.has(normalised)) return 'interventions';
  if (DISCUSSION_ALIASES.has(normalised)) return 'discussion';
  if (PLAN_ALIASES.has(normalised)) return 'plan';
  return null;
}

/** The exact authored section that receives a role, or null when absent. */
export function sectionForRole(sections: readonly string[], role: ClinicalSectionRole): string | null {
  const name = sections.find((section) => sectionRole(section) === role);
  return name ?? null;
}

const PRESENTATION_DOMAINS = PRESENTATION_MSE_DOMAINS;
const PRESENTATION_DOMAIN_KEYS: Readonly<Record<string, string>> = {
  'appearance/behaviour': 'appearance-behavior',
  speech: 'speech',
  mood: 'mood',
  affect: 'affect',
  perception: 'perception',
  'thought process': 'thought-process',
  'thought content': 'thought-content',
  'cognition/sensorium': 'cognition-sensorium',
  'insight/judgment': 'insight-judgment',
};
const PRESENTATION_DOMAINS_WITH_MAPPINGS = PRESENTATION_DOMAINS.filter((domain) =>
  PRESENTATION_MSE_KNOWLEDGE.some((mapping) => mapping.domain === PRESENTATION_DOMAIN_KEYS[domain]),
);
const INTERVENTION_LABELS = INTERVENTION_MODALITIES.filter((label) =>
  INTERVENTION_KNOWLEDGE.some((entry) => entry.label === label),
);

/**
 * Render a compact prompt block for the format's named destinations.
 *
 * The mappings are vocabulary only.  In particular, this block never tells
 * the model that a domain or intervention occurred, and never includes a
 * reference-document excerpt or a source sentence.
 */
export function renderClinicalKnowledgeGuide(
  formatName: string | undefined,
  sections: readonly string[],
): string {
  const presentation = sectionForRole(sections, 'presentation');
  const intervention = sectionForRole(sections, 'interventions');
  const plan = sectionForRole(sections, 'plan');
  const discussion = sectionForRole(sections, 'discussion');
  const lines: string[] = [];

  if (presentation !== null) {
    lines.push(
      `Presentation/MSE routing: use the authored section ${JSON.stringify(presentation)} only for findings explicitly observed, measured, or reported in the current source.`,
      `MSE domains are a checklist, not a completion quota: ${PRESENTATION_DOMAINS_WITH_MAPPINGS.join(', ')}.`,
      'Do not turn silence into a normal or negative finding. Preserve uncertainty and source attribution; omit an unsupported or unclear finding.',
    );
  }

  if (intervention !== null) {
    lines.push(
      `Intervention routing: use the authored section ${JSON.stringify(intervention)} only for an intervention explicitly described in the current source.`,
      `Closed vocabulary labels (never a recommendation): ${INTERVENTION_LABELS.join(', ')}.`,
      'Do not infer a modality from a symptom, goal, generic skill, recommendation, future plan, hypothetical, or negated action; do not expand a named modality into unstated techniques.',
    );
  }

  if (plan !== null && intervention === null) {
    lines.push(
      `Plan routing: use the authored section ${JSON.stringify(plan)} only for stated future actions, follow-up, or interventions; do not add a modality or technique that the source does not state.`,
    );
  }

  if (discussion !== null) {
    lines.push(
      `Discussion routing: keep supplied facts in the authored section ${JSON.stringify(discussion)} and, when two or more facts clearly share a broad topic, group them under a concise neutral title. Use titles only when there are two or more such topics; a Discussion with a single theme stays prose with no title.`,
      'Every supplied fact must appear exactly once and verbatim within Discussion. A title may organize facts but may not add diagnosis, causality, severity, risk, or any other clinical claim; when there are titled topics, facts that do not safely group go in one neutral catch-all subsection, and there is no catch-all when every fact belongs to a titled topic.',
    );
  }

  if (lines.length === 0) return '';
  const trimmedFormatName = formatName?.trim();
  const formatNote =
    trimmedFormatName === undefined || trimmedFormatName === ''
      ? ''
      : ` for ${JSON.stringify(trimmedFormatName)}`;
  return [
    `## Local clinical vocabulary guidance${formatNote}`,
    `Vocabulary version: ${CLINICAL_GUIDANCE_VERSION}.`,
    '',
    ...lines,
  ].join('\n');
}

/**
 * Apply the deterministic Discussion formatter only when the format authored
 * a Discussion-like section. Other sections and all section keys are returned
 * untouched. The formatter emits headings as the only generated content and
 * preserves each supplied body fact once; a Discussion without two distinct
 * subtopics comes back unchanged, with no heading.
 */
export function applyDiscussionThemes<T extends Record<string, string>>(
  sections: T,
  order: readonly string[],
): T {
  const discussion = sectionForRole(order, 'discussion');
  if (discussion === null) return sections;

  const body = sections[discussion] ?? '';
  const rendered = renderDiscussionThemes(body);
  if (rendered === body) return sections;
  return { ...sections, [discussion]: rendered };
}
