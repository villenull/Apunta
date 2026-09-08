/**
 * A small, deterministic knowledge layer for Presentation/MSE wording.
 *
 * The keys in this file are observations, not defaults.  A caller must first
 * identify an explicit observation in the dictation or raw note and pass it
 * as a fact.  This module only maps that fact to concise clinical wording; it
 * does not diagnose, complete a normal MSE, or infer a negative finding from
 * silence.
 */

export type PresentationMseDomain =
  | 'appearance-behavior'
  | 'speech'
  | 'mood'
  | 'affect'
  | 'perception'
  | 'thought-process'
  | 'thought-content'
  | 'cognition-sensorium'
  | 'insight-judgment';

export type PresentationMseSignal =
  | 'appearance.well-groomed'
  | 'appearance.disheveled'
  | 'appearance.attire-appropriate'
  | 'appearance.attire-inappropriate'
  | 'behavior.eye-contact-good'
  | 'behavior.eye-contact-limited'
  | 'behavior.cooperative'
  | 'behavior.guarded'
  | 'behavior.hostile'
  | 'behavior.psychomotor-agitation'
  | 'behavior.psychomotor-retardation'
  | 'behavior.unusual-movements'
  | 'behavior.posture-relaxed'
  | 'behavior.posture-stiff'
  | 'speech.rate-normal'
  | 'speech.rate-rapid'
  | 'speech.rate-slow'
  | 'speech.rate-pressured'
  | 'speech.volume-normal'
  | 'speech.volume-soft'
  | 'speech.volume-loud'
  | 'speech.tone-clear'
  | 'speech.tone-monotone'
  | 'speech.latency'
  | 'mood.self-report'
  | 'affect.range-full'
  | 'affect.range-restricted'
  | 'affect.range-flat'
  | 'affect.range-labile'
  | 'affect.quality-euthymic'
  | 'affect.quality-dysphoric'
  | 'affect.quality-anxious'
  | 'affect.quality-irritable'
  | 'affect.quality-euphoric'
  | 'affect.congruent'
  | 'affect.incongruent'
  | 'perception.hallucinations'
  | 'perception.illusions'
  | 'perception.depersonalization'
  | 'perception.derealization'
  | 'thought-process.linear'
  | 'thought-process.logical'
  | 'thought-process.goal-directed'
  | 'thought-process.circumstantial'
  | 'thought-process.tangential'
  | 'thought-process.flight-of-ideas'
  | 'thought-process.loose-associations'
  | 'thought-process.word-salad'
  | 'thought-process.blocking'
  | 'thought-process.mutism'
  | 'thought-content.preoccupation'
  | 'thought-content.delusions'
  | 'thought-content.paranoia'
  | 'thought-content.obsessions'
  | 'thought-content.phobias'
  | 'thought-content.suicidal-ideation'
  | 'thought-content.homicidal-ideation'
  | 'thought-content.self-harm'
  | 'cognition.alert'
  | 'cognition.lethargic'
  | 'cognition.oriented-person'
  | 'cognition.oriented-place'
  | 'cognition.oriented-time'
  | 'cognition.oriented-situation'
  | 'cognition.attention-intact'
  | 'cognition.concentration-intact'
  | 'cognition.memory-intact'
  | 'cognition.abstract-thinking'
  | 'insight.good'
  | 'insight.fair'
  | 'insight.poor'
  | 'judgment.sound'
  | 'judgment.fair'
  | 'judgment.impaired';

export type PresentationMseFactStatus = 'present' | 'absent' | 'uncertain';
export type PresentationMseEvidenceSource = 'observed' | 'reported';

/**
 * One explicit, already-grounded observation from a dictation or raw note.
 * `detail` is used only by mappings that explicitly request it (for example,
 * a person's self-reported mood or a described preoccupation).
 */
export interface PresentationMseFact {
  readonly signal: PresentationMseSignal;
  readonly status: PresentationMseFactStatus;
  readonly source: PresentationMseEvidenceSource;
  readonly detail?: string;
}

export interface PresentationMseMapping {
  readonly signal: PresentationMseSignal;
  readonly domain: PresentationMseDomain;
  readonly descriptor: string;
  /** `either` permits a finding explicitly observed or explicitly reported. */
  readonly evidenceSource: PresentationMseEvidenceSource | 'either';
  readonly present: string;
  /** Absence wording is available only where a negative is clinically clear. */
  readonly absent?: string;
  readonly requiresDetail?: boolean;
}

export interface RenderedPresentationMseEntry {
  readonly signal: PresentationMseSignal;
  readonly domain: PresentationMseDomain;
  readonly status: 'present' | 'absent';
  readonly wording: string;
}

export interface OmittedPresentationMseFact {
  readonly signal: PresentationMseSignal;
  readonly reason: 'uncertain' | 'absence-not-supported' | 'detail-required' | 'evidence-source-mismatch';
}

export interface RenderedPresentationMse {
  readonly entries: readonly RenderedPresentationMseEntry[];
  readonly omitted: readonly OmittedPresentationMseFact[];
  /** A prose fragment; empty when no explicit safe finding was supplied. */
  readonly text: string;
}

const detailToken = '{{detail}}';

/**
 * General mappings distilled from the two supplied MSE references.  They are
 * intentionally descriptors rather than case examples or patient data.
 */
export const PRESENTATION_MSE_KNOWLEDGE: readonly PresentationMseMapping[] = [
  {
    signal: 'appearance.well-groomed',
    domain: 'appearance-behavior',
    descriptor: 'well-groomed appearance',
    evidenceSource: 'observed',
    present: 'Appearance was well-groomed.',
  },
  {
    signal: 'appearance.disheveled',
    domain: 'appearance-behavior',
    descriptor: 'disheveled appearance',
    evidenceSource: 'observed',
    present: 'Appearance was disheveled.',
  },
  {
    signal: 'appearance.attire-appropriate',
    domain: 'appearance-behavior',
    descriptor: 'attire appropriate to context',
    evidenceSource: 'observed',
    present: 'Attire was appropriate to context.',
  },
  {
    signal: 'appearance.attire-inappropriate',
    domain: 'appearance-behavior',
    descriptor: 'attire inappropriate to context',
    evidenceSource: 'observed',
    present: 'Attire was inappropriate to context.',
  },
  {
    signal: 'behavior.eye-contact-good',
    domain: 'appearance-behavior',
    descriptor: 'good eye contact',
    evidenceSource: 'observed',
    present: 'Eye contact was good.',
  },
  {
    signal: 'behavior.eye-contact-limited',
    domain: 'appearance-behavior',
    descriptor: 'limited eye contact',
    evidenceSource: 'observed',
    present: 'Eye contact was limited.',
  },
  {
    signal: 'behavior.cooperative',
    domain: 'appearance-behavior',
    descriptor: 'cooperative behavior',
    evidenceSource: 'observed',
    present: 'Behavior was cooperative.',
  },
  {
    signal: 'behavior.guarded',
    domain: 'appearance-behavior',
    descriptor: 'guarded behavior',
    evidenceSource: 'observed',
    present: 'Behavior was guarded.',
  },
  {
    signal: 'behavior.hostile',
    domain: 'appearance-behavior',
    descriptor: 'hostile behavior',
    evidenceSource: 'observed',
    present: 'Behavior was hostile.',
  },
  {
    signal: 'behavior.psychomotor-agitation',
    domain: 'appearance-behavior',
    descriptor: 'psychomotor agitation',
    evidenceSource: 'observed',
    present: 'Psychomotor activity was agitated.',
  },
  {
    signal: 'behavior.psychomotor-retardation',
    domain: 'appearance-behavior',
    descriptor: 'psychomotor retardation',
    evidenceSource: 'observed',
    present: 'Psychomotor activity was slowed/retarded.',
  },
  {
    signal: 'behavior.unusual-movements',
    domain: 'appearance-behavior',
    descriptor: 'unusual movements',
    evidenceSource: 'observed',
    present: 'Unusual movements were observed.',
  },
  {
    signal: 'behavior.posture-relaxed',
    domain: 'appearance-behavior',
    descriptor: 'relaxed posture',
    evidenceSource: 'observed',
    present: 'Posture was relaxed.',
  },
  {
    signal: 'behavior.posture-stiff',
    domain: 'appearance-behavior',
    descriptor: 'stiff posture',
    evidenceSource: 'observed',
    present: 'Posture was stiff.',
  },
  {
    signal: 'speech.rate-normal',
    domain: 'speech',
    descriptor: 'normal speech rate',
    evidenceSource: 'observed',
    present: 'Speech rate was normal.',
  },
  {
    signal: 'speech.rate-rapid',
    domain: 'speech',
    descriptor: 'rapid speech rate',
    evidenceSource: 'observed',
    present: 'Speech was rapid.',
  },
  {
    signal: 'speech.rate-slow',
    domain: 'speech',
    descriptor: 'slow speech rate',
    evidenceSource: 'observed',
    present: 'Speech was slow.',
  },
  {
    signal: 'speech.rate-pressured',
    domain: 'speech',
    descriptor: 'pressured speech',
    evidenceSource: 'observed',
    present: 'Speech was pressured.',
  },
  {
    signal: 'speech.volume-normal',
    domain: 'speech',
    descriptor: 'normal speech volume',
    evidenceSource: 'observed',
    present: 'Speech volume was normal.',
  },
  {
    signal: 'speech.volume-soft',
    domain: 'speech',
    descriptor: 'soft speech volume',
    evidenceSource: 'observed',
    present: 'Speech volume was soft.',
  },
  {
    signal: 'speech.volume-loud',
    domain: 'speech',
    descriptor: 'loud speech volume',
    evidenceSource: 'observed',
    present: 'Speech volume was loud.',
  },
  {
    signal: 'speech.tone-clear',
    domain: 'speech',
    descriptor: 'clear speech',
    evidenceSource: 'observed',
    present: 'Speech was clear.',
  },
  {
    signal: 'speech.tone-monotone',
    domain: 'speech',
    descriptor: 'monotone speech',
    evidenceSource: 'observed',
    present: 'Speech was monotone.',
  },
  {
    signal: 'speech.latency',
    domain: 'speech',
    descriptor: 'speech latency',
    evidenceSource: 'observed',
    present: 'Speech latency was observed.',
  },
  {
    signal: 'mood.self-report',
    domain: 'mood',
    descriptor: 'self-reported mood',
    evidenceSource: 'reported',
    present: `Mood was reported as "${detailToken}".`,
    requiresDetail: true,
  },
  {
    signal: 'affect.range-full',
    domain: 'affect',
    descriptor: 'full affective range',
    evidenceSource: 'observed',
    present: 'Affect was full-range.',
  },
  {
    signal: 'affect.range-restricted',
    domain: 'affect',
    descriptor: 'restricted affective range',
    evidenceSource: 'observed',
    present: 'Affect was restricted.',
  },
  {
    signal: 'affect.range-flat',
    domain: 'affect',
    descriptor: 'flat affective range',
    evidenceSource: 'observed',
    present: 'Affect was flat.',
  },
  {
    signal: 'affect.range-labile',
    domain: 'affect',
    descriptor: 'labile affective range',
    evidenceSource: 'observed',
    present: 'Affect was labile.',
  },
  {
    signal: 'affect.quality-euthymic',
    domain: 'affect',
    descriptor: 'euthymic affect',
    evidenceSource: 'observed',
    present: 'Affect appeared euthymic.',
  },
  {
    signal: 'affect.quality-dysphoric',
    domain: 'affect',
    descriptor: 'dysphoric affect',
    evidenceSource: 'observed',
    present: 'Affect appeared dysphoric.',
  },
  {
    signal: 'affect.quality-anxious',
    domain: 'affect',
    descriptor: 'anxious affect',
    evidenceSource: 'observed',
    present: 'Affect appeared anxious.',
  },
  {
    signal: 'affect.quality-irritable',
    domain: 'affect',
    descriptor: 'irritable affect',
    evidenceSource: 'observed',
    present: 'Affect appeared irritable.',
  },
  {
    signal: 'affect.quality-euphoric',
    domain: 'affect',
    descriptor: 'euphoric affect',
    evidenceSource: 'observed',
    present: 'Affect appeared euphoric.',
  },
  {
    signal: 'affect.congruent',
    domain: 'affect',
    descriptor: 'mood-affect congruence',
    evidenceSource: 'observed',
    present: 'Affect was congruent with reported mood.',
  },
  {
    signal: 'affect.incongruent',
    domain: 'affect',
    descriptor: 'mood-affect incongruence',
    evidenceSource: 'observed',
    present: 'Affect was incongruent with reported mood.',
  },
  {
    signal: 'perception.hallucinations',
    domain: 'perception',
    descriptor: 'hallucinations',
    evidenceSource: 'either',
    present: 'Hallucinations were reported or observed.',
    absent: 'No hallucinations were reported or observed.',
  },
  {
    signal: 'perception.illusions',
    domain: 'perception',
    descriptor: 'illusions',
    evidenceSource: 'either',
    present: 'Illusions were reported or observed.',
    absent: 'No illusions were reported or observed.',
  },
  {
    signal: 'perception.depersonalization',
    domain: 'perception',
    descriptor: 'depersonalization',
    evidenceSource: 'either',
    present: 'Depersonalization was reported or observed.',
    absent: 'No depersonalization was reported or observed.',
  },
  {
    signal: 'perception.derealization',
    domain: 'perception',
    descriptor: 'derealization',
    evidenceSource: 'either',
    present: 'Derealization was reported or observed.',
    absent: 'No derealization was reported or observed.',
  },
  {
    signal: 'thought-process.linear',
    domain: 'thought-process',
    descriptor: 'linear thought process',
    evidenceSource: 'observed',
    present: 'Thought process was linear.',
  },
  {
    signal: 'thought-process.logical',
    domain: 'thought-process',
    descriptor: 'logical thought process',
    evidenceSource: 'observed',
    present: 'Thought process was logical.',
  },
  {
    signal: 'thought-process.goal-directed',
    domain: 'thought-process',
    descriptor: 'goal-directed thought process',
    evidenceSource: 'observed',
    present: 'Thought process was goal-directed.',
  },
  {
    signal: 'thought-process.circumstantial',
    domain: 'thought-process',
    descriptor: 'circumstantial thought process',
    evidenceSource: 'observed',
    present: 'Thought process was circumstantial.',
  },
  {
    signal: 'thought-process.tangential',
    domain: 'thought-process',
    descriptor: 'tangential thought process',
    evidenceSource: 'observed',
    present: 'Thought process was tangential.',
  },
  {
    signal: 'thought-process.flight-of-ideas',
    domain: 'thought-process',
    descriptor: 'flight of ideas',
    evidenceSource: 'observed',
    present: 'Thought process showed flight of ideas.',
  },
  {
    signal: 'thought-process.loose-associations',
    domain: 'thought-process',
    descriptor: 'loose associations',
    evidenceSource: 'observed',
    present: 'Thought process showed loose associations.',
  },
  {
    signal: 'thought-process.word-salad',
    domain: 'thought-process',
    descriptor: 'word salad',
    evidenceSource: 'observed',
    present: 'Thought process was characterized by word salad.',
  },
  {
    signal: 'thought-process.blocking',
    domain: 'thought-process',
    descriptor: 'thought blocking',
    evidenceSource: 'observed',
    present: 'Thought blocking was observed.',
  },
  {
    signal: 'thought-process.mutism',
    domain: 'thought-process',
    descriptor: 'mutism',
    evidenceSource: 'observed',
    present: 'Mutism was observed.',
  },
  {
    signal: 'thought-content.preoccupation',
    domain: 'thought-content',
    descriptor: 'preoccupation',
    evidenceSource: 'either',
    present: `Thought content included preoccupation with "${detailToken}".`,
    requiresDetail: true,
  },
  {
    signal: 'thought-content.delusions',
    domain: 'thought-content',
    descriptor: 'delusions',
    evidenceSource: 'either',
    present: `Thought content included delusional beliefs about "${detailToken}".`,
    absent: 'No delusions were reported or observed.',
    requiresDetail: true,
  },
  {
    signal: 'thought-content.paranoia',
    domain: 'thought-content',
    descriptor: 'paranoid ideation',
    evidenceSource: 'either',
    present: 'Paranoid ideation was reported or observed.',
    absent: 'No paranoid ideation was reported or observed.',
  },
  {
    signal: 'thought-content.obsessions',
    domain: 'thought-content',
    descriptor: 'obsessions',
    evidenceSource: 'either',
    present: 'Obsessions were reported or observed.',
    absent: 'No obsessions were reported or observed.',
  },
  {
    signal: 'thought-content.phobias',
    domain: 'thought-content',
    descriptor: 'phobias',
    evidenceSource: 'either',
    present: 'Phobias were reported or observed.',
    absent: 'No phobias were reported or observed.',
  },
  {
    signal: 'thought-content.suicidal-ideation',
    domain: 'thought-content',
    descriptor: 'suicidal ideation',
    evidenceSource: 'reported',
    present: 'Suicidal ideation was reported.',
    absent: 'Suicidal ideation was denied.',
  },
  {
    signal: 'thought-content.homicidal-ideation',
    domain: 'thought-content',
    descriptor: 'homicidal ideation',
    evidenceSource: 'reported',
    present: 'Homicidal ideation was reported.',
    absent: 'Homicidal ideation was denied.',
  },
  {
    signal: 'thought-content.self-harm',
    domain: 'thought-content',
    descriptor: 'self-harm thoughts or behavior',
    evidenceSource: 'reported',
    present: 'Self-harm thoughts or behavior were reported.',
    absent: 'Self-harm thoughts or behavior were denied.',
  },
  {
    signal: 'cognition.alert',
    domain: 'cognition-sensorium',
    descriptor: 'alert sensorium',
    evidenceSource: 'observed',
    present: 'The client appeared alert.',
  },
  {
    signal: 'cognition.lethargic',
    domain: 'cognition-sensorium',
    descriptor: 'lethargic sensorium',
    evidenceSource: 'observed',
    present: 'The client appeared lethargic.',
  },
  {
    signal: 'cognition.oriented-person',
    domain: 'cognition-sensorium',
    descriptor: 'oriented to person',
    evidenceSource: 'observed',
    present: 'Oriented to person.',
  },
  {
    signal: 'cognition.oriented-place',
    domain: 'cognition-sensorium',
    descriptor: 'oriented to place',
    evidenceSource: 'observed',
    present: 'Oriented to place.',
  },
  {
    signal: 'cognition.oriented-time',
    domain: 'cognition-sensorium',
    descriptor: 'oriented to time',
    evidenceSource: 'observed',
    present: 'Oriented to time.',
  },
  {
    signal: 'cognition.oriented-situation',
    domain: 'cognition-sensorium',
    descriptor: 'oriented to situation',
    evidenceSource: 'observed',
    present: 'Oriented to situation.',
  },
  {
    signal: 'cognition.attention-intact',
    domain: 'cognition-sensorium',
    descriptor: 'intact attention',
    evidenceSource: 'observed',
    present: 'Attention appeared intact.',
  },
  {
    signal: 'cognition.concentration-intact',
    domain: 'cognition-sensorium',
    descriptor: 'intact concentration',
    evidenceSource: 'observed',
    present: 'Concentration appeared intact.',
  },
  {
    signal: 'cognition.memory-intact',
    domain: 'cognition-sensorium',
    descriptor: 'gross memory intact',
    evidenceSource: 'observed',
    present: 'Gross memory appeared intact.',
  },
  {
    signal: 'cognition.abstract-thinking',
    domain: 'cognition-sensorium',
    descriptor: 'abstract thinking',
    evidenceSource: 'observed',
    present: 'Abstract thinking was demonstrated.',
  },
  {
    signal: 'insight.good',
    domain: 'insight-judgment',
    descriptor: 'good insight',
    evidenceSource: 'either',
    present: 'Insight was good.',
  },
  {
    signal: 'insight.fair',
    domain: 'insight-judgment',
    descriptor: 'fair insight',
    evidenceSource: 'either',
    present: 'Insight was fair.',
  },
  {
    signal: 'insight.poor',
    domain: 'insight-judgment',
    descriptor: 'poor insight',
    evidenceSource: 'either',
    present: 'Insight was poor.',
  },
  {
    signal: 'judgment.sound',
    domain: 'insight-judgment',
    descriptor: 'sound judgment',
    evidenceSource: 'either',
    present: 'Judgment appeared sound.',
  },
  {
    signal: 'judgment.fair',
    domain: 'insight-judgment',
    descriptor: 'fair judgment',
    evidenceSource: 'either',
    present: 'Judgment appeared fair.',
  },
  {
    signal: 'judgment.impaired',
    domain: 'insight-judgment',
    descriptor: 'impaired judgment',
    evidenceSource: 'either',
    present: 'Judgment appeared impaired.',
  },
] as const;

const DOMAIN_ORDER: readonly PresentationMseDomain[] = [
  'appearance-behavior',
  'speech',
  'mood',
  'affect',
  'perception',
  'thought-process',
  'thought-content',
  'cognition-sensorium',
  'insight-judgment',
];

function findMapping(signal: PresentationMseSignal): PresentationMseMapping | undefined {
  return PRESENTATION_MSE_KNOWLEDGE.find((mapping) => mapping.signal === signal);
}

function normalizedDetail(detail: string | undefined): string | undefined {
  const value = detail?.trim().replace(/\s+/g, ' ');
  return value ? value : undefined;
}

function renderPhrase(mapping: PresentationMseMapping, detail: string | undefined): string | undefined {
  const value = normalizedDetail(detail);
  if (mapping.requiresDetail && !value) return undefined;
  return mapping.present.replaceAll(detailToken, value ?? '');
}

/**
 * Render only findings supported by explicit facts.
 *
 * Silence is not a negative.  `absent` is rendered only when that mapping has
 * a dedicated absence phrase (and therefore cannot turn an unmentioned MSE
 * item into a normal finding).  `uncertain` facts are always omitted.
 */
export function renderPresentationMse(facts: readonly PresentationMseFact[]): RenderedPresentationMse {
  const entries: RenderedPresentationMseEntry[] = [];
  const omitted: OmittedPresentationMseFact[] = [];

  for (const fact of facts) {
    const mapping = findMapping(fact.signal);
    if (!mapping) continue;

    if (fact.status === 'uncertain') {
      omitted.push({ signal: fact.signal, reason: 'uncertain' });
      continue;
    }

    if (mapping.evidenceSource !== 'either' && mapping.evidenceSource !== fact.source) {
      omitted.push({ signal: fact.signal, reason: 'evidence-source-mismatch' });
      continue;
    }

    if (fact.status === 'absent') {
      if (!mapping.absent) {
        omitted.push({ signal: fact.signal, reason: 'absence-not-supported' });
        continue;
      }
      entries.push({
        signal: fact.signal,
        domain: mapping.domain,
        status: 'absent',
        wording: mapping.absent,
      });
      continue;
    }

    const wording = renderPhrase(mapping, fact.detail);
    if (!wording) {
      omitted.push({ signal: fact.signal, reason: 'detail-required' });
      continue;
    }
    entries.push({
      signal: fact.signal,
      domain: mapping.domain,
      status: 'present',
      wording,
    });
  }

  const orderedEntries = DOMAIN_ORDER.flatMap((domain) => entries.filter((entry) => entry.domain === domain));

  return {
    entries: orderedEntries,
    omitted,
    text: orderedEntries.map((entry) => entry.wording).join(' '),
  };
}
