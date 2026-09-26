import { t, type PatientListItem } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  installFakeApi,
  installFakeClipboard,
  makeGoal,
  makeNote,
  makePatient,
  makePlan,
} from '../test/fakeApi.js';
import { PlanView } from './PlanView.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function patientFixture(): PatientListItem {
  return makePatient('John Smith', { note_count: 1 });
}

describe('PlanView', () => {
  it('offers to start a plan when there is none', async () => {
    installFakeApi({ patients: [patientFixture()] });
    const patient = patientFixture();

    render(<PlanView patient={patient} onOpenNote={() => {}} />);

    expect(await screen.findByTestId('empty-no-plan')).toBeTruthy();
    fireEvent.click(screen.getByTestId('start-plan'));
    await waitFor(() => {
      expect(screen.getByTestId('plan-version').textContent).toContain('Version 1');
    });
  });

  /**
   * The distinction the whole feature turns on. A suggestion is marked as one,
   * shows the note text it was drafted from, and is one click from being
   * discarded; a goal she accepted reads as the plan.
   */
  it('never renders a proposal like part of the plan', async () => {
    const patient = patientFixture();
    const plan = makePlan(patient.id);
    const note = makeNote(patient.id);
    const accepted = makeGoal(plan.id, { statement: 'John sleeps through the night.' });
    const proposed = makeGoal(plan.id, {
      statement: 'John keeps a sleep log.',
      status: 'proposed',
      evidence: [
        {
          note_id: note.id,
          note_date: note.created_at,
          section: 'Subjective',
          excerpt: 'improved sleep since last session',
        },
      ],
    });
    installFakeApi({ patients: [patient], notes: [note], plans: [plan], goals: [accepted, proposed] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);

    const suggestion = await screen.findByTestId('proposed-goal');
    expect(suggestion.textContent).toContain('Suggested — not in the plan yet');
    expect(within(suggestion).getByTestId('goal-evidence').textContent).toContain(
      'improved sleep since last session',
    );
    expect(within(suggestion).getByTestId('accept-goal')).toBeTruthy();

    const inPlan = screen.getByTestId('plan-goal');
    expect(inPlan.textContent).toContain('John sleeps through the night.');
    expect(inPlan.textContent).not.toContain('Suggested');
    expect(within(inPlan).queryByTestId('accept-goal')).toBeNull();
  });

  it('accepts a proposal, which moves it into the plan', async () => {
    const patient = patientFixture();
    const plan = makePlan(patient.id);
    const proposed = makeGoal(plan.id, { statement: 'John keeps a sleep log.', status: 'proposed' });
    const api = installFakeApi({ patients: [patient], plans: [plan], goals: [proposed] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);
    fireEvent.click(await screen.findByTestId('accept-goal'));

    await waitFor(() => {
      expect(screen.queryByTestId('proposed-goal')).toBeNull();
    });
    expect(api.state.goals[0]?.status).toBe('accepted');
    expect(screen.getByTestId('plan-goal').textContent).toContain('John keeps a sleep log.');
  });

  it('discards a proposal outright', async () => {
    const patient = patientFixture();
    const plan = makePlan(patient.id);
    const proposed = makeGoal(plan.id, { statement: 'John keeps a sleep log.', status: 'proposed' });
    const api = installFakeApi({ patients: [patient], plans: [plan], goals: [proposed] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);
    fireEvent.click(await screen.findByTestId('discard-goal'));

    await waitFor(() => {
      expect(api.state.goals).toHaveLength(0);
    });
  });

  it('streams suggestions in and says how far back it read', async () => {
    const patient = patientFixture();
    const plan = makePlan(patient.id);
    const note = makeNote(patient.id);
    installFakeApi({ patients: [patient], notes: [note], plans: [plan], goals: [] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);
    fireEvent.click(await screen.findByTestId('draft-goals'));

    expect(await screen.findByTestId('proposed-goal')).toBeTruthy();
    const lookback = await screen.findByTestId('lookback-note');
    expect(lookback.textContent).toContain('Read 1 note');
    expect(lookback.textContent).toContain('limit 5');
  });

  /**
   * S2.4 Fixed decision 4: `version` and `status` are stored values and go
   * into `plan.versionMeta` verbatim — a status is never translated — and the
   * date `effective_from` carries reaches `t()` as a raw `YYYY-MM-DD` under
   * `dateOnly`, so the English is the same string the screen showed before and
   * the Spanish one is the locale's date.
   */
  it('renders the version line as one key, with the stored status and a formatted day', async () => {
    const patient = patientFixture();
    const plan = makePlan(patient.id, {
      version: 3,
      status: 'active',
      activated_at: '2026-05-01T09:00:00.000Z',
      effective_from: '2026-05-01',
    });
    installFakeApi({ patients: [patient], plans: [plan], goals: [] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);

    const line = await screen.findByTestId('plan-version');
    expect(line.textContent).toBe(
      t('plan.versionMetaEffective', { version: '3', status: 'active', day: '2026-05-01' }),
    );
    expect(t('plan.versionMetaEffective', { version: '3', status: 'active', day: '2026-05-01' }, 'en')).toBe(
      'Version 3 · active · effective May 1, 2026',
    );
    expect(t('plan.versionMeta', { version: '3', status: 'active' }, 'en')).toBe('Version 3 · active');
  });

  /**
   * The lookback line is four sentences the code joins, each a key: the base
   * sentence in its two forms (the source already branched on whether the
   * oldest note is known), then the skipped count and the outcome.
   */
  it('renders the lookback line from its keys, with the day formatted by t()', async () => {
    const patient = patientFixture();
    const plan = makePlan(patient.id);
    const note = makeNote(patient.id);
    installFakeApi({ patients: [patient], notes: [note], plans: [plan], goals: [] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);
    fireEvent.click(await screen.findByTestId('draft-goals'));

    const lookback = await screen.findByTestId('lookback-note');
    // The fake server reports an oldest note, so the line takes the `backTo`
    // form — the one whose `{day}` reaches `t()` raw.
    expect(lookback.textContent).toContain(
      t('plan.lookbackReadBackTo', { count: 1, day: '2026-08-08', cap: 5 }),
    );
    expect(t('plan.lookbackReadBackTo', { count: 1, day: '2026-08-08', cap: 5 }, 'en')).toBe(
      'Read 1 note, back to Aug 8, 2026 (limit 5).',
    );
    expect(t('plan.lookbackReadBackTo', { count: 1, day: '2026-08-08', cap: 5 }, 'es-MX')).toBe(
      'Se leyeron 1 nota, desde el 8 ago 2026 (límite 5).',
    );
    // The form with no oldest note, for the case the server reports none.
    expect(t('plan.lookbackRead', { count: 3, cap: 5 }, 'en')).toBe('Read 3 notes (limit 5).');
  });

  it('follows a citation through to the note it came from', async () => {
    const patient = patientFixture();
    const plan = makePlan(patient.id);
    const note = makeNote(patient.id);
    const proposed = makeGoal(plan.id, {
      status: 'proposed',
      evidence: [
        {
          note_id: note.id,
          note_date: note.created_at,
          section: 'Subjective',
          excerpt: 'improved sleep since last session',
        },
      ],
    });
    installFakeApi({ patients: [patient], notes: [note], plans: [plan], goals: [proposed] });

    const opened: string[] = [];
    render(
      <PlanView
        patient={patient}
        onOpenNote={(id) => {
          opened.push(id);
        }}
      />,
    );

    fireEvent.click(await screen.findByTestId('evidence-link'));
    expect(opened).toEqual([note.id]);
  });

  /**
   * Date arithmetic on a date she chose — the one thing on this screen derived
   * from anything, and it reads no note.
   */
  it('says a review has come due, and nothing about the notes', async () => {
    const patient = patientFixture();
    const plan = makePlan(patient.id, {
      status: 'active',
      activated_at: '2026-05-01T09:00:00.000Z',
      review_due: '2020-01-01',
    });
    installFakeApi({ patients: [patient], plans: [plan], goals: [] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);

    const due = await screen.findByTestId('review-due');
    expect(due.textContent).toContain('Plan review was due');
    expect(due.className).toContain('is-overdue');

    // Nothing counts sessions, scores coverage or says a goal is being missed.
    const view = screen.getByTestId('plan-view');
    expect(view.textContent).not.toMatch(/sessions since|not been addressed|coverage|behind/i);
  });

  it('keeps a superseded version read-only', async () => {
    const patient = patientFixture();
    const superseded = makePlan(patient.id, {
      status: 'superseded',
      activated_at: '2026-05-01T09:00:00.000Z',
      effective_to: '2026-08-01',
    });
    const current = makePlan(patient.id, {
      version: 2,
      status: 'active',
      activated_at: '2026-08-01T09:00:00.000Z',
    });
    installFakeApi({
      patients: [patient],
      plans: [superseded, current],
      goals: [makeGoal(superseded.id)],
    });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);

    fireEvent.change(await screen.findByTestId('version-picker'), { target: { value: '1' } });

    expect(await screen.findByTestId('read-only-note')).toBeTruthy();
    await waitFor(() => {
      expect(screen.queryByTestId('edit-goal')).toBeNull();
    });
    expect(screen.queryByTestId('plan-suggestions')).toBeNull();
  });

  it('copies the plan as a document', async () => {
    const clipboard = installFakeClipboard();
    const patient = patientFixture();
    const plan = makePlan(patient.id);
    installFakeApi({ patients: [patient], plans: [plan], goals: [] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);
    fireEvent.click(await screen.findByTestId('copy-plan'));

    await waitFor(() => {
      expect(clipboard.written[0]).toContain('TREATMENT PLAN');
    });
  });

  /** The daily view leads with the goals, not with a form of payer fields. */
  it('folds the plan-level fields away, but says whether they are filled in', async () => {
    const patient = patientFixture();
    const plan = makePlan(patient.id, {
      diagnoses: [
        { code: 'F41.1', system: 'icd-10-cm', description: 'Generalized anxiety disorder', primary: true },
      ],
      modality: 'Individual psychotherapy (CBT)',
    });
    installFakeApi({ patients: [patient], plans: [plan], goals: [] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);

    const details = await screen.findByTestId('plan-details-block');
    expect(details.hasAttribute('open')).toBe(false);
    expect(screen.getByTestId('toggle-details').textContent).toContain(
      'F41.1 · Individual psychotherapy (CBT)',
    );
  });

  it('says plainly when the payer-facing fields are missing', async () => {
    const patient = patientFixture();
    installFakeApi({ patients: [patient], plans: [makePlan(patient.id)], goals: [] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);

    expect((await screen.findByTestId('toggle-details')).textContent).toContain(
      'diagnosis, modality and frequency not recorded',
    );
  });

  it('says an unattested plan is not a signature', async () => {
    const patient = patientFixture();
    installFakeApi({ patients: [patient], plans: [makePlan(patient.id)], goals: [] });

    render(<PlanView patient={patient} onOpenNote={() => {}} />);

    const attestation = await screen.findByTestId('plan-attestation');
    expect(attestation.textContent).toContain('sign the copy in your records system');
    expect(attestation.textContent).toContain('Not yet attested');
  });
});

/**
 * Two unrelated ways a run ends with nothing, which used to render as one
 * shrug ("No suggestions waiting.") after a minute of visible work.
 */
describe('when a suggestion run produces nothing', () => {
  it('says the notes were thin when the model drafted nothing', async () => {
    const patient = makePatient('John Smith', { note_count: 1 });
    installFakeApi(
      { patients: [patient], notes: [makeNote(patient.id)] },
      { suggestNothing: { dropped: 0 } },
    );

    render(<PlanView patient={patient} onOpenNote={() => {}} />);
    fireEvent.click(await screen.findByTestId('draft-goals'));

    await waitFor(() => {
      expect(screen.getByTestId('lookback-note').textContent).toContain('not much recorded');
    });
  });

  it('says so plainly when drafts were written and discarded', async () => {
    const patient = makePatient('John Smith', { note_count: 1 });
    installFakeApi(
      { patients: [patient], notes: [makeNote(patient.id)] },
      { suggestNothing: { dropped: 3 } },
    );

    render(<PlanView patient={patient} onOpenNote={() => {}} />);
    fireEvent.click(await screen.findByTestId('draft-goals'));

    await waitFor(() => {
      const text = screen.getByTestId('lookback-note').textContent ?? '';
      expect(text).toContain('discarded');
      expect(text).toContain('could not be traced');
    });
  });
});
