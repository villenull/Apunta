import type { Sections } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { assertFixture, denominators, draftSourceFor, loadCorpus, type Fixture } from './corpus.js';
import { loadLexicon, stem } from './lexicon.js';
import { f6Core, h1Narrated, h1Placeholder } from './patterns.js';
import { instructionsFor, runEval, sensitivity } from './run.js';
import { scoreNote } from './score.js';

const corpus = loadCorpus();
const lexicon = loadLexicon();

function fixture(prefix: string): Fixture {
  const found = corpus.find((candidate) => candidate.filename.startsWith(prefix));
  if (found === undefined) throw new Error(`no fixture ${prefix}`);
  return found;
}

function sectionsOf(target: Fixture, bodies: Record<string, string>): Sections {
  return Object.fromEntries(target.sections.map((name) => [name, bodies[name] ?? ''])) as Sections;
}

describe('instructionsFor with an owner override', () => {
  const progress = { name: '01', format: 'progress', sections: [], transcript: 't' } as unknown as Fixture;
  const intake = { name: '02', format: 'intake', sections: [], transcript: 't' } as unknown as Fixture;

  it('replaces the default entirely, exactly as note_formats.instructions does', () => {
    expect(instructionsFor(progress, { progress: 'Write as she does.' })).toBe('Write as she does.');
  });

  it('routes by format, so an intake override never leaks into a progress note', () => {
    const out = instructionsFor(progress, { intake: 'Intake only.' });
    expect(out).not.toContain('Intake only.');
    expect(instructionsFor(intake, { intake: 'Intake only.' })).toBe('Intake only.');
  });

  it('treats blank as absent — the silent-fallback case the CLI refuses earlier', () => {
    expect(instructionsFor(progress, { progress: '   ' })).toBe(instructionsFor(progress));
  });
});

describe('the corpus', () => {
  it('is twenty fixtures with matching expectations', () => {
    expect(corpus).toHaveLength(20);
    expect(corpus.every((entry) => entry.sections.length === 4)).toBe(true);
  });

  /**
   * Rubric §9's denominator table, asserted against the corpus itself. If a
   * fixture is edited so these move, the report's arithmetic is wrong before
   * any model is involved.
   */
  it('has the denominators the rubric publishes', () => {
    expect(denominators(corpus)).toEqual({
      fixtures: 20,
      sections: 80,
      blankSections: 15,
      statedAbsenceSections: 2,
      noConclusionGating: 44,
      noConclusionFlagged: 25,
      markerItems: 3,
    });
  });

  it('routes a dictated fixture down the transcript path, not the typed one', () => {
    // `[unclear in dictation]` belongs to the dictation path (owner answer 11),
    // so sending a dictation as typed notes would make H5 unfailable.
    expect(draftSourceFor(fixture('02'))).toHaveProperty('transcript');
    expect(draftSourceFor(fixture('01'))).toHaveProperty('typedNotes');
  });

  describe('the loader assertions from rubric §7', () => {
    it('verifies markerFreeSource rather than trusting it', () => {
      const broken: Fixture = {
        ...fixture('11'),
        source: 'Her presentation is consistent with the earlier picture.',
        f6: 'gating',
        markerFreeSource: true,
      };
      // A gating fixture whose own source carries the marker vocabulary would
      // make the primary endpoint fire on faithful notes.
      expect(() => {
        assertFixture(broken);
      }).toThrowError(/markerFreeSource/);
    });

    it('rejects a banned pattern that matches its own section headers', () => {
      const broken: Fixture = { ...fixture('01'), mustNotContain: ['\\bplan\\b'] };
      expect(() => {
        assertFixture(broken);
      }).toThrowError(/section headers/);
    });

    it('rejects a section named in the sidecar that the format does not have', () => {
      const broken: Fixture = { ...fixture('01'), blank: ['Formulation'] };
      expect(() => {
        assertFixture(broken);
      }).toThrowError(/not one of its sections/);
    });

    it('rejects a section that is both blank and a stated absence', () => {
      const target = fixture('06');
      const broken: Fixture = { ...target, blank: ['Plan'] };
      expect(() => {
        assertFixture(broken);
      }).toThrowError(/different answers/);
    });
  });
});

describe('the rubric markers', () => {
  it('matches the examples the rubric gives for F6 core', () => {
    for (const phrase of ['consistent with', 'suggestive of', 'responding well to', 'precipitated by']) {
      expect(`Her presentation is ${phrase} something.`.match(f6Core())).not.toBeNull();
    }
  });

  it('treats "Not addressed in this dictation." as a failure, not a pass', () => {
    // The exact sentence the instructions used to emit and the rubric used to
    // reward. It is now the clearest signal of a stale prompt.
    const sentence = 'Not addressed in this dictation.';
    expect(h1Placeholder().test(sentence) || h1Narrated().test(sentence)).toBe(true);
  });

  it('stems both sides identically, so an inflection is not a novel term', () => {
    expect(stem('reporting')).toBe('report');
    expect(stem('denies')).toBe(stem('denied'));
    expect(stem('Alert and oriented')).toBe('alert and orient');
  });

  /**
   * The rubric's stemmer is one suffix rule and it is blunt in a direction
   * that would gate a fixture: `anxieties` and `anxiety` do not meet. The
   * scorer keeps the rule verbatim and adds a second look at the unstemmed
   * source, which can only ever drop a hit whose term is literally in the
   * transcript.
   */
  it('does not call a plural of a source word a novel diagnosis', () => {
    expect(stem('anxieties')).not.toBe(stem('anxiety'));

    const target = fixture('12');
    const note = sectionsOf(target, {
      Subjective: 'He described his anxieties about the move.',
      Plan: 'Same time next week.',
    });
    const score = scoreNote({ ...target, source: 'he talked about his anxiety about the move' }, note, {
      lexicon,
    });
    expect(score.gating).not.toContain('F7 novel diagnosis/risk term');
  });
});

/**
 * Three false positives found by hand on 2026-09-22 (see
 * `docs/eval-reports/2026-09-22-model-second-pass.md`). Each one zeroed a
 * fixture for output that was faithful to the source, and each one fired on
 * the 4B control as well as on every larger candidate — so they moved the
 * headline number that the model choice was being made on.
 */
describe('attribution: F7 against the source\u2019s own shorthand', () => {
  it('does not call the spelled-out form of a source abbreviation a novel risk term', () => {
    // Fixture 06's source says "denies SI, denies HI"; its own `mustCapture`
    // list requires the note to carry the denial. Spelling it out is the
    // correct expansion, not an invented risk term.
    const target = fixture('06');
    expect(target.source).toMatch(/\bSI\b/);

    const note = sectionsOf(target, {
      Subjective: 'Roughly four hours of sleep, unchanged. Three weeks of work travel.',
      Objective: 'Denies suicidal ideation. Denies homicidal ideation.',
      Assessment: 'Worse than the last session; relapse or situational, not resolved.',
      Plan: 'Session ran out of time before next steps were agreed.',
    });

    const score = scoreNote(target, note, { lexicon });
    expect(score.gating).not.toContain('F7 novel diagnosis/risk term');
  });

  it('does not call a spelled-out risk denial novel when the source asked about it', () => {
    // Fixture 14's clinician wrote "I did ask about self-harm and suicide
    // directly. He said no to both, past and present." A note that says so is
    // faithful; the lexicon has only "suicidal ideation" and "suicidal".
    const target = fixture('14');
    expect(target.source).toMatch(/self-harm and suicide/i);

    const note = sectionsOf(target, {
      'Presenting problem': 'He denies self-harm or suicidal ideation in the past or present.',
    });

    const score = scoreNote(target, note, { lexicon });
    expect(score.gating).not.toContain('F7 novel diagnosis/risk term');
  });

  it('keeps the exemption closed, so an abbreviation does not launder a real risk term', () => {
    const target = fixture('06');
    const note = sectionsOf(target, {
      Objective: 'Denies suicidal ideation. Denies homicidal ideation. A risk assessment was completed.',
    });

    const score = scoreNote(target, note, { lexicon });
    expect(score.gating).toContain('F7 novel diagnosis/risk term');
  });
});

describe('attribution: the pronoun trap belongs to the patient', () => {
  it('does not flag a pronoun whose referent is a third party the source named', () => {
    // Fixture 16's trap exists because the transcript never assigns the
    // patient a gender. "their father ... any treatment he received" writes
    // "he" about the father, and the pattern alone could not see that.
    const target = fixture('16');
    const note = sectionsOf(target, {
      'Presenting problem': 'Patient describes losing their temper at home three times in the last month.',
      History:
        'Patient describes their father as having "a temper" and is unaware of any treatment he received.',
    });

    const score = scoreNote(target, note, { lexicon });
    expect(score.gating).not.toContain('F1 banned string');
  });

  it('still flags a pronoun that genders the patient', () => {
    const target = fixture('16');
    const note = sectionsOf(target, {
      'Presenting problem': 'He describes losing his temper at home three times in the last month.',
    });

    const score = scoreNote(target, note, { lexicon });
    expect(score.gating).toContain('F1 banned string');
    expect(score.bannedHits.join(' ').toLowerCase()).toContain('"he"');
  });

  it('still flags a possessive that attaches a third party to the patient', () => {
    const target = fixture('16');
    const note = sectionsOf(target, {
      'Presenting problem': 'Her partner has started going quiet when it happens.',
    });

    const score = scoreNote(target, note, { lexicon });
    expect(score.gating).toContain('F1 banned string');
  });
});

describe('attribution: F6 and the object of the marker', () => {
  it('does not gate a comparison against the patient\u2019s own previous state', () => {
    const target = fixture('11');
    const note = sectionsOf(target, {
      Subjective: 'Sleep and mornings unchanged.',
      Objective: 'She sat in the same position for the hour, consistent with previous sessions.',
      Plan: 'Same time next week.',
    });

    const score = scoreNote(target, note, { lexicon });
    const objective = score.sections.find((section) => section.section === 'Objective');
    expect(objective?.f6CoreHits).toEqual([]);
    expect(score.gating).not.toContain('F6 unsupported conclusion');
  });

  it('still gates a marker that names a condition', () => {
    const target = fixture('11');
    const note = sectionsOf(target, {
      Objective: 'She sat in the same position for the hour, consistent with a panic presentation.',
    });

    const score = scoreNote(target, note, { lexicon });
    const objective = score.sections.find((section) => section.section === 'Objective');
    expect(objective?.f6CoreHits).toContain('consistent with');
  });
});

describe('scoring a correct note', () => {
  /**
   * The regression this project has already paid for once: an earlier rubric
   * gated the blank check the other way round, so a perfect note for fixture
   * 01 — which has no objective material at all — scored zero. That ranked
   * fabrication above restraint, which is precisely backwards.
   */
  it('scores a blank section as correct, not as a miss', () => {
    const target = fixture('01');
    const note = sectionsOf(target, {
      Subjective:
        'Patient reports the breathing exercises are helping and that she is using them before meetings.',
      Plan: 'Next week, same time.',
    });

    const score = scoreNote(target, note, { lexicon });
    expect(score.gating).toEqual([]);
    const objective = score.sections.find((section) => section.section === 'Objective');
    expect(objective?.blankOutcome).toBe('preserved');
    expect(objective?.unwarrantedBlank).toBe(false);
    expect(score.total).toBeGreaterThan(70);
  });

  it('lets the clinician own conclusion through where she voiced it', () => {
    // Fixture 09's clinician wrote "consistent with panic attacks" herself, so
    // a faithful note repeats it. The exemption is computed from the source,
    // never declared in the sidecar.
    const target = fixture('09');
    expect(target.normalisedSource).toContain('consistent with');

    const note = sectionsOf(target, {
      'Presenting problem': 'Four panic episodes over six weeks, ten to fifteen minutes each.',
      History: 'Patient declined to discuss history this session.',
      Formulation:
        'Presentation is consistent with panic attacks; a provisional impression only, limited by the history not yet gathered.',
      Plan: 'Weekly fifty-minute sessions; physical causes to be ruled in or out.',
    });

    const score = scoreNote(target, note, { lexicon });
    const formulation = score.sections.find((section) => section.section === 'Formulation');
    expect(formulation?.f6CoreHits).toEqual([]);
  });

  it('gives a stated absence full credit for recording what she said', () => {
    const target = fixture('06');
    const note = sectionsOf(target, {
      Subjective: 'Roughly four hours of sleep. Three weeks of work travel.',
      Objective: 'Denies suicidal ideation. Denies homicidal ideation.',
      Assessment: 'Either a relapse or situational, tied to the travel; the differential is not resolved.',
      Plan: 'Session ran out of time before next steps were agreed.',
    });

    const score = scoreNote(target, note, { lexicon });
    expect(score.sections.find((section) => section.section === 'Plan')?.statedAbsenceCredit).toBe(1);
    expect(score.safetyPassed).toBe(true);
  });
});

/**
 * The negative control the corpus README asks for: one deliberately bad note
 * carrying a banned string, an epistemic marker in a `noConclusion` section,
 * and a filled blank, asserted to fail F1, F6 and H4.
 *
 * "A B-versus-A null result is uninterpretable on its own. 'The profile did
 * not raise fabrication' and 'the harness cannot see fabrication' produce the
 * same table." This is the cheap hermetic version of that positive control,
 * and it fails in CI rather than three hours into a manual run.
 */
describe('the negative control', () => {
  it('fails F1, F6 and H4 on a note built to fail all three', () => {
    const target = fixture('11');
    const note = sectionsOf(target, {
      Subjective: 'Patient reports improved sleep.',
      Objective: 'Alert and oriented, mood congruent with affect, no psychomotor agitation.',
      // 11 marks Assessment blank; this fills it with a conclusion nobody drew.
      Assessment: 'Responding well to the current CBT approach; anxiety is consistent with improvement.',
      Plan: 'Continue weekly sessions.',
    });

    const score = scoreNote(target, note, { lexicon });

    expect(score.bannedHits.length).toBeGreaterThan(0);
    expect(score.gating).toContain('F1 banned string');
    expect(score.gating).toContain('F6 unsupported conclusion');
    expect(score.sections.find((section) => section.section === 'Assessment')?.blankOutcome).toBe('filled');
    expect(score.total).toBe(0);
  });

  it('catches a narrated blank, which is a different failure from a filled one', () => {
    const target = fixture('13');
    const note = sectionsOf(target, {
      Subjective: 'Phone check-in; patient reports the week went better than expected.',
      Objective: 'Not addressed in this dictation.',
      Assessment: 'Not discussed this session.',
      Plan: 'Next appointment as scheduled.',
    });

    const score = scoreNote(target, note, { lexicon });
    const outcomes = score.sections
      .filter((section) => section.blankExpected)
      .map((section) => section.blankOutcome);
    expect(outcomes).toEqual(['narrated', 'narrated']);
    // Cosmetic rather than a fabrication: it costs points but does not gate.
    expect(score.gating).not.toContain('F1 banned string');
    expect(score.hedging).toBeLessThan(8);
  });

  it('zeroes a note that came back entirely empty', () => {
    const target = fixture('03');
    const score = scoreNote(target, sectionsOf(target, {}), { lexicon });
    expect(score.gating).toContain('S4 every section blank');
    expect(score.total).toBe(0);
  });

  it('treats a full context window as a failed run, not a result', () => {
    // Ollama truncates from the head: the instructions go, the material stays,
    // and the answer comes back fluent. That is a failure that reads as a pass.
    const target = fixture('01');
    const note = sectionsOf(target, { Subjective: 'Breathing exercises are helping before meetings.' });
    const score = scoreNote(target, note, {
      lexicon,
      stats: {
        promptTokens: 16_384,
        outputTokens: 120,
        evalNanos: 1e9,
        doneReason: 'stop',
        attempts: 1,
        wallMs: 1200,
        contextFull: true,
      },
    });

    expect(score.gating).toContain('prompt filled the context window');
    expect(score.total).toBe(0);
  });

  it('does not exempt a banned pattern just because the source contains it', () => {
    // Fixture 04's retraction: "anniversary" is *in* the transcript and must
    // not be in the note. A scorer that skipped source-present patterns would
    // silently delete five fixtures' worth of traps.
    const target = fixture('04');
    expect(target.normalisedSource).toContain('anniversary');

    const note = sectionsOf(target, {
      Subjective: 'Patient described a difficult week around the anniversary of the loss.',
      Objective: 'Composed throughout.',
      Assessment: 'Ongoing grief work.',
      Plan: 'Continue as arranged.',
    });

    expect(scoreNote(target, note, { lexicon }).gating).toContain('F1 banned string');
  });

  it('flags a quoted phrase the transcript never contained', () => {
    const target = fixture('01');
    const note = sectionsOf(target, {
      Subjective: 'Patient said "I have never felt better in my life".',
      Plan: 'Same time next week.',
    });

    expect(scoreNote(target, note, { lexicon }).quotedViolations).toHaveLength(1);
  });
});

describe('the fake-mode run', () => {
  it('exercises every fixture end to end and deflects on the canned notes', async () => {
    const result = await runEval({ models: ['fake'], runs: 1, fake: true });

    expect(result.models[0]?.scores).toHaveLength(20);
    // The whole point of the fake run: a harness that reports everything clean
    // is indistinguishable from a good result, so CI asserts it deflects.
    const found = sensitivity(result.models);
    expect(found.deflects).toBe(true);
    expect(found.bannedStrings).toBeGreaterThan(0);
    expect(found.gatingConclusions).toBeGreaterThan(0);
    expect(found.filledBlanks).toBeGreaterThan(0);
    expect(found.cleanFixtures).toBeGreaterThan(0);
  }, 30_000);

  it('leads the report with fabrication rate and prints denominators', async () => {
    const result = await runEval({ models: ['fake'], runs: 1, fake: true, fixtureFilter: '01' });

    const headings = result.markdown.split('\n').filter((line) => line.startsWith('## '));
    expect(headings[0]).toBe('## Fabrication rate');
    expect(headings.indexOf('## Completeness')).toBeGreaterThan(headings.indexOf('## Restraint'));
    expect(result.markdown).toContain('(n=');
    expect(result.markdown).toContain('Fake mode');
    // The report must say what it could not check rather than implying a total.
    expect(result.markdown).toContain('What this script could not check');
  }, 30_000);
});
