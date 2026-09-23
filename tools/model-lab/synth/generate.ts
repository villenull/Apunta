/**
 * A synthetic (dictation → note) corpus generator for the model lab.
 *
 * Nothing here is real: every client, fact and phrase is invented, and the
 * generator never reads a fixture, a database or an export. It exists so a
 * LoRA can be trained end to end — and so the real pipeline
 * (`../pipeline/build-pairs.ts`) has a shape to be built against — without a
 * single line of patient text anywhere near it.
 *
 * The design point: **the note is rendered from the same structured facts the
 * dictation is rendered from**, so every target is faithful by construction.
 * That is the honest analogue of "her Claude reply was her accepted note": the
 * target is what the record should say, and the input is the same facts said
 * out loud. The two renderings share facts but not wording, which is what
 * keeps the corpus from teaching the model to copy its source.
 *
 * The traps the eval corpus scores are represented deliberately, because those
 * are the behaviours a LoRA could plausibly put into the weights instead of
 * leaving them to a prompt sentence: a retraction, a restated figure with no
 * direction, a risk review, a topic she did not gather, a flagged aside, an
 * option raised and declined, empty sections, and the "None." convention.
 *
 * Two house rules the corpus obeys on purpose:
 *
 * - **No pronouns for the client.** Fact pools are written so every clause
 *   works after the client's name, whatever the name suggests; a corpus that
 *   assumed a gender would teach an error the eval's pronoun fixture exists to
 *   catch.
 * - **Discussion labels are grounded.** A two-topic Discussion is split under
 *   a one- or two-word heading whose words appear in the dictation, because
 *   the server keeps a subheading only when the source bears it out
 *   (`server/src/ai/clinical-knowledge/discussion-subheadings.ts`).
 */

/** Deterministic PRNG (mulberry32), so a seed reproduces a corpus exactly. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Pick = <T>(items: readonly T[]) => T;

function picker(random: () => number): Pick {
  return <T>(items: readonly T[]): T => {
    const item = items[Math.floor(random() * items.length)];
    if (item === undefined) throw new Error('empty pool');
    return item;
  };
}

export const OWNER_SECTIONS = [
  'Location',
  'Client presentation',
  'Risk review',
  'Discussion',
  'Intervention',
  'Out of session actions',
  'Note for next session',
] as const;

export const SOAP_SECTIONS = ['Subjective', 'Objective', 'Assessment', 'Plan'] as const;

export const INTAKE_SECTIONS = ['Presenting problem', 'History', 'Formulation', 'Plan'] as const;

export type FormatKind = 'owner' | 'soap' | 'intake';

export interface Fact {
  /** What she said, in her spoken voice. `{name}` is the client's first name. */
  readonly say: readonly string[];
  /** The same fact as the record states it. `{name}` is the client's first name. */
  readonly note: readonly string[];
}

/** A topic's clause: lowercase, verb-first, no full stop — it follows the name. */
interface Clause {
  readonly say: readonly string[];
  readonly note: readonly string[];
}

export interface TopicSeed {
  readonly label: string;
  readonly facts: readonly Clause[];
  readonly interventions: readonly Fact[];
  readonly actions: readonly Fact[];
  readonly next: readonly Fact[];
  /** The therapist's own clinical thinking, voiced. SOAP's Assessment only. */
  readonly assessments: readonly Fact[];
}

export interface Scenario {
  readonly format: FormatKind;
  readonly name: string;
  readonly source: 'dictated' | 'typed';
  /** Where the session happened, or null when she did not say. */
  readonly location: 'office' | 'online' | null;
  /** Her observation of how the client seemed, or null when she described none. */
  readonly presentation: Fact | null;
  /** The session's topics, in the order she covered them. 1 or 2. */
  readonly topics: readonly {
    readonly label: string | null;
    readonly facts: readonly Clause[];
    readonly assessment: Fact | null;
  }[];
  /** Risk material: a review she carried out, or null (silence). */
  readonly risk: Fact | null;
  /** Background she actually gathered, for an intake's History. */
  readonly history: Fact | null;
  readonly intervention: readonly Fact[] | null;
  readonly actions: readonly Fact[];
  readonly nextSession: readonly Fact[] | null;
  /** A cadence decision she stated: the arrangement, kept or changed. */
  readonly cadence: Fact | null;
  /** An aside she flagged herself; never in the note. */
  readonly aside: string | null;
  /** Something she raised and then declined; never in the note. */
  readonly declined: string | null;
  /** A retraction: the withdrawn statement and what replaced it. */
  readonly retraction: { readonly withdrawn: string; readonly kept: string } | null;
  /** An earlier figure restated with no direction: the trap fixture 03 scores. */
  readonly restated: {
    readonly topic: string;
    readonly now: string;
    readonly sayThen: string;
    readonly noteThen: string;
  } | null;
  /** A topic she says she did not gather; must never become a negative finding. */
  readonly notGathered: { readonly say: string; readonly topic: string } | null;
  /** A garbled medication she named, to be carried with its marker. */
  readonly unclearMedication: { readonly say: string; readonly note: string } | null;
  /** Explicit mental-status observations, only for the SOAP Objective section. */
  readonly mentalStatus: string | null;
}

const NAMES = [
  'Amara',
  'Ben',
  'Carmen',
  'Dev',
  'Elena',
  'Felix',
  'Grace',
  'Hana',
  'Ivan',
  'Jules',
  'Kira',
  'Liam',
  'Mira',
  'Noah',
  'Owen',
  'Pia',
  'Quinn',
  'Rosa',
  'Sam',
  'Tessa',
  'Uma',
  'Victor',
  'Wren',
  'Yara',
  'Zane',
  'Ana',
  'Cody',
  'Daphne',
  'Emmett',
  'Freya',
  'Gabe',
  'Hazel',
  'Iris',
  'Jonah',
  'Lena',
  'Marco',
  'Nadia',
  'Oscar',
  'Petra',
  'Ravi',
  'Sofia',
  'Theo',
  'Ursula',
  'Vera',
  'Will',
  'Ximena',
  'Yusuf',
  'Zara',
];

/** The clinical material. Every phrase is invented for this corpus. */
const TOPICS: readonly TopicSeed[] = [
  {
    label: 'Sleep',
    facts: [
      {
        say: [
          'sleep has been up and down, some nights {name} is lying there till one or two',
          '{name} is getting about six hours of sleep and waking in the middle of it',
        ],
        note: [
          'reports disrupted sleep, with some nights awake until one or two',
          'reports roughly six hours of sleep and waking during the night',
        ],
      },
      {
        say: [
          'the breathing thing before bed takes the edge off a bit',
          'the wind-down routine is helping a little, {name} thinks',
        ],
        note: [
          'said the breathing exercise before bed is helping somewhat',
          'reported the wind-down routine is helping a little',
        ],
      },
    ],
    interventions: [
      { say: ['I went through sleep hygiene again'], note: ['Psychoeducation on sleep hygiene.'] },
    ],
    actions: [
      {
        say: ['{name} is going to note down the times of going to sleep and waking'],
        note: ['{name}, log sleep and wake times each night.'],
      },
    ],
    next: [{ say: ['we will look at the sleep log next week'], note: ['Sleep log to review.'] }],
    assessments: [
      {
        say: ['I think the sleep work is going somewhere'],
        note: ['The therapist considered the sleep work to be useful so far.'],
      },
    ],
  },
  {
    label: 'Work',
    facts: [
      {
        say: [
          'most of the hour went on the job interview on Thursday and the work worry around it',
          'the work thing is still the main worry, {name} is second-guessing every email',
        ],
        note: [
          'most of the session focused on the job interview on Thursday and the catastrophizing about it',
          'reports ongoing worry about work, second-guessing decisions throughout the day',
        ],
      },
      {
        say: [
          'we did some cognitive restructuring on the worst-case thought',
          'we looked at the evidence for the thought that the job is gone',
        ],
        note: [
          'worked on the worst-case thought in the session',
          'examined the evidence for the prediction of being dismissed',
        ],
      },
    ],
    interventions: [
      {
        say: ['I introduced the two-column thought record'],
        note: ['Introduced a two-column thought record.'],
      },
    ],
    actions: [
      {
        say: [
          '{name} will write the worst-case thought down each time it comes up',
          '{name} is going to try the two-column record before the interview',
        ],
        note: [
          '{name}, write the worst-case thought down each time it comes up.',
          '{name}, try the two-column record before the interview.',
        ],
      },
    ],
    next: [
      {
        say: ['we will pick up the interview aftermath next time'],
        note: ['Interview aftermath to review.'],
      },
    ],
    assessments: [
      {
        say: ['I think the work worry needs more attention'],
        note: ['The therapist considered the work worry to need more attention.'],
      },
    ],
  },
  {
    label: 'Intrusive thoughts',
    facts: [
      {
        say: [
          'the intrusive thoughts are down to two or three a day from most of the day',
          'the intrusive thoughts are still turning up but they pass quicker now',
        ],
        note: [
          'reports intrusive thoughts reduced to two or three a day, from most of the day',
          'reports the intrusive thoughts still occur but pass more quickly',
        ],
      },
      {
        say: [
          'we reviewed the thought record and named the pattern',
          'I reflected back the pattern in the record, the checking one',
        ],
        note: [
          'reviewed the thought record brought to the session and named the pattern',
          'reflected the checking pattern back from the thought record',
        ],
      },
    ],
    interventions: [
      {
        say: ['I did some psychoeducation on the anxiety cycle'],
        note: ['Psychoeducation on the anxiety cycle.'],
      },
    ],
    actions: [
      {
        say: ['{name} keeps the record going and brings it next week'],
        note: ['{name}, continue the thought record and bring it next session.'],
      },
    ],
    next: [{ say: ['we will keep working on the record'], note: ['Thought record continues.'] }],
    assessments: [
      {
        say: ['I think the intrusive thoughts are manageable now'],
        note: ['The therapist considered the intrusive thoughts to be manageable now.'],
      },
    ],
  },
  {
    label: 'Panic',
    facts: [
      {
        say: [
          'there was a panic attack on the train on Tuesday, out of nowhere',
          'the panic came on the train again and {name} had to get off a stop early',
        ],
        note: [
          'describes a panic attack on the train on Tuesday, which came on without warning',
          'reports a further panic attack on the train and got off a stop early',
        ],
      },
      {
        say: [
          'the grounding steps got it down in about ten minutes',
          'the grounding took about ten minutes to settle',
        ],
        note: [
          'used the grounding steps and it settled in about ten minutes',
          'reports the grounding steps settled it within about ten minutes',
        ],
      },
    ],
    interventions: [
      {
        say: ['we did a thought record on the train episode'],
        note: ['Thought record on the train episode.'],
      },
    ],
    actions: [
      {
        say: ['{name} keeps the grounding notes on the phone'],
        note: ['{name}, keep the grounding notes on the phone.'],
      },
    ],
    next: [{ say: ['we will pick up the wedding worry next time'], note: ['Wedding worry to pick up.'] }],
    assessments: [
      {
        say: ['I think the panic work is worth continuing'],
        note: ['The therapist considered the panic work worth continuing.'],
      },
    ],
  },
  {
    label: 'Drinking',
    facts: [
      {
        say: [
          'the drinking is on {name} mind, six a week at the moment',
          'we spent most of it on the drinking, {name} is not happy with the amount',
        ],
        note: [
          'raised concern about drinking, around six standard drinks a week at present',
          'spoke about alcohol use, which was not sitting well',
        ],
      },
      {
        say: [
          'we did pros and cons on the Friday work drinks',
          'we listed the good and the bad of the after-work drinks',
        ],
        note: [
          'weighed the pros and cons of the Friday work drinks',
          'explored the advantages and disadvantages of the Friday work drinks',
        ],
      },
    ],
    interventions: [
      { say: ['I used motivational interviewing, no pushing'], note: ['Motivational interviewing.'] },
    ],
    actions: [
      {
        say: ['{name} will skip the Friday drinks for a month'],
        note: ['{name}, skip the Friday work drinks for a month.'],
      },
    ],
    next: [{ say: ['we will see how the month goes'], note: ['Month without the Friday drinks to review.'] }],
    assessments: [
      {
        say: ['I think the drinking needs more work'],
        note: ['The therapist considered the drinking to need more work.'],
      },
    ],
  },
  {
    label: 'Anniversary',
    facts: [
      {
        say: [
          'the anniversary is coming up and that has been sitting there all week',
          'it was the anniversary of the death of the mother and {name} found it heavy',
        ],
        note: [
          'reports the approaching anniversary has been present all week',
          'described the anniversary of the death of the mother as a heavy week',
        ],
      },
      {
        say: [
          'there was one missed day of work and {name} is annoyed about that',
          'work slipped a bit, one day off, and {name} was cross about it',
        ],
        note: [
          'reports one missed day of work and frustration about it',
          'reports a day of work missed, which was a source of annoyance',
        ],
      },
    ],
    interventions: [{ say: ['we did some containment imagery'], note: ['Containment imagery.'] }],
    actions: [
      {
        say: ['{name} is going back to the bereavement group on Tuesday'],
        note: ['{name}, attend the bereavement group on Tuesday.'],
      },
    ],
    next: [{ say: ['we will check in on how the anniversary went'], note: ['Anniversary to check in on.'] }],
    assessments: [
      {
        say: ['I think the grief work is where it needs to be'],
        note: ['The therapist considered the grief work to be on track.'],
      },
    ],
  },
  {
    label: 'Scan',
    facts: [
      {
        say: [
          'the scan is still hanging over {name}, waiting on the results',
          'the scan result came back clear and {name} could not believe it at first',
        ],
        note: [
          'reports the scan result is still pending and it is preoccupying',
          'reports the MRI result came back clear, which was hard to take in at first',
        ],
      },
      {
        say: [
          'we went over the checking behavior, looking things up most nights',
          'the researching symptoms at night came up again',
        ],
        note: [
          'reviewed the checking behavior, which happens most nights',
          'discussed late-night symptom searching',
        ],
      },
    ],
    interventions: [
      {
        say: ['I did psychoeducation on how reassurance keeps the cycle going'],
        note: ['Psychoeducation on the reassurance cycle.'],
      },
    ],
    actions: [
      {
        say: ['{name} will leave the phone outside the bedroom'],
        note: ['{name}, leave the phone outside the bedroom.'],
      },
    ],
    next: [{ say: ['we will look at the checking again next time'], note: ['Checking behavior to review.'] }],
    assessments: [
      {
        say: ['I think the scan worry is the main thing to work on'],
        note: ['The therapist considered the scan worry to be the main focus.'],
      },
    ],
  },
  {
    label: 'Partner',
    facts: [
      {
        say: [
          'the argument with the partner is still going round, and {name} feels blamed',
          'things at home are tense, {name} and the partner barely spoke this week',
        ],
        note: [
          'reports the argument with the partner remains unresolved and feels blamed',
          'describes tension at home, with little conversation between them this week',
        ],
      },
      {
        say: [
          'we looked at what {name} can actually control in the conversation',
          'we separated out what is {name} to carry and what is not',
        ],
        note: [
          'explored what is within control in the conversation',
          'separated what is to be carried from what is not',
        ],
      },
    ],
    interventions: [
      {
        say: ['I introduced assertive communication, the three-part request'],
        note: ['Introduced assertive communication, the three-part request.'],
      },
    ],
    actions: [
      {
        say: ['{name} will try the three-part request once this week'],
        note: ['{name}, make the three-part request once this week.'],
      },
    ],
    next: [
      { say: ['we will debrief how the three-part request went'], note: ['Three-part request to debrief.'] },
    ],
    assessments: [
      {
        say: ['I think the partner work is the priority'],
        note: ['The therapist considered the partner work to be the priority.'],
      },
    ],
  },
  {
    label: 'Exposure',
    facts: [
      {
        say: [
          'the exposure homework was manageable, {name} got to the shop twice',
          'the exposure went better than expected, out twice',
        ],
        note: [
          'reports the exposure homework was manageable and went out twice',
          'completed the exposure twice, which went better than expected',
        ],
      },
      {
        say: [
          'we built the next step of the hierarchy, the busy supermarket',
          'we added the next rung, a busier shop',
        ],
        note: [
          'built the next step of the exposure hierarchy, a busier supermarket',
          'added the next rung of the hierarchy, a busier shop',
        ],
      },
    ],
    interventions: [
      { say: ['I mapped the hierarchy on the whiteboard'], note: ['Mapped the exposure hierarchy.'] },
    ],
    actions: [
      {
        say: ['{name} will try the busy shop on Saturday'],
        note: ['{name}, attempt the busy supermarket on Saturday.'],
      },
    ],
    next: [{ say: ['we will review the Saturday trip'], note: ['Saturday supermarket trip to review.'] }],
    assessments: [
      {
        say: ['I think the exposure is worth continuing'],
        note: ['The therapist considered the exposure work worth continuing.'],
      },
    ],
  },
  {
    label: 'Mood',
    facts: [
      {
        say: [
          'the mood is flat, but not more flat than last time, same as last time really',
          'low mood most days, about the same as it has been',
        ],
        note: [
          'reports low mood most days, unchanged from the previous session',
          'describes mood as flat and no different from last session',
        ],
      },
      {
        say: ['we planned two small activities for the week', 'we scheduled the walks again'],
        note: ['planned two small activities for the week', 'scheduled the morning walks'],
      },
    ],
    interventions: [{ say: ['I used behavioral activation'], note: ['Behavioral activation.'] }],
    actions: [
      {
        say: ['{name} will walk on the two mornings before work'],
        note: ['{name}, walk on two mornings before work.'],
      },
    ],
    next: [{ say: ['we will see whether the walking changed anything'], note: ['Morning walks to review.'] }],
    assessments: [
      {
        say: ['I think the mood is what we keep working on'],
        note: ['The therapist considered the mood work to be the ongoing focus.'],
      },
    ],
  },
];

const PRESENTATIONS: readonly Fact[] = [
  {
    say: [
      '{name} arrived early and seemed more settled than last time',
      '{name} was more settled today, good eye contact, answered without me prompting',
    ],
    note: [
      'Presented as more settled than last session, with good eye contact and answered without prompting.',
      'Presented as more settled, with good eye contact, and answered without prompting.',
    ],
  },
  {
    say: [
      '{name} came in flat and tearful at the start',
      '{name} presented flat, tearful in the first ten minutes',
    ],
    note: [
      'Presented as flat and tearful at the start of the session.',
      'Presented as flat, tearful in the first ten minutes.',
    ],
  },
  {
    say: [
      '{name} was engaged and did most of the talking',
      '{name} seemed engaged, brought the record in without being asked',
    ],
    note: [
      'Presented as engaged and did most of the talking.',
      'Presented as engaged and brought the record unprompted.',
    ],
  },
  {
    say: [
      '{name} was restless, could not settle in the chair',
      '{name} was agitated at the start, up and down out of the chair',
    ],
    note: [
      'Presented as restless and did not settle in the chair.',
      'Presented as agitated at the start, up and down out of the chair.',
    ],
  },
];

const RISK_REVIEWS: readonly Fact[] = [
  {
    say: [
      'I asked about risk. {name} denied any thoughts of self-harm or suicide, and no history of attempts',
      'asked about risk, {name} denied any thoughts of self-harm or suicide, and nothing in the history either',
    ],
    note: [
      'Inquired about risk: denied current thoughts of self-harm or suicide, and no history of attempts.',
      'Inquired about risk: denied thoughts of self-harm or suicide and reported no history of attempts.',
    ],
  },
  {
    say: [
      'we reviewed safety. the passive thoughts are still there but no plan and no intent',
      'asked about risk, the passive thoughts come and go, no plan, no intent',
    ],
    note: [
      'Reviewed safety: reported the passive thoughts are still present, with no plan and no intent.',
      'Reviewed risk: the passive thoughts continue, with no plan and no intent reported.',
    ],
  },
  {
    say: ['I checked in about safety, nothing came up', 'asked about risk at the end, nothing to report'],
    note: ['Inquired about risk; nothing was raised.', 'Inquired about risk and nothing was raised.'],
  },
  {
    say: [
      'asked about risk. there is a history of one attempt about ten years ago, and today no current thoughts',
      'on risk, one attempt about ten years back, and no current thoughts now',
    ],
    note: [
      'Reviewed risk: a history of one attempt approximately ten years ago, and denied any current thoughts.',
      'Reviewed risk: a history of one attempt some years ago and denied current thoughts.',
    ],
  },
];

const HISTORY: readonly Fact[] = [
  {
    say: ['tried counselling once through work, a few sessions, and it fizzled out'],
    note: ['Attended a few counselling sessions through work previously, which ended.'],
  },
  {
    say: ['saw someone in the twenties for a while, no medication then'],
    note: ['Saw a therapist in the twenties for a period, with no medication at that time.'],
  },
  {
    say: ['no previous therapy before this, this is the first time'],
    note: ['No previous therapy; this is the first episode of care.'],
  },
];

const INTERVENTIONS: readonly Fact[] = [
  { say: ['I did some grounding work'], note: ['Grounding work.'] },
  { say: ['I reflected the ambivalence back'], note: ['Reflection of ambivalence.'] },
  { say: ['I taught the box breathing'], note: ['Taught box breathing.'] },
  { say: ['we did a values clarification exercise'], note: ['Values clarification.'] },
];

const CADENCES: readonly Fact[] = [
  {
    say: ['we agreed to move to every two weeks from October'],
    note: ['Sessions move to every two weeks from October.'],
  },
  { say: ['we agreed to keep meeting weekly for now'], note: ['Continues weekly for now.'] },
  { say: ['same time next week'], note: ['Continues weekly, same time.'] },
  {
    say: ['we agreed to fortnightly from next month'],
    note: ['Sessions move to fortnightly from next month.'],
  },
];

const ASIDES: readonly string[] = [
  'she asked how my holiday was, we chatted about that for a minute, not clinically relevant',
  'there was a bit about the parking, just noting it, not clinically relevant',
  'we started with the weather, nothing clinical in that',
  'she mentioned the coffee place downstairs, not clinically relevant',
];

const DECLINED: readonly string[] = [
  'we talked about moving her sessions to mornings, actually no, scratch that, she would rather keep her usual time',
  'I offered a group referral, she thought about it and said no for now',
  'we discussed bringing the partner in, she decided against it',
  'I suggested a workbook, she was not keen, so we left it',
];

const NOT_GATHERED: readonly { readonly say: string; readonly topic: string }[] = [
  { say: 'I did not get into family history today', topic: 'family history' },
  { say: 'I did not cover the medical background this time', topic: 'the medical background' },
  { say: 'I have not taken a substance use history yet', topic: 'substance use' },
  { say: 'I did not ask about trauma history today', topic: 'trauma history' },
  { say: 'I did not gather a family psychiatric history this time', topic: 'family psychiatric history' },
];

const UNCLEAR_MEDICATIONS: readonly { readonly say: string; readonly note: string }[] = [
  { say: 'still on the quetiapine, I think that is the one', note: 'quetiapine [unclear in dictation]' },
  { say: 'the sertraline, or citalopram, one of those', note: 'sertraline [unclear in dictation]' },
  { say: 'some kind of beta blocker, propranolol maybe', note: 'propranolol [unclear in dictation]' },
];

const RESTATED: readonly NonNullable<Scenario['restated']>[] = [
  {
    topic: 'drinking',
    now: 'six drinks a week at the moment',
    sayThen: 'four was back in February',
    noteThen: 'four in February',
  },
  {
    topic: 'sleep',
    now: 'about three hours of sleep some nights',
    sayThen: 'five hours was back in March',
    noteThen: 'five hours in March',
  },
  {
    topic: 'panic',
    now: 'two panic attacks this month',
    sayThen: 'one was back in April',
    noteThen: 'one in April',
  },
];

const MENTAL_STATUS: readonly string[] = [
  'alert and oriented, speech normal in rate and volume',
  'engaged throughout, affect reactive',
  'settled on arrival, no psychomotor agitation observed',
];

const OPENERS = [
  '',
  'Rough notes, sorry. ',
  'Dictating this on the way out. ',
  'Quick one today. ',
  'Notes from today. ',
];

export function generateScenario(random: () => number): Scenario {
  const p = picker(random);
  const name = p(NAMES);
  const format: FormatKind = random() < 0.6 ? 'owner' : random() < 0.75 ? 'soap' : 'intake';

  const topicCount = random() < 0.35 ? 2 : 1;
  const chosen: TopicSeed[] = [];
  while (chosen.length < topicCount) {
    const candidate = p(TOPICS);
    if (!chosen.includes(candidate)) chosen.push(candidate);
  }

  const topics = chosen.map((topic) => {
    // The first clause always goes in: it is the one that names the topic, so
    // a two-topic Discussion's subheading is grounded in the source (the
    // server drops a heading whose words the source does not carry).
    const facts: Clause[] = [topic.facts[0] ?? p(topic.facts)];
    if (random() < 0.5) {
      const second = p(topic.facts);
      if (!facts.includes(second)) facts.push(second);
    }
    return {
      label: topicCount > 1 ? topic.label : null,
      facts,
      assessment: format === 'soap' && random() < 0.6 ? p(topic.assessments) : null,
    };
  });

  const declinedRoll = random();
  const declined = declinedRoll < 0.22 ? p(DECLINED) : null;
  const retraction =
    declined !== null && declined.includes('scratch that')
      ? { withdrawn: 'moving her sessions to mornings', kept: 'keeps her usual time' }
      : null;

  const restated = random() < 0.15 ? p(RESTATED) : null;

  return {
    format,
    name,
    source: random() < 0.75 ? 'dictated' : 'typed',
    location: random() < 0.4 ? null : random() < 0.6 ? 'office' : 'online',
    presentation: random() < 0.7 ? p(PRESENTATIONS) : null,
    topics,
    risk: random() < 0.55 ? p(RISK_REVIEWS) : null,
    history: format === 'intake' && random() < 0.7 ? p(HISTORY) : null,
    intervention:
      random() < 0.75 ? [p(INTERVENTIONS), ...chosen.map((topic) => p(topic.interventions))] : null,
    actions: chosen.slice(0, random() < 0.5 ? 1 : chosen.length).map((topic) => p(topic.actions)),
    nextSession: random() < 0.8 ? chosen.map((topic) => p(topic.next)) : null,
    cadence: random() < 0.5 ? p(CADENCES) : null,
    aside: random() < 0.3 ? p(ASIDES) : null,
    declined,
    retraction,
    restated,
    notGathered: random() < 0.12 ? p(NOT_GATHERED) : null,
    unclearMedication: format === 'intake' ? null : random() < 0.15 ? p(UNCLEAR_MEDICATIONS) : null,
    mentalStatus: format === 'soap' && random() < 0.5 ? p(MENTAL_STATUS) : null,
  };
}

/** The scenario as the therapist said it. Traps are in, in spoken form. */
export function renderDictation(scenario: Scenario, random: () => number): string {
  return renderPair(scenario, random).dictation;
}

/** The note the record should carry: the same facts, none of the traps. */
export function renderNote(scenario: Scenario, random: () => number): Record<string, string> {
  return renderPair(scenario, random).note;
}

export interface RenderedPair {
  readonly dictation: string;
  readonly note: Record<string, string>;
}

/**
 * Both sides of a pair in one pass, so a fact's wording is chosen **once**:
 * `say[i]` and `note[i]` are the same fact spoken and recorded, and a figure in
 * the note is always a figure the dictation gave. Choosing them independently
 * is how a corpus teaches a model to invent a number.
 */
export function renderPair(scenario: Scenario, random: () => number): RenderedPair {
  const p = picker(random);
  const name = scenario.name;
  const sayParts: string[] = [];
  const note: Record<string, string> = {};

  const say = (fact: Fact): { say: string; note: string } => {
    const index = Math.floor(random() * fact.say.length);
    return {
      say: (fact.say[index] ?? '').replaceAll('{name}', name),
      note: (fact.note[index] ?? '').replaceAll('{name}', name),
    };
  };

  const sections =
    scenario.format === 'owner'
      ? OWNER_SECTIONS
      : scenario.format === 'soap'
        ? SOAP_SECTIONS
        : INTAKE_SECTIONS;
  for (const section of sections) note[section] = '';

  sayParts.push(`${name}, ${scenario.location === 'online' ? 'online' : 'in the office'} today.`);

  const presentation = scenario.presentation === null ? null : say(scenario.presentation);
  if (presentation !== null) sayParts.push(presentation.say);
  if (scenario.aside !== null) sayParts.push(scenario.aside);

  const topics = scenario.topics.map((topic) => {
    const facts = topic.facts.map((clause) => say(clause));
    sayParts.push(facts.map((fact) => fact.say).join(', and '));
    return { label: topic.label, prose: facts.map((fact) => `${name} ${fact.note}.`).join(' ') };
  });

  const history = scenario.history === null ? null : say(scenario.history);
  if (history !== null) sayParts.push(history.say);

  if (scenario.restated !== null) {
    sayParts.push(
      `on the ${scenario.restated.topic}, ${scenario.restated.now}, and ${scenario.restated.sayThen}`,
    );
  }

  if (scenario.retraction !== null) {
    sayParts.push(
      `we talked about ${scenario.retraction.withdrawn}, actually no, scratch that, ${name} ${scenario.retraction.kept}`,
    );
  } else if (scenario.declined !== null) {
    sayParts.push(scenario.declined);
  }

  if (scenario.notGathered !== null) sayParts.push(scenario.notGathered.say);
  const risk = scenario.risk === null ? null : say(scenario.risk);
  if (risk !== null) sayParts.push(risk.say);
  if (scenario.mentalStatus !== null) sayParts.push(scenario.mentalStatus);
  const medication = scenario.unclearMedication === null ? null : scenario.unclearMedication;
  if (medication !== null) sayParts.push(`meds: ${medication.say}`);

  const intervention = scenario.intervention === null ? null : scenario.intervention.map((fact) => say(fact));
  if (intervention !== null) sayParts.push(intervention.map((fact) => fact.say).join(', and '));

  const actions = scenario.actions.map((fact) => say(fact));
  for (const action of actions) sayParts.push(action.say);

  const cadence = scenario.cadence === null ? null : say(scenario.cadence);
  if (cadence !== null) sayParts.push(cadence.say);

  const next = scenario.nextSession === null ? null : scenario.nextSession.map((fact) => say(fact));
  if (next !== null) sayParts.push(next.map((fact) => fact.say).join(', and '));

  const assessment = scenario.topics
    .map((topic) => (topic.assessment === null ? null : say(topic.assessment).note))
    .filter((line) => line !== null);

  const forward: string[] = [];
  if (next !== null) forward.push(next.map((fact) => fact.note).join(' '));
  if (cadence !== null) forward.push(cadence.note);

  const dictation = `${scenario.source === 'dictated' ? p(OPENERS) : ''}${sayParts.join(' ')}`
    .replace(/\s+/g, ' ')
    .trim();

  if (scenario.format === 'owner') {
    note.Location = scenario.location === null ? '' : scenario.location === 'online' ? 'Online.' : 'Office.';
    note['Client presentation'] = presentation?.note ?? '';
    note['Risk review'] = risk?.note ?? 'None.';
    const discussion = topics.map((topic) =>
      topic.label === null ? topic.prose : `${topic.label}:\n${topic.prose}`,
    );
    if (scenario.restated !== null) {
      discussion.push(
        `${name} gave ${scenario.restated.now} and ${scenario.restated.noteThen}, with no direction between them.`,
      );
    }
    if (scenario.notGathered !== null) {
      discussion.push(`I did not gather ${scenario.notGathered.topic} this session.`);
    }
    if (medication !== null) discussion.push(`Medication as given: ${medication.note}.`);
    note.Discussion = discussion.join('\n\n');
    note.Intervention = intervention === null ? '' : intervention.map((fact) => fact.note).join(' ');
    note['Out of session actions'] =
      actions.length === 0 ? 'None.' : actions.map((fact) => fact.note).join(' ');
    note['Note for next session'] = forward.join(' ');
    return { dictation, note };
  }

  if (scenario.format === 'soap') {
    const subjective = topics.map((topic) => topic.prose);
    if (history !== null) subjective.push(history.note);
    if (risk !== null) subjective.push(risk.note);
    if (scenario.notGathered !== null) {
      subjective.push(`I did not gather ${scenario.notGathered.topic} this session.`);
    }
    if (medication !== null) subjective.push(`Medication as given: ${medication.note}.`);
    note.Subjective = subjective.join(' ');

    const objective: string[] = [];
    if (presentation !== null) objective.push(presentation.note);
    if (scenario.mentalStatus !== null) objective.push(`${scenario.mentalStatus}.`);
    note.Objective = objective.join(' ');
    note.Assessment = assessment.join(' ');

    const plan: string[] = [];
    if (intervention !== null) plan.push(intervention.map((fact) => fact.note).join(' '));
    if (actions.length > 0) plan.push(actions.map((fact) => fact.note).join(' '));
    if (forward.length > 0) plan.push(forward.join(' '));
    note.Plan = plan.join(' ');
    return { dictation, note };
  }

  note['Presenting problem'] = topics.map((topic) => topic.prose).join(' ');
  const historyLines: string[] = [];
  if (history !== null) historyLines.push(history.note);
  if (scenario.notGathered !== null) {
    historyLines.push(`I did not gather ${scenario.notGathered.topic} at this appointment.`);
  }
  note.History = historyLines.join(' ');
  note.Formulation = '';
  const plan: string[] = [];
  if (actions.length > 0) plan.push(actions.map((fact) => fact.note).join(' '));
  if (forward.length > 0) plan.push(forward.join(' '));
  note.Plan = plan.join(' ');
  return { dictation, note };
}

/**
 * Every fact pool's `say` and `note` lists must be the same length: the
 * renderer picks one index and uses both sides, which is what keeps a figure
 * in the note a figure the dictation gave. A pool that drifts is a corpus that
 * teaches invention, so this is checked rather than trusted.
 */
export function auditFactPools(): string[] {
  const problems: string[] = [];
  const pools: { readonly name: string; readonly facts: readonly Fact[] }[] = [
    ...TOPICS.map((topic) => ({ name: `topic ${topic.label}`, facts: topic.facts })),
    ...TOPICS.map((topic) => ({ name: `topic ${topic.label} interventions`, facts: topic.interventions })),
    ...TOPICS.map((topic) => ({ name: `topic ${topic.label} actions`, facts: topic.actions })),
    ...TOPICS.map((topic) => ({ name: `topic ${topic.label} next`, facts: topic.next })),
    ...TOPICS.map((topic) => ({ name: `topic ${topic.label} assessments`, facts: topic.assessments })),
    { name: 'presentations', facts: PRESENTATIONS },
    { name: 'risk reviews', facts: RISK_REVIEWS },
    { name: 'history', facts: HISTORY },
    { name: 'interventions', facts: INTERVENTIONS },
    { name: 'cadences', facts: CADENCES },
  ];
  for (const pool of pools) {
    pool.facts.forEach((fact, index) => {
      if (fact.say.length !== fact.note.length) {
        problems.push(
          `${pool.name}[${String(index)}]: ${String(fact.say.length)} say vs ${String(fact.note.length)} note`,
        );
      }
    });
  }
  return problems;
}

export function generateCorpus(
  count: number,
  seed: number,
): { readonly scenarios: readonly Scenario[]; readonly randoms: readonly (() => number)[] } {
  const random = rng(seed);
  const scenarios: Scenario[] = [];
  const randoms: (() => number)[] = [];
  for (let index = 0; index < count; index += 1) {
    scenarios.push(generateScenario(random));
    randoms.push(rng(seed * 7919 + index));
  }
  return { scenarios, randoms };
}
