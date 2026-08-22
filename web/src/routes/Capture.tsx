import { useCallback, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { createNote, errorMessage, getPatient, listFormats } from '../api/index.js';
import { KeyboardIcon, MicIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';

/** Until M5 lands the recorder, the option is visible but cannot be chosen. */
const RECORDING_TOOLTIP = 'Recording arrives in a later milestone';

/**
 * `prototype/capture.html` — the format, and how the session gets in.
 *
 * One deliberate difference from the prototype: the options are not a
 * either/or picker that swaps the screen. The practice owner said she both
 * speaks a session aloud *and* writes rough notes
 * (`docs/feedback/2026-08-22-owner-answers.md`), so M5 will feed a recording
 * and typed notes to the same drafting call. Building the toggle now would
 * only be something for M5 to tear out.
 *
 * M2 implements the typed path, and saves the typed text as the note's body.
 * M3 replaces that with /api/generate, which drafts the note from the same
 * text; the screen around it does not change.
 */
export function Capture(): React.JSX.Element {
  const { patientId = '' } = useParams();
  const navigate = useNavigate();

  const loadPatient = useCallback((signal: AbortSignal) => getPatient(patientId, signal), [patientId]);
  const patient = useLoader(loadPatient);

  const loadFormats = useCallback((signal: AbortSignal) => listFormats(signal), []);
  const formats = useLoader(loadFormats);

  const [chosenFormatId, setChosenFormatId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const available = formats.state.status === 'ready' ? formats.state.data : [];
  const formatId = chosenFormatId ?? available[0]?.id ?? '';

  async function handleProcess(): Promise<void> {
    if (busy || formatId === '' || text.trim().length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const note = await createNote({ patient_id: patientId, format_id: formatId, content: text });
      await navigate(`/?patient=${patientId}&note=${note.id}`, { replace: true });
    } catch (thrown) {
      setError(errorMessage(thrown));
      setBusy(false);
    }
  }

  const heading = patient.state.status === 'ready' ? `New note for ${patient.state.data.name}` : 'New note';

  return (
    <Screen back={{ to: `/?patient=${patientId}`, label: 'Patients' }}>
      <h2 className="heading-tight" data-testid="capture-heading">
        {heading}
      </h2>
      {patient.state.status === 'error' && (
        <p className="form-error" role="alert">
          {patient.state.message}
        </p>
      )}

      <div className="field field-narrow lede">
        <label className="label" htmlFor="note-format">
          Note format
        </label>
        <select
          id="note-format"
          value={formatId}
          disabled={available.length === 0}
          onChange={(event) => {
            setChosenFormatId(event.target.value);
          }}
        >
          {formats.state.status === 'loading' && <option value="">Loading…</option>}
          {available.map((format) => (
            <option key={format.id} value={format.id}>
              {format.name}
            </option>
          ))}
        </select>
      </div>

      {formats.state.status === 'ready' && available.length === 0 ? (
        <p className="muted">
          No note formats yet. <Link to="/onboarding/format">Add one first</Link> — a note needs a structure
          to follow.
        </p>
      ) : (
        <>
          <div className="stack">
            <button type="button" className="btn-option" disabled title={RECORDING_TOOLTIP}>
              <MicIcon />
              <div>
                <div className="opt-title">Record audio</div>
                <div className="opt-sub">Narrate your notes right now</div>
                <div className="opt-sub later-milestone">{RECORDING_TOOLTIP}.</div>
              </div>
            </button>

            <div className="capture-typed" data-testid="type-ui">
              <div className="row gap-12 capture-typed-head">
                <KeyboardIcon />
                <div>
                  <div className="opt-title">Type it out</div>
                  <div className="opt-sub">Quick summary in your own words</div>
                </div>
              </div>
              <textarea
                placeholder="Type your session summary..."
                aria-label="Session summary"
                data-testid="summary-input"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                }}
                autoFocus
              />
            </div>
          </div>

          {error !== null && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            className="btn btn-primary btn-block form-actions"
            data-testid="process-note"
            disabled={busy || text.trim().length === 0}
            onClick={() => {
              void handleProcess();
            }}
          >
            {busy ? 'Saving…' : 'Process note'}
          </button>
        </>
      )}
    </Screen>
  );
}
