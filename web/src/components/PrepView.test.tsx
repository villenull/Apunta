import { t } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeApi, makeGoal, makeNote, makePatient, makePlan } from '../test/fakeApi.js';
import { PrepView } from './PrepView.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('PrepView', () => {
  it('streams the briefing in, dating every line', async () => {
    const patient = makePatient('John Smith', { note_count: 1 });
    const note = makeNote(patient.id);
    installFakeApi({ patients: [patient], notes: [note] });

    render(<PrepView patient={patient} onOpenNote={() => {}} />);

    const lines = await screen.findAllByTestId('prep-line');
    expect(lines.length).toBeGreaterThan(0);
    expect(lines[0]?.textContent).toContain('improved sleep');
    // Every line names the note it came from, and clicks through to it.
    expect(screen.getAllByTestId('prep-citation')).toHaveLength(lines.length);
  });

  it('states how far back it read', async () => {
    const patient = makePatient('John Smith', { note_count: 1 });
    installFakeApi({ patients: [patient], notes: [makeNote(patient.id)] });

    render(<PrepView patient={patient} onOpenNote={() => {}} />);

    const lookback = await screen.findByTestId('prep-lookback');
    expect(lookback.textContent).toContain('Read the last 1 note');
    expect(lookback.textContent).toContain('limit 5');
  });

  /**
   * Prep presents the plan and presents the recent material. It does not
   * relate one to the other — that is the thing the owner turned down.
   */
  it('shows the plan beside the notes, and draws no line between them', async () => {
    const patient = makePatient('John Smith', { note_count: 1 });
    const plan = makePlan(patient.id, { status: 'active', activated_at: '2026-08-01T09:00:00.000Z' });
    installFakeApi({
      patients: [patient],
      notes: [makeNote(patient.id)],
      plans: [plan],
      goals: [makeGoal(plan.id, { statement: 'John sleeps through the night.' })],
    });

    render(<PrepView patient={patient} onOpenNote={() => {}} />);

    expect((await screen.findByTestId('prep-plan')).textContent).toContain('John sleeps through the night.');
    await screen.findAllByTestId('prep-line');

    const view = screen.getByTestId('prep-view');
    expect(view.textContent).not.toMatch(
      /sessions since|not addressed|hasn.t come up|progress toward|on track|coverage/i,
    );
  });

  it('follows a citation to its note', async () => {
    const patient = makePatient('John Smith', { note_count: 1 });
    const note = makeNote(patient.id);
    installFakeApi({ patients: [patient], notes: [note] });

    const opened: string[] = [];
    render(
      <PrepView
        patient={patient}
        onOpenNote={(id) => {
          opened.push(id);
        }}
      />,
    );

    fireEvent.click((await screen.findAllByTestId('prep-citation'))[0] as HTMLElement);
    expect(opened).toEqual([note.id]);
  });

  /** Ephemeral by default: nothing is stored until she presses Keep. */
  it('saves nothing until she keeps it', async () => {
    const patient = makePatient('John Smith', { note_count: 1 });
    const api = installFakeApi({ patients: [patient], notes: [makeNote(patient.id)] });

    render(<PrepView patient={patient} onOpenNote={() => {}} />);
    await screen.findAllByTestId('prep-line');

    expect(api.state.briefs).toHaveLength(0);
    expect(screen.getByTestId('prep-view').textContent).toContain('not saved unless you keep it');

    // The lines render before the stream's final `brief` frame arrives, and
    // Keep is disabled until that frame lands — click a button, not a hope.
    const keep = screen.getByTestId('keep-brief') as HTMLButtonElement;
    await waitFor(() => {
      expect(keep.disabled).toBe(false);
    });
    fireEvent.click(keep);

    await waitFor(() => {
      expect(api.state.briefs).toHaveLength(1);
    });
    expect(api.state.briefs[0]?.saved).toBe(true);
  });

  it('has an honest answer for a patient with no notes', async () => {
    const patient = makePatient('Maria Ruiz');
    installFakeApi({ patients: [patient], notes: [] });

    render(<PrepView patient={patient} onOpenNote={() => {}} />);

    expect((await screen.findByTestId('prep-empty')).textContent).toContain('no notes for this patient');
    expect((await screen.findByTestId('prep-lookback')).textContent).toContain('Read no notes');
  });

  /**
   * S2.4 Fixed decision 5: the review-due line is a sentence JSX split around
   * an interpolation, so the literal checker cannot see it, and the date it
   * composes is the one the app must never hand a catalogue pre-formatted. The
   * rendered line is therefore the catalogue's own English, with the day passed
   * raw and formatted by `t()`.
   */
  it("says the review is due in the catalogue's words, with the day formatted by t()", async () => {
    const patient = makePatient('John Smith', { note_count: 1 });
    const plan = makePlan(patient.id, { review_due: '2026-11-21' });
    installFakeApi({ patients: [patient], notes: [makeNote(patient.id)], plans: [plan] });

    render(<PrepView patient={patient} onOpenNote={() => {}} />);

    expect((await screen.findByTestId('prep-plan')).textContent).toContain(
      t('prep.reviewDue', { day: '2026-11-21' }),
    );
    // …and the date is the locale's, not the `en-US` string `formatPlanDate`
    // used to compose into this line.
    expect(t('prep.reviewDue', { day: '2026-11-21' }, 'en')).toBe('Review due Nov 21, 2026.');
    expect(t('prep.reviewDue', { day: '2026-11-21' }, 'es-MX')).toBe('Revisión pendiente el 21 nov 2026.');
  });

  it('reports a failure inside the stream without losing the screen', async () => {
    const patient = makePatient('John Smith', { note_count: 1 });
    installFakeApi(
      { patients: [patient], notes: [makeNote(patient.id)] },
      { prepError: { code: 'ollama_unreachable', message: "Apunta can't reach the local AI." } },
    );

    render(<PrepView patient={patient} onOpenNote={() => {}} />);

    expect((await screen.findByTestId('prep-error')).textContent).toContain("can't reach the local AI");
    expect(screen.getByTestId('prep-plan')).toBeTruthy();
  });
});
