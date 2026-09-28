// The synthetic account, described once, by hand.
//
// This file is the *specification* of the fake Claude account every test in this
// directory walks. It is not generated from any source code: `fixtures/account.mjs`
// renders it into API responses, and `fixtures/expected.mjs` reads the same file
// through a different code path to state what a correct capture must contain.
// When the two disagree, one of them is wrong and the test says which.
//
// Every person here is invented. English names are the prototype's sample
// people (John Smith, Jane Doe, Jane Roe, Alex Roe, Dana Doe, Richard Roe);
// Spanish names are the registry in `e2e/fixtures/eval-es/NAMES.md`
// (Marisol Urzúa Salgado, Fermín Zamudio Zúñiga), and relatives are referred to
// by relationship only, as that registry requires. No sentence here is a real
// record, redacted or otherwise.

/** A message under construction. `at` may be null or an unparseable string on purpose. */
function message(id, sender, at, text, extra = {}) {
  return {
    id,
    sender,
    at,
    text,
    editedAt: extra.editedAt ?? null,
    parent: extra.parent ?? null,
    contentBlocks: extra.contentBlocks ?? (text === '' ? [] : [{ type: 'text', text }]),
    attachments: extra.attachments ?? [],
    artifacts: extra.artifacts ?? [],
    omitTextField: extra.omitTextField ?? false,
  };
}

const ATTACHMENT = (fileName, fileType, fileSize) => ({ fileName, fileType, fileSize });

const ARTIFACT = (id, versionId, title, artifactType, text) => ({ id, versionId, title, artifactType, text });

/** `day` + `hour` + `minutes` past the hour, as an ISO instant. */
function at(day, hour, minutes = 0) {
  return `${day}T${String(hour).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00Z`;
}

/** One sitting: her account, a note-shaped reply, and a further remark or two. */
function clinicalSession({ day, hour, idPrefix, opening, remark, reply }) {
  return [
    message(`${idPrefix}-h1`, 'human', at(day, hour, 0), opening),
    message(`${idPrefix}-a1`, 'assistant', at(day, hour, 5), reply),
    message(`${idPrefix}-h2`, 'human', at(day, hour, 25), remark),
  ];
}

export const ORGANIZATION_ID = 'org-synthetic-0001';
export const ACCOUNT_UUID = 'acct-synthetic-0001';
export const ARTIFACT_ORGINS = ['compliance-api'];

export const CONVERSATIONS = [
  {
    id: 'c-john-a',
    name: 'John Smith weekly notes',
    createdAt: '2024-11-04T15:20:00Z',
    updatedAt: '2026-07-01T00:02:00Z',
    labels: {
      kind: 'patient',
      patient: 'John Smith',
      language: 'en',
      case: 'multi-year-history-with-abandoned-branch',
    },
    messages: [
      ...clinicalSession({
        day: '2024-11-04',
        hour: 15,
        idPrefix: 'c-john-a-s1',
        opening:
          'Session with John Smith. He reports sleeping five hours a night and says the intrusive thoughts are worst before he gets out of bed.',
        remark: 'He has not used the grounding sheet we practised in October.',
        reply:
          'Subjective: Sleep five hours a night; intrusive thoughts worst on waking.\n\nAssessment: Sleep restriction is maintaining the intrusive cycle.\n\nPlan: Grounding sheet before rising; review next session.',
      }),
      ...clinicalSession({
        day: '2025-05-13',
        hour: 17,
        idPrefix: 'c-john-a-s2',
        opening:
          'John Smith again. Three months of the sheet and the intrusions are down to most days instead of daily. He wants to stop coming weekly.',
        remark: 'His sleep is now six hours and he describes it as uneventful.',
        reply:
          'Subjective: Intrusive thoughts most days rather than daily; sleep six hours.\n\nRisk: No current risk indicators reported.\n\nPlan: Move to fortnightly; review in six weeks.',
      }),
      // The third sitting, with a fork in it. She edited her first message of
      // the evening, so the original and the reply it produced are the branch
      // she abandoned, and the edit plus its reply are the thread she ended on.
      message(
        'c-john-a-s3-h1',
        'human',
        at('2026-06-30', 22, 5),
        'John Smith tonight. Back to six hours sleep but the intrusive thoughts have been every day again for a fortnight.',
      ),
      message(
        'c-john-a-s3-a1',
        'assistant',
        at('2026-06-30', 22, 45),
        'Subjective: Sleep six hours; intrusive thoughts daily.\n\nPlan: Return to weekly.',
        {
          parent: 'c-john-a-s3-h1',
          attachments: [ATTACHMENT('sleep-log-june.pdf', 'application/pdf', 48213)],
          artifacts: [
            ARTIFACT(
              'art-john-note',
              'art-john-note-v1',
              'Progress note — John Smith',
              'text/markdown',
              '# Progress note\n\nSleep six hours, intrusive thoughts daily for a fortnight.',
            ),
          ],
        },
      ),
      message(
        'c-john-a-s3-h2',
        'human',
        at('2026-06-30', 23, 10),
        'John Smith tonight, editing what I wrote: back to six hours sleep, the intrusive thoughts have been every day again for a fortnight, he has started skipping breakfast, and his sister moved out in May, which he links to the change.',
      ),
      message(
        'c-john-a-s3-a2',
        'assistant',
        at('2026-07-01', 0, 0),
        'Subjective: Sleep six hours; intrusive thoughts daily for a fortnight; skipping breakfast; sister moved out in May.\n\nRisk: No risk indicators reported tonight.\n\nPlan: Return to weekly, breakfast as a target.',
        {
          parent: 'c-john-a-s3-h2',
          editedAt: '2026-07-01T00:02:00Z',
          attachments: [ATTACHMENT('sleep-log-june.pdf', 'application/pdf', 48213)],
          contentBlocks: [
            {
              type: 'text',
              text: 'Subjective: Sleep six hours; intrusive thoughts daily for a fortnight; skipping breakfast; sister moved out in May.',
            },
            {
              type: 'tool_use',
              name: 'web_search',
              input: { query: 'intrusive thoughts sleep deprivation' },
            },
            { type: 'tool_result', content: 'three results' },
            {
              type: 'text',
              text: '\nRisk: No risk indicators reported tonight.\n\nPlan: Return to weekly, breakfast as a target.',
            },
          ],
          artifacts: [
            ARTIFACT(
              'art-john-note',
              'art-john-note-v2',
              'Progress note — John Smith',
              'text/markdown',
              '# Progress note\n\nRevised: sleep six hours, intrusive thoughts daily for a fortnight, breakfast as a target.',
            ),
          ],
        },
      ),
    ],
  },
  {
    id: 'c-john-b',
    name: 'John Smith referral letter',
    createdAt: '2026-07-15T14:00:00Z',
    updatedAt: '2026-08-02T19:20:00Z',
    labels: {
      kind: 'patient',
      patient: 'John Smith',
      language: 'en',
      case: 'second-conversation-same-patient',
    },
    messages: [
      message(
        'c-john-b-h1',
        'human',
        at('2026-07-15', 14, 0),
        'Separate chat about John Smith — what do I write as his presenting concern for the referral letter?',
      ),
      message(
        'c-john-b-a1',
        'assistant',
        at('2026-07-15', 14, 2),
        'Presenting concern: recurrent intrusive thoughts with sleep disturbance, seen six-weekly.\n\nPlan: Referral letter wording to follow.',
      ),
      message(
        'c-john-b-h2',
        'human',
        at('2026-08-02', 19, 15),
        'John Smith again, and I need the whole sentence for the letter.',
      ),
      message(
        'c-john-b-a2',
        'assistant',
        at('2026-08-02', 19, 20),
        'Presenting concern: recurrent intrusive thoughts, most nights before rising, with sleep reduced to six hours; no risk indicators reported; seen six-weekly.\n\nPlan: Letter sent Monday.',
      ),
    ],
  },
  {
    id: 'c-jane-doe',
    name: 'Jane Doe sessions',
    createdAt: '2026-07-02T10:00:00Z',
    updatedAt: '2026-08-11T11:30:00Z',
    labels: {
      kind: 'patient',
      patient: 'Jane Doe',
      language: 'en',
      case: 'same-first-name-other-patient-mentioned',
    },
    messages: [
      message(
        'c-jane-doe-h1',
        'human',
        at('2026-07-02', 10, 0),
        'Jane Doe, first of our new weekly sessions. Low mood since the spring, sleeping badly, and her sister has been unwell.',
      ),
      message(
        'c-jane-doe-a1',
        'assistant',
        at('2026-07-02', 10, 5),
        'Subjective: Low mood since spring, disturbed sleep, sister unwell.\n\nAssessment: Adjustment and family stress.\n\nPlan: Weekly; monitor sleep and appetite.',
      ),
      message(
        'c-jane-doe-h2',
        'human',
        at('2026-08-11', 11, 25),
        'Jane Doe today. Mood a little better, still waking at three. She asked whether I have seen Jane Roe — I have not, a different practice.',
      ),
      message(
        'c-jane-doe-a2',
        'assistant',
        at('2026-08-11', 11, 30),
        'Subjective: Mood slightly improved; still waking at three; asked after another patient called Jane at a different practice.\n\nPlan: Sleep hygiene and morning activation; review in a week.',
      ),
    ],
  },
  {
    id: 'c-jane-roe',
    name: 'Jane Roe second opinion',
    createdAt: '2026-05-20T16:00:00Z',
    updatedAt: '2026-07-20T09:15:00Z',
    labels: { kind: 'patient', patient: 'Jane Roe', language: 'en', case: 'same-first-name' },
    messages: [
      message(
        'c-jane-roe-h1',
        'human',
        at('2026-05-20', 16, 0),
        'Jane Roe, first session. Panic before leaving the house, three episodes this week.',
      ),
      message(
        'c-jane-roe-a1',
        'assistant',
        at('2026-05-20', 16, 5),
        'Subjective: Three pre-departure panic episodes this week.\n\nAssessment: Agoraphobia pattern without avoidance.\n\nPlan: Graded exposure steps, weekly.',
      ),
      message(
        'c-jane-roe-h2',
        'human',
        at('2026-07-20', 9, 10),
        'Jane Roe again — two episodes, both in the car, none at the door. She is pleased with that.',
      ),
      message(
        'c-jane-roe-a2',
        'assistant',
        at('2026-07-20', 9, 15),
        'Subjective: Two episodes, both in the car; none at the door.\n\nPlan: Continue graded steps; review next week.',
      ),
    ],
  },
  {
    id: 'c-marisol',
    name: 'Marisol Urzúa Salgado — notas de sesión',
    createdAt: '2026-06-05T22:00:00Z',
    updatedAt: '2026-07-28T23:10:00Z',
    labels: { kind: 'patient', patient: 'Marisol Urzúa Salgado', language: 'es-MX', case: 'spanish' },
    messages: [
      message(
        'c-marisol-h1',
        'human',
        at('2026-06-05', 22, 0),
        'Sesión con Marisol. Dice que no ha dormido en tres noches y que sigue sin desayunar. Pregunta si el ejercicio sirve.',
      ),
      message(
        'c-marisol-a1',
        'assistant',
        at('2026-06-05', 22, 3),
        'Subjetivo: Tres noches sin dormir, no desayuna.\n\nEvaluación: Activación y falta de apetito.\n\nPlan: Revisar el sueño y el horario de comidas.',
      ),
      message(
        'c-marisol-h2',
        'human',
        at('2026-07-28', 23, 0),
        'Marisol de nuevo. Durmió cinco horas y comió algo. Su mamá está ansiosa y lo menciona en cada sesión.',
      ),
      message(
        'c-marisol-a2',
        'assistant',
        at('2026-07-28', 23, 10),
        'Subjetivo: Cinco horas de sueño, comió algo; su mamá ansiosa y lo menciona en cada sesión.\n\nEvaluación: Mejoría parcial.\n\nPlan: Continuar semanal y revisar el sueño esta semana.',
      ),
    ],
  },
  {
    id: 'c-fermin',
    name: 'Fermín Zamudio Zúñiga — una sesión',
    createdAt: '2026-07-09T13:00:00Z',
    updatedAt: '2026-07-09T13:40:00Z',
    labels: { kind: 'patient', patient: 'Fermín Zamudio Zúñiga', language: 'es-MX', case: 'one-session' },
    messages: [
      message(
        'c-fermin-h1',
        'human',
        at('2026-07-09', 13, 0),
        'Sesión inicial con Fermín. Ansiedad por el trabajo; toma medio pastilla antes de las presentaciones.',
      ),
      message(
        'c-fermin-a1',
        'assistant',
        at('2026-07-09', 13, 40),
        'Subjetivo: Ansiedad laboral, medio pastilla antes de las presentaciones.\n\nPlan: Continuar semanal.',
      ),
    ],
  },
  {
    id: 'c-dana',
    name: 'Dana Doe across the years',
    createdAt: '2024-02-14T09:00:00Z',
    updatedAt: '2026-09-05T09:30:00Z',
    labels: { kind: 'patient', patient: 'Dana Doe', language: 'en', case: 'multi-year-gaps' },
    messages: [
      message(
        'c-dana-h1',
        'human',
        at('2024-02-14', 9, 0),
        'Dana Doe, intake. Reports drinking most evenings and low mood since the separation.',
      ),
      message(
        'c-dana-a1',
        'assistant',
        at('2024-02-14', 9, 15),
        'Subjective: Most evenings drinking; low mood since separation.\n\nRisk: No self-harm reported.\n\nPlan: Weekly; alcohol diary.',
      ),
      message(
        'c-dana-h2',
        'human',
        at('2025-08-19', 11, 0),
        'Dana Doe after a long gap. Sober eleven months, mood steady, working full time again.',
      ),
      message(
        'c-dana-a2',
        'assistant',
        at('2025-08-19', 11, 10),
        'Subjective: Sober eleven months, mood steady, working full time.\n\nPlan: Move to monthly; relapse plan reviewed.',
      ),
      message(
        'c-dana-h3',
        'human',
        at('2026-09-05', 9, 20),
        'Dana Doe this week. A drink at a wedding, and she felt the pull for a week afterwards.',
      ),
      message(
        'c-dana-a3',
        'assistant',
        at('2026-09-05', 9, 30),
        'Subjective: One drink at a wedding, a week of craving afterwards.\n\nPlan: Monthly continues; name the early warning signs.',
      ),
    ],
  },
  {
    id: 'c-alex-recent-old',
    name: 'Alex Roe — remembering March',
    createdAt: '2026-09-10T20:00:00Z',
    updatedAt: '2026-09-10T20:30:00Z',
    labels: {
      kind: 'patient',
      patient: 'Alex Roe',
      language: 'en',
      case: 'recent-chat-about-an-old-session',
    },
    messages: [
      message(
        'c-alex-h1',
        'human',
        at('2026-09-10', 20, 0),
        'Alex Roe — I never wrote up the session we had in March last year. From what I remember it was about the panic on the train and we agreed to try breathing.',
      ),
      message(
        'c-alex-a1',
        'assistant',
        at('2026-09-10', 20, 30),
        'Subjective: Session recalled by the therapist as March 2025, about panic on the train.\n\nPlan: Check the diary before writing this up as a session note.',
      ),
    ],
  },
  {
    id: 'c-recipe',
    name: 'Sourdough timings',
    createdAt: '2026-06-18T08:00:00Z',
    updatedAt: '2026-07-02T08:10:00Z',
    labels: { kind: 'unrelated', patient: null, language: 'en', case: 'personal-material' },
    messages: [
      message(
        'c-recipe-h1',
        'human',
        at('2026-06-18', 8, 0),
        'My sourdough is not rising. The starter is fed twice a day and the kitchen is cold.',
      ),
      message(
        'c-recipe-a1',
        'assistant',
        at('2026-06-18', 8, 5),
        'Cold kitchens slow the starter. Try a longer bulk and a warmer spot.',
      ),
      message('c-recipe-h2', 'human', at('2026-07-02', 8, 0), 'Risen. It worked, thank you.'),
      message(
        'c-recipe-a2',
        'assistant',
        at('2026-07-02', 8, 10),
        'Glad it worked. Back to schedule next week.',
      ),
    ],
  },
  {
    id: 'c-boundary',
    name: 'Boundary timings',
    createdAt: '2026-06-30T17:59:59Z',
    updatedAt: '2026-07-01T06:00:30Z',
    labels: { kind: 'boundary', patient: null, language: 'en', case: 'cutoff-and-gap-boundaries' },
    messages: [
      // Exactly six hours apart, which is still one sitting; two seconds apart
      // across midnight, which is also one sitting; and then six hours and one
      // second, which is not. The conversation therefore straddles the cutoff
      // day without the gap rule ever being tested on a calendar day.
      message(
        'c-boundary-h1',
        'human',
        '2026-06-30T17:59:59Z',
        'Boundary case. A message exactly on the evening before the cutoff.',
      ),
      message(
        'c-boundary-h2',
        'human',
        '2026-06-30T23:59:59Z',
        'Six hours later, so the same sitting under the six-hour rule.',
      ),
      message(
        'c-boundary-h3',
        'human',
        '2026-07-01T00:00:01Z',
        'Two seconds later and a day later, so still the same sitting: the rule is about hours, not about midnight.',
      ),
      message(
        'c-boundary-h4',
        'human',
        '2026-07-01T06:00:02Z',
        'Six hours and one second later, so a new sitting.',
      ),
      message(
        'c-boundary-a1',
        'assistant',
        '2026-07-01T06:00:30Z',
        'Subjective: Boundary timings checked.\n\nPlan: Two sessions from these five messages.',
      ),
    ],
  },
  {
    id: 'c-ambiguous-dates',
    name: 'Dates I am unsure of',
    createdAt: null,
    updatedAt: null,
    labels: { kind: 'patient', patient: 'Jane Doe', language: 'en', case: 'ambiguous-dates' },
    messages: [
      message(
        'c-dates-h1',
        'human',
        at('2026-08-01', 9, 0),
        'Jane Doe, and I cannot find the date of our July session.',
      ),
      message(
        'c-dates-a1',
        'assistant',
        at('2026-08-01', 9, 5),
        'Subjective: Session date not recalled.\n\nPlan: Check the diary; do not infer the date.',
      ),
      message('c-dates-h2', 'human', null, 'This message has no timestamp at all.'),
      message('c-dates-h3', 'human', 'not-a-date', 'And this one carries a value that is not a date.'),
      message(
        'c-dates-a2',
        'assistant',
        at('2026-09-14', 10, 0),
        'Subjective: Second sitting, date to be confirmed from the diary.\n\nPlan: Confirm before filing.',
      ),
    ],
  },
  {
    id: 'c-empty',
    name: 'Untitled empty chat',
    createdAt: '2026-04-01T00:00:00Z',
    updatedAt: '2026-04-01T00:00:00Z',
    labels: { kind: 'empty', patient: null, language: 'en', case: 'no-messages' },
    messages: [],
  },
  {
    id: 'c-attachment-only',
    name: 'Scans of the questionnaire',
    createdAt: '2026-03-03T12:00:00Z',
    updatedAt: '2026-03-03T12:05:00Z',
    labels: { kind: 'attachments-only', patient: null, language: 'en', case: 'no-text-only-files' },
    messages: [
      message('c-attach-h1', 'human', at('2026-03-03', 12, 0), '', {
        attachments: [
          ATTACHMENT('questionnaire-scan-1.pdf', 'application/pdf', 210944),
          ATTACHMENT('consent.pdf', 'application/pdf', 51002),
        ],
        contentBlocks: [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf' } }],
      }),
      message('c-attach-h2', 'human', at('2026-03-03', 12, 5), '', {
        attachments: [ATTACHMENT('questionnaire-scan-2.pdf', 'application/pdf', 198233)],
        contentBlocks: [{ type: 'image', source: { type: 'base64', media_type: 'image/jpeg' } }],
      }),
    ],
  },
  {
    id: 'c-content-blocks',
    name: 'Content blocks only',
    createdAt: '2026-09-01T08:00:00Z',
    updatedAt: '2026-09-01T08:05:00Z',
    labels: { kind: 'patient', patient: 'Dana Doe', language: 'en', case: 'no-text-field-content-blocks' },
    messages: [
      message(
        'c-blocks-h1',
        'human',
        at('2026-09-01', 8, 0),
        'Dana Doe, sending the sleep diary as a file.',
        {
          omitTextField: true,
          attachments: [ATTACHMENT('sleep-diary.png', 'image/png', 12043)],
        },
      ),
      message(
        'c-blocks-a1',
        'assistant',
        at('2026-09-01', 8, 5),
        'Subjective: Sleep diary attached.\n\nPlan: Review the diary next session.',
        {
          omitTextField: true,
        },
      ),
    ],
  },
  {
    id: 'c-deleted',
    name: 'Deleted in the app',
    createdAt: '2026-02-02T10:00:00Z',
    updatedAt: '2026-02-03T10:00:00Z',
    deletedAt: '2026-08-08T00:00:00Z',
    labels: { kind: 'deleted', patient: null, language: 'en', case: 'deleted-in-the-app' },
    messages: [],
  },
];

// A long history, generated rather than written: thirty messages over three
// sittings, so message-level paging and the six-hour split both have something
// to chew on. Its content is as invented as everything else here.
{
  const sittings = [
    { day: '2025-11-03', hour: 15 },
    { day: '2025-11-10', hour: 15 },
    { day: '2025-11-17', hour: 15 },
  ];
  const messages = [];
  sittings.forEach((sitting, index) => {
    for (let turn = 0; turn < 9; turn += 1) {
      messages.push(
        message(
          `c-long-s${String(index + 1)}-h${String(turn + 1)}`,
          'human',
          at(sitting.day, sitting.hour, turn * 5),
          `Sitting ${String(index + 1)}, turn ${String(turn + 1)}: still six hours of sleep, and the sheet is on the table.`,
        ),
      );
    }
    messages.push(
      message(
        `c-long-s${String(index + 1)}-a1`,
        'assistant',
        at(sitting.day, sitting.hour, 50),
        `Subjective: Sitting ${String(index + 1)} — sleep six hours, sheet in use.\n\nPlan: Continue weekly.`,
      ),
    );
  });
  CONVERSATIONS.push({
    id: 'c-long',
    name: 'Long history, three sittings',
    createdAt: at('2025-11-03', 15, 0),
    updatedAt: at('2025-11-17', 15, 50),
    labels: { kind: 'patient', patient: 'Dana Doe', language: 'en', case: 'long-history' },
    messages,
  });
}

/** Parent links that are not "the message before me". */
const PARENT_OVERRIDES = {
  // She edited the first message of the third sitting, so the edit forks from
  // the last message of the second and the original pair is left behind.
  'c-john-a-s3-h2': 'c-john-a-s2-h2',
};

/**
 * Give every message the parent a real export records: the message before it on
 * the thread, unless this is a fork. Without links the live-thread walk has
 * nothing to follow, and a capture that preserved no links would look
 * identical to a capture of a conversation that was never branched.
 */
function linkThreads(conversations) {
  for (const conversation of conversations) {
    let previous = null;
    for (const each of conversation.messages) {
      each.parent = PARENT_OVERRIDES[each.id] ?? previous;
      previous = each.id;
    }
  }
}

linkThreads(CONVERSATIONS);

export const ACCOUNT = { uuid: ACCOUNT_UUID, organization_uuid: ORGANIZATION_ID };

/** Every message id in the account, for the dedupe assertions. */
export function allMessageIds() {
  return CONVERSATIONS.flatMap((conversation) => conversation.messages.map((each) => each.id));
}

/** Conversation ids, in the order the inventory lists them. */
export function conversationIds() {
  return CONVERSATIONS.map((conversation) => conversation.id);
}
