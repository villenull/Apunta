import {
  DEFAULT_IMPORT_CUTOFF,
  type ClaudeImportReport,
  type ImportBatch,
  type ImportNameSource,
  type ImportNoteSource,
  type ImportSkipReason,
  type ImportUndoResponse,
} from '@apunta/shared';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';

import {
  errorMessage,
  listImportBatches,
  previewClaudeImport,
  runClaudeImport,
  undoImportBatch,
} from '../api/index.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

/**
 * Importing her Claude conversations (M11), automatically — the owner's
 * choice on 2026-09-21, over per-note review.
 *
 * Three steps on one screen: the export and three settings; a glance at who
 * would be imported, each patient with a tick she can take off; one button,
 * then a report with an undo. No note text is shown before the import — the
 * notes arrive as drafts, marked as imported, and she reads them where she
 * reads every other note. No title or text of a skipped conversation is
 * shown at all: a reason, a date and a count.
 */

const REASONS: Record<ImportSkipReason, string> = {
  before_cutoff: 'no activity since the cutoff',
  single_session: 'a single sitting, not a patient history',
  not_clinical: "Claude's replies never looked like a note",
  no_name: 'no patient name could be told with confidence',
  ambiguous: 'more than one name from your list',
  excluded: 'you unticked the patient',
};

const NAME_SOURCES: Record<ImportNameSource, string> = {
  previous: 'imported before',
  list: 'from your list',
  existing: 'already in Apunta',
  title: 'name guessed from the chat title — check',
};

export function Import(): React.JSX.Element {
  useDocumentTitle('Import from Claude');
  const [file, setFile] = useState<File | null>(null);
  const [cutoff, setCutoff] = useState(DEFAULT_IMPORT_CUTOFF);
  const [names, setNames] = useState('');
  const [source, setSource] = useState<ImportNoteSource>('assistant');
  const [summary, setSummary] = useState<ClaudeImportReport | null>(null);
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [report, setReport] = useState<ClaudeImportReport | null>(null);
  const [undone, setUndone] = useState<ImportUndoResponse | null>(null);
  const [batches, setBatches] = useState<ImportBatch[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function loadBatches(): void {
    listImportBatches()
      .then((result) => {
        setBatches(result.batches);
      })
      .catch(() => {
        setBatches([]);
      });
  }
  useEffect(loadBatches, []);

  async function check(): Promise<void> {
    if (file === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      setSummary(await previewClaudeImport({ file, names, cutoff, source, exclude: [] }));
      setUnticked(new Set());
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  async function run(): Promise<void> {
    if (file === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      setReport(await runClaudeImport({ file, names, cutoff, source, exclude: [...unticked] }));
      setUndone(null);
      loadBatches();
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  async function undo(id: string): Promise<void> {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      setUndone(await undoImportBatch(id));
      loadBatches();
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  const errorLine = error !== null && (
    <p className="form-error" role="alert" data-testid="import-error">
      {error}
    </p>
  );

  if (report !== null) {
    return (
      <Screen back={{ to: '/settings', label: 'Settings' }}>
        <h2 className="heading-tight">{undone === null ? 'Imported' : 'Import undone'}</h2>
        {undone !== null ? (
          <p className="lede" data-testid="import-undone">
            {plural(undone.notes_deleted, 'note')} and {plural(undone.patients_deleted, 'patient')} removed.
            {undone.notes_kept > 0
              ? ` ${plural(undone.notes_kept, 'note')} you had finalized ${undone.notes_kept === 1 ? 'was' : 'were'} kept.`
              : ''}
            {undone.patients_kept > 0
              ? ` ${plural(undone.patients_kept, 'patient')} with other work attached ${undone.patients_kept === 1 ? 'was' : 'were'} kept.`
              : ''}
          </p>
        ) : (
          <>
            <p className="lede" data-testid="import-done">
              {report.notes === 0
                ? 'Nothing new to import.'
                : `${plural(report.notes, 'note')} for ${plural(report.patients.length, 'patient')}` +
                  (report.patients_to_create > 0 ? ` (${String(report.patients_to_create)} new)` : '') +
                  '. Each is a draft, dated when you talked to Claude, marked as imported.'}
            </p>
            <PatientTable report={report} />
            {report.batch_id !== null && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                data-testid="import-undo"
                onClick={() => {
                  void undo(report.batch_id as string);
                }}
              >
                Undo this import
              </button>
            )}
          </>
        )}
        <Skipped report={report} />
        {errorLine}
        <Link to="/" className="btn">
          Go to patients
        </Link>
      </Screen>
    );
  }

  if (summary !== null) {
    const kept = summary.patients.filter((patient) => !unticked.has(patient.key));
    const notes = kept.reduce((sum, patient) => sum + patient.notes, 0);
    const toCreate = kept.filter((patient) => patient.patient_id === null).length;
    const ambiguous = summary.skipped.filter((s) => s.reason === 'ambiguous').length;
    return (
      <Screen back={{ to: '/settings', label: 'Settings' }}>
        <h2 className="heading-tight">Ready to import</h2>
        <p className="lede" data-testid="import-summary">
          {plural(toCreate, 'patient')} to create, {plural(notes, 'note')} across{' '}
          {plural(kept.length, 'patient')}. {plural(summary.skipped.length, 'conversation')} skipped
          {ambiguous > 0 ? `, ${String(ambiguous)} of them as ambiguous` : ''}.
          {summary.already_imported > 0
            ? ` ${plural(summary.already_imported, 'session')} already imported earlier will not be imported again.`
            : ''}
        </p>
        <p className="small note-meta">
          Untick anyone who is not a patient. Every note arrives as a draft marked as imported, and this
          import can be undone in one click afterwards.
          {summary.totals.attachments > 0
            ? ` ${plural(summary.totals.attachments, 'attached file')} in these sessions ${summary.totals.attachments === 1 ? 'is' : 'are'} not imported — they stay in Claude.`
            : ''}
        </p>
        <div className="card card-rows lede">
          {summary.patients.length === 0 && (
            <p className="small muted">No patient conversations were found since {summary.cutoff}.</p>
          )}
          {summary.patients.map((patient) => (
            <label className="row gap-8" key={patient.key} data-testid="import-patient">
              <input
                type="checkbox"
                checked={!unticked.has(patient.key)}
                aria-label={`Import ${patient.name}`}
                onChange={(event) => {
                  const next = new Set(unticked);
                  if (event.target.checked) next.delete(patient.key);
                  else next.add(patient.key);
                  setUnticked(next);
                }}
              />
              <strong>{patient.name}</strong>
              <span className="small muted">
                {plural(patient.notes, 'note')} · {NAME_SOURCES[patient.source]}
              </span>
            </label>
          ))}
          {summary.unmatched_names.length > 0 && (
            <p className="small note-meta" data-testid="import-unmatched">
              Not found since {summary.cutoff}: {summary.unmatched_names.join(', ')}.
            </p>
          )}
        </div>
        {errorLine}
        <button
          type="button"
          className="btn btn-block"
          disabled={notes === 0 || busy}
          data-testid="import-run"
          onClick={() => {
            void run();
          }}
        >
          {busy ? 'Importing…' : `Import ${plural(notes, 'note')}`}
        </button>
        <button
          type="button"
          className="btn btn-quick small"
          onClick={() => {
            setSummary(null);
          }}
        >
          Change the settings
        </button>
      </Screen>
    );
  }

  return (
    <Screen back={{ to: '/settings', label: 'Settings' }}>
      <h2 className="heading-tight">Import from Claude</h2>
      <p className="muted lede">
        Bring the notes you drafted with Claude into Apunta: every patient you have seen since the cutoff,
        with their whole history, one draft per session.
      </p>
      <div className="card card-rows lede">
        <p className="small note-meta">
          In Claude, open Settings → Privacy → Export data. The export arrives by email as a zip. Choose that
          file here, or the conversations.json inside it. It is read on this Mac and kept nowhere.
        </p>
        <input
          type="file"
          accept=".zip,.json,application/zip,application/json"
          data-testid="import-file"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
          }}
        />
        <label className="small note-meta">
          Patients seen since{' '}
          <input
            type="date"
            value={cutoff}
            data-testid="import-cutoff"
            onChange={(event) => {
              setCutoff(event.target.value);
            }}
          />
        </label>
        <label className="small note-meta">
          Your patients&rsquo; names, one per line (optional — they help spell and match names; anyone not
          listed is still found from the chat title)
          <textarea
            rows={5}
            value={names}
            data-testid="import-names"
            onChange={(event) => {
              setNames(event.target.value);
            }}
          />
        </label>
        <fieldset className="small note-meta">
          <legend>Each note is</legend>
          <label className="row gap-8">
            <input
              type="radio"
              name="import-source"
              checked={source === 'assistant'}
              onChange={() => {
                setSource('assistant');
              }}
            />
            Claude&rsquo;s last reply in each session (the note you ended up with)
          </label>
          <label className="row gap-8">
            <input
              type="radio"
              name="import-source"
              checked={source === 'human'}
              onChange={() => {
                setSource('human');
              }}
            />
            Your own messages in each session
          </label>
        </fieldset>
        {errorLine}
        <button
          type="button"
          className="btn btn-block"
          disabled={file === null || cutoff === '' || busy}
          data-testid="import-check"
          onClick={() => {
            void check();
          }}
        >
          {busy ? 'Reading the export…' : 'Check what will be imported'}
        </button>
        <p className="small note-meta">Nothing is written until you press Import on the next screen.</p>
      </div>

      {batches.length > 0 && (
        <div className="card card-rows lede" data-testid="import-batches">
          <h3 className="heading-tight">Earlier imports</h3>
          {undone !== null && (
            <p className="small note-meta" data-testid="import-undone">
              Undone: {plural(undone.notes_deleted, 'note')} and {plural(undone.patients_deleted, 'patient')}{' '}
              removed.
            </p>
          )}
          {batches.map((batch) => (
            <div className="row between" key={batch.id}>
              <span className="small">
                {batch.created_at.slice(0, 16).replace('T', ' ')} — {plural(batch.notes, 'note')}
                {batch.patients > 0 ? `, ${plural(batch.patients, 'new patient')}` : ''}
              </span>
              <button
                type="button"
                className="btn small btn-quick"
                disabled={busy}
                onClick={() => {
                  void undo(batch.id);
                }}
              >
                Undo
              </button>
            </div>
          ))}
        </div>
      )}
    </Screen>
  );
}

function PatientTable({ report }: { report: ClaudeImportReport }): React.JSX.Element | null {
  if (report.patients.length === 0) return null;
  return (
    <div className="card card-rows lede" data-testid="import-report-patients">
      {report.patients.map((patient) => (
        <div className="row between" key={patient.key}>
          <span>
            {patient.name}
            {patient.name_guessed ? <span className="small muted"> · name guessed — check</span> : null}
          </span>
          <span className="small muted">{plural(patient.notes, 'note')}</span>
        </div>
      ))}
    </div>
  );
}

/** Reasons, dates and counts — never a title or a word of text. */
function Skipped({ report }: { report: ClaudeImportReport }): React.JSX.Element | null {
  if (report.skipped.length === 0) return null;
  const counts = new Map<ImportSkipReason, number>();
  for (const item of report.skipped) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  return (
    <details className="card card-rows lede" data-testid="import-skipped">
      <summary className="small">
        {plural(report.skipped.length, 'conversation')} skipped:{' '}
        {[...counts].map(([reason, count]) => `${String(count)} ${REASONS[reason]}`).join('; ')}
      </summary>
      <table className="small">
        <thead>
          <tr>
            <th>Why</th>
            <th>Started</th>
            <th>Last message</th>
            <th>Messages</th>
          </tr>
        </thead>
        <tbody>
          {report.skipped.map((item, index) => (
            <tr key={index}>
              <td>{REASONS[item.reason]}</td>
              <td>{day(item.recorded_at)}</td>
              <td>{day(item.last_at)}</td>
              <td>{item.messages}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function plural(count: number, word: string): string {
  return `${String(count)} ${word}${count === 1 ? '' : 's'}`;
}

function day(iso: string | null): string {
  return iso === null ? 'undated' : iso.slice(0, 10);
}
