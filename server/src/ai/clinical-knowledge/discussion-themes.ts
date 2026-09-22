/**
 * Conservative organization for facts that already belong in Discussion.
 *
 * This module is intentionally a grouper, not a clinical language model. It
 * chooses a neutral heading only when at least two source facts have a clear
 * shared topic, and headings at all only when at least two topics qualify: a
 * Discussion with one theme stays prose, with no subheading. Source facts are returned verbatim and are never merged,
 * rewritten, interpreted, or deduplicated.
 */

export const DISCUSSION_FALLBACK_TITLE = 'Other discussion';

export interface DiscussionTheme {
  /**
   * A neutral, display-ready subsection heading, or null when the section
   * has no distinct subtopics and its facts stand as prose without one.
   */
  readonly title: string | null;
  /** Source facts, unchanged and in their original relative order. */
  readonly facts: readonly string[];
}

export type DiscussionSource = readonly string[] | string;

interface ThemeRule {
  readonly title: string;
  readonly patterns: readonly RegExp[];
}

interface ClassifiedFact {
  readonly fact: string;
  readonly themeIndex: number | null;
  readonly sourceIndex: number;
}

/**
 * Broad topics only. The patterns are deliberately narrower than a clinical
 * ontology: a match is a filing signal, never a statement about the patient.
 */
const THEME_RULES: readonly ThemeRule[] = [
  {
    title: 'Current experiences',
    patterns: [
      /\b(?:feel(?:ing|s)?|felt|mood|worr(?:y|ies|ied)|anxious|sad(?:ness)?|low mood|distress(?:ed)?|overwhelm(?:ed)?|irritab(?:le|ility)|panic|intrusive thoughts?|ruminat(?:e|ing|ion)|concentrat(?:e|ion)|focus(?:ed|ing)?|motivation|energy)\b/i,
    ],
  },
  {
    title: 'Context and relationships',
    patterns: [
      /\b(?:family|parent(?:s|ing)?|child(?:ren)?|partner|spouse|relationship|friend(?:s|ship)?|support(?:s|ive)?|conflict|work(?:place|er)?|job|school|class(?:es)?|housing|move|moving|financial|money|caregiv(?:e|er|ing)|transition|stressor|event)\b/i,
    ],
  },
  {
    title: 'Daily routines and functioning',
    patterns: [
      /\b(?:sleep\w*|asleep|insomnia|wak(?:e|ing|es)|wok(?:e|en)|appetite|eating|meal(?:s)?|exercise|routine|daily|day[- ]to[- ]day|function(?:ing|al)?|productiv(?:e|ity)|task(?:s)?|activity|activities|attendance|medication adherence)\b/i,
    ],
  },
  {
    title: 'Treatment and practice',
    patterns: [
      /\b(?:therap(?:y|ist|ies)|treatment|session(?:s)?|medication(?:s)?|prescri(?:be|bed|ber)|homework|between[- ]session|coping skill(?:s)?|grounding|breathing practice|mindfulness|rehears(?:e|ed|al)|practic(?:e|ed|ing))\b/i,
    ],
  },
  {
    title: 'Plans and goals',
    patterns: [
      /\b(?:goal(?:s)?|plan(?:s|ned|ning)?|next step(?:s)?|follow[- ]?up|referral|schedule(?:d|ing)?|agreed|continue|intend(?:s|ed)?|between[- ]session task(?:s)?|objective(?:s)?)\b/i,
    ],
  },
];

function splitRawNotes(rawNotes: string): string[] {
  const facts: string[] = [];

  for (const line of rawNotes.split(/\r?\n/)) {
    const boundary = /[.!?](?=\s|$)/g;
    let start = 0;
    let match: RegExpExecArray | null;

    while ((match = boundary.exec(line)) !== null) {
      const end = match.index + 1;
      const fact = line.slice(start, end).trim();
      if (fact.length > 0) facts.push(fact);
      start = end;
    }

    const remainder = line.slice(start).trim();
    if (remainder.length > 0) facts.push(remainder);
  }

  return facts;
}

/**
 * Split a raw note into sentence/line facts before grouping it. For exact
 * preservation, callers with already separated facts should pass an array to
 * `groupDiscussionThemes` instead.
 */
export function splitDiscussionRawNotes(rawNotes: string): readonly string[] {
  return splitRawNotes(rawNotes);
}

function sourceFacts(source: DiscussionSource): readonly string[] {
  return typeof source === 'string' ? splitRawNotes(source) : source;
}

function classify(fact: string): number | null {
  const scores = THEME_RULES.map((rule) =>
    rule.patterns.reduce((score, pattern) => score + (pattern.test(fact) ? 1 : 0), 0),
  );
  const highest = Math.max(...scores);
  if (highest === 0) return null;

  const winners = scores.reduce<number[]>((indices, score, index) => {
    if (score === highest) indices.push(index);
    return indices;
  }, []);

  // Ties are intentionally left ungrouped: assigning a fact to one topic
  // would add an interpretation that the source did not supply.
  return winners.length === 1 ? (winners[0] ?? null) : null;
}

/**
 * Group supplied Discussion facts into neutral titled subsections.
 *
 * A named subsection needs two or more facts classified to that topic, and
 * subsections are returned only when at least two topics qualify. Below that
 * the result is one untitled group of every fact: a lone subheading, or
 * `Other discussion` as the only one, is structure the session did not have.
 * With several subtopics, facts that fit none appear exactly once under
 * `Other discussion`, last; when every fact fits a subtopic there is none.
 */
export function groupDiscussionThemes(source: DiscussionSource): readonly DiscussionTheme[] {
  const facts = sourceFacts(source);
  if (facts.length === 0) return [];

  const classified: ClassifiedFact[] = facts.map((fact, sourceIndex) => ({
    fact,
    themeIndex: classify(fact),
    sourceIndex,
  }));

  const grouped = new Map<number, ClassifiedFact[]>();
  for (const item of classified) {
    if (item.themeIndex === null) continue;
    const entries = grouped.get(item.themeIndex) ?? [];
    entries.push(item);
    grouped.set(item.themeIndex, entries);
  }

  const themes: DiscussionTheme[] = [];
  for (const [themeIndex, entries] of grouped) {
    if (entries.length < 2) continue;
    const rule = THEME_RULES[themeIndex];
    if (!rule) continue;
    themes.push({
      title: rule.title,
      facts: entries.sort((left, right) => left.sourceIndex - right.sourceIndex).map(({ fact }) => fact),
    });
  }

  // Keep subsection order close to the first source occurrence. The fallback
  // is deliberately last so a neutral catch-all does not lead the section.
  themes.sort((left, right) => {
    const leftIndex = classified.findIndex((item) => item.themeIndex !== null && item.fact === left.facts[0]);
    const rightIndex = classified.findIndex(
      (item) => item.themeIndex !== null && item.fact === right.facts[0],
    );
    return leftIndex - rightIndex;
  });

  if (themes.length < 2) return [{ title: null, facts: [...facts] }];

  const groupedThemeIndices = new Set(
    themes.flatMap((theme) => {
      const index = THEME_RULES.findIndex((rule) => rule.title === theme.title);
      return index < 0 ? [] : [index];
    }),
  );
  const fallbackFacts = classified
    .filter((item) => item.themeIndex === null || !groupedThemeIndices.has(item.themeIndex))
    .sort((left, right) => left.sourceIndex - right.sourceIndex)
    .map(({ fact }) => fact);

  if (fallbackFacts.length > 0) {
    themes.push({ title: DISCUSSION_FALLBACK_TITLE, facts: fallbackFacts });
  }

  return themes;
}

/** Group an already separated array under the explicit raw-notes name. */
export function groupDiscussionRawNotes(rawNotes: string): readonly DiscussionTheme[] {
  return groupDiscussionThemes(rawNotes);
}

/** A subheading line this renderer (or the model) already wrote. */
const SUBHEADING_LINE = /^\s*#{1,6}\s+(.*)$/;

/**
 * The body with any subheadings it already carries accounted for: null when
 * it has a real subtopic heading (leave it as it is), otherwise the body with
 * a catch-all heading that stood alone removed, ready to group afresh.
 */
function withoutLoneCatchAll(body: string): string | null {
  const lines = body.split(/\r?\n/);
  const titles = lines.flatMap((line) => {
    const match = SUBHEADING_LINE.exec(line);
    return match ? [(match[1] ?? '').trim().toLowerCase()] : [];
  });
  if (titles.length === 0) return body;
  if (titles.some((title) => title !== DISCUSSION_FALLBACK_TITLE.toLowerCase())) return null;
  return lines
    .filter((line) => !SUBHEADING_LINE.test(line))
    .join('\n')
    .trim();
}

/**
 * Render grouped facts as titled Markdown subsections. The heading is the
 * only generated content; each fact is emitted verbatim on its own line.
 *
 * A Discussion without distinct subtopics comes back exactly as given, so a
 * single-theme section keeps its prose. A body that already has subtopic
 * headings is returned untouched: the refine chat runs this again on its own
 * output, and regrouping would file the heading lines themselves as facts.
 * An `Other discussion` heading standing alone (the model's, or a note drafted
 * before this rule) is dropped and the rest grouped afresh.
 */
export function renderDiscussionThemes(source: DiscussionSource): string {
  let body = source;
  if (typeof source === 'string') {
    const cleaned = withoutLoneCatchAll(source);
    if (cleaned === null) return source;
    body = cleaned;
  }
  const themes = groupDiscussionThemes(body);
  if (themes.every(({ title }) => title === null)) {
    return typeof body === 'string' ? body : body.join(' ');
  }
  return themes.map(({ title, facts }) => `### ${String(title)}\n${facts.join('\n')}`).join('\n\n');
}
