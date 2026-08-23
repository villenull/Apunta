import {
  KEEP_AUDIO_SETTING,
  MAX_VOCABULARY_TERMS,
  STT_VOCABULARY_SETTING,
  CLINICIAN_CREDENTIAL_SETTING,
  CLINICIAN_LICENCE_SETTING,
  CLINICIAN_NAME_SETTING,
  CLINICIAN_NPI_SETTING,
  DEFAULT_LOOKBACK_NOTES,
  DEFAULT_REVIEW_INTERVAL_DAYS,
  LOOKBACK_SETTING,
  REVIEW_INTERVAL_SETTING,
  type Settings as SettingsRecord,
} from '@apunta/shared';
import { useCallback, useState } from 'react';
import { Link } from 'react-router';

import { errorMessage, getSettings, listFormats, putSettings } from '../api/index.js';
import { PlusIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { useLoader } from '../hooks/useLoader.js';
import type { FormatDraft } from './formatDraft.js';

/**
 * `prototype/settings.html` — the note formats the practice writes against.
 *
 * "Edit" reuses the onboarding confirm screen as the format editor: it is
 * already the name-plus-sections form, and M6 grows it further.
 */
export function Settings(): React.JSX.Element {
  const loadFormats = useCallback((signal: AbortSignal) => listFormats(signal), []);
  const formats = useLoader(loadFormats);

  const newFormat: FormatDraft = { name: '', sections: [], returnTo: '/settings' };

  return (
    <Screen back={{ to: '/', label: 'Patients' }}>
      <h2 className="lede">Note formats</h2>

      <div className="card card-rows lede" data-testid="format-list">
        {formats.state.status === 'loading' && <p className="small state-note">Loading formats…</p>}
        {formats.state.status === 'error' && (
          <p className="small state-note error-state" role="alert">
            {formats.state.message}{' '}
            <button type="button" className="btn small btn-quick" onClick={formats.reload}>
              Try again
            </button>
          </p>
        )}
        {formats.state.status === 'ready' && formats.state.data.length === 0 && (
          <p className="small state-note">No note formats yet.</p>
        )}
        {formats.state.status === 'ready' &&
          formats.state.data.map((format) => (
            <div className="patient-row" key={format.id}>
              <div>
                <p className="format-name">{format.name}</p>
                <p className="small note-meta">{format.sections.join(', ')}</p>
              </div>
              <Link
                to="/onboarding/preview"
                className="small note-meta"
                state={
                  {
                    name: format.name,
                    sections: format.sections,
                    returnTo: '/settings',
                    formatId: format.id,
                    source: format.source,
                    instructions: format.instructions,
                  } satisfies FormatDraft
                }
              >
                Edit
              </Link>
            </div>
          ))}
      </div>

      <Link to="/onboarding/format" state={newFormat} className="btn btn-block">
        <PlusIcon className="icon icon-sm" />
        Add another format
      </Link>

      <ClinicianDetails />
      <RecordingSettings />
    </Screen>
  );
}

/**
 * What happens when she dictates: the words whisper should expect, and whether
 * the recording is kept.
 *
 * Both are here rather than buried because both are privacy-shaped. The
 * vocabulary list is the one knob that fixes Whisper's known weak spot —
 * medication names — and `keep_audio` decides whether the rawest form of a
 * session stays on the disk after the note exists.
 */
function RecordingSettings(): React.JSX.Element {
  const load = useCallback((signal: AbortSignal) => getSettings(signal), []);
  const settings = useLoader(load);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (settings.state.status === 'loading') return <p className="small state-note">Loading settings…</p>;
  if (settings.state.status === 'error') {
    return (
      <p className="small state-note error-state" role="alert">
        {settings.state.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={settings.reload}>
          Try again
        </button>
      </p>
    );
  }

  const current = settings.state.data as SettingsRecord;
  const stored = current[STT_VOCABULARY_SETTING];
  const vocabulary = Array.isArray(stored) ? stored.filter((term) => typeof term === 'string') : [];
  const keepAudio = current[KEEP_AUDIO_SETTING] === true;

  return (
    <form
      className="card card-rows lede"
      data-testid="recording-settings"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        // One term per line, blanks dropped: a textarea is what a list of
        // medication names is actually pasted into.
        const terms = String(form.get(STT_VOCABULARY_SETTING) ?? '')
          .split('\n')
          .map((term) => term.trim())
          .filter((term) => term !== '')
          .slice(0, MAX_VOCABULARY_TERMS);

        void (async () => {
          try {
            await putSettings({
              [STT_VOCABULARY_SETTING]: terms,
              [KEEP_AUDIO_SETTING]: form.get(KEEP_AUDIO_SETTING) === 'on',
            });
            setSaved(true);
            setError(null);
          } catch (thrown) {
            setError(errorMessage(thrown));
          }
        })();
      }}
    >
      <h2 className="lede">Recording</h2>

      <label className="label" htmlFor="stt-vocabulary">
        Words to listen for, one per line
      </label>
      <p className="small note-meta">
        Medication and clinical names are what transcription gets wrong most often. Anything listed here is
        given to the transcriber before it starts.
      </p>
      <textarea
        id="stt-vocabulary"
        name={STT_VOCABULARY_SETTING}
        rows={6}
        placeholder={'Vraylar\nLatuda\nlamotrigine'}
        defaultValue={vocabulary.join('\n')}
      />

      <label className="row gap-12 keep-audio">
        <input type="checkbox" name={KEEP_AUDIO_SETTING} defaultChecked={keepAudio} />
        <span>
          <span className="opt-title">Keep the recording after transcribing</span>
          <span className="small note-meta keep-audio-sub">
            Off by default. The note and the transcript are kept either way; the audio file is the rawest form
            of the session, and it is stored unencrypted in your data folder as a WAV.
          </span>
        </span>
      </label>

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" data-testid="save-recording">
        {saved ? 'Saved' : 'Save recording settings'}
      </button>
    </form>
  );
}

/**
 * Your details, and how much the AI reads.
 *
 * The identity fields are copied onto a treatment plan version at the moment
 * it is put in force, and never joined at render time: a superseded version
 * has to keep the credential you held when you wrote it. They are not a
 * signature — Apunta has no login, so a typed name is not attributable to
 * anyone (`docs/research/m9-plan-requirements-2026-08.md` §4).
 */
function ClinicianDetails(): React.JSX.Element {
  const load = useCallback((signal: AbortSignal) => getSettings(signal), []);
  const settings = useLoader(load);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (settings.state.status === 'loading') return <p className="small state-note">Loading settings…</p>;
  if (settings.state.status === 'error') {
    return (
      <p className="small state-note error-state" role="alert">
        {settings.state.message}{' '}
        <button type="button" className="btn small btn-quick" onClick={settings.reload}>
          Try again
        </button>
      </p>
    );
  }

  const current = settings.state.data;

  function value(key: string, fallback = ''): string {
    const stored = (current as SettingsRecord)[key];
    if (typeof stored === 'string') return stored;
    if (typeof stored === 'number') return String(stored);
    return fallback;
  }

  return (
    <form
      className="card card-rows lede"
      data-testid="clinician-settings"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const number = (key: string, fallback: number): number => {
          const parsed = Number(form.get(key));
          return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
        };

        void (async () => {
          try {
            await putSettings({
              [CLINICIAN_NAME_SETTING]: String(form.get(CLINICIAN_NAME_SETTING) ?? ''),
              [CLINICIAN_CREDENTIAL_SETTING]: String(form.get(CLINICIAN_CREDENTIAL_SETTING) ?? ''),
              [CLINICIAN_LICENCE_SETTING]: String(form.get(CLINICIAN_LICENCE_SETTING) ?? ''),
              [CLINICIAN_NPI_SETTING]: String(form.get(CLINICIAN_NPI_SETTING) ?? ''),
              [REVIEW_INTERVAL_SETTING]: number(REVIEW_INTERVAL_SETTING, DEFAULT_REVIEW_INTERVAL_DAYS),
              [LOOKBACK_SETTING]: number(LOOKBACK_SETTING, DEFAULT_LOOKBACK_NOTES),
            });
            setSaved(true);
            setError(null);
          } catch (thrown) {
            setError(errorMessage(thrown));
          }
        })();
      }}
    >
      <h2 className="lede">Your details</h2>
      <p className="small note-meta">
        Copied onto a treatment plan when you put a version in force, so an old version keeps the credential
        you held at the time.
      </p>

      <label className="label" htmlFor="clinician-name">
        Name, as you want it printed
      </label>
      <input id="clinician-name" name={CLINICIAN_NAME_SETTING} defaultValue={value(CLINICIAN_NAME_SETTING)} />

      <label className="label" htmlFor="clinician-credential">
        Credential
      </label>
      <input
        id="clinician-credential"
        name={CLINICIAN_CREDENTIAL_SETTING}
        placeholder="LCSW"
        defaultValue={value(CLINICIAN_CREDENTIAL_SETTING)}
      />

      <label className="label" htmlFor="clinician-licence">
        Licence number
      </label>
      <input
        id="clinician-licence"
        name={CLINICIAN_LICENCE_SETTING}
        defaultValue={value(CLINICIAN_LICENCE_SETTING)}
      />

      <label className="label" htmlFor="clinician-npi">
        NPI
      </label>
      <input id="clinician-npi" name={CLINICIAN_NPI_SETTING} defaultValue={value(CLINICIAN_NPI_SETTING)} />

      <label className="label" htmlFor="review-interval">
        Review a plan every (days)
      </label>
      <input
        id="review-interval"
        name={REVIEW_INTERVAL_SETTING}
        type="number"
        min={1}
        defaultValue={value(REVIEW_INTERVAL_SETTING, String(DEFAULT_REVIEW_INTERVAL_DAYS))}
      />
      <p className="small note-meta">
        Payers differ on this, so it is yours to set rather than something the app assumes.
      </p>

      <label className="label" htmlFor="lookback">
        Notes the AI reads for a briefing or a plan draft
      </label>
      <input
        id="lookback"
        name={LOOKBACK_SETTING}
        type="number"
        min={1}
        defaultValue={value(LOOKBACK_SETTING, String(DEFAULT_LOOKBACK_NOTES))}
      />

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary" data-testid="save-clinician">
        {saved ? 'Saved' : 'Save details'}
      </button>
    </form>
  );
}
