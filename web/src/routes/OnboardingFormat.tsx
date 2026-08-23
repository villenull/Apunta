import { MAX_DETECT_FILES } from '@apunta/shared';
import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { detectFormat, errorMessage } from '../api/index.js';
import { ExamplesIcon, PencilIcon, TemplateIcon, UploadIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { duplicateSection, parseSections } from '../lib/sections.js';
import { asFormatDraft, type FormatDraft } from './formatDraft.js';

type Choice = 'template' | 'examples' | 'manual';

/**
 * `prototype/onboarding-format.html`. All three options are live: upload a
 * blank template, upload two or three completed notes, or type the sections
 * out. The last one is the only path that cannot fail, so every failure
 * message on the other two points back at it.
 */
export function OnboardingFormat(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = asFormatDraft(location.state)?.returnTo ?? '/patients/new';

  const [choice, setChoice] = useState<Choice | null>(null);
  const [name, setName] = useState('');
  const [sectionsText, setSectionsText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function choose(next: Choice): void {
    setChoice(next);
    setFiles([]);
    setError(null);
  }

  function handleManual(): void {
    const trimmedName = name.trim();
    const sections = parseSections(sectionsText);
    const duplicate = duplicateSection(sections);

    if (trimmedName.length === 0) {
      setError('Give the format a name.');
      return;
    }
    if (sections.length === 0) {
      setError('List at least one section.');
      return;
    }
    if (duplicate !== null) {
      setError(`"${duplicate}" is listed twice — section names have to be unique.`);
      return;
    }

    const draft: FormatDraft = { name: trimmedName, sections, returnTo };
    void navigate('/onboarding/preview', { state: draft });
  }

  async function handleUpload(kind: 'template' | 'examples'): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const detected = await detectFormat(kind, files);
      const draft: FormatDraft = {
        name: detected.name,
        sections: [...detected.sections],
        returnTo,
        source: kind,
        ...(detected.truncated ? { truncated: true } : {}),
      };
      await navigate('/onboarding/preview', { state: draft });
    } catch (thrown) {
      setError(errorMessage(thrown));
      setBusy(false);
    }
  }

  const canContinue =
    choice === 'manual' ||
    (choice === 'template' && files.length === 1) ||
    (choice === 'examples' && files.length >= 2);

  return (
    <Screen {...(returnTo === '/settings' ? { back: { to: '/settings', label: 'Settings' } } : {})}>
      <div className="progress">
        <div className="dot done" />
        <div className="dot" />
      </div>

      <h2 className="heading-tight">Add your note format</h2>
      <p className="muted lede">Choose how to define it — we&apos;ll figure out the structure for you.</p>

      <div className="stack">
        <Option
          selected={choice === 'template'}
          onSelect={() => {
            choose('template');
          }}
          icon={<TemplateIcon />}
          title="Upload a blank template"
          subtitle="A Word doc or PDF with empty sections"
        />
        <Option
          selected={choice === 'examples'}
          onSelect={() => {
            choose('examples');
          }}
          icon={<ExamplesIcon />}
          title="Upload a few example notes"
          subtitle="2-3 completed notes to learn the pattern from"
        />
        <Option
          selected={choice === 'manual'}
          onSelect={() => {
            choose('manual');
          }}
          icon={<PencilIcon />}
          title="Describe it myself"
          subtitle="Type out the sections you need"
        />
      </div>

      {choice === 'template' && (
        <Dropzone
          testId="area-template"
          inputId="file-template"
          hint="Drop a .docx or .pdf template here"
          multiple={false}
          files={files}
          onFiles={setFiles}
          disabled={busy}
        />
      )}
      {choice === 'examples' && (
        <Dropzone
          testId="area-examples"
          inputId="file-examples"
          hint="Drop 2-3 completed notes here"
          multiple
          files={files}
          onFiles={setFiles}
          disabled={busy}
        />
      )}
      {choice === 'manual' && (
        <div className="onboarding-area" data-testid="area-manual">
          <div className="field">
            <label className="label" htmlFor="format-name">
              Format name
            </label>
            <input
              id="format-name"
              type="text"
              placeholder="e.g. Progress note"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              autoFocus
            />
          </div>
          <div className="field field-last">
            <label className="label" htmlFor="format-sections">
              Sections
            </label>
            <textarea
              id="format-sections"
              placeholder="e.g. Subjective, Objective, Assessment, Plan"
              value={sectionsText}
              onChange={(event) => {
                setSectionsText(event.target.value);
              }}
            />
          </div>
        </div>
      )}

      {error !== null && (
        <p className="form-error" role="alert">
          {error}{' '}
          <button
            type="button"
            className="btn small btn-quick"
            onClick={() => {
              choose('manual');
            }}
          >
            Describe it myself
          </button>
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block form-actions"
        data-testid="format-continue"
        disabled={!canContinue || busy}
        onClick={() => {
          if (choice === 'manual') handleManual();
          else if (choice === 'template' || choice === 'examples') void handleUpload(choice);
        }}
      >
        {busy ? 'Reading your file…' : 'Continue'}
      </button>

      {busy && (
        <p className="small state-note" role="status">
          Reading the file and working out its sections. Nothing is saved until you say it looks right.
        </p>
      )}
    </Screen>
  );
}

interface OptionProps {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}

function Option({ selected, onSelect, icon, title, subtitle }: OptionProps): React.JSX.Element {
  return (
    <button type="button" className={selected ? 'btn-option selected' : 'btn-option'} onClick={onSelect}>
      {icon}
      <div>
        <div className="opt-title">{title}</div>
        <div className="opt-sub">{subtitle}</div>
      </div>
    </button>
  );
}

interface DropzoneProps {
  testId: string;
  inputId: string;
  hint: string;
  multiple: boolean;
  files: File[];
  onFiles: (files: File[]) => void;
  disabled: boolean;
}

/**
 * Drag-and-drop with click-to-browse behind it.
 *
 * The `<input type="file">` is the real control — it is what a keyboard and a
 * screen reader reach, and it is what Playwright sets files on — and the
 * dashed area is a label wrapped around it. Dropping files writes the same
 * state, so the two ways in are one code path from here on.
 */
function Dropzone({
  testId,
  inputId,
  hint,
  multiple,
  files,
  onFiles,
  disabled,
}: DropzoneProps): React.JSX.Element {
  const [over, setOver] = useState(false);

  function accept(list: FileList | null): void {
    if (list === null) return;
    onFiles(Array.from(list).slice(0, multiple ? MAX_DETECT_FILES : 1));
  }

  return (
    <div className="onboarding-area" data-testid={testId}>
      <label
        className={over ? 'dropzone dropzone-over' : 'dropzone'}
        htmlFor={inputId}
        onDragOver={(event) => {
          event.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => {
          setOver(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setOver(false);
          accept(event.dataTransfer.files);
        }}
      >
        <UploadIcon />
        <p className="small">{hint}</p>
        <p className="small later-milestone">or click to choose a file</p>
        <input
          id={inputId}
          type="file"
          className="visually-hidden"
          accept=".docx,.pdf,.txt,.md"
          multiple={multiple}
          disabled={disabled}
          data-testid={`${testId}-input`}
          onChange={(event) => {
            accept(event.target.files);
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="upload-list" data-testid={`${testId}-files`}>
          {files.map((file) => (
            <li className="small" key={`${file.name}-${String(file.size)}`}>
              {file.name}
            </li>
          ))}
        </ul>
      )}
      {multiple && files.length === 1 && (
        <p className="small later-milestone">
          Add one or two more — Apunta works out the sections from what the notes have in common.
        </p>
      )}
    </div>
  );
}
