import {
  DEFAULT_IMPORT_CUTOFF,
  calendarDay,
  type ClaudeImportReport,
  type ImportNameSource,
  type ImportNoteSource,
  type ImportSkipReason,
} from '@apunta/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import { errorMessage, previewClaudeImport, runClaudeImport } from '../api/index.js';
import { ImportBatchList } from '../components/ImportBatchList.js';
import { ImportPreviewRow } from '../components/ImportPreviewRow.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useImportBatch } from '../hooks/useImportBatch.js';
import { useI18n, useReportWork, type Translate } from '../lib/i18n.js';

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

/**
 * Why a conversation was skipped, by the stored reason.
 *
 * The reason is an enum the server stored and is never translated
 * (Fixed decision 4): each is a key of its own and the sentence around it is
 * what a language has to translate. The same six reasons the server sends are
 * the six the screen shows, and none of the stored text is shown.
 */
function skipReason(t: Translate, reason: ImportSkipReason): string {
  switch (reason) {
    case 'before_cutoff':
      return t('import.skip.beforeCutoff');
    case 'single_session':
      return t('import.skip.singleSession');
    case 'not_clinical':
      return t('import.skip.notClinical');
    case 'no_name':
      return t('import.skip.noName');
    case 'ambiguous':
      return t('import.skip.ambiguous');
    case 'excluded':
      return t('import.skip.excluded');
  }
}

/** Where a matched name came from, by the stored source. */
function nameSource(t: Translate, source: ImportNameSource): string {
  switch (source) {
    case 'previous':
      return t('import.nameSource.previous');
    case 'list':
      return t('import.nameSource.list');
    case 'existing':
      return t('import.nameSource.existing');
    case 'title':
      return t('import.nameSource.title');
  }
}

export function Import(): React.JSX.Element {
  const { t } = useI18n();
  useDocumentTitle(t('doc.importClaude'));
  const [file, setFile] = useState<File | null>(null);
  const [cutoff, setCutoff] = useState(DEFAULT_IMPORT_CUTOFF);
  const [names, setNames] = useState('');
  const [source, setSource] = useState<ImportNoteSource>('assistant');
  const [summary, setSummary] = useState<ClaudeImportReport | null>(null);
  const [patientChoices, setPatientChoices] = useState<Readonly<Record<string, string | null>>>({});
  const [unticked, setUnticked] = useState<ReadonlySet<string>>(new Set());
  const [report, setReport] = useState<ClaudeImportReport | null>(null);
  const [busy, setBusy] = useState(false);
  // A preview or import in flight holds the Language control (C-LANG@1 rule 6).
  useReportWork(busy);
  const [error, setError] = useState<string | null>(null);
  const { batches, undone, undoing, reload, undo } = useImportBatch();

  async function check(): Promise<void> {
    if (file === null || busy) return;
    setBusy(true);
    setError(null);
    try {
      const next = await previewClaudeImport({ file, names, cutoff, source, exclude: [] });
      setSummary(next);
      setPatientChoices(
        Object.fromEntries(next.patients.map((patient) => [patient.key, patient.patient_id])),
      );
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
      const existingPatientIds = Object.fromEntries(
        (summary?.patients ?? [])
          .filter((patient) => !unticked.has(patient.key) && patient.patient_id !== null)
          .map((patient) => [
            patient.key,
            (Object.hasOwn(patientChoices, patient.key) ? patientChoices[patient.key] : patient.patient_id) ??
              null,
          ]),
      );
      setReport(
        await runClaudeImport({
          file,
          names,
          cutoff,
          source,
          exclude: [...unticked],
          ...(Object.keys(existingPatientIds).length > 0 ? { existingPatientIds } : {}),
        }),
      );
      reload();
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  async function handleUndo(id: string): Promise<void> {
    if (busy || undoing) return;
    setError(null);
    try {
      await undo(id);
    } catch (thrown) {
      setError(errorMessage(thrown));
    }
  }

  const errorLine = error !== null && (
    <p className="form-error" role="alert" data-testid="import-error">
      {error}
    </p>
  );

  if (report !== null) {
    return (
      <Screen back={{ to: '/settings', label: t('common.settings') }}>
        <h2 className="heading-tight">{undone === null ? t('import.doneTitle') : t('import.undoneTitle')}</h2>
        {undone !== null ? (
          <p className="lede" data-testid="import-undone">
            {t('import.undoneLine', {
              notes: t('count.note', { count: undone.notes_deleted }),
              patients: t('count.patient', { count: undone.patients_deleted }),
            })}
            {undone.notes_kept > 0 ? ` ${t('import.undoneNotesKept', { count: undone.notes_kept })}` : ''}
            {undone.patients_kept > 0
              ? ` ${t('import.undonePatientsKept', { count: undone.patients_kept })}`
              : ''}
          </p>
        ) : (
          <>
            <p className="lede" data-testid="import-done">
              {report.notes === 0
                ? t('import.nothingNew')
                : t('import.doneLine', {
                    notes: t('count.note', { count: report.notes }),
                    patients: t('count.patient', { count: report.patients.length }),
                    new:
                      report.patients_to_create > 0
                        ? t('import.doneNewCount', { count: report.patients_to_create })
                        : '',
                  })}
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
                {t('import.undo')}
              </button>
            )}
          </>
        )}
        <Skipped report={report} />
        {errorLine}
        <Link to="/" className="btn">
          {t('import.goToPatients')}
        </Link>
      </Screen>
    );
  }

  if (summary !== null) {
    const kept = summary.patients.filter((patient) => !unticked.has(patient.key));
    const chosenPatientId = (patient: ClaudeImportReport['patients'][number]): string | null =>
      (Object.hasOwn(patientChoices, patient.key) ? patientChoices[patient.key] : patient.patient_id) ?? null;
    const notes = kept.reduce((sum, patient) => sum + patient.notes, 0);
    const toCreate = kept.filter((patient) => chosenPatientId(patient) === null).length;
    const ambiguous = summary.skipped.filter((s) => s.reason === 'ambiguous').length;
    return (
      <Screen back={{ to: '/settings', label: t('common.settings') }}>
        <h2 className="heading-tight">{t('import.readyTitle')}</h2>
        <p className="lede" data-testid="import-summary">
          {t('import.summaryLine', {
            toCreate: t('count.patient', { count: toCreate }),
            notes: t('count.note', { count: notes }),
            patients: t('count.patient', { count: kept.length }),
            skipped: t('count.conversation', { count: summary.skipped.length }),
            ambiguous: ambiguous > 0 ? t('import.summaryAmbiguous', { count: ambiguous }) : '',
          })}
          {summary.already_imported > 0
            ? ` ${t('import.summaryAgain', { count: summary.already_imported })}`
            : ''}
        </p>
        <p className="small note-meta">
          {t('import.untickHelp')}
          {summary.totals.attachments > 0
            ? ` ${t('import.attachmentsNote', { count: summary.totals.attachments })}`
            : ''}
        </p>
        <div className="card card-rows lede">
          {summary.patients.length === 0 && (
            <p className="small muted">{t('import.noConversations', { cutoff: summary.cutoff })}</p>
          )}
          {summary.patients.map((patient) => (
            <div className="import-patient-row" key={patient.key} data-testid="import-patient">
              <ImportPreviewRow
                checked={!unticked.has(patient.key)}
                ariaLabel={t('import.patientLabel', { name: patient.name })}
                title={patient.name}
                excerpt={t('import.patientExcerpt', {
                  notes: t('count.note', { count: patient.notes }),
                  source: nameSource(t, patient.source),
                })}
                onChange={(checked) => {
                  const next = new Set(unticked);
                  if (checked) next.delete(patient.key);
                  else next.add(patient.key);
                  setUnticked(next);
                }}
              />
              {patient.patient_id !== null ? (
                <div className="import-patient-choice">
                  <span className="import-patient-choice-label">{t('import.whereTo')}</span>
                  <div className="import-patient-choice-options">
                    <label className="small">
                      <input
                        type="radio"
                        name={`import-choice-${patient.key}`}
                        checked={chosenPatientId(patient) === patient.patient_id}
                        onChange={() => {
                          setPatientChoices((current) => ({ ...current, [patient.key]: patient.patient_id }));
                        }}
                      />
                      {t('import.addTo', { name: patient.name })}
                    </label>
                    <label className="small">
                      <input
                        type="radio"
                        name={`import-choice-${patient.key}`}
                        checked={chosenPatientId(patient) === null}
                        onChange={() => {
                          setPatientChoices((current) => ({ ...current, [patient.key]: null }));
                        }}
                      />
                      {t('import.createNew')}
                    </label>
                  </div>
                </div>
              ) : (
                <span className="small muted">{t('import.createNewPatient')}</span>
              )}
            </div>
          ))}
          {summary.unmatched_names.length > 0 && (
            <p className="small note-meta" data-testid="import-unmatched">
              {t('import.notFound', {
                cutoff: summary.cutoff,
                names: summary.unmatched_names.join(', '),
              })}
            </p>
          )}
        </div>
        {errorLine}
        <div className="import-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={notes === 0 || busy}
            data-testid="import-run"
            onClick={() => {
              void run();
            }}
          >
            {busy
              ? t('common.importing')
              : t('import.runLabel', { notes: t('count.note', { count: notes }) })}
          </button>
          <button
            type="button"
            className="btn btn-quick"
            onClick={() => {
              setSummary(null);
            }}
          >
            {t('import.changeSettings')}
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen back={{ to: '/settings', label: t('common.settings') }}>
      <h2 className="heading-tight">{t('doc.importClaude')}</h2>
      <p className="muted lede">{t('import.claudeLede')}</p>
      <div className="card card-rows lede">
        <p className="small note-meta">{t('import.exportHelp')}</p>
        <input
          className="field-input"
          type="file"
          accept=".zip,.json,application/zip,application/json"
          data-testid="import-file"
          disabled={busy}
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
          }}
        />
        <label className="field-label">
          {t('import.patientsSince')}
          <input
            className="field-input"
            type="date"
            value={cutoff}
            data-testid="import-cutoff"
            onChange={(event) => {
              setCutoff(event.target.value);
            }}
          />
        </label>
        <label className="field-label">
          {t('import.namesHelp')}
          <textarea
            className="field-input"
            rows={5}
            value={names}
            data-testid="import-names"
            onChange={(event) => {
              setNames(event.target.value);
            }}
          />
        </label>
        <fieldset className="small note-meta">
          <legend>{t('import.eachNoteIs')}</legend>
          <label className="row gap-8">
            <input
              type="radio"
              name="import-source"
              checked={source === 'assistant'}
              onChange={() => {
                setSource('assistant');
              }}
            />
            {t('import.sourceAssistant')}
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
            {t('import.sourceHuman')}
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
          {busy ? t('import.readingExport') : t('import.check')}
        </button>
        <p className="small note-meta">{t('import.nothingWritten')}</p>
      </div>

      <ImportBatchList
        batches={batches}
        undone={undone}
        busy={busy || undoing}
        onUndo={(id) => void handleUndo(id)}
        testId="import-batches"
        showPatients
        formatDate={(iso) => formatBatchDate(t, iso)}
      />
    </Screen>
  );
}

function PatientTable({ report }: { report: ClaudeImportReport }): React.JSX.Element | null {
  const { t } = useI18n();
  if (report.patients.length === 0) return null;
  return (
    <div className="card card-rows lede" data-testid="import-report-patients">
      {report.patients.map((patient) => (
        <div className="row between" key={patient.key}>
          <span>
            {patient.name}
            {patient.name_guessed ? (
              <span className="small muted">{t('import.nameGuessedSuffix')}</span>
            ) : null}
          </span>
          <span className="small muted">{t('count.note', { count: patient.notes })}</span>
        </div>
      ))}
    </div>
  );
}

/** Reasons, dates and counts — never a title or a word of text. */
function Skipped({ report }: { report: ClaudeImportReport }): React.JSX.Element | null {
  const { t } = useI18n();
  if (report.skipped.length === 0) return null;
  const counts = new Map<ImportSkipReason, number>();
  for (const item of report.skipped) counts.set(item.reason, (counts.get(item.reason) ?? 0) + 1);
  return (
    <details className="card card-rows lede" data-testid="import-skipped">
      <summary className="small">
        {t('import.skippedSummary', {
          conversations: t('count.conversation', { count: report.skipped.length }),
          reasons: [...counts]
            .map(([reason, count]) => `${String(count)} ${skipReason(t, reason)}`)
            .join('; '),
        })}
      </summary>
      <table className="small">
        <thead>
          <tr>
            <th>{t('import.why')}</th>
            <th>{t('import.started')}</th>
            <th>{t('import.lastMessage')}</th>
            <th>{t('import.messages')}</th>
          </tr>
        </thead>
        <tbody>
          {report.skipped.map((item, index) => (
            <tr key={index}>
              <td>{skipReason(t, item.reason)}</td>
              <td>{day(t, item.recorded_at)}</td>
              <td>{day(t, item.last_at)}</td>
              <td>{item.messages}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}
/**
 * A batch's own instant, through the catalogue rather than
 * `formatInstantAsDate`'s `en-US` string (Fixed decision 3).
 */
function formatBatchDate(t: Translate, iso: string): string {
  return t('note.updatedAt', { at: iso });
}

/** A stored day as the app stores it, or the word for a conversation with none. */
function day(t: Translate, iso: string | null): string {
  return iso === null ? t('import.undated') : calendarDay(iso.slice(0, 10));
}
