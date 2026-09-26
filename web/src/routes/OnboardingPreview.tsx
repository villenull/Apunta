import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';

import { createFormat, errorMessage, updateFormat } from '../api/index.js';
import { CloseIcon } from '../components/icons.js';
import { InstructionsPanel } from '../components/InstructionsPanel.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useI18n } from '../lib/i18n.js';
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
  const { t } = useI18n();
  useDocumentTitle(t('doc.noteFormat'));
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
      setError(t('format.errorAlreadySection', { section: trimmed }));
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
      setError(t('format.errorAlreadySection', { section: trimmed }));
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
      setError(t('format.errorName'));
      return;
    }
    if (sections.length === 0) {
      setError(t('format.errorNoSections'));
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
    <Screen back={{ to: editing ? draft.returnTo : '/onboarding/format', label: t('common.back') }}>
      <div className="progress">
        <div className="dot done" />
        <div className={editing ? 'dot' : 'dot done'} />
      </div>

      <h2 className="heading-tight">{editing ? t('format.editTitle') : t('format.foundTitle')}</h2>
      <p className="muted lede">{editing ? t('format.editLede') : t('format.foundLede')}</p>

      {draft.truncated === true && (
        <p className="small state-note" data-testid="truncated-note">
          {t('format.truncatedNote')}
        </p>
      )}

      <div className="card">
        <div className="field">
          <label className="label" htmlFor="preview-name">
            {t('format.nameLabel')}
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

        <span className="label">{editing ? t('format.sectionsLabel') : t('format.sectionsDetected')}</span>
        <div data-testid="section-chips">
          {sections.map((section, index) => (
            <div className="section-chip" key={section}>
              {renaming?.index === index ? (
                <input
                  type="text"
                  className="grow chip-rename"
                  aria-label={t('format.renameLabel', { section })}
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
                  aria-label={t('format.renameAction', { section })}
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
                  aria-label={t('format.moveUp', { section })}
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
                  aria-label={t('format.moveDown', { section })}
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
                  aria-label={t('format.removeSection', { section })}
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
              placeholder={t('format.sectionNamePlaceholder')}
              aria-label={t('format.sectionNamePlaceholder')}
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
              {t('common.add')}
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
            {t('format.addSection')}
          </button>
        )}

        {editing && <p className="small note-meta">{t('format.existingNotesNote')}</p>}
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
            {t('common.cancel')}
          </Link>
        ) : (
          <Link to="/onboarding/format" className="btn grow">
            {t('format.startOver')}
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
          {busy ? t('common.saving') : editing ? t('format.saveChanges') : t('format.looksRight')}
        </button>
      </div>
    </Screen>
  );
}
