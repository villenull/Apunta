import {
  type HalaxyImportResponse,
  type HalaxyPreviewPatient,
  type HalaxyPreviewResponse,
} from '@apunta/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { errorMessage, previewHalaxyImport, runHalaxyImport } from '../api/index.js';
import { ImportBatchList } from '../components/ImportBatchList.js';
import { ImportPreviewRow } from '../components/ImportPreviewRow.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useImportBatch } from '../hooks/useImportBatch.js';
import { useI18n, useReportWork, type Translate } from '../lib/i18n.js';
/**
 * Halaxy's practitioner export is one text PDF per patient. The preview is
 * deliberately reviewable: names can be corrected and individual sessions
 * can be left out before one undoable batch is written.
 */
export function HalaxyImport(): React.JSX.Element {
  const { t } = useI18n();
  useDocumentTitle(t('doc.importHalaxy'));
  const [files, setFiles] = useState<readonly File[]>([]);
  const [summary, setSummary] = useState<HalaxyPreviewResponse | null>(null);
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const [patientChoices, setPatientChoices] = useState<Readonly<Record<string, string | null>>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [report, setReport] = useState<HalaxyImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
  // A preview or import in flight holds the Language control (C-LANG@1 rule 6).
  useReportWork(busy);
  const [error, setError] = useState<string | null>(null);
  const importBatch = useImportBatch();
  const { batches, undone, undoing, reload, undo } = importBatch;

  async function check(): Promise<void> {
    if (files.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await previewHalaxyImport(files);
      const nextNames: Record<string, string> = {};
      const nextChoices: Record<string, string | null> = {};
      const nextSelected = new Set<string>();
      for (const patient of response.patients) {
        nextNames[patient.fileName] = patient.patientName;
        if (patient.existingPatients.length === 1)
          nextChoices[patient.fileName] = patient.existingPatients[0]!.id;
        for (const note of patient.notes) nextSelected.add(noteKey(patient.fileName, note.key));
      }
      setSummary(response);
      setNames(nextNames);
      setPatientChoices(nextChoices);
      setSelected(nextSelected);
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  async function run(): Promise<void> {
    if (summary === null || busy) return;
    setBusy(true);
    try {
      const patients = summary.patients.flatMap((patient) => {
        const notes = patient.notes
          .filter((note) => selected.has(noteKey(patient.fileName, note.key)))
          .map(({ date, title, text }) => ({ date, ...(title === undefined ? {} : { title }), text }));
        if (notes.length === 0) return [];
        return [
          {
            fileName: patient.fileName,
            patientName: names[patient.fileName] ?? patient.patientName,
            ...(Object.hasOwn(patientChoices, patient.fileName)
              ? { existingPatientId: patientChoices[patient.fileName] ?? null }
              : {}),
            notes,
          },
        ];
      });
      const response = await runHalaxyImport({ patients });
      setReport(response);
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
    <p className="form-error" role="alert" data-testid="halaxy-error">
      {error}
    </p>
  );

  if (report !== null) {
    return (
      <Screen back={{ to: '/settings', label: t('common.settings') }}>
        <h2 className="heading-tight">{undone === null ? t('import.doneTitle') : t('import.undoneTitle')}</h2>
        {undone !== null ? (
          <p className="lede" data-testid="halaxy-undone">
            {t('import.undoneLine', {
              notes: t('count.note', { count: undone.notes_deleted }),
              patients: t('count.patient', { count: undone.patients_deleted }),
            })}
            {undone.notes_kept > 0 ? ` ${t('halaxy.undoneNotesKept', { count: undone.notes_kept })}` : ''}
          </p>
        ) : (
          <>
            <p className="lede" data-testid="halaxy-done">
              {report.notes === 0
                ? t('import.nothingNew')
                : t('halaxy.doneLine', {
                    notes: t('count.note', { count: report.notes }),
                    patients: t('count.patient', { count: report.patients.length }),
                  })}
            </p>
            {report.patients.length > 0 && (
              <div className="card card-rows lede" data-testid="halaxy-report-patients">
                {report.patients.map((patient) => (
                  <div className="row between" key={patient.fileName}>
                    <span>{patient.patientName}</span>
                    <span className="small muted">{t('count.note', { count: patient.notes })}</span>
                  </div>
                ))}
              </div>
            )}
            {report.batch_id !== null && (
              <button
                type="button"
                className="btn"
                disabled={busy}
                data-testid="halaxy-undo"
                onClick={() => {
                  void undo(report.batch_id as string);
                }}
              >
                {t('import.undo')}
              </button>
            )}
          </>
        )}
        {errorLine}
        <Link to="/" className="btn">
          {t('import.goToPatients')}
        </Link>
      </Screen>
    );
  }

  if (summary !== null) {
    const notes = summary.patients.reduce(
      (total, patient) =>
        total + patient.notes.filter((note) => selected.has(noteKey(patient.fileName, note.key))).length,
      0,
    );
    return (
      <Screen back={{ to: '/settings', label: t('common.settings') }}>
        <h2 className="heading-tight">{t('import.readyTitle')}</h2>
        <p className="lede" data-testid="halaxy-summary">
          {t('halaxy.summaryLine', {
            notes: t('count.note', { count: notes }),
            patients: t('count.patient', { count: summary.patients.length }),
          })}
        </p>
        <p className="small note-meta">{t('halaxy.untickHelp')}</p>
        {summary.patients.map((patient) => (
          <PatientReview
            key={patient.fileName}
            patient={patient}
            name={names[patient.fileName] ?? patient.patientName}
            choice={patientChoices[patient.fileName]}
            selected={selected}
            onName={(name) => {
              setNames((current) => ({ ...current, [patient.fileName]: name }));
              setPatientChoices((current) => {
                const next = { ...current };
                delete next[patient.fileName];
                return next;
              });
            }}
            onChoice={(choice) => {
              setPatientChoices((current) => ({ ...current, [patient.fileName]: choice }));
            }}
            onToggle={(key, checked) => {
              const next = new Set(selected);
              if (checked) next.add(key);
              else next.delete(key);
              setSelected(next);
            }}
          />
        ))}
        <Rejected response={summary} />
        {errorLine}
        <div className="import-actions">
          <button
            type="button"
            className="btn btn-primary"
            disabled={notes === 0 || busy}
            data-testid="halaxy-run"
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
            {t('import.chooseDifferent')}
          </button>
        </div>
      </Screen>
    );
  }

  return (
    <Screen back={{ to: '/', label: t('common.patients') }}>
      <h2 className="heading-tight">{t('doc.importHalaxy')}</h2>
      <p className="muted lede">{t('halaxy.lede')}</p>
      {/* The other importer, since the row in "More" that brought her here
          serves both and this screen used to be linked only from Settings. */}
      <p className="small">
        <Link to="/import" data-testid="import-switch-claude">
          {t('import.switchToClaude')}
        </Link>
      </p>
      <div className="card card-rows lede">
        <p className="small note-meta">{t('halaxy.localOnly')}</p>
        <input
          type="file"
          accept=".pdf,application/pdf"
          multiple
          data-testid="halaxy-files"
          disabled={busy}
          onChange={(event) => {
            setFiles(Array.from(event.target.files ?? []));
            setSummary(null);
            setError(null);
          }}
        />
        {errorLine}
        <button
          type="button"
          className="btn btn-block"
          disabled={files.length === 0 || busy}
          data-testid="halaxy-check"
          onClick={() => {
            void check();
          }}
        >
          {busy ? t('halaxy.readingPdfs') : t('import.check')}
        </button>
        <p className="small note-meta">{t('import.nothingWritten')}</p>
      </div>
      <ImportBatchList
        batches={batches}
        undone={undone}
        busy={busy || undoing}
        onUndo={(id) => void handleUndo(id)}
        testId="halaxy-batches"
        formatDate={(iso) => formatBatchDate(t, iso)}
      />
    </Screen>
  );
}

function PatientReview({
  patient,
  name,
  choice,
  selected,
  onName,
  onChoice,
  onToggle,
}: {
  patient: HalaxyPreviewPatient;
  name: string;
  choice: string | null | undefined;
  selected: ReadonlySet<string>;
  onName: (name: string) => void;
  onChoice: (choice: string | null) => void;
  onToggle: (key: string, checked: boolean) => void;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <section className="card card-rows lede" data-testid="halaxy-patient">
      <label className="field-label import-patient-name">
        {t('import.patientName')}
        <input
          className="field-input"
          value={name}
          data-testid="halaxy-patient-name"
          onChange={(event) => onName(event.target.value)}
        />
      </label>
      {patient.existingPatients.length > 0 && (
        <div className="import-patient-choice">
          <span className="import-patient-choice-label">{t('import.whereTo')}</span>
          <div className="import-patient-choice-options">
            {patient.existingPatients.map((existing) => (
              <label className="small" key={existing.id}>
                <input
                  type="radio"
                  name={`halaxy-choice-${patient.fileName}`}
                  checked={choice === existing.id}
                  onChange={() => onChoice(existing.id)}
                />
                {t('import.addTo', { name: existing.name })}
              </label>
            ))}
            <label className="small">
              <input
                type="radio"
                name={`halaxy-choice-${patient.fileName}`}
                checked={choice === null}
                onChange={() => onChoice(null)}
              />
              {t('import.createNew')}
            </label>
          </div>
        </div>
      )}
      {patient.notes.map((note) => {
        const key = noteKey(patient.fileName, note.key);
        return (
          <ImportPreviewRow
            key={key}
            checked={selected.has(key)}
            ariaLabel={
              note.title === undefined
                ? t('import.halaxyNoteLabel', { date: note.date, name })
                : t('import.halaxyNoteLabelTitled', { date: note.date, title: note.title, name })
            }
            testId="halaxy-note"
            title={note.title ?? t('import.sessionTitle')}
            date={note.date}
            excerpt={excerpt(note.text)}
            onChange={(checked) => onToggle(key, checked)}
          />
        );
      })}
    </section>
  );
}

function Rejected({ response }: { response: HalaxyPreviewResponse }): React.JSX.Element | null {
  const { t } = useI18n();
  if (response.rejected.length === 0) return null;
  return (
    <div className="card card-rows lede" data-testid="halaxy-rejected">
      <h3 className="heading-tight">{t('import.filesNotImported')}</h3>
      {response.rejected.map((item) => (
        <p className="small note-meta" key={item.fileName}>
          {item.fileName}: {item.reason}
        </p>
      ))}
    </div>
  );
}

function noteKey(fileName: string, key: string): string {
  return `${fileName}:${key}`;
}

function excerpt(text: string): string {
  const compact = text.replace(/\s+/g, ' ').trim();
  return compact.length > 180 ? `${compact.slice(0, 177)}…` : compact;
}
/**
 * A batch's own instant, through the catalogue rather than
 * `formatInstantAsDate`'s `en-US` string (Fixed decision 3).
 */
function formatBatchDate(t: Translate, iso: string): string {
  return t('note.updatedAt', { at: iso });
}
