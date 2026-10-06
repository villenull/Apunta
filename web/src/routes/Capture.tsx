import { WARN_RECORDING_SECONDS } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Link,
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  type Blocker,
  type BlockerFunction,
  type Location,
} from 'react-router';

import {
  errorMessage,
  generateNote,
  getPatient,
  listFormats,
  preloadDraftingModel,
  transcribeRecording,
  type GenerateHandlers,
} from '../api/index.js';
import { CloseIcon, KeyboardIcon, MicIcon } from '../components/icons.js';
import { ConfirmDialog } from '../components/ConfirmDialog.js';
import { Dialog } from '../components/Dialog.js';
import { LiveRecording } from '../components/LiveRecording.js';
import { SpellLayer } from '../components/SpellLayer.js';
import { ThinkingDots } from '../components/ThinkingDots.js';
import { useLoader } from '../hooks/useLoader.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useLiveRecording } from '../hooks/useLiveRecording.js';
import { useI18n, useReportWork } from '../lib/i18n.js';
import { setEditorUnpersisted, setRecordingActive } from '../lib/maintenance.js';
import { formatTimer } from '../lib/recorder.js';
import '../styles/capture-modal.css';

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
 * And "Create draft" calls the local model: `/api/generate` for typed notes,
 * `/api/transcribe` when there is a recording. The second is one request that
 * transcribes and then drafts, so the screen shows one continuous progression
 * rather than making her wait twice.
 *
 * The recording itself is 16 kHz mono WAV written in the tab
 * (`lib/recorder.ts`). The Web Speech API is never involved — it can send
 * audio to Google, which is the hardest rule in this project.
 *
 * It is a **window over the practice, not a screen of its own** (owner,
 * 2026-10-05), the way adding a patient already is: the workspace stays
 * mounted behind, dimmed and blurred, and the way out is the × rather than a
 * Back link. That is why this route renders a `Dialog` and nothing else —
 * `AppRoutes` owns the background half (`<Routes location={background}>`) and
 * hands it the `backgroundLocation` every entry point puts in the navigation
 * state. Direct `/capture/:id` still works: `AppRoutes` synthesises a `/`
 * background for it, and `close()` below falls back to the patient's own
 * workspace rather than guessing.
 */

export function Capture(): React.JSX.Element {
  const dirtyRef = useRef(false);
  const reportDirty = useCallback((dirty: boolean) => {
    dirtyRef.current = dirty;
  }, []);
  const shouldBlock = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      dirtyRef.current &&
      (currentLocation.pathname !== nextLocation.pathname ||
        currentLocation.search !== nextLocation.search ||
        currentLocation.hash !== nextLocation.hash),
    [],
  );
  const blocker = useBlocker(shouldBlock);
  return <CaptureScreen blocker={blocker} reportDirty={reportDirty} />;
}

interface CaptureScreenProps {
  readonly blocker: Blocker;
  readonly reportDirty: (dirty: boolean) => void;
}

/**
 * The route this window was opened over, if it was opened from inside the app.
 *
 * Every entry point (`NotesColumn`, `PatientWelcome`, `HomeLauncher`) puts a
 * `Location`-shaped `backgroundLocation` in the navigation state, and
 * `AppRoutes` reads it to keep the workspace mounted behind. This reader is the
 * close half of that contract: it accepts only something that actually looks
 * like a route, so a malformed state cannot send the × out of the app, and it
 * rejects another capture route — a background that is itself a capture means
 * the entry point handed over nothing worth going back to.
 */
function readBackgroundLocation(state: unknown): Location | null {
  if (typeof state !== 'object' || state === null) return null;
  const candidate = (state as { readonly backgroundLocation?: unknown }).backgroundLocation;
  if (typeof candidate !== 'object' || candidate === null) return null;
  const { pathname, search, hash } = candidate as Partial<Location>;
  if (typeof pathname !== 'string' || pathname.length === 0) return null;
  if (pathname.startsWith('/capture/')) return null;
  return {
    pathname,
    search: typeof search === 'string' ? search : '',
    hash: typeof hash === 'string' ? hash : '',
    state: null,
    key: '',
  };
}

function CaptureScreen({ blocker, reportDirty }: CaptureScreenProps): React.JSX.Element {
  const { t } = useI18n();
  useDocumentTitle(t('doc.newNote'));
  const { patientId = '' } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const background = readBackgroundLocation(location.state);
  /** The editor, which is where the caret belongs when the window opens. */
  const summaryRef = useRef<HTMLTextAreaElement>(null);

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

  const [notice, setNotice] = useState<string | null>(null);
  const unfinishedRef = useRef(false);
  /** What the dirty effect above last published, so unmount can retract it. */
  const publishedRef = useRef({ recording: false, editor: false });
  /**
   * The finished WAV, held until the note is saved.
   *
   * This is what makes "Try again" mean anything: if transcription fails
   * because whisper is not installed, or the draft fails because Ollama is
   * not running, she retries the recording she already made rather than
   * speaking the session again.
   */
  const [wav, setWav] = useState<Blob | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  /**
   * The live half of the recording (owner-proxy, 2026-09-01): provisional
   * words, and a level that moves the moment she speaks. Shared with the
   * refine chat's microphone since 2026-09-07; `useLiveRecording` owns the
   * recorder, this screen owns what becomes of the WAV.
   */
  const live = useLiveRecording({
    onError: (message, salvage) => {
      setError(message);
      if (salvage !== null && salvage !== undefined) setWav(salvage);
    },
    onNotice: setNotice,
    warnAfterSeconds: WARN_RECORDING_SECONDS,
    onLimit: () => {
      void stopRecording();
    },
  });
  const recording = live.phase;
  const seconds = live.seconds;
  // Recording, transcribing and drafting all hold the Language control (C-LANG@1 rule 6).
  useReportWork(busy || recording !== 'idle');

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

  // Leaving the screen mid-draft must stop the model; the microphone is the
  // hook's to close.
  //
  // The window can now close over a workspace that stays mounted, and those two
  // published flags describe *this* window's quiescence. Retracting only what
  // this window published — tracked in `publishedRef` — keeps a modal closing
  // over a workspace that is merely sitting there from claiming a recording or
  // unsaved text that the note editor behind it still owns.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      const published = publishedRef.current;
      if (published.recording) setRecordingActive(false);
      if (published.editor) setEditorUnpersisted(false);
    },
    [],
  );
  const unfinished = text.trim().length > 0 || recording !== 'idle' || wav !== null || busy;
  unfinishedRef.current = unfinished;

  useEffect(() => {
    reportDirty(unfinished);
    // C-UPD@1's quiescence: the microphone is in the browser, so a recording is
    // the one blocker the server has no route to register. Published through the
    // maintenance reporter's own flag, not through `useReportWork` — that
    // counter belongs to the Language control and has one reader.
    publishedRef.current = { recording: recording !== 'idle', editor: unfinished };
    setRecordingActive(recording !== 'idle');
    setEditorUnpersisted(unfinished);
  }, [recording, reportDirty, unfinished]);

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent): void {
      if (!unfinishedRef.current) return;
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, []);

  function abandonCapture(): void {
    // This is called only after the user chooses Discard in the leave dialog.
    unfinishedRef.current = false;
    live.cancel();
    abortRef.current?.abort();
    abortRef.current = null;
    setWav(null);
    setBusy(false);
  }

  function confirmLeave(): void {
    if (blocker.state !== 'blocked') return;
    abandonCapture();
    blocker.proceed();
  }

  function stayOnCapture(): void {
    if (blocker.state === 'blocked') blocker.reset();
  }

  /**
   * Out through the × or Escape, which are the same door.
   *
   * Opened from inside the app, that is one step back in *her* history: the
   * capture entry has to be popped, not pushed over, or Back reopens it. So it
   * needs both halves to be true — a validated `backgroundLocation` from the
   * entry point, and `history.state.idx` showing there is in-app history to go
   * back to (react-router's own depth counter, as `AddPatient` reads it). A URL
   * typed straight into the address bar has neither, even though the browser's
   * own back stack is full of other sites, and it leaves for the patient's
   * workspace with a replace so nothing of this window is left behind.
   *
   * The blocker is not bypassed anywhere in here: this is an ordinary
   * navigation, so unfinished work still raises the leave confirmation.
   */
  function close(): void {
    const depth = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (background !== null && depth > 0) {
      void navigate(-1);
      return;
    }
    void navigate(`/?patient=${patientId}`, { replace: true });
  }

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
    if (busy || wav !== null || recording !== 'idle') return;
    setError(null);
    setNotice(null);
    const started = await live.start();
    if (started) preloadDraftingModel();
  }

  async function stopRecording(): Promise<void> {
    const recorded = await live.stop();
    if (recorded === null) return;
    setWav(recorded);
    await process(recorded);
  }

  function discardRecording(): void {
    live.cancel();
    setWav(null);
    setNotice(null);
    setError(null);
  }

  /** Send whatever she has — the recording, the typed notes, or both. */
  async function process(recorded: Blob | null = wav): Promise<void> {
    const { text: notes, formatId: chosen, busy: running } = latest.current;
    const typed = notes.trim();
    if (running || chosen === '' || (recorded === null && typed.length === 0)) return;

    setBusy(true);
    setError(null);
    setDraft({});
    setStatus(recorded === null ? t('common.thinkingBusy') : t('dictation.transcribingBusy'));
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
                  setStatus(event.message);
                },
              },
              controller.signal,
            );
      unfinishedRef.current = false;
      reportDirty(false);
      await navigate(`/?patient=${patientId}&note=${note.id}`, { replace: true });
    } catch (thrown) {
      setError(errorMessage(thrown));
      setStatus(null);
      setBusy(false);
    } finally {
      abortRef.current = null;
    }
  }

  const heading =
    patient.state.status === 'ready'
      ? t('capture.newNoteFor', { name: patient.state.data.name })
      : t('capture.newNote');
  const sections = format?.sections ?? [];
  const drafting = busy && Object.keys(draft).length > 0;
  const canProcess = wav !== null || text.trim().length > 0;

  // A patient the server no longer knows — deleted from another tab, most
  // likely — gets no microphone: a recording made here could never be saved
  // (seen live 2026-09-04, a full dictation lost to a stale tab). It is said
  // inside this same window rather than on a screen of its own, so a patient
  // who has gone away cannot put a second full page over the practice.
  const missingPatientNotice =
    patient.state.status === 'error' ? (
      <p className="form-error" role="alert" data-testid="capture-missing-patient">
        {patient.state.message} {t('capture.missingPatient')}{' '}
        <Link to="/">{t('capture.backToPatients')}</Link>
      </p>
    ) : null;

  return (
    <>
      {/*
        The one modal surface. `open={false}` while the leave confirmation is
        up is what keeps Escape from having two handlers: `Dialog` ignores keys
        and `aria-hidden`s its panel while closed, and the confirmation below is
        a sibling of this panel rather than a child of it, so it is never inside
        the hidden ancestor.
      */}
      <Dialog
        title={heading}
        onClose={close}
        open={blocker.state !== 'blocked'}
        showTitle={false}
        className="modal card capture-modal"
        testId="capture-modal"
        backdropTestId="capture-backdrop"
        initialFocusRef={summaryRef}
      >
        <div className="capture-modal-head">
          <h2 className="heading-tight capture-heading" data-testid="capture-heading">
            {heading}
          </h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('capture.closeLabel')}
            data-testid="capture-close"
            onClick={close}
          >
            <CloseIcon className="icon icon-sm" />
          </button>
        </div>

        {missingPatientNotice ?? (
          <>
            <div className="field capture-format lede">
              <label className="label" htmlFor="note-format">
                {t('capture.formatLabel')}
              </label>
              {/* The wrapper is what carries the chevron: a `<select>` takes no
                  pseudo-element, and the native arrow cannot be inset. */}
              <div className="capture-select">
                <select
                  id="note-format"
                  value={formatId}
                  disabled={available.length === 0 || busy}
                  onChange={(event) => {
                    setChosenFormatId(event.target.value);
                  }}
                >
                  {formats.state.status === 'loading' && <option value="">{t('common.loading')}</option>}
                  {available.map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {formats.state.status === 'error' && (
              <p className="form-error" role="alert">
                {formats.state.message}{' '}
                <button type="button" className="btn small btn-quick" onClick={formats.reload}>
                  {t('common.tryAgain')}
                </button>
              </p>
            )}

            {formats.state.status === 'ready' && available.length === 0 ? (
              <p className="muted">
                {t('capture.noFormats')} <Link to="/onboarding/format">{t('capture.addOneFirst')}</Link>{' '}
                {t('capture.noFormatsTail')}
              </p>
            ) : (
              <>
                {/* Split by the `<strong>` the screen needs, so two keys rather than
              one with the emphasis deleted; the English reads as it did. */}
                <p className="capture-source" data-testid="capture-source">
                  <strong>{t('capture.sourceRecording')}</strong> {t('capture.sourceTail')}
                </p>

                <div className="stack">
                  {recording === 'recording' ? (
                    <LiveRecording
                      level={live.level}
                      seconds={seconds}
                      previewCommitted={live.committedPreview}
                      previewTentative={live.tentativePreview}
                      previewNote={t('dictation.previewNoteCapture')}
                    >
                      <button
                        type="button"
                        className="btn btn-primary"
                        data-testid="record-stop"
                        onClick={() => {
                          void stopRecording();
                        }}
                      >
                        {t('capture.stopAndDraft')}
                      </button>
                    </LiveRecording>
                  ) : recording === 'starting' ? (
                    <div className="record-ui capture-stage" data-testid="record-stage">
                      <p className="capture-stage-status" role="status">
                        {t('capture.openingMicrophone')}
                      </p>
                      <p className="small muted">{t('capture.allowMicrophone')}</p>
                    </div>
                  ) : busy ? (
                    <div className="capture-stage draft-progress" data-testid="draft-progress">
                      <p
                        className="capture-stage-status draft-status"
                        role="status"
                        data-testid="draft-status"
                      >
                        <span data-testid="draft-status-label">{status ?? t('capture.preparingDraft')}</span>{' '}
                        <ThinkingDots ariaLabel={status ?? t('capture.preparingDraftShort')} />
                      </p>
                      {drafting && (
                        <div className="draft-preview capture-stage-preview" data-testid="draft-preview">
                          {sections.map((section) => (
                            <p key={section}>
                              <span className="draft-section">{section}:</span> {draft[section] ?? ''}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : wav !== null ? (
                    <div className="record-ui capture-stage" data-testid="record-done">
                      <p className="capture-stage-status" role="status">
                        {t('capture.recordingReady')}
                      </p>
                      {/* `Mac` is a keep-as-is token inside a translatable sentence, so
                    it is written out verbatim in both catalogue values, never
                    allowlisted and never split off into a key (Fixed
                    decision 2). */}
                      <p className="muted record-label">
                        {t('capture.recorded', { timer: formatTimer(seconds) })}
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
                          {t('capture.draftFromRecording')}
                        </button>
                        <button
                          type="button"
                          className="btn"
                          data-testid="record-discard"
                          onClick={discardRecording}
                        >
                          {t('capture.discardRecording')}
                        </button>
                      </div>
                    </div>
                  ) : !busy ? (
                    <button
                      type="button"
                      className="btn-option capture-source-option"
                      data-testid="record-start"
                      onClick={() => {
                        void startRecording();
                      }}
                    >
                      <MicIcon />
                      <span className="capture-source-label">{t('capture.recordAudio')}</span>
                    </button>
                  ) : null}

                  <div className="capture-typed" data-testid="type-ui">
                    <div className="row gap-12 capture-typed-head">
                      <KeyboardIcon />
                      <span className="capture-source-label">{t('capture.typeNotes')}</span>
                    </div>
                    <SpellLayer
                      as="textarea"
                      // `Dialog`'s `initialFocusRef` is what puts the caret here: as a
                      // window the × precedes this field in the panel, and `Dialog`
                      // focuses the first focusable it finds unless it is told.
                      ref={summaryRef}
                      className="capture-editor"
                      placeholder={t('capture.summaryPlaceholder')}
                      aria-label={t('capture.summaryLabel')}
                      data-testid="summary-input"
                      value={text}
                      readOnly={busy}
                      onChange={setText}
                      allowWords={patient.state.status === 'ready' ? [patient.state.data.name] : []}
                    />
                  </div>
                </div>

                {notice !== null && (
                  <p className="small muted" role="status" data-testid="record-notice">
                    {notice}
                  </p>
                )}

                {error !== null && (
                  <p className="form-error" role="alert" data-testid="capture-error">
                    {error}
                  </p>
                )}

                {recording === 'idle' && !busy && (
                  <button
                    type="button"
                    className="btn btn-primary btn-block form-actions"
                    data-testid="process-note"
                    disabled={!canProcess}
                    onClick={() => {
                      void process();
                    }}
                  >
                    {t('capture.createDraft')}
                  </button>
                )}
              </>
            )}
          </>
        )}
      </Dialog>

      {blocker.state === 'blocked' && (
        <ConfirmDialog
          title={t('capture.leaveTitle')}
          cancelLabel={t('capture.stay')}
          confirmLabel={t('capture.discardAndLeave')}
          onCancel={stayOnCapture}
          onConfirm={confirmLeave}
          body={
            <>
              <p>{t('capture.leaveBodyFirst')}</p>
              <p>{t('capture.leaveBodySecond')}</p>
            </>
          }
        />
      )}
    </>
  );
}
