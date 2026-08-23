import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { createFormat, errorMessage, updateFormat } from '../api/index.js';
import { CloseIcon } from '../components/icons.js';
import { InstructionsPanel } from '../components/InstructionsPanel.js';
import { Screen } from '../components/TopBar.js';
import { duplicateSection } from '../lib/sections.js';
import { asFormatDraft } from './formatDraft.js';

/**
 * `prototype/onboarding-preview.html` — confirm the format before it is saved,
 * and (from Settings) the editor for one that already exists.
 *
 * **Reorder is up/down buttons rather than drag.** The two were equivalent for
 * the therapist — a four-item list is not a sortable table — and not
 * equivalent to test: HTML5 drag-and-drop does not fire from Playwright's
 * `dragTo` without hand-dispatched `dragstart`/`drop` events, and a
 * pointer-based drag needs timed `mouse.move` steps that go flaky under load.
 * A button is `getByRole('button', { name: 'Move Objective up' }).click()`,
 * which is also the whole of its keyboard and screen-reader story. Recorded in
 * `docs/decisions.md`.
 */
export function OnboardingPreview(): React.JSX.Element {
  const location = useLocation();
  const navigate = useNavigate();
  const draft = asFormatDraft(location.state);

  const [name, setName] = useState(draft?.name ?? '');
  const [sections, setSections] = useState<string[]>(draft?.sections ?? []);
  const [instructions, setInstructions] = useState(draft?.instructions ?? '');
  const [renaming, setRenaming] = useState<{ index: number; value: string } | null>(null);
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

  /** Commit an inline rename. An empty or duplicate name leaves it alone. */
  function commitRename(): void {
    if (renaming === null) return;
    const trimmed = renaming.value.trim();
    const current = sections[renaming.index];
    if (trimmed.length === 0 || trimmed === current) {
      setRenaming(null);
      return;
    }
    const next = sections.map((section, index) => (index === renaming.index ? trimmed : section));
    if (duplicateSection(next) !== null) {
      setError(`"${trimmed}" is already a section.`);
      return;
    }
    setSections(next);
    setRenaming(null);
    setError(null);
  }

  function move(index: number, by: -1 | 1): void {
    const target = index + by;
    if (target < 0 || target >= sections.length) return;
    const next = [...sections];
    const moved = next[index] as string;
    next[index] = next[target] as string;
    next[target] = moved;
    setSections(next);
    setRenaming(null);
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
        await updateFormat(draft.formatId, { name: name.trim(), sections, instructions });
      } else {
        await createFormat({ name: name.trim(), sections, source: draft.source ?? 'manual' });
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

      {draft.truncated === true && (
        <p className="small state-note" data-testid="truncated-note">
          That file was long, so Apunta read the first part of it. Check nothing is missing below.
        </p>
      )}

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
          {sections.map((section, index) => (
            <div className="section-chip" key={section}>
              {renaming?.index === index ? (
                <input
                  type="text"
                  className="grow chip-rename"
                  aria-label={`New name for ${section}`}
                  value={renaming.value}
                  onChange={(event) => {
                    setRenaming({ index, value: event.target.value });
                  }}
                  onBlur={commitRename}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitRename();
                    }
                    if (event.key === 'Escape') setRenaming(null);
                  }}
                  autoFocus
                />
              ) : (
                <button
                  type="button"
                  className="chip-name"
                  aria-label={`Rename ${section}`}
                  onClick={() => {
                    setRenaming({ index, value: section });
                  }}
                >
                  {section}
                </button>
              )}

              <span className="chip-actions">
                <button
                  type="button"
                  className="icon-btn chip-move"
                  aria-label={`Move ${section} up`}
                  disabled={index === 0}
                  onClick={() => {
                    move(index, -1);
                  }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="icon-btn chip-move"
                  aria-label={`Move ${section} down`}
                  disabled={index === sections.length - 1}
                  onClick={() => {
                    move(index, 1);
                  }}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="icon-btn chip-remove"
                  aria-label={`Remove ${section}`}
                  onClick={() => {
                    setRenaming(null);
                    setSections(sections.filter((candidate) => candidate !== section));
                  }}
                >
                  <CloseIcon className="icon icon-sm" />
                </button>
              </span>
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

        {editing && (
          <p className="small note-meta">
            Notes you have already written keep the sections they were written with. Changes here apply to
            future drafts only.
          </p>
        )}
      </div>

      {editing && <InstructionsPanel value={instructions} onChange={setInstructions} disabled={busy} />}

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
