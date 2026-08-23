import { useCallback, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import { errorMessage, generateNote, getPatient, listFormats } from '../api/index.js';
import { KeyboardIcon, MicIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';

/** Until M5 lands the recorder, the option is visible but cannot be chosen. */
const RECORDING_TOOLTIP = 'Recording arrives in a later milestone';

/**
 * `prototype/capture.html` — the format, and how the session gets in.
 *
 * Two deliberate differences from the prototype:
 *
 * The options are not an either/or picker that swaps the screen. The practice
 * owner both writes rough notes and occasionally speaks a session aloud
 * (`docs/feedback/2026-08-22-owner-answers.md`), so M5 will feed a recording
 * and her typed notes to the same drafting call. Building the toggle now would
 * only be something for M5 to tear out.
 *
 * And "Process note" now calls `/api/generate`, which drafts the note with the
 * local model and streams it back. Typed notes are the primary path, not a
 * placeholder: "mostly written, speaking is occasional".
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
  const [status, setStatus] = useState<string | null>(null);
  /** Section name → body so far. Filled in by `token` events as they arrive. */
  const [draft, setDraft] = useState<Record<string, string>>({});
  const abortRef = useRef<AbortController | null>(null);

  const available = formats.state.status === 'ready' ? formats.state.data : [];
  const format = available.find((candidate) => candidate.id === chosenFormatId) ?? available[0];
  const formatId = format?.id ?? '';

  async function handleProcess(): Promise<void> {
    if (busy || formatId === '' || text.trim().length === 0) return;
    setBusy(true);
    setError(null);
    setDraft({});
    setStatus('Contacting the local AI…');

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { note } = await generateNote(
        { patient_id: patientId, format_id: formatId, typed_notes: text },
        {
          onStatus: (event) => {
            setStatus(event.message);
            // A retry starts the note over, so the half-written one on screen
            // is no longer what the model is producing.
            if (event.stage === 'retrying') setDraft({});
          },
          onToken: (event) => {
            setDraft((current) => ({
              ...current,
              [event.section]: (current[event.section] ?? '') + event.text,
            }));
          },
        },
        controller.signal,
      );
      await navigate(`/?patient=${patientId}&note=${note.id}`, { replace: true });
    } catch (thrown) {
      setError(errorMessage(thrown));
      setStatus(null);
      setBusy(false);
    } finally {
      abortRef.current = null;
    }
  }

  const heading = patient.state.status === 'ready' ? `New note for ${patient.state.data.name}` : 'New note';
  const sections = format?.sections ?? [];
  const drafting = busy && Object.keys(draft).length > 0;

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
          disabled={available.length === 0 || busy}
          onChange={(event) => {
            setChosenFormatId(event.target.value);
          }}
        >
          {formats.state.status === 'loading' && <option value="">Loading…</option>}
          {available.map((candidate) => (
            <option key={candidate.id} value={candidate.id}>
              {candidate.name}
            </option>
          ))}
        </select>
      </div>

      {formats.state.status === 'error' && (
        <p className="form-error" role="alert">
          {formats.state.message}{' '}
          <button type="button" className="btn small btn-quick" onClick={formats.reload}>
            Try again
          </button>
        </p>
      )}

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
                readOnly={busy}
                onChange={(event) => {
                  setText(event.target.value);
                }}
                autoFocus
              />
            </div>
          </div>

          {busy && (
            <div className="draft-progress" data-testid="draft-progress">
              <p className="small muted" role="status" data-testid="draft-status">
                {status ?? 'Drafting…'}
              </p>
              {drafting && (
                <div className="draft-preview" data-testid="draft-preview">
                  {sections.map((section) => (
                    <p key={section}>
                      <span className="draft-section">{section}:</span> {draft[section] ?? ''}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

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
            {busy ? 'Drafting…' : 'Process note'}
          </button>
        </>
      )}
    </Screen>
  );
}
