import {
  MAX_RECORDING_SECONDS,
  PREVIEW_COMMIT_AFTER_SECONDS,
  PREVIEW_COMMIT_FORCE_SECONDS,
  PREVIEW_FIRST_MS,
  PREVIEW_INTERVAL_MS,
  PREVIEW_MAX_SECONDS,
  PREVIEW_MIN_GAP_MS,
  PREVIEW_SLOW_GAP_MS,
  WARN_RECORDING_SECONDS,
} from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';

import {
  errorMessage,
  generateNote,
  getPatient,
  listFormats,
  previewTranscript,
  transcribeRecording,
  type GenerateHandlers,
} from '../api/index.js';
import { KeyboardIcon, MicIcon } from '../components/icons.js';
import { ThinkingDots } from '../components/ThinkingDots.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { formatTimer, Recorder, recorderMessage, RecorderError } from '../lib/recorder.js';

/**
 * `prototype/capture.html` — the format, and how the session gets in.
 *
 * Two deliberate differences from the prototype:
 *
 * The options are not an either/or picker that swaps the screen. The practice
 * owner both writes rough notes and occasionally speaks a session aloud
 * (`docs/feedback/2026-08-22-owner-answers.md`), so a recording and her typed
 * notes go to the same drafting call — the recorder replaces the "Record
 * audio" button while it runs, and the textarea stays where it is.
 *
 * And "Process note" calls the local model: `/api/generate` for typed notes,
 * `/api/transcribe` when there is a recording. The second is one request that
 * transcribes and then drafts, so the screen shows one continuous progression
 * rather than making her wait twice.
 *
 * The recording itself is 16 kHz mono WAV written in the tab
 * (`lib/recorder.ts`). The Web Speech API is never involved — it can send
 * audio to Google, which is the hardest rule in this project.
 */

type RecordingState = 'idle' | 'starting' | 'recording' | 'recorded';

export function Capture(): React.JSX.Element {
  useDocumentTitle('New note');
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

  const [recording, setRecording] = useState<RecordingState>('idle');
  const [seconds, setSeconds] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  /**
   * The finished WAV, held until the note is saved.
   *
   * This is what makes "Try again" mean anything: if transcription fails
   * because whisper is not installed, or the draft fails because Ollama is
   * not running, she retries the recording she already made rather than
   * speaking the session again.
   */
  const [wav, setWav] = useState<Blob | null>(null);

  const recorder = useRef<Recorder | null>(null);
  /**
   * The live half of the recording UI (owner-proxy, 2026-09-01): provisional
   * words, and a level that moves the moment she speaks.
   *
   * `level` answers "is this hearing me" immediately. `preview` answers "are
   * the words coming out right", but cannot answer it for a few seconds —
   * whisper's encoder takes its time even on a short clip — so the two are
   * separate on purpose rather than one indicator that starts late.
   */
  const [level, setLevel] = useState(0);
  const [preview, setPreview] = useState('');
  /** Words committed for good, and the second of audio they run up to. */
  const committed = useRef({ text: '', at: 0 });
  const previewBox = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const available = formats.state.status === 'ready' ? formats.state.data : [];
  const format = available.find((candidate) => candidate.id === chosenFormatId) ?? available[0];
  const formatId = format?.id ?? '';

  /**
   * The current values, readable from a callback the recorder captured an hour
   * ago.
   *
   * `onLimit` fires at the 60-minute cap and processes what was recorded, but
   * the closure it lives in was built when she pressed record — so reading
   * `text` from it would upload the typed notes as they were *before* the
   * session, and reading `formatId` would send an empty one if the format list
   * had not loaded yet at that moment.
   */
  const latest = useRef({ text, formatId, busy });
  latest.current = { text, formatId, busy };

  // A recording is a live microphone and an open audio graph, so leaving the
  // screen has to close them rather than leave the tab's mic light on.
  useEffect(
    () => () => {
      recorder.current?.cancel();
      abortRef.current?.abort();
    },
    [],
  );

  /**
   * Refresh the provisional words while she speaks, and let them grow.
   *
   * Each refresh transcribes only the audio since the last *committed* point.
   * Once that stretch is long enough, the next pause in her speech becomes a
   * cut: the chunk up to it is transcribed once more, appended to the block
   * for good, and never re-read — so the words already on screen stop
   * changing, the cost of a refresh stays flat however long she talks, and
   * the cut falls between words rather than through one. If she never pauses,
   * the cut is forced at the quietest moment once the stretch is long.
   *
   * The first refresh goes early; each one after that is scheduled when the
   * previous returns, so refreshes never overlap. After four minutes they
   * slow to a walking pace rather than stop. A failure goes quiet: the
   * preview is reassurance, and reassurance that raises an alarm about a
   * recording which is going fine would be worse than none.
   */
  useEffect(() => {
    if (recording !== 'recording') return;
    committed.current = { text: '', at: 0 };
    setPreview('');

    let cancelled = false;
    let timer = 0;
    const schedule = (ms: number): void => {
      timer = window.setTimeout(run, ms);
    };
    const settle = (started: number, now: number): void => {
      if (cancelled) return;
      // Rest for as long as the refresh took: whisper gets at most half the
      // machine, and a fast machine gets a caption that keeps up.
      let gap = Math.min(PREVIEW_INTERVAL_MS, Math.max(PREVIEW_MIN_GAP_MS, performance.now() - started));
      if (now > PREVIEW_MAX_SECONDS) gap = Math.max(gap, PREVIEW_SLOW_GAP_MS);
      schedule(gap);
    };
    const run = (): void => {
      const active = recorder.current;
      if (cancelled || !active) return;
      const now = active.seconds;
      const done = committed.current;
      const pending = now - done.at;
      const started = performance.now();

      if (pending >= PREVIEW_COMMIT_AFTER_SECONDS) {
        const searchFrom = done.at + PREVIEW_COMMIT_AFTER_SECONDS / 2;
        const cut =
          active.cutPoint(searchFrom, now - 1) ??
          (pending >= PREVIEW_COMMIT_FORCE_SECONDS
            ? (active.quietestPoint(searchFrom, now - 1) ?? now - 1)
            : null);
        const chunk = cut === null ? null : active.slice(done.at, cut);
        if (cut !== null && chunk !== null) {
          void previewTranscript(chunk)
            .then((result) => {
              if (cancelled || result === null || recorder.current === null) return;
              committed.current = { text: joinWords(done.text, result.text), at: cut };
              setPreview(committed.current.text);
            })
            .finally(() => {
              settle(started, now);
            });
          return;
        }
      }

      const tail = active.slice(done.at, now);
      if (tail === null) {
        schedule(PREVIEW_MIN_GAP_MS);
        return;
      }
      void previewTranscript(tail)
        .then((result) => {
          // Still recording? A result that lands after she stopped belongs to
          // a screen that has moved on.
          if (cancelled || result === null || recorder.current === null) return;
          setPreview(joinWords(committed.current.text, result.text));
        })
        .finally(() => {
          settle(started, now);
        });
    };
    schedule(PREVIEW_FIRST_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [recording]);

  // The block follows the words: newest at the bottom, always in view.
  useEffect(() => {
    const box = previewBox.current;
    if (box) box.scrollTop = box.scrollHeight;
  }, [preview]);

  const draftHandlers = (): GenerateHandlers => ({
    onStatus: (event) => {
      setStatus(event.message);
      // A retry starts the note over, so the half-written one on screen is no
      // longer what the model is producing.
      if (event.stage === 'retrying') setDraft({});
    },
    onToken: (event) => {
      setDraft((current) => ({
        ...current,
        [event.section]: (current[event.section] ?? '') + event.text,
      }));
    },
  });

  async function startRecording(): Promise<void> {
    if (busy || recording !== 'idle') return;
    setError(null);
    setNotice(null);
    setSeconds(0);
    setLevel(0);
    setPreview('');
    setRecording('starting');

    const active = new Recorder({
      onProgress: (elapsed) => {
        setSeconds(elapsed);
        if (elapsed >= WARN_RECORDING_SECONDS) {
          setNotice(
            `This recording is over ${String(Math.floor(WARN_RECORDING_SECONDS / 60))} minutes. Apunta stops at ${String(Math.floor(MAX_RECORDING_SECONDS / 60))}.`,
          );
        }
      },
      onLimit: () => {
        setNotice(
          `Recording stopped at ${String(Math.floor(MAX_RECORDING_SECONDS / 60))} minutes, the longest Apunta takes.`,
        );
        void stopRecording();
      },
      onLevel: setLevel,
      onError: (failure) => {
        setError(recorderMessage(failure));
        recorder.current?.cancel();
        recorder.current = null;
        setRecording('idle');
      },
    });

    try {
      await active.start();
      recorder.current = active;
      setRecording('recording');
    } catch (thrown) {
      setError(recorderMessage(thrown));
      setRecording('idle');
      if (!(thrown instanceof RecorderError)) throw thrown;
    }
  }

  async function stopRecording(): Promise<void> {
    const active = recorder.current;
    if (!active) return;
    recorder.current = null;

    const recorded = await active.stop();
    setSeconds(active.seconds);
    setWav(recorded);
    setRecording('recorded');
    await process(recorded);
  }

  function discardRecording(): void {
    recorder.current?.cancel();
    recorder.current = null;
    setWav(null);
    setSeconds(0);
    setNotice(null);
    setError(null);
    setRecording('idle');
  }

  /** Send whatever she has — the recording, the typed notes, or both. */
  async function process(recorded: Blob | null = wav): Promise<void> {
    const { text: notes, formatId: chosen, busy: running } = latest.current;
    const typed = notes.trim();
    if (running || chosen === '' || (recorded === null && typed.length === 0)) return;

    setBusy(true);
    setError(null);
    setDraft({});
    setStatus(recorded === null ? 'Thinking…' : 'Transcribing…');
    latest.current = { ...latest.current, busy: true };

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const { note } =
        recorded === null
          ? await generateNote(
              { patient_id: patientId, format_id: chosen, typed_notes: notes },
              draftHandlers(),
              controller.signal,
            )
          : await transcribeRecording(
              {
                patient_id: patientId,
                format_id: chosen,
                audio: recorded,
                ...(typed.length > 0 ? { typed_notes: notes } : {}),
              },
              {
                ...draftHandlers(),
                onProgress: (event) => {
                  setStatus(`${event.message} ${String(Math.round(event.fraction * 100))}%`);
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
  const canProcess = wav !== null || text.trim().length > 0;

  // A patient the server no longer knows — deleted from another tab, most
  // likely — gets no microphone: a recording made here could never be saved
  // (seen live 2026-09-04, a full dictation lost to a stale tab).
  if (patient.state.status === 'error') {
    return (
      <Screen back={{ to: '/', label: 'Patients' }}>
        <h2 className="heading-tight" data-testid="capture-heading">
          New note
        </h2>
        <p className="form-error" role="alert" data-testid="capture-missing-patient">
          {patient.state.message} This patient may have been deleted, so nothing recorded here could be saved.{' '}
          <Link to="/">Back to patients</Link>
        </p>
      </Screen>
    );
  }

  return (
    <Screen back={{ to: `/?patient=${patientId}`, label: 'Patients' }}>
      <h2 className="heading-tight" data-testid="capture-heading">
        {heading}
      </h2>
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
            {recording === 'recording' ? (
              <div className="record-ui" data-testid="record-panel">
                {/*
                  The dot is the meter: faint and still when nothing is heard,
                  swelling and colouring with her voice — the one answer to
                  "is this hearing me" on the timescale of her voice itself
                  (owner, 2026-09-05; the bar it replaces looked like a
                  stray widget).
                */}
                <div
                  className="record-dot recording"
                  data-testid="record-dot"
                  style={{ ['--level' as string]: String(Math.min(1, level * 2.5)) }}
                >
                  <MicIcon className="icon record-mic" />
                </div>
                <p className="timer" data-testid="record-timer">
                  {formatTimer(seconds)}
                </p>
                <p className="muted record-label" role="status">
                  Recording…
                </p>

                <div className="record-preview" data-testid="record-preview">
                  {preview === '' ? (
                    <p className="small muted record-preview-waiting">
                      <ThinkingDots ariaLabel="Listening" /> Listening…
                    </p>
                  ) : (
                    <>
                      <div className="record-preview-text" ref={previewBox} data-testid="record-preview-text">
                        {preview}
                      </div>
                      <p className="small muted record-preview-note">
                        Everything so far, roughly. The note is written from the finished recording.
                      </p>
                    </>
                  )}
                </div>
                <button
                  type="button"
                  className="btn btn-primary"
                  data-testid="record-stop"
                  onClick={() => {
                    void stopRecording();
                  }}
                >
                  Stop and process
                </button>
              </div>
            ) : wav !== null && !busy ? (
              <div className="record-ui" data-testid="record-done">
                <p className="muted record-label">
                  Recording ready — {formatTimer(seconds)}. Nothing has left this Mac.
                </p>
                <div className="row gap-12 record-actions">
                  <button
                    type="button"
                    className="btn btn-primary"
                    data-testid="record-retry"
                    onClick={() => {
                      void process();
                    }}
                  >
                    Process recording
                  </button>
                  <button
                    type="button"
                    className="btn"
                    data-testid="record-discard"
                    onClick={discardRecording}
                  >
                    Discard recording
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                className="btn-option"
                data-testid="record-start"
                disabled={busy || recording === 'starting'}
                onClick={() => {
                  void startRecording();
                }}
              >
                <MicIcon />
                <div>
                  <div className="opt-title">Record audio</div>
                  <div className="opt-sub">
                    {recording === 'starting'
                      ? 'Waiting for the microphone…'
                      : 'Narrate your notes right now'}
                  </div>
                </div>
              </button>
            )}

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

          {notice !== null && (
            <p className="small muted" role="status" data-testid="record-notice">
              {notice}
            </p>
          )}

          {busy && (
            <div className="draft-progress" data-testid="draft-progress">
              {/* Dots alone (owner-proxy, 2026-08-30): the cycling is the
                  signal. The server's live stage text still reaches assistive
                  tech as the dots' spoken name. */}
              <p className="small muted draft-status" role="status" data-testid="draft-status">
                <ThinkingDots ariaLabel={status ?? 'Drafting'} />
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
            <p className="form-error" role="alert" data-testid="capture-error">
              {error}
            </p>
          )}

          {recording !== 'recording' && (
            <button
              type="button"
              className="btn btn-primary btn-block form-actions"
              data-testid="process-note"
              disabled={busy || !canProcess}
              onClick={() => {
                void process();
              }}
            >
              {busy ? 'Drafting…' : 'Process note'}
            </button>
          )}
        </>
      )}
    </Screen>
  );
}

/** Committed words, then the tail — with a space, never a stray one. */
function joinWords(head: string, tail: string): string {
  const a = head.trim();
  const b = tail.trim();
  return a === '' ? b : b === '' ? a : `${a} ${b}`;
}
