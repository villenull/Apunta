/**
 * Versioned, closed vocabulary metadata for local drafting guidance.
 *
 * The domain/modality names are routing/checklist vocabulary only. They are
 * not findings, treatment recommendations, or patient text. The intervention
 * approach suggestion labels additionally mirror the therapist's reference
 * headings for anchoring only; a suggestion is a candidate for her explicit
 * confirmation, not a finding or treatment action.
 */
export const CLINICAL_GUIDANCE_VERSION = '2026-09-07.1';

export const PRESENTATION_MSE_DOMAINS = [
  'appearance/behaviour',
  'speech',
  'mood',
  'affect',
  'perception',
  'thought process',
  'thought content',
  'cognition/sensorium',
  'insight/judgment',
] as const;

export const INTERVENTION_MODALITIES = [
  'EMDR',
  'CBT',
  'CBT for children',
  'ACT',
  'Solution-focused/Narrative Therapy',
  'Psychodynamic therapy',
  'DBT-C',
  'Behavioral therapy',
  'DBT',
] as const;

export type PresentationMseDomainName = (typeof PRESENTATION_MSE_DOMAINS)[number];
export type InterventionModality = (typeof INTERVENTION_MODALITIES)[number];
/**
 * Note-level approach suggestion for an Intervention that describes a
 * technique without naming its approach.
 *
 * The nine return values are the exact page-1 headings of the therapist's
 * "Interventions Cheat Sheet for Notes" PDF. The matcher only fires on an
 * explicit, distinctive technique phrase from that PDF that is present in the
 * given Intervention body; the matched phrase is returned verbatim as
 * `evidence` so the UI can anchor a suggestion next to the note text for her
 * explicit confirmation.
 *
 * It never adds, infers, or mutates note text: it returns null (abstains)
 * when the body already names a modality, when surviving cues point at more
 * than one approach, when a child-context cue lacks explicit child context
 * (or an adult/child-shared cue meets one), or when the cue is negated,
 * planned/future, hypothetical, quoted, or reported speech — as well as when
 * the body holds only generic material (breathing, mindfulness, reassurance,
 * plans) shared by several modalities. The result never claims the therapist
 * used or selected the approach; confirmation stays with her.
 */
export function suggestInterventionApproach(
  interventionBody: string,
): { approach: string; evidence: string } | null {
  if (interventionBody.trim() === '') return null;
  if (NAMED_MODALITY_SENSITIVE.test(interventionBody)) return null;
  if (NAMED_MODALITY_PHRASE.test(interventionBody)) return null;

  const childContext = CHILD_CONTEXT.test(interventionBody);
  const quotes = quotedSpans(interventionBody);
  const sentences = sentencesOf(interventionBody);

  interface Candidate {
    readonly approach: string;
    readonly index: number;
    readonly evidence: string;
  }
  const candidates: Candidate[] = [];

  for (const cue of APPROACH_CUES) {
    const matcher = new RegExp(cue.source, `g${cue.flags}`);
    for (const match of interventionBody.matchAll(matcher)) {
      const index = match.index ?? -1;
      if (index < 0) continue;
      if (quotes.some((span) => index >= span.start && index < span.end)) continue;
      const sentence = sentences.find((entry) => index >= entry.start && index < entry.end);
      if (sentence === undefined) continue;
      const cueStart = index - sentence.start;
      const before = sentence.text.slice(0, cueStart).slice(-80);
      const after = sentence.text.slice(cueStart + match[0].length).slice(0, 40);
      if (NEGATED_BEFORE.test(before)) continue;
      if (AFTER_NEGATION.test(after)) continue;
      if (PLANNED_OR_HYPOTHETICAL.test(sentence.text)) continue;
      if (REPORTED_SPEECH.test(sentence.text)) continue;
      if (cue.valuesConflict === true && VALUES_LANGUAGE.test(sentence.text)) continue;
      if (cue.child === 'required' && !childContext) continue;
      if (cue.child === 'absent' && childContext) continue;
      const approach =
        cue.approach === DBT_FAMILY ? (childContext ? DBT_C_APPROACH : DBT_APPROACH) : cue.approach;
      candidates.push({ approach, index, evidence: match[0] });
    }
  }

  const approachSeen: Record<string, true> = {};
  for (const candidate of candidates) approachSeen[candidate.approach] = true;
  const approachNames = Object.keys(approachSeen);
  if (approachNames.length !== 1) return null;
  const sole = approachNames[0];
  if (sole === undefined) return null;
  const winner = candidates
    .filter((candidate) => candidate.approach === sole)
    .sort((a, b) => a.index - b.index)[0];
  if (winner === undefined) return null;
  return { approach: sole, evidence: winner.evidence };
}

const EMDR_APPROACH = 'EMDR';
const CBT_APPROACH = 'CBT (Cognitive Behavioral Therapy)';
const CHILD_CBT_APPROACH = 'Cognitive Behavioral Therapy (CBT) for Children';
const ACT_APPROACH = 'Acceptance and Commitment Therapy (ACT)';
const NARRATIVE_APPROACH = 'Solution-focused/Narrative Therapy';
const PSYCHODYNAMIC_APPROACH = 'Key Psychodynamic Interventions';
const DBT_C_APPROACH = 'DBT-C';
const CONDUCTUAL_APPROACH = 'Terapia Conductual';
const DBT_APPROACH = 'Dialectical Behaviour Therapy (DBT)';

/** Internal routing sentinel for DBT skills; resolved to DBT-C vs DBT by child context. */
const DBT_FAMILY = 'dbt-family';

interface ApproachCue {
  readonly approach: string;
  /** Regex source matched against the Intervention body. */
  readonly source: string;
  /** Extra flags besides `g`. Acronym cues stay case-sensitive; phrases use `'i'`. */
  readonly flags: string;
  /** Whether an explicit child mention must be present/absent for this cue to count. */
  readonly child: 'any' | 'required' | 'absent';
  /** Drop this cue when its own sentence already frames it with values language. */
  readonly valuesConflict?: boolean;
}

/**
 * Distinctive technique phrases from the PDF, each belonging to just one
 * modality. Deliberately absent: generic material shared by several
 * modalities (mindfulness, breathing, body scan, relaxation, chain analysis,
 * psychoeducation, problem solving, homework, role-play) and triple-overlap
 * cues (urge surfing), which must abstain rather than guess.
 */
const APPROACH_CUES: readonly ApproachCue[] = [
  // EMDR (PDF p.2: desensitization via bilateral stimulation / eye movements).
  { approach: EMDR_APPROACH, source: String.raw`bilateral\s+stimulation`, flags: 'i', child: 'any' },
  { approach: EMDR_APPROACH, source: String.raw`eye\s+movements?`, flags: 'i', child: 'any' },
  {
    approach: EMDR_APPROACH,
    source: String.raw`alternating\s+(?:eye\s+movements?|taps?|tones?)`,
    flags: 'i',
    child: 'any',
  },
  // CBT (PDF p.3). Cognitive restructuring / behavioral activation are shared
  // with the child section, so they count only with no child context present.
  { approach: CBT_APPROACH, source: String.raw`Socratic\s+questioning`, flags: 'i', child: 'any' },
  { approach: CBT_APPROACH, source: String.raw`cognitive\s+restructuring`, flags: 'i', child: 'absent' },
  {
    approach: CBT_APPROACH,
    source: String.raw`thought\s+records?|thought\s+journal|cognitive\s+journal`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: CBT_APPROACH,
    source: String.raw`behavioral\s+activation|behavioural\s+activation`,
    flags: 'i',
    child: 'absent',
    valuesConflict: true,
  },
  { approach: CBT_APPROACH, source: String.raw`guided\s+discovery`, flags: 'i', child: 'any' },
  {
    approach: CBT_APPROACH,
    source: String.raw`downward[\s-]+arrow(?:\s+technique)?`,
    flags: 'i',
    child: 'any',
  },
  { approach: CBT_APPROACH, source: String.raw`ABC\s+model`, flags: '', child: 'any' },
  {
    approach: CBT_APPROACH,
    source: String.raw`exposure\s+and\s+response\s+prevention|exposure[\s-]+response\s+prevention`,
    flags: 'i',
    child: 'any',
  },
  // CBT for children (PDF p.4): child techniques count only with explicit child context.
  { approach: CHILD_CBT_APPROACH, source: String.raw`token\s+economy`, flags: 'i', child: 'required' },
  { approach: CHILD_CBT_APPROACH, source: String.raw`fear\s+ladders?`, flags: 'i', child: 'required' },
  {
    approach: CHILD_CBT_APPROACH,
    source: String.raw`emotion\s+thermometers?`,
    flags: 'i',
    child: 'required',
  },
  {
    approach: CHILD_CBT_APPROACH,
    source: String.raw`automatic\s+negative\s+thoughts?`,
    flags: 'i',
    child: 'required',
  },
  { approach: CHILD_CBT_APPROACH, source: String.raw`mood\s+charts?`, flags: 'i', child: 'required' },
  // ACT (PDF pp.5-6).
  { approach: ACT_APPROACH, source: String.raw`values?\s+clarification`, flags: 'i', child: 'any' },
  { approach: ACT_APPROACH, source: String.raw`values?\s+card\s+sort`, flags: 'i', child: 'any' },
  { approach: ACT_APPROACH, source: String.raw`cognitive\s+defusion`, flags: 'i', child: 'any' },
  { approach: ACT_APPROACH, source: String.raw`committed\s+action`, flags: 'i', child: 'any' },
  {
    approach: ACT_APPROACH,
    source: String.raw`behavioral\s+activation\s+aligned\s+with\s+values?|behavioural\s+activation\s+aligned\s+with\s+values?`,
    flags: 'i',
    child: 'any',
  },
  { approach: ACT_APPROACH, source: String.raw`acceptance\s+exercise`, flags: 'i', child: 'any' },
  {
    approach: ACT_APPROACH,
    source: String.raw`having\s+the\s+thought\s+that`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: ACT_APPROACH,
    source: String.raw`values?[\s-]+aligned\s+action|exposure\s+framed\s+as\s+values?[\s-]+based`,
    flags: 'i',
    child: 'any',
  },
  // Solution-focused/Narrative (PDF p.6).
  {
    approach: NARRATIVE_APPROACH,
    source: String.raw`externalizing\s+conversations?`,
    flags: 'i',
    child: 'any',
  },
  { approach: NARRATIVE_APPROACH, source: String.raw`unique\s+outcomes?`, flags: 'i', child: 'any' },
  {
    approach: NARRATIVE_APPROACH,
    source: String.raw`problem\s+deconstruction`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: NARRATIVE_APPROACH,
    source: String.raw`adaptive\s+narratives?|co[\s-]+created?\s+(?:therapeutic\s+)?(?:materials?|narratives?)|therapeutic\s+documentation`,
    flags: 'i',
    child: 'any',
  },
  // Psychodynamic (PDF pp.6-9).
  {
    approach: PSYCHODYNAMIC_APPROACH,
    source: String.raw`countertransference|transference`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: PSYCHODYNAMIC_APPROACH,
    source: String.raw`working\s+through`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: PSYCHODYNAMIC_APPROACH,
    source: String.raw`repetition\s+compulsion`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: PSYCHODYNAMIC_APPROACH,
    source: String.raw`defen[cs]e\s+mechanisms?`,
    flags: 'i',
    child: 'any',
  },
  { approach: PSYCHODYNAMIC_APPROACH, source: String.raw`affect\s+focus`, flags: 'i', child: 'any' },
  // DBT skills (PDF pp.9-10, 12): routed to DBT-C with child context, else DBT.
  // GIVE / FAST / STOP / TIPP / PLEASE / ACCEPTS stay uppercase-only so common
  // words never count as skill evidence.
  { approach: DBT_FAMILY, source: String.raw`\bTIPP\b`, flags: '', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`DEAR\s+MAN`, flags: 'i', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`\bGIVE\b`, flags: '', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`\bFAST\b`, flags: '', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`\bSTOP\b`, flags: '', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`wise\s+mind`, flags: 'i', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`opposite\s+action`, flags: 'i', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`radical\s+acceptance`, flags: 'i', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`check\s+the\s+facts`, flags: 'i', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`improve\s+the\s+moment`, flags: 'i', child: 'any' },
  { approach: DBT_FAMILY, source: String.raw`\bPLEASE\b`, flags: '', child: 'any' },
  {
    approach: DBT_FAMILY,
    source: String.raw`behavioral\s+chain\s+analysis|behavioural\s+chain\s+analysis`,
    flags: 'i',
    child: 'any',
  },
  { approach: DBT_FAMILY, source: String.raw`\bACCEPTS\b|\bRESISTT\b`, flags: '', child: 'any' },
  // Terapia Conductual (PDF p.11, Spanish).
  {
    approach: CONDUCTUAL_APPROACH,
    source: String.raw`modificaci[oó]n\s+de\s+la\s+conducta`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: CONDUCTUAL_APPROACH,
    source: String.raw`econom[íi]a\s+de\s+fichas`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: CONDUCTUAL_APPROACH,
    source: String.raw`contratos?\s+conductuales?`,
    flags: 'i',
    child: 'any',
  },
  { approach: CONDUCTUAL_APPROACH, source: String.raw`modelamiento`, flags: 'i', child: 'any' },
  { approach: CONDUCTUAL_APPROACH, source: String.raw`encadenamiento`, flags: 'i', child: 'any' },
  {
    approach: CONDUCTUAL_APPROACH,
    source: String.raw`autoinstrucciones?`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: CONDUCTUAL_APPROACH,
    source: String.raw`desensibilizaci[oó]n\s+sistem[áa]tica`,
    flags: 'i',
    child: 'any',
  },
  {
    approach: CONDUCTUAL_APPROACH,
    source: String.raw`coste\s+de\s+respuesta`,
    flags: 'i',
    child: 'any',
  },
  { approach: CONDUCTUAL_APPROACH, source: String.raw`tiempo\s+fuera`, flags: 'i', child: 'any' },
  {
    approach: CONDUCTUAL_APPROACH,
    source: String.raw`programa\s+de\s+contingencias?`,
    flags: 'i',
    child: 'any',
  },
  { approach: CONDUCTUAL_APPROACH, source: String.raw`extinci[oó]n`, flags: 'i', child: 'any' },
];

/**
 * The suggestion only applies when the therapist has not already named the
 * approach. Acronyms stay case-sensitive so the common verb "act" (and
 * stray lowercase) never counts as naming ACT.
 */
const NAMED_MODALITY_SENSITIVE = /\bEMDR\b|\bCBT\b|\bACT\b|\bDBT(?:[\s-]*C)?\b/;

const NAMED_MODALITY_PHRASE =
  /cognitive[\s-]+behavioral\s+therapy|acceptance\s+and\s+commitment\s+therapy|solution[\s-]+focused|narrative\s+therapy|psychodynamic|dialectical\s+behavio[uü]r\s+therapy|terapia\s+conductual|behavioral\s+therapy|behavioural\s+therapy|behavior\s+therapy|behaviour\s+therapy/i;

const CHILD_CONTEXT =
  /\b(child(?:ren)?|kids?|adolescents?|teens?(?:agers?)?|youth|pediatric|play[\s-]+based|school[\s-]+ag(?:ed|e))\b/i;

const VALUES_LANGUAGE = /\bvalues?\b/i;

/** Negation scoped to the ~80 characters before the cue, within its sentence. */
const NEGATED_BEFORE =
  /\b(did\s+not|didn'?t|do\s+not|don'?t|does\s+not|doesn'?t|never|not|no|without|declined|refused|failed\s+to|unable\s+to|avoided)\b/i;

/** Passive negation just after the cue ("thought records were not used"). */
const AFTER_NEGATION = /^\s*(?:was|were|is|are|has\s+been|have\s+been)\s+(?:not|never)\b/i;

const PLANNED_OR_HYPOTHETICAL =
  /\b(will|would|shall|may|plan(?:s|ned)?\s+to|intend(?:s|ed)?\s+to|consider(?:s|ed|ing)?|recommend(?:s|ed|ing)?|might|could|should|going\s+to|next\s+(?:session|week|time)|were\s+to)\b|\bif\b/i;

/** Quoted or other-person text just before the cue is never technique evidence. */
const REPORTED_SPEECH =
  /\b(client|patient|mother|father|partner|spouse|they|she|he)\s+(said|says?|saying|stated|reports?|reported|mentioned|described|noted|asked|wanted|requested|suggested)\b/i;

interface TextSpan {
  readonly start: number;
  readonly end: number;
}

function quotedSpans(text: string): readonly TextSpan[] {
  const spans: TextSpan[] = [];
  for (const match of text.matchAll(/"[^"\n]*"|'[^'\n]+'/g)) {
    const start = match.index ?? -1;
    if (start < 0) continue;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}

interface SentenceSpan extends TextSpan {
  readonly text: string;
}

function sentencesOf(text: string): readonly SentenceSpan[] {
  const sentences: SentenceSpan[] = [];
  for (const match of text.matchAll(/[^.!?;\n]+/g)) {
    const start = match.index ?? -1;
    if (start < 0) continue;
    sentences.push({ start, end: start + match[0].length, text: match[0] });
  }
  return sentences;
}
