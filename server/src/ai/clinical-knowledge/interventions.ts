/**
 * Conservative intervention knowledge for note review.
 *
 * This module is deliberately a mapper, not a treatment recommender. It
 * returns a label only when the input contains an explicit clinician action
 * or an explicitly recorded in-session event. It never returns excerpts from
 * the input, so callers can use the result without copying patient content
 * into a prompt, log, or fixture.
 */

export type InterventionLabel =
  | 'EMDR'
  | 'CBT'
  | 'CBT for children'
  | 'ACT'
  | 'Solution-focused/Narrative Therapy'
  | 'Psychodynamic therapy'
  | 'DBT-C'
  | 'Behavioral therapy'
  | 'DBT';

/** The minimum evidence required for a mapping to be returned. */
export type EvidenceThreshold =
  'named-modality-plus-action' | 'distinctive-technique-plus-action' | 'child-context-plus-action';

export interface InterventionKnowledgeEntry {
  readonly label: InterventionLabel;
  readonly signal: string;
  readonly documentationLanguage: string;
  readonly evidenceThreshold: EvidenceThreshold;
}

/**
 * General labels and safe documentation language derived from the source
 * cheat sheet. Signal names are stable identifiers; they are not excerpts
 * from a note.
 */
export const INTERVENTION_KNOWLEDGE: readonly InterventionKnowledgeEntry[] = [
  {
    label: 'EMDR',
    signal: 'emdr-named',
    documentationLanguage: 'EMDR was explicitly delivered in session.',
    evidenceThreshold: 'named-modality-plus-action',
  },
  {
    label: 'EMDR',
    signal: 'emdr-bilateral-stimulation',
    documentationLanguage: 'Bilateral stimulation was explicitly used as an EMDR intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'CBT',
    signal: 'cbt-named',
    documentationLanguage: 'CBT was explicitly delivered in session.',
    evidenceThreshold: 'named-modality-plus-action',
  },
  {
    label: 'CBT',
    signal: 'cbt-cognitive-restructuring',
    documentationLanguage: 'Cognitive restructuring was explicitly used as a CBT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'CBT',
    signal: 'cbt-guided-discovery',
    documentationLanguage:
      'Guided discovery or Socratic questioning was explicitly used as a CBT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'CBT',
    signal: 'cbt-abc-model',
    documentationLanguage: 'The ABC model was explicitly used as a CBT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'CBT',
    signal: 'cbt-downward-arrow',
    documentationLanguage: 'The downward-arrow technique was explicitly used as a CBT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'CBT',
    signal: 'cbt-thought-record',
    documentationLanguage: 'A thought record or journal exercise was explicitly used as a CBT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'CBT',
    signal: 'cbt-exposure-response-prevention',
    documentationLanguage: 'Exposure and response prevention was explicitly used as a CBT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'CBT for children',
    signal: 'cbt-child-named',
    documentationLanguage: 'CBT for children was explicitly delivered in a child-focused session.',
    evidenceThreshold: 'child-context-plus-action',
  },
  {
    label: 'CBT for children',
    signal: 'cbt-child-behavioral-support',
    documentationLanguage:
      'A child-focused behavioral support technique was explicitly used within CBT for children.',
    evidenceThreshold: 'child-context-plus-action',
  },
  {
    label: 'ACT',
    signal: 'act-named',
    documentationLanguage: 'ACT was explicitly delivered in session.',
    evidenceThreshold: 'named-modality-plus-action',
  },
  {
    label: 'ACT',
    signal: 'act-values-clarification',
    documentationLanguage: 'Values clarification was explicitly used as an ACT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'ACT',
    signal: 'act-cognitive-defusion',
    documentationLanguage: 'Cognitive defusion was explicitly used as an ACT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'ACT',
    signal: 'act-acceptance',
    documentationLanguage: 'An acceptance exercise was explicitly used as an ACT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'ACT',
    signal: 'act-committed-action',
    documentationLanguage: 'Values-aligned committed action was explicitly used as an ACT intervention.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'Solution-focused/Narrative Therapy',
    signal: 'solution-narrative-externalizing',
    documentationLanguage:
      'An externalizing or unique-outcomes intervention was explicitly used in solution-focused/narrative therapy.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'Solution-focused/Narrative Therapy',
    signal: 'solution-narrative-deconstruction',
    documentationLanguage:
      'Problem deconstruction or a co-created adaptive narrative was explicitly used in solution-focused/narrative therapy.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'Psychodynamic therapy',
    signal: 'psychodynamic-named',
    documentationLanguage: 'Psychodynamic therapy was explicitly delivered in session.',
    evidenceThreshold: 'named-modality-plus-action',
  },
  {
    label: 'Psychodynamic therapy',
    signal: 'psychodynamic-relational-exploration',
    documentationLanguage: 'A psychodynamic relational exploration was explicitly conducted.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'Psychodynamic therapy',
    signal: 'psychodynamic-affect-focus',
    documentationLanguage: 'A psychodynamic affect-focused intervention was explicitly conducted.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'DBT-C',
    signal: 'dbt-child-named',
    documentationLanguage: 'DBT-C was explicitly delivered in a child-focused session.',
    evidenceThreshold: 'child-context-plus-action',
  },
  {
    label: 'DBT-C',
    signal: 'dbt-child-skill',
    documentationLanguage: 'A child-focused DBT skill was explicitly practiced in session.',
    evidenceThreshold: 'child-context-plus-action',
  },
  {
    label: 'Behavioral therapy',
    signal: 'behavioral-named',
    documentationLanguage: 'Behavioral therapy was explicitly delivered in session.',
    evidenceThreshold: 'named-modality-plus-action',
  },
  {
    label: 'Behavioral therapy',
    signal: 'behavioral-contingency',
    documentationLanguage:
      'A behavioral contingency, reinforcement, or contract intervention was explicitly used.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'Behavioral therapy',
    signal: 'behavioral-shaping-exposure',
    documentationLanguage:
      'Behavioral shaping, modeling, chaining, or systematic desensitization was explicitly used.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
  {
    label: 'DBT',
    signal: 'dbt-named',
    documentationLanguage: 'DBT was explicitly delivered in session.',
    evidenceThreshold: 'named-modality-plus-action',
  },
  {
    label: 'DBT',
    signal: 'dbt-distinctive-skill',
    documentationLanguage: 'A distinctive DBT skills intervention was explicitly practiced in session.',
    evidenceThreshold: 'distinctive-technique-plus-action',
  },
];

/** Cases that are intentionally not treated as intervention evidence. */
export const NO_INFERENCE_CASES = [
  'A modality name without an explicit action or recorded session event.',
  'A recommendation, future plan, hypothetical, or possibility.',
  'A client symptom, goal, response, or homework report without a clinician action or in-session event.',
  'A generic skill shared by multiple modalities without a named framework or distinctive technique.',
  'A negated action such as an intervention that was not used.',
] as const;

export interface InterventionMatch {
  readonly label: InterventionLabel;
  /** Stable signal IDs; no source text or patient content is returned. */
  readonly signals: readonly string[];
  readonly evidence: EvidenceThreshold;
  readonly documentation: string;
}

export const INTERVENTION_MAPPINGS = INTERVENTION_KNOWLEDGE;

const NEGATED_OR_PLANNED_ACTION =
  /\b(?:did not|didn't|does not|doesn't|do not|don't|never|not yet|will|would|shall|plan(?:s|ned)? to|intend(?:s|ed)? to|consider(?:s|ed|ing)?|recommend(?:s|ed|ing)?|might|may|could|should)\b[^.!?;\n]{0,100}\b(?:used|provided|delivered|guided|taught|reviewed|practiced|completed|led|performed|introduced|applied|conducted|explored|challenged|assigned|rehearsed|implemented|mapped|model(?:ed|led)|reinforced|validated|coached|facilitated|administered|clarified|confronted|interpreted|processed|discussed|included|focused on|worked on|engaged in|went through|role[- ]played)\b/i;

const PROVIDER_ACTION =
  /\b(?:therapist|clinician|provider|counsell?or|counselor|we)\b[^.!?;\n]{0,120}\b(?:used|provided|delivered|guided|taught|reviewed|practiced|completed|led|performed|introduced|applied|conducted|explored|challenged|assigned|rehearsed|implemented|mapped|model(?:ed|led)|reinforced|validated|coached|facilitated|administered|clarified|confronted|interpreted|processed|discussed|included|focused on|worked on|engaged in|went through|role[- ]played)\b/i;

const PASSIVE_ACTION =
  /\b(?:was|were|is|are)\s+(?:used|provided|delivered|guided|taught|reviewed|practiced|completed|led|performed|introduced|applied|conducted|explored|challenged|assigned|rehearsed|implemented|mapped|model(?:ed|led)|reinforced|validated|coached|facilitated|administered|clarified|confronted|interpreted|processed|discussed|included|focused on|worked on|engaged in|went through|role[- ]played)\b/i;

const SESSION_EVENT =
  /\b(?:in|during|this|today(?:'s)?)\s+session\b[^.!?;\n]{0,120}\b(?:used|provided|delivered|guided|taught|reviewed|practiced|completed|led|performed|introduced|applied|conducted|explored|challenged|assigned|rehearsed|implemented|mapped|model(?:ed|led)|reinforced|validated|coached|facilitated|administered|clarified|confronted|interpreted|processed|discussed|included|focused on|worked on|engaged in|went through|role[- ]played)\b|\b(?:used|provided|delivered|guided|taught|reviewed|practiced|completed|led|performed|introduced|applied|conducted|explored|challenged|assigned|rehearsed|implemented|mapped|model(?:ed|led)|reinforced|validated|coached|facilitated|administered|clarified|confronted|interpreted|processed|discussed|included|focused on|worked on|engaged in|went through|role[- ]played)\b[^.!?;\n]{0,100}\b(?:in|during)\s+session\b/i;

const DIRECT_SESSION_ACTION =
  /^\s*(?:used|provided|delivered|guided|taught|reviewed|practiced|completed|led|performed|introduced|applied|conducted|explored|challenged|assigned|rehearsed|implemented|mapped|model(?:ed|led)|reinforced|validated|coached|facilitated|administered|clarified|confronted|interpreted|processed|discussed|included|focused on|worked on|engaged in|went through|role[- ]played)\b/i;

const CHILD_CONTEXT = /\b(?:child(?:ren)?|kid(?:s)?|young person|pediatric|play[- ]based)\b/i;

function acronymOrPhrase(text: string, acronym: string, phrase: RegExp): boolean {
  return new RegExp(`\\b${acronym}\\b`).test(text) || phrase.test(text);
}

function namedModality(text: string, label: InterventionLabel): boolean {
  switch (label) {
    case 'EMDR':
      return /\bEMDR\b/.test(text);
    case 'CBT':
      return (
        /\bCBT\b(?![-\s]?C\b)(?!\s*(?:for|with)\s+(?:children|kids?))/.test(text) ||
        /\bcognitive[- ]behavioral therapy\b/i.test(text)
      );
    case 'CBT for children':
      return /\b(?:CBT\s*(?:for|with)\s+(?:children|kids?)|children'?s?\s+CBT|CBT-C)\b/i.test(text);
    case 'ACT':
      return acronymOrPhrase(text, 'ACT', /acceptance\s+and\s+commitment\s+therapy/i);
    case 'Solution-focused/Narrative Therapy':
      return /\b(?:solution[- ]focused|narrative)\s+therapy\b/i.test(text);
    case 'Psychodynamic therapy':
      return /\bpsychodynamic(?:\s+therapy)?\b/i.test(text);
    case 'DBT-C':
      return /\bDBT[-\s]?C\b/i.test(text);
    case 'Behavioral therapy':
      return /\b(?:behavioral|behavioural)\s+therapy\b/i.test(text);
    case 'DBT':
      return /\bDBT\b(?![-\s]?C\b)|dialectical\s+(?:behavior|behaviour)\s+therapy/i.test(text);
  }
}

function explicitAction(text: string): boolean {
  if (NEGATED_OR_PLANNED_ACTION.test(text)) return false;
  return (
    PROVIDER_ACTION.test(text) ||
    PASSIVE_ACTION.test(text) ||
    SESSION_EVENT.test(text) ||
    DIRECT_SESSION_ACTION.test(text)
  );
}

function childSignal(text: string): string | null {
  if (/\b(?:CBT\s*(?:for|with)\s+(?:children|kids?)|children'?s?\s+CBT|CBT-C)\b/i.test(text)) {
    return 'cbt-child-named';
  }
  if (
    /\b(?:token economy|emotion thermometer|fear ladder|shaping|prompting|positive reinforcement|reward system)\b/i.test(
      text,
    )
  ) {
    return 'cbt-child-behavioral-support';
  }
  return null;
}

interface Rule {
  readonly signal: string;
  readonly label: InterventionLabel;
  readonly evidence: EvidenceThreshold;
  readonly matches: (text: string, childContext: boolean) => boolean;
}

const RULES: readonly Rule[] = [
  {
    signal: 'emdr-named',
    label: 'EMDR',
    evidence: 'named-modality-plus-action',
    matches: (text) => namedModality(text, 'EMDR'),
  },
  {
    signal: 'emdr-bilateral-stimulation',
    label: 'EMDR',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\bbilateral\s+stimulation\b|\b(?:bilateral|alternating)\s+(?:eye movements?|taps?|tones?)\b/i.test(
        text,
      ),
  },
  {
    signal: 'cbt-named',
    label: 'CBT',
    evidence: 'named-modality-plus-action',
    matches: (text) => namedModality(text, 'CBT'),
  },
  {
    signal: 'cbt-cognitive-restructuring',
    label: 'CBT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) => /\bcognitive\s+restructuring\b/.test(text),
  },
  {
    signal: 'cbt-guided-discovery',
    label: 'CBT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) => /\b(?:guided discovery|Socratic questioning)\b/i.test(text),
  },
  {
    signal: 'cbt-abc-model',
    label: 'CBT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) => /\bABC\s+model\b|\badversity[\s-]+beliefs?[\s-]+consequences?\b/i.test(text),
  },
  {
    signal: 'cbt-downward-arrow',
    label: 'CBT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) => /\bdownward[- ]arrow\b/i.test(text),
  },
  {
    signal: 'cbt-thought-record',
    label: 'CBT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) => /\b(?:thought record|thought journal|cognitive journal)\b/i.test(text),
  },
  {
    signal: 'cbt-exposure-response-prevention',
    label: 'CBT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\b(?:exposure and response prevention|exposure[- ]response prevention|ERP)\b/.test(text),
  },
  {
    signal: 'cbt-child-named',
    label: 'CBT for children',
    evidence: 'child-context-plus-action',
    matches: (text, childContext) => childContext && namedModality(text, 'CBT for children'),
  },
  {
    signal: 'cbt-child-behavioral-support',
    label: 'CBT for children',
    evidence: 'child-context-plus-action',
    matches: (text, childContext) =>
      childContext &&
      namedModality(text, 'CBT for children') &&
      childSignal(text) === 'cbt-child-behavioral-support',
  },
  {
    signal: 'act-named',
    label: 'ACT',
    evidence: 'named-modality-plus-action',
    matches: (text) => namedModality(text, 'ACT'),
  },
  {
    signal: 'act-values-clarification',
    label: 'ACT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\bvalues?\s+(?:clarification|card sort|domain exploration)\b|\bvalues?[- ]behavior discrepancy\b/i.test(
        text,
      ),
  },
  {
    signal: 'act-cognitive-defusion',
    label: 'ACT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\bcognitive defusion\b|\bhaving the thought that\b|\bexternaliz(?:e|ing) thoughts?\b/i.test(text),
  },
  {
    signal: 'act-acceptance',
    label: 'ACT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) => /\b(?:guided )?acceptance exercise\b|\bexperiential avoidance\b/i.test(text),
  },
  {
    signal: 'act-committed-action',
    label: 'ACT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\bcommitted action\b|\bvalues?[- ]aligned action\b|\bexposure framed as values?[- ]based\b/i.test(
        text,
      ),
  },
  {
    signal: 'solution-narrative-externalizing',
    label: 'Solution-focused/Narrative Therapy',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) => /\bexternalizing conversations?\b|\bunique outcomes?\b/i.test(text),
  },
  {
    signal: 'solution-narrative-deconstruction',
    label: 'Solution-focused/Narrative Therapy',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\bproblem deconstruction\b|\b(?:co[- ]created|co[- ]creating)\s+(?:therapeutic )?(?:materials|narratives?)\b|\badaptive narratives?\b/i.test(
        text,
      ),
  },
  {
    signal: 'psychodynamic-named',
    label: 'Psychodynamic therapy',
    evidence: 'named-modality-plus-action',
    matches: (text) => namedModality(text, 'Psychodynamic therapy'),
  },
  {
    signal: 'psychodynamic-relational-exploration',
    label: 'Psychodynamic therapy',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\b(?:transference|countertransference|defense mechanisms?|repetition compulsion|working through)\b|\b(?:early|childhood) relationships?\b/i.test(
        text,
      ),
  },
  {
    signal: 'psychodynamic-affect-focus',
    label: 'Psychodynamic therapy',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\baffect focus\b|\b(?:clarif(?:ied|ication)|confront(?:ed|ation)|interpret(?:ed|ation))\b[^.!?;\n]{0,80}\b(?:feelings?|avoidance|defen[cs]e|unconscious|past experiences?)\b/i.test(
        text,
      ),
  },
  {
    signal: 'dbt-child-named',
    label: 'DBT-C',
    evidence: 'child-context-plus-action',
    matches: (text, childContext) => childContext && namedModality(text, 'DBT-C'),
  },
  {
    signal: 'dbt-child-skill',
    label: 'DBT-C',
    evidence: 'child-context-plus-action',
    matches: (text, childContext) =>
      childContext &&
      namedModality(text, 'DBT-C') &&
      /\b(?:emotion thermometer|wise mind|grounding|mindful breathing|body scan)\b/i.test(text),
  },
  {
    signal: 'behavioral-named',
    label: 'Behavioral therapy',
    evidence: 'named-modality-plus-action',
    matches: (text) => namedModality(text, 'Behavioral therapy'),
  },
  {
    signal: 'behavioral-contingency',
    label: 'Behavioral therapy',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\b(?:contingency (?:program|management)|token economy|response cost|behavioral contract|behavioural contract|reinforcement schedule|extinction)\b/i.test(
        text,
      ),
  },
  {
    signal: 'behavioral-shaping-exposure',
    label: 'Behavioral therapy',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      /\b(?:behavior|behaviour) modification\b|\b(?:shaping|prompting|chaining|modeling|modelling|systematic desensitization|systematic desensitisation|self[- ]instructions?)\b/i.test(
        text,
      ),
  },
  {
    signal: 'dbt-named',
    label: 'DBT',
    evidence: 'named-modality-plus-action',
    matches: (text) => namedModality(text, 'DBT'),
  },
  {
    signal: 'dbt-distinctive-skill',
    label: 'DBT',
    evidence: 'distinctive-technique-plus-action',
    matches: (text) =>
      !namedModality(text, 'DBT-C') &&
      /\b(?:DEAR\s+MAN|GIVE|FAST|TIPP|STOP|wise mind|opposite action|PLEASE|radical acceptance|improve the moment|check the facts|distress tolerance|emotion regulation|interpersonal effectiveness|behavioral chain analysis)\b/i.test(
        text,
      ),
  },
];

const ENTRY_BY_SIGNAL = new Map(INTERVENTION_KNOWLEDGE.map((entry) => [entry.signal, entry]));

function sentencesOf(text: string): readonly string[] {
  return text
    .split(/[.!?;\n]+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

/**
 * Map explicitly documented clinician actions/session events to safe labels.
 * The result contains no source excerpts and is empty for inference-only text.
 */
export function mapInterventions(text: string): readonly InterventionMatch[] {
  if (text.trim() === '') return [];

  const found = new Map<InterventionLabel, { signals: Set<string>; evidence: EvidenceThreshold }>();
  for (const sentence of sentencesOf(text)) {
    if (!explicitAction(sentence)) continue;
    const childContext = CHILD_CONTEXT.test(sentence);
    for (const rule of RULES) {
      if (!rule.matches(sentence, childContext)) continue;
      const existing = found.get(rule.label);
      if (existing) {
        existing.signals.add(rule.signal);
      } else {
        found.set(rule.label, { signals: new Set([rule.signal]), evidence: rule.evidence });
      }
    }
  }

  return [...found].map(([label, value]) => {
    const signals = [...value.signals];
    const documentation = signals
      .map((signal) => ENTRY_BY_SIGNAL.get(signal)?.documentationLanguage)
      .filter((language): language is string => language !== undefined);
    return {
      label,
      signals,
      evidence: value.evidence,
      documentation: documentation.join(' '),
    };
  });
}

/** Return only labels for integrations that do not need documentation text. */
export function extractInterventionLabels(text: string): readonly InterventionLabel[] {
  return mapInterventions(text).map((match) => match.label);
}

/** Return safe, generic documentation strings without returning source text. */
export function documentInterventions(text: string): readonly string[] {
  return mapInterventions(text).map((match) => match.documentation);
}
