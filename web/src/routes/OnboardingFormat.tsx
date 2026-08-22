import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { ExamplesIcon, PencilIcon, TemplateIcon, UploadIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { duplicateSection, parseSections } from '../lib/sections.js';
import { asFormatDraft, type FormatDraft } from './formatDraft.js';

type Choice = 'template' | 'examples' | 'manual';

/** M6 implements the two upload paths; until then they explain themselves. */
const COMING_SOON = 'Reading a format from files arrives in a later milestone.';

/**
 * `prototype/onboarding-format.html`. All three options render; only "Describe
 * it myself" can be completed in M2, and it is the one the first run needs.
 *
 * After the format is saved the prototype goes on to add a patient, so that is
 * where a first run returns to; Settings sends the user back to Settings.
 */
export function OnboardingFormat(): React.JSX.Element {
  const navigate = useNavigate();
  const location = useLocation();
  const returnTo = asFormatDraft(location.state)?.returnTo ?? '/patients/new';

  const [choice, setChoice] = useState<Choice | null>(null);
  const [name, setName] = useState('');
  const [sectionsText, setSectionsText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function handleContinue(): void {
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
            setChoice('template');
          }}
          icon={<TemplateIcon />}
          title="Upload a blank template"
          subtitle="A Word doc or PDF with empty sections"
        />
        <Option
          selected={choice === 'examples'}
          onSelect={() => {
            setChoice('examples');
          }}
          icon={<ExamplesIcon />}
          title="Upload a few example notes"
          subtitle="2-3 completed notes to learn the pattern from"
        />
        <Option
          selected={choice === 'manual'}
          onSelect={() => {
            setChoice('manual');
          }}
          icon={<PencilIcon />}
          title="Describe it myself"
          subtitle="Type out the sections you need"
        />
      </div>

      {choice === 'template' && (
        <ComingSoonDrop hint="Drop a .docx or .pdf template here" testId="area-template" />
      )}
      {choice === 'examples' && (
        <ComingSoonDrop hint="Drop 2-3 completed notes here" testId="area-examples" />
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
          {error}
        </p>
      )}

      <button
        type="button"
        className="btn btn-primary btn-block form-actions"
        data-testid="format-continue"
        disabled={choice !== 'manual'}
        onClick={handleContinue}
      >
        Continue
      </button>
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

function ComingSoonDrop({ hint, testId }: { hint: string; testId: string }): React.JSX.Element {
  return (
    <div className="onboarding-area" data-testid={testId}>
      <div className="dropzone">
        <UploadIcon />
        <p className="small">{hint}</p>
        <p className="small later-milestone">
          {COMING_SOON} For now, choose &ldquo;Describe it myself&rdquo;.
        </p>
      </div>
    </div>
  );
}
