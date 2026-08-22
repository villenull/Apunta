import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { createFormat, errorMessage, updateFormat } from '../api/index.js';
import { CloseIcon } from '../components/icons.js';
import { Screen } from '../components/TopBar.js';
import { duplicateSection } from '../lib/sections.js';
import { asFormatDraft } from './formatDraft.js';

/**
 * `prototype/onboarding-preview.html` — confirm the format before it is saved,
 * and (from Settings) the editor for one that already exists.
 */
export function OnboardingPreview(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const draft = asFormatDraft(location.state);

  const [name, setName] = useState(draft?.name ?? '');
  const [sections, setSections] = useState<string[]>(draft?.sections ?? []);
  const [newSection, setNewSection] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reached without a draft (a reload, or a typed URL): start the flow again.
  if (!draft) return <Navigate to="/onboarding/format" replace />;

  const editing = draft.formatId !== undefined;

  function addSection(): void {
    const trimmed = newSection.trim();
    if (trimmed.length === 0) return;
    if (duplicateSection([...sections, trimmed]) !== null) {
      setError(`"${trimmed}" is already a section.`);
      return;
    }
    setSections([...sections, trimmed]);
    setNewSection('');
    setError(null);
  }

  async function handleSave(): Promise<void> {
    if (!draft || busy) return;
    if (name.trim().length === 0) {
      setError('Give the format a name.');
      return;
    }
    if (sections.length === 0) {
      setError('A format needs at least one section.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      if (draft.formatId !== undefined) {
        await updateFormat(draft.formatId, { name: name.trim(), sections });
      } else {
        await createFormat({ name: name.trim(), sections, source: 'manual' });
      }
      await navigate(draft.returnTo, { replace: true });
    } catch (thrown) {
      setError(errorMessage(thrown));
      setBusy(false);
    }
  }

  return (
    <Screen back={{ to: editing ? draft.returnTo : '/onboarding/format', label: 'Back' }}>
      <div className="progress">
        <div className="dot done" />
        <div className={editing ? 'dot' : 'dot done'} />
      </div>

      <h2 className="heading-tight">{editing ? 'Edit note format' : "Here's what we found"}</h2>
      <p className="muted lede">
        {editing
          ? 'Rename it or change its sections, then save.'
          : "Check this matches your work's format before saving."}
      </p>

      <div className="card">
        <div className="field">
          <label className="label" htmlFor="preview-name">
            Format name
          </label>
          <input
            id="preview-name"
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
            }}
          />
        </div>

        <span className="label">{editing ? 'Sections' : 'Sections detected'}</span>
        <div data-testid="section-chips">
          {sections.map((section) => (
            <div className="section-chip" key={section}>
              <span>{section}</span>
              <button
                type="button"
                className="icon-btn chip-remove"
                aria-label={`Remove ${section}`}
                onClick={() => {
                  setSections(sections.filter((candidate) => candidate !== section));
                }}
              >
                <CloseIcon className="icon icon-sm" />
              </button>
            </div>
          ))}
        </div>

        {adding ? (
          <div className="row gap-8 section-list-add">
            <input
              type="text"
              className="grow"
              placeholder="Section name"
              aria-label="Section name"
              value={newSection}
              onChange={(event) => {
                setNewSection(event.target.value);
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  addSection();
                }
              }}
              autoFocus
            />
            <button type="button" className="btn small btn-compact" onClick={addSection}>
              Add
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn small btn-compact section-list-add"
            onClick={() => {
              setAdding(true);
            }}
          >
            + Add section
          </button>
        )}
      </div>

      {error !== null && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="row gap-12 form-actions-row">
        {editing ? (
          <Link to={draft.returnTo} className="btn grow">
            Cancel
          </Link>
        ) : (
          <Link to="/onboarding/format" className="btn grow">
            Start over
          </Link>
        )}
        <button
          type="button"
          className="btn btn-primary grow"
          data-testid="save-format"
          disabled={busy}
          onClick={() => {
            void handleSave();
          }}
        >
          {busy ? 'Saving…' : editing ? 'Save changes' : 'Looks right, save'}
        </button>
      </div>
    </Screen>
  );
}
