import { type HalaxyImportResponse, type HalaxyPreviewPatient, type HalaxyPreviewResponse } from '@apunta/shared';
import { useState } from 'react';
import { Link } from 'react-router';

import { errorMessage, previewHalaxyImport, runHalaxyImport } from '../api/index.js';
import { ImportBatchList } from '../components/ImportBatchList.js';
import { Screen } from '../components/TopBar.js';
/**
 * Halaxy's practitioner export is one text PDF per patient. The preview is
 * deliberately reviewable: names can be corrected and individual sessions
 * can be left out before one undoable batch is written.
 */
export function HalaxyImport(): React.JSX.Element {
  useDocumentTitle('Import from Halaxy');
  const [files, setFiles] = useState<readonly File[]>([]);
  const [summary, setSummary] = useState<HalaxyPreviewResponse | null>(null);
  const [names, setNames] = useState<Readonly<Record<string, string>>>({});
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [report, setReport] = useState<HalaxyImportResponse | null>(null);
  const [busy, setBusy] = useState(false);
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
      const nextSelected = new Set<string>();
      for (const patient of response.patients) {
        nextNames[patient.fileName] = patient.patientName;
        for (const note of patient.notes) nextSelected.add(noteKey(patient.fileName, note.key));
      }
      setSummary(response);
      setNames(nextNames);
      setSelected(nextSelected);
      setReport(null);
    } catch (thrown) {
      setError(errorMessage(thrown));
    } finally {
      setBusy(false);
    }
  }

  async function run(): Promise<void> {
    if (summary === null || busy) return;
    setBusy(true);
    setError(null);
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
      <Screen back={{ to: '/settings', label: 'Settings' }}>
        <h2 className="heading-tight">{undone === null ? 'Imported' : 'Import undone'}</h2>
        {undone !== null ? (
          <p className="lede" data-testid="halaxy-undone">
            {plural(undone.notes_deleted, 'note')} and {plural(undone.patients_deleted, 'patient')} removed.
            {undone.notes_kept > 0
              ? ` ${plural(undone.notes_kept, 'note')} you had finalized were kept.`
              : ''}
          </p>
        ) : (
          <>
            <p className="lede" data-testid="halaxy-done">
              {report.notes === 0
                ? 'Nothing new to import.'
                : `${plural(report.notes, 'note')} for ${plural(report.patients.length, 'patient')} imported as published history.`}
            </p>
            {report.patients.length > 0 && (
              <div className="card card-rows lede" data-testid="halaxy-report-patients">
                {report.patients.map((patient) => (
                  <div className="row between" key={patient.fileName}>
                    <span>{patient.patientName}</span>
                    <span className="small muted">{plural(patient.notes, 'note')}</span>
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
                Undo this import
              </button>
            )}
          </>
        )}
        {errorLine}
        <Link to="/" className="btn">
          Go to patients
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
      <Screen back={{ to: '/settings', label: 'Settings' }}>
        <h2 className="heading-tight">Ready to import</h2>
        <p className="lede" data-testid="halaxy-summary">
          {plural(notes, 'note')} across {plural(summary.patients.length, 'patient')}.
        </p>
        <p className="small note-meta">
          Check the names, untick anything you do not want, then import. Notes are saved as published history.
        </p>
        {summary.patients.map((patient) => (
          <PatientReview
            key={patient.fileName}
            patient={patient}
            name={names[patient.fileName] ?? patient.patientName}
            selected={selected}
            onName={(name) => setNames((current) => ({ ...current, [patient.fileName]: name }))}
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
        <button
          type="button"
          className="btn btn-block"
          disabled={notes === 0 || busy}
          data-testid="halaxy-run"
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
          Choose different files
        </button>
      </Screen>
    );
  }

  return (
    <Screen back={{ to: '/settings', label: 'Settings' }}>
      <h2 className="heading-tight">Import from Halaxy</h2>
      <p className="muted lede">Bring your Halaxy notes into Apunta. Choose one PDF per patient.</p>
      <div className="card card-rows lede">
        <p className="small note-meta">Text PDFs are read on this computer and kept nowhere.</p>
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
          {busy ? 'Reading the PDFs…' : 'Check what will be imported'}
        </button>
        <p className="small note-meta">Nothing is written until you press Import on the next screen.</p>
      </div>
      <ImportBatchList
        batches={batches}
        undone={undone}
        busy={busy || undoing}
        onUndo={(id) => void handleUndo(id)}
        testId="halaxy-batches"
        formatDate={formatBatchDate}
      />
    </Screen>
  );
}

function PatientReview({
  patient,
  name,
  selected,
  onName,
  onToggle,
}: {
  patient: HalaxyPreviewPatient;
  name: string;
  selected: ReadonlySet<string>;
  onName: (name: string) => void;
  onToggle: (key: string, checked: boolean) => void;
}): React.JSX.Element {
  return (
    <section className="card card-rows lede" data-testid="halaxy-patient">
      <label className="small note-meta">
        Patient name
        <input
          className="input"
          value={name}
          data-testid="halaxy-patient-name"
          onChange={(event) => onName(event.target.value)}
        />
      </label>
      {patient.warnings.map((warning) => (
        <p className="small note-meta" role="status" key={warning}>
          {warning}
        </p>
      ))}
      {patient.notes.map((note) => {
        const key = noteKey(patient.fileName, note.key);
        return (
          <label className="row gap-8" key={key}>
            <input
              type="checkbox"
              checked={selected.has(key)}
              aria-label={`Import ${note.date}${note.title === undefined ? '' : ` ${note.title}`} for ${name}`}
              data-testid="halaxy-note"
              onChange={(event) => onToggle(key, event.target.checked)}
            />
            <span>
              <strong>{note.title ?? note.date}</strong>
              {note.title !== undefined && <span className="small muted"> · {note.date}</span>}
              <span className="small note-meta halaxy-excerpt">{excerpt(note.text)}</span>
            </span>
          </label>
        );
      })}
    </section>
  );
}

function Rejected({ response }: { response: HalaxyPreviewResponse }): React.JSX.Element | null {
  if (response.rejected.length === 0) return null;
  return (
    <div className="card card-rows lede" data-testid="halaxy-rejected">
      <h3 className="heading-tight">Files not imported</h3>
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
function formatBatchDate(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

