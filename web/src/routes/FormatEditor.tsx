import { MAX_DETECT_FILES, STANDARD_PROGRESS_FORMAT } from '@apunta/shared';
import { useEffect, useRef, useState } from 'react';
import { createStandardFormat, detectFormat, errorMessage } from '../api/index.js';
import { DocumentIcon, ExamplesIcon, PencilIcon, TemplateIcon, UploadIcon } from '../components/icons.js';
import { useI18n, useReportWork } from '../lib/i18n.js';
import { duplicateSection, parseSections } from '../lib/sections.js';
import type { FormatDraft } from './formatDraft.js';

type Choice = 'standard' | 'template' | 'examples' | 'manual';

export interface FormatEditorProps {
  /**
   * What is selected on arrival. First run preselects the owner's standard
   * progress note; adding another format to a list she already has preselects
   * nothing, so "Add another format" never overwrites the format she uses.
   */
  initialChoice?: Choice | null;
  /**
   * The draft to preview before anything is saved: typed sections straight
   * away, and a detected format as soon as the server has read the upload.
   */
  onPreview: (draft: FormatDraft) => void;
  /** The standard format saved itself; the host reloads whatever it lists. */
  onSaved: () => void;
  /**
   * Whether the format on the server still matches what is on screen. Fired
   * `true` only once the create has resolved, and `false` if it is edited
   * afterwards — never before it lands.
   */
  onSavedStateChange?: (saved: boolean) => void;
}

/**
 * `prototype/onboarding-format.html`, plus one option the prototype does not
 * have: the owner's standard progress note, first, recommended and selected on
 * first run, so her format with her drafting instructions is one click away
 * (`docs/decisions.md`, 2026-09-22). It saves straight away, with no preview:
 * the sections are fixed, and the format list edits them afterwards like any
 * format. The prototype's three stay as the alternatives: upload a blank
 * template, upload two or three completed notes, or type the sections out. The
 * last is the only path that cannot fail, so every failure message points back
 * at it.
 *
 * It is a component, not a screen, because Settings edits formats from inside
 * its modal: the same three questions and the same failure messages, with the
 * host deciding where "saved" goes.
 */
export function FormatEditor({
  initialChoice = 'standard',
  onPreview,
  onSaved,
  onSavedStateChange,
}: FormatEditorProps): React.JSX.Element {
  const { t } = useI18n();
  const [choice, setChoice] = useState<Choice | null>(initialChoice);
  const [name, setName] = useState('');
  const [sectionsText, setSectionsText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  // A create in flight, kept outside the render closure: two clicks in the
  // same tick both read `busy` as false before React re-renders, which would
  // ask the server for the standard format twice.
  const creatingRef = useRef(false);
  // Reading a format file holds the Language control (C-LANG@1 rule 6).
  useReportWork(busy);
  const [error, setError] = useState<string | null>(null);
  // The standard format is saved by one click and lands in the list, so the
  // indicator is only ever true after that request resolves. The host passes
  // this callback fresh on every render, so it is read through a ref: keying
  // the effect on it would report `false` again after the `true`, undoing it.
  const savedStateChangeRef = useRef(onSavedStateChange);
  savedStateChangeRef.current = onSavedStateChange;
  useEffect(() => {
    savedStateChangeRef.current?.(false);
  }, []);

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
      setError(t('format.errorName'));
      return;
    }
    if (sections.length === 0) {
      setError(t('format.errorSections'));
      return;
    }
    if (duplicate !== null) {
      setError(t('format.errorDuplicate', { section: duplicate }));
      return;
    }

    onPreview({ name: trimmedName, sections });
  }

  async function handleStandard(): Promise<void> {
    if (creatingRef.current) return;
    creatingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await createStandardFormat();
      savedStateChangeRef.current?.(true);
      onSaved();
    } catch (thrown) {
      setError(errorMessage(thrown));
      creatingRef.current = false;
      setBusy(false);
    }
  }

  async function handleUpload(kind: 'template' | 'examples'): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const detected = await detectFormat(kind, files);
      onPreview({
        name: detected.name,
        sections: [...detected.sections],
        source: kind,
        ...(detected.truncated ? { truncated: true } : {}),
      });
    } catch (thrown) {
      setError(errorMessage(thrown));
      setBusy(false);
    }
  }

  const canContinue =
    choice === 'standard' ||
    choice === 'manual' ||
    (choice === 'template' && files.length === 1) ||
    (choice === 'examples' && files.length >= 2);

  return (
    <>
      <div className="stack" role="radiogroup" aria-label={t('format.choicesLabel')}>
        <Option
          selected={choice === 'standard'}
          onSelect={() => {
            choose('standard');
          }}
          icon={<DocumentIcon />}
          title={t('format.standardTitle')}
          badge={t('format.recommended')}
          subtitle={t('format.standardSubtitle', {
            sections: STANDARD_PROGRESS_FORMAT.sections.join(', '),
          })}
          testId="option-standard"
        />
        <Option
          selected={choice === 'template'}
          onSelect={() => {
            choose('template');
          }}
          icon={<TemplateIcon />}
          title={t('format.templateTitle')}
          subtitle={t('format.templateSubtitle')}
        />
        <Option
          selected={choice === 'examples'}
          onSelect={() => {
            choose('examples');
          }}
          icon={<ExamplesIcon />}
          title={t('format.examplesTitle')}
          subtitle={t('format.examplesSubtitle')}
        />
        <Option
          selected={choice === 'manual'}
          onSelect={() => {
            choose('manual');
          }}
          icon={<PencilIcon />}
          title={t('format.manualTitle')}
          subtitle={t('format.manualSubtitle')}
        />
      </div>

      {choice === 'template' && (
        <Dropzone
          testId="area-template"
          inputId="file-template"
          hint={t('format.dropTemplate')}
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
          hint={t('format.dropExamples')}
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
              {t('format.nameLabel')}
            </label>
            <input
              id="format-name"
              type="text"
              placeholder={t('format.namePlaceholder')}
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              autoFocus
            />
          </div>
          <div className="field field-last">
            <label className="label" htmlFor="format-sections">
              {t('format.sectionsLabel')}
            </label>
            <textarea
              id="format-sections"
              placeholder={t('format.sectionsPlaceholder')}
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
            {t('format.manualTitle')}
          </button>
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block form-actions"
        data-testid="format-continue"
        disabled={!canContinue || busy}
        onClick={() => {
          if (choice === 'standard') void handleStandard();
          else if (choice === 'manual') handleManual();
          else if (choice === 'template' || choice === 'examples') void handleUpload(choice);
        }}
      >
        {busy ? (choice === 'standard' ? t('common.saving') : t('format.readingFile')) : t('common.continue')}
      </button>

      {busy && choice !== 'standard' && (
        <p className="small state-note" role="status">
          {t('format.readingNote')}
        </p>
      )}
    </>
  );
}

interface OptionProps {
  selected: boolean;
  onSelect: () => void;
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  badge?: string;
  testId?: string;
}

function Option({
  selected,
  onSelect,
  icon,
  title,
  subtitle,
  badge,
  testId,
}: OptionProps): React.JSX.Element {
  return (
    <button
      type="button"
      className={selected ? 'btn-option selected' : 'btn-option'}
      role="radio"
      aria-checked={selected}
      aria-pressed={selected}
      onClick={onSelect}
      {...(testId === undefined ? {} : { 'data-testid': testId })}
    >
      {icon}
      <div>
        <div className="opt-title">
          {title}
          {badge !== undefined && <span className="badge opt-badge">{badge}</span>}
        </div>
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
  const { t } = useI18n();
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
        <p className="small later-milestone">{t('format.dropClick')}</p>
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
      {multiple && files.length === 1 && <p className="small later-milestone">{t('format.dropMore')}</p>}
    </div>
  );
}
