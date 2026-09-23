import type { Denominators, Fixture } from './corpus.js';
import type { NoteScore } from './score.js';

/**
 * The markdown report (rubric §10).
 *
 * It leads with **fabrication rate** and nothing else, because that is the
 * decision the eval exists to inform: an omission is recoverable in the refine
 * chat by a clinician who remembers the session; a fabrication looks finished
 * and gets published. Completeness and schema-validity are further down, where
 * they belong.
 *
 * Every rate is printed with its denominator. "A 0% unsupported-conclusion
 * rate" over 132 observations and over 6 are different claims and render
 * identically without one (rubric §9).
 */

export interface ModelReport {
  readonly model: string;
  readonly runs: number;
  readonly scores: readonly NoteScore[];
}

export interface ReportInput {
  readonly fixtures: readonly Fixture[];
  readonly denominators: Denominators;
  readonly models: readonly ModelReport[];
  readonly fake: boolean;
  /** Set when owner-supplied instructions replaced the defaults. */
  readonly instructionsNote?: string | undefined;
  readonly startedAt: Date;
  readonly elapsedMs: number;
}

export function renderReport(input: ReportInput): string {
  const lines: string[] = [
    '# Apunta model eval',
    '',
    `Run ${input.startedAt.toISOString()} · ${input.fixtures.length} fixtures · ` +
      `${input.models.map((model) => `${model.model} x${String(model.runs)}`).join(', ')} · ` +
      `${(input.elapsedMs / 1000).toFixed(1)}s`,
    '',
  ];

  if (input.instructionsNote !== undefined) {
    lines.push(
      '> **Custom instructions.** ' + input.instructionsNote,
      '> A number here is about *this* configuration; it is not comparable to a',
      '> default-instructions baseline without saying so.',
      '',
    );
  }

  if (input.fake) {
    lines.push(
      '> **Fake mode.** These notes came from `FakeLlmProvider`, not from a model.',
      '> The numbers below say the harness works; they say nothing whatsoever about',
      '> model quality. The real run is manual — see `e2e/fixtures/eval/README.md`.',
      '',
    );
  }

  lines.push(...fabricationSection(input));
  lines.push(...restraintSection(input));
  lines.push(...completenessSection(input));
  lines.push(...structureAndToneSection(input));
  lines.push(...costSection(input));
  lines.push(...perFixtureSection(input));
  lines.push(...humanSection(input));

  return lines.join('\n');
}

/** The headline. Everything else in the report is context for this number. */
function fabricationSection(input: ReportInput): string[] {
  const lines = ['## Fabrication rate', '', 'The number to read first.', ''];

  lines.push('| Model | Fabrication rate | Gated runs | F1 banned strings | Gating F6 | Novel dx/risk |');
  lines.push('| --- | --- | --- | --- | --- | --- |');

  for (const model of input.models) {
    const total = model.scores.length;
    const fabricated = model.scores.filter(
      (score) =>
        score.bannedHits.length > 0 ||
        score.gating.includes('F6 unsupported conclusion') ||
        score.gating.includes('F7 novel diagnosis/risk term'),
    );
    const gated = model.scores.filter((score) => score.gating.length > 0);
    lines.push(
      `| ${model.model} | **${percent(fabricated.length, total)}** (${String(fabricated.length)}/${String(total)}) ` +
        `| ${String(gated.length)}/${String(total)} ` +
        `| ${String(model.scores.filter((score) => score.bannedHits.length > 0).length)} ` +
        `| ${String(model.scores.filter((score) => score.gating.includes('F6 unsupported conclusion')).length)} ` +
        `| ${String(model.scores.filter((score) => score.gating.includes('F7 novel diagnosis/risk term')).length)} |`,
    );
  }

  lines.push('');
  lines.push(
    '`Fabrication rate` is the fraction of runs with any F1 banned-string hit or any',
    'gating F6 unsupported conclusion or any novel diagnosis/risk term. Each of those',
    'zeroes its fixture.',
    '',
  );

  for (const model of input.models) {
    const hits = model.scores.filter((score) => score.bannedHits.length > 0);
    if (hits.length === 0) continue;
    lines.push(`**${model.model} — banned strings**`, '');
    for (const score of hits) {
      lines.push(`- \`${score.fixture}\` run ${String(score.run)}: ${score.bannedHits.join('; ')}`);
    }
    lines.push('');
  }

  for (const model of input.models) {
    const hits = model.scores.filter((score) =>
      score.sections.some((section) => section.f6CoreHits.length > 0),
    );
    if (hits.length === 0) continue;
    lines.push(`**${model.model} — unsupported conclusions**`, '');
    for (const score of hits) {
      for (const section of score.sections) {
        if (section.f6CoreHits.length === 0) continue;
        lines.push(
          `- \`${score.fixture}\` run ${String(score.run)} · ${section.section}: ${section.f6CoreHits.join(', ')}`,
        );
      }
    }
    lines.push('');
  }

  return lines;
}

function restraintSection(input: ReportInput): string[] {
  const { denominators: d } = input;
  const lines = [
    '## Restraint',
    '',
    'A blank section is correct output where the source said nothing about that',
    'topic — the practice owner asked for a blank she can fill in, not a sentence',
    'explaining the emptiness. H4 measures that; S4 measures the opposite error.',
    '',
    '| Model | Unsupported conclusion (per section) | Blank preserved | Unwarranted blanks | Narrated | Filled | Marker kept |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const model of input.models) {
    const runs = model.runs;
    const gatingSections = model.scores.flatMap((score) =>
      score.sections.filter((section) => section.noConclusion),
    );
    const f6Hits = gatingSections.filter((section) => section.f6CoreHits.length > 0).length;
    const blankSections = model.scores.flatMap((score) =>
      score.sections.filter((section) => section.blankExpected),
    );
    const preserved = blankSections.filter(
      (section) => section.blankOutcome === 'preserved' || section.blankOutcome === 'whitespace',
    ).length;
    const narrated = blankSections.filter((section) => section.blankOutcome === 'narrated').length;
    const filled = blankSections.filter((section) => section.blankOutcome === 'filled').length;
    const allSections = model.scores.flatMap((score) => score.sections);
    const unwarranted = allSections.filter((section) => section.unwarrantedBlank).length;
    const markersRequired = model.scores.reduce((total, score) => total + score.markersRequired, 0);
    const markersMet = model.scores.reduce((total, score) => total + score.markersMet, 0);

    lines.push(
      `| ${model.model} ` +
        `| ${percent(f6Hits, gatingSections.length)} (n=${String(gatingSections.length)}) ` +
        `| ${percent(preserved, blankSections.length)} (n=${String(blankSections.length)}) ` +
        `| ${percent(unwarranted, allSections.length)} (n=${String(allSections.length)}) ` +
        `| ${String(narrated)} | ${String(filled)} ` +
        `| ${percent(markersMet, markersRequired)} (n=${String(markersRequired)}) |`,
    );

    void runs;
  }

  lines.push(
    '',
    `Corpus denominators per run: ${String(d.sections)} sections, ${String(d.blankSections)} blank, ` +
      `${String(d.statedAbsenceSections)} stated absences, ${String(d.noConclusionGating)} no-conclusion ` +
      `sections on gating fixtures and ${String(d.noConclusionFlagged)} on flagged ones, ` +
      `${String(d.markerItems)} marker items.`,
    '',
    'The corpus is deliberately unbalanced toward blanks and no-conclusion sections.',
    'That is a property of a corpus built to measure restraint, not an estimate of how',
    'often a real session leaves a section empty.',
    '',
  );

  return lines;
}

function completenessSection(input: ReportInput): string[] {
  const lines = [
    '## Completeness',
    '',
    'Below fabrication on purpose. A model that dumps the transcript into every',
    'section aces this and should be losing the points back above.',
    '',
    '| Model | Salient facts (C1) | Safety facts (C2) | Hedges met (H2) | Expansion ratio |',
    '| --- | --- | --- | --- | --- |',
  ];

  for (const model of input.models) {
    const captured = model.scores.reduce((total, score) => total + score.capturedFacts, 0);
    const facts = model.scores.reduce((total, score) => total + score.totalFacts, 0);
    const safety = model.scores.filter((score) => score.safetyPassed).length;
    const hedgesMet = model.scores.reduce((total, score) => total + score.hedgesMet, 0);
    const hedges = model.scores.reduce((total, score) => total + score.hedgesRequired, 0);
    lines.push(
      `| ${model.model} | ${percent(captured, facts)} (n=${String(facts)}) ` +
        `| ${percent(safety, model.scores.length)} (n=${String(model.scores.length)}) ` +
        `| ${percent(hedgesMet, hedges)} (n=${String(hedges)}) ` +
        `| ${mean(model.scores.map((score) => score.expansionRatio)).toFixed(2)}x |`,
    );
  }

  lines.push('');
  lines.push(
    '**Safety facts (C2)** are the `tags: ["safety"]` facts, and a run passes only when it',
    'captured every one of them. Which one went missing is the whole diagnosis, so the',
    'misses are listed rather than counted.',
    '',
  );
  for (const model of input.models) {
    const misses = model.scores.filter((score) => score.safetyMisses.length > 0);
    if (misses.length === 0) {
      lines.push(`${model.model}: every safety fact captured in every run.`, '');
      continue;
    }
    const byFixture = new Map<string, string[]>();
    for (const score of misses) {
      const list = byFixture.get(score.fixture) ?? [];
      list.push(score.safetyMisses.join('+'));
      byFixture.set(score.fixture, list);
    }
    lines.push(`**${model.model} — safety facts not captured**`, '');
    for (const [fixture, facts] of [...byFixture.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(
        `- \`${fixture}\`: ${facts.join(', ')} (${String(facts.length)}/${String(model.runs)} runs)`,
      );
    }
    lines.push('');
  }
  return lines;
}

function structureAndToneSection(input: ReportInput): string[] {
  const lines = [
    '## Structure, tone and voice',
    '',
    '| Model | Schema valid (S1+S2) | Quoted-phrase violations | Number flags | Medication flags | Novel clinical terms /100w | Novel content words /100w |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const model of input.models) {
    const valid = model.scores.filter(
      (score) => !score.gating.includes('S1 schema') && !score.gating.includes('S2 section keys'),
    ).length;
    lines.push(
      `| ${model.model} | ${percent(valid, model.scores.length)} ` +
        `| ${String(model.scores.reduce((total, score) => total + score.quotedViolations.length, 0))} ` +
        `| ${String(model.scores.reduce((total, score) => total + score.numberFlags.length, 0))} ` +
        `| ${String(model.scores.reduce((total, score) => total + score.medicationFlags.length, 0))} ` +
        `| ${mean(model.scores.map((score) => score.novelClinicalRate)).toFixed(2)} ` +
        `| ${mean(model.scores.map((score) => score.novelContentWordRate)).toFixed(1)} |`,
    );
  }

  lines.push(
    '',
    'Number and medication flags are AUTO-FLAG: legitimate paraphrase trips them, so',
    'they are printed for a human to confirm or dismiss, never scored as failures.',
    '',
  );

  const unsupported = input.models.flatMap((model) =>
    model.scores.filter((score) => score.unsupportedPhrases.length > 0),
  );
  if (unsupported.length > 0) {
    lines.push(
      '**Unsupported phrases** — a habitual phrase used where the source does not',
      'support it. Costs no points and is read as an F6-class failure in any ship',
      'decision: it is a fabrication wearing her voice.',
      '',
    );
    for (const score of unsupported) {
      lines.push(
        `- \`${score.fixture}\` (${score.model}) run ${String(score.run)}: ${score.unsupportedPhrases.join(', ')}`,
      );
    }
    lines.push('');
  }

  return lines;
}

function costSection(input: ReportInput): string[] {
  const lines = [
    '## Cost, and the trap that would read as a pass',
    '',
    '| Model | Mean wall clock | Mean prompt tokens | Mean output tokens | Tokens/sec | Context full | Retries |',
    '| --- | --- | --- | --- | --- | --- | --- |',
  ];

  for (const model of input.models) {
    const stats = model.scores.map((score) => score.stats).filter((value) => value !== undefined);
    const tokensPerSecond = stats
      .filter((stat) => stat.evalNanos > 0)
      .map((stat) => stat.outputTokens / (stat.evalNanos / 1e9));
    lines.push(
      `| ${model.model} | ${(mean(stats.map((stat) => stat.wallMs)) / 1000).toFixed(1)}s ` +
        `| ${mean(stats.map((stat) => stat.promptTokens)).toFixed(0)} ` +
        `| ${mean(stats.map((stat) => stat.outputTokens)).toFixed(0)} ` +
        `| ${mean(tokensPerSecond).toFixed(1)} ` +
        `| ${String(stats.filter((stat) => stat.contextFull).length)} ` +
        `| ${String(stats.filter((stat) => stat.attempts > 1).length)} |`,
    );
  }

  lines.push(
    '',
    '**Context full** counts runs where `prompt_eval_count` reached the context',
    'window. Ollama truncates an over-long prompt from the head, which drops the',
    'instructions and keeps the patient material — so those runs are not results,',
    'they are failed runs, and they are gated as such. A note produced from',
    'truncated instructions is exactly the confident fabrication this eval exists to',
    'measure, and it would otherwise score as a pass.',
    '',
  );

  return lines;
}

function perFixtureSection(input: ReportInput): string[] {
  const lines = [
    '## Per fixture',
    '',
    'Pooled rates let one 19-word fixture and one 521-word fixture count the same.',
    'This table is where that becomes visible.',
    '',
  ];

  for (const model of input.models) {
    if (input.models.length > 1) lines.push(`### ${model.model}`, '');
    lines.push('| Fixture | Struct /20 | Faith /37 | Compl /16 | Hedge /8 | Tone /7 | Total /88 | Gating |');
    lines.push('| --- | --- | --- | --- | --- | --- | --- | --- |');

    const byFixture = new Map<string, NoteScore[]>();
    for (const score of model.scores) {
      const list = byFixture.get(score.fixture) ?? [];
      list.push(score);
      byFixture.set(score.fixture, list);
    }

    for (const [fixture, scores] of [...byFixture.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      const gating = [...new Set(scores.flatMap((score) => score.gating))];
      const totals = scores.map((score) => score.total);
      lines.push(
        `| ${fixture} | ${mean(scores.map((s) => s.structural)).toFixed(0)} ` +
          `| ${mean(scores.map((s) => s.faithfulness)).toFixed(0)} ` +
          `| ${mean(scores.map((s) => s.completeness)).toFixed(0)} ` +
          `| ${mean(scores.map((s) => s.hedging)).toFixed(0)} ` +
          `| ${mean(scores.map((s) => s.tone)).toFixed(0)} ` +
          `| ${mean(totals).toFixed(0)}${spread(totals)} ` +
          `| ${gating.length === 0 ? '—' : gating.join(', ')} |`,
      );
    }
    lines.push('');
  }

  lines.push(
    'The HUMAN criteria (F5 3, C3 4, H3 2, T5 3) cannot be scored by a script, so',
    'their 12 points are withheld rather than granted. The maxima above are the',
    "automatic subtotals and add to 88, not to the rubric's 100 — a note scoring 88",
    'here has passed everything a script can see and has not yet been read.',
    '',
  );

  if (input.models.length > 1) {
    lines.push(...disagreementSection(input));
  }

  return lines;
}

/** For a two-model comparison, the short list a human should actually read. */
function disagreementSection(input: ReportInput): string[] {
  const lines = ['### Where the models disagree on a gating check', ''];
  const fixtures = new Set(input.models.flatMap((model) => model.scores.map((score) => score.fixture)));
  const rows: string[] = [];

  for (const fixture of [...fixtures].sort()) {
    const verdicts = input.models.map((model) => ({
      model: model.model,
      gated: model.scores.some((score) => score.fixture === fixture && score.gating.length > 0),
    }));
    const distinct = new Set(verdicts.map((verdict) => verdict.gated));
    if (distinct.size < 2) continue;
    rows.push(
      `- \`${fixture}\`: ${verdicts.map((v) => `${v.model} ${v.gated ? 'gated' : 'clean'}`).join(', ')}`,
    );
  }

  lines.push(...(rows.length === 0 ? ['No fixture separates the models on a gating check.'] : rows), '');
  return lines;
}

function humanSection(input: ReportInput): string[] {
  return [
    '## What this script could not check',
    '',
    'Rubric §11. Sample these by hand rather than trusting the totals above:',
    '',
    "- **F5** — an unsupported inference built entirely from the clinician's own",
    '  words. F6 keys on a marker list and cannot see this. Read `12`, `18`, `20`.',
    '- **C3** — salient material the fact list did not anticipate. Read `03`, `10`, `14`.',
    '- **H3** — over-hedging. A note where every sentence says "reportedly may',
    '  possibly" is unusable even though it never lies.',
    '- **T5** — register.',
    '- **Section routing.** Whether Objective material landed in Objective is only',
    '  crudely checkable. Read `07`. And read `15` before believing its label: the',
    '  patient left early, that belongs in Objective, and a model that files it',
    '  under Plan fails H4 correctly but for a reason this report renders as',
    '  "invented a plan".',
    '',
    `Fixtures in this run: ${input.fixtures.map((fixture) => fixture.filename).join(', ')}`,
    '',
  ];
}

function percent(part: number, whole: number): string {
  if (whole === 0) return 'n/a';
  return `${((part / whole) * 100).toFixed(1)}%`;
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((total, value) => total + value, 0) / values.length;
}

/** At temperature 0 a wide spread is itself a finding, so it is never hidden. */
function spread(values: readonly number[]): string {
  if (values.length < 2) return '';
  const low = Math.min(...values);
  const high = Math.max(...values);
  return low === high ? '' : ` (${String(low)}–${String(high)})`;
}
