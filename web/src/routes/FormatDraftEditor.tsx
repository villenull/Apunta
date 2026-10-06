import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';

import { createFormat, errorMessage, updateFormat } from '../api/index.js';
import { CloseIcon } from '../components/icons.js';
import { useI18n, useReportWork } from '../lib/i18n.js';
import { duplicateSection } from '../lib/sections.js';
import type { FormatDraft } from './formatDraft.js';

/**
 * The one question a host asks before it unmounts the editor.
 */
export interface FormatDraftEditorHandle {
  /**
   * Write what is on screen and wait for it. Resolves `true` only once the
   * server holds exactly that — a write already in flight is waited out, and an
   * edit made while it was out is written and waited for too. Resolves `false`
   * when the value cannot be written (no name, no sections, a repeated section)
   * or the server refused; the editor is still mounted and the reason is on
   * screen, so a host leaves only on `true`. Never throws and never retries.
   */
  flush: () => Promise<boolean>;
}

export interface FormatDraftEditorProps {
  draft: FormatDraft;
  /** The format is saved; the host reloads whatever it lists. */
  onSaved: () => void;
  /** Nothing was saved: back to wherever the host came from. */
  onCancel: () => void;
  /** How a host asks for the wait above before it unmounts the editor. */
  ref?: Ref<FormatDraftEditorHandle>;
  /**
   * Whether the server still holds what is on screen. Fired `true` only once a
   * save has resolved, and `false` on every edit after that — so a host may
   * show it as an indicator and never as a promise.
   */
  onSavedStateChange?: (saved: boolean) => void;
}

/** Typing a name is one request per pause, not one per keystroke. */
const AUTOSAVE_DELAY_MS = 600;

/**
 * The editor for one note format: the confirm-and-save step of the create
 * flow, and the editor Settings uses for a format she already has.
 *
 * **A format that exists saves itself.** There is no save button — the host's
 * `Saved` marker beside its own back arrow says it landed
 * (`onSavedStateChange`, `true` only for a request that resolved *and* left
 * the screen as it was written). Typing is debounced; a section added,
 * renamed, moved or removed by one action saves at once. An edit that lands
 * while a save is out stays dirty and unsaved until its own save lands. A host
 * that unmounts the editor asks `flush()` first and unmounts on `true`, so the
 * write has landed before the pane that held it is gone; an invalid value (no
 * name, no sections, a repeated section) is reported, never written, and makes
 * `flush()` resolve `false` so the host stays put.
 * An invalid value never blocks the next valid one: the next edit carries it
 * and itself.
 *
 * **A format that does not exist yet still has a button**, because the create
 * flow asks her to check what was detected before it is stored. One press is
 * one format.
 *
 * **Reorder is up/down buttons rather than drag.** Equivalent for her, and
 * not equivalent to test: HTML5 drag-and-drop does not fire from Playwright's
 * `dragTo` without hand-dispatched events. Recorded in `docs/decisions.md`.
 *
 * Stored drafting instructions are left alone: the autosave patch carries no
 * `instructions`, so the server keeps what it had.
 */
export function FormatDraftEditor({
  draft,
  onSaved,
  onCancel,
  onSavedStateChange,
  ref,
}: FormatDraftEditorProps): React.JSX.Element {
  const { t } = useI18n();
  const [name, setName] = useState(draft.name);
  const [sections, setSections] = useState<string[]>(draft.sections);
  const [renaming, setRenaming] = useState<{ index: number; value: string } | null>(null);
  const [newSection, setNewSection] = useState('');
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const editing = draft.formatId !== undefined;

  /** What is on screen now, for a save that settles after this render. */
  const latest = useRef({ name: draft.name, sections: draft.sections });
  latest.current = { name, sections };
  /** What the server is known to hold. */
  const persisted = useRef({ name: draft.name, sections: draft.sections });
  const timer = useRef<number | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const dirty = useRef(false);
  const alive = useRef(true);
  const notify = useRef(onSavedStateChange);
  notify.current = onSavedStateChange;

  // An autosave holds the Language control (C-LANG@1 rule 6) like any other
  // job, and stops holding it when it settles or the pane goes.
  useReportWork(saving);

  // A host that unmounts the editor asks for the wait first; without this it
  // has no way to know whether the edit landed before it went away.
  useImperativeHandle(ref, () => ({ flush }));

  /** Why these values cannot be written, or `null` when they can. */
  function problemWith(nextName: string, nextSections: string[]): string | null {
    if (nextName.trim().length === 0) return t('format.errorName');
    if (nextSections.length === 0) return t('format.errorNoSections');
    const duplicate = duplicateSection(nextSections);
    return duplicate === null ? null : t('format.errorDuplicate', { section: duplicate });
  }

  function matchesPersisted(nextName: string, nextSections: string[]): boolean {
    const known = persisted.current;
    return (
      known.name === nextName.trim() &&
      known.sections.length === nextSections.length &&
      known.sections.every((section, index) => section === nextSections[index])
    );
  }

  /**
   * One write, resolving to whether the screen still is what was written. It
   * never rejects and never throws: a refused write is an answer, not a fault.
   */
  async function write(nextName: string, nextSections: string[]): Promise<boolean> {
    try {
      await updateFormat(draft.formatId as string, { name: nextName, sections: nextSections });
      persisted.current = { name: nextName, sections: nextSections };
      // Only claim the screen is saved if it still *is* what was written. An
      // edit that landed while this request was out stays unsaved — dirty, no
      // `Saved` — until its own save lands.
      const current = latest.current;
      const caughtUp =
        current.name.trim() === nextName &&
        current.sections.length === nextSections.length &&
        current.sections.every((section, index) => section === nextSections[index]);
      dirty.current = !caughtUp;
      if (alive.current) {
        setSaving(false);
        notify.current?.(caughtUp);
      }
      return true;
    } catch (thrown) {
      // The screen keeps the edit and stays dirty, so the next one retries;
      // the indicator never claims a save that did not happen.
      if (alive.current) {
        setError(errorMessage(thrown));
        setSaving(false);
        notify.current?.(false);
      }
      return false;
    }
  }

  /**
   * Write what is on screen, unless the server already holds exactly that, and
   * resolve to whether it holds it afterwards. A write already out is waited
   * out and the screen re-checked, so an edit made while it was out is written
   * and waited for as well — which is what makes this safe to unmount on.
   */
  async function flush(): Promise<boolean> {
    if (draft.formatId === undefined) return true;
    for (;;) {
      // A write already out — from a debounce, or from a host that asked twice —
      // is waited out rather than duplicated, then the screen is re-read.
      const pending = inFlight.current;
      if (pending !== null) {
        inFlight.current = null;
        if (!(await pending)) return false;
        continue;
      }

      const trimmed = latest.current.name.trim();
      const next = [...latest.current.sections];
      if (!dirty.current && matchesPersisted(trimmed, next)) return true;

      const problem = problemWith(trimmed, next);
      if (problem !== null) {
        dirty.current = true;
        if (alive.current) setError(problem);
        return false;
      }

      dirty.current = true;
      if (alive.current) {
        setSaving(true);
        setError(null);
      }

      const running = write(trimmed, next);
      inFlight.current = running;
      const landed = await running;
      inFlight.current = null;
      // A refused write is not retried: the host learns it from the `false`, the
      // editor says why, and the next edit carries the whole screen again.
      if (!landed) return false;
    }
  }

  function scheduleSave(delay = AUTOSAVE_DELAY_MS): void {
    if (draft.formatId === undefined) return;
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      timer.current = null;
      void flush();
    }, delay);
  }

  /** An edit happened: the indicator goes off now, the save is on its way. */
  function edited(): void {
    dirty.current = true;
    notify.current?.(false);
  }

  function changeName(value: string): void {
    setName(value);
    edited();
    scheduleSave();
  }

  function changeSections(next: string[]): void {
    setSections(next);
    edited();
    scheduleSave(0);
  }

  function addSection(): void {
    const trimmed = newSection.trim();
    if (trimmed.length === 0) return;
    if (duplicateSection([...sections, trimmed]) !== null) {
      setError(t('format.errorAlreadySection', { section: trimmed }));
      return;
    }
    changeSections([...sections, trimmed]);
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
    changeSections(next);
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
    changeSections(next);
    setRenaming(null);
    setError(null);
  }

  /**
   * Leaving the pane does not throw an unsaved edit away: whatever the debounce
   * was still holding goes now, and a save already in flight re-checks the
   * screen when it settles.
   *
   * The body re-arms `alive` because `<StrictMode>` runs mount → cleanup → mount
   * again on one fiber with its refs intact: a flag only ever cleared here stays
   * false for the whole session, and every `setError`, `setSaving` and `Saved`
   * in this file is behind it.
   *
   * A write that settles after this ran may not talk to the host — the screen it
   * would update is gone — so it stays silent, and that silence is why a host
   * that cares must ask through `flush` instead.
   */
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      if (timer.current !== null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      if (draft.formatId !== undefined && dirty.current) void flush();
    };
  }, []);

  /** The one and only create. The button is disabled while it works. */
  async function handleSave(): Promise<void> {
    if (busy) return;
    const problem = problemWith(name, sections);
    if (problem !== null) {
      setError(problem);
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await createFormat({ name: name.trim(), sections, source: draft.source ?? 'manual' });
      onSaved();
    } catch (thrown) {
      setError(errorMessage(thrown));
      setBusy(false);
    }
  }

  return (
    <>
      {editing ? (
        <input
          className="format-heading-edit"
          type="text"
          aria-label={t('format.nameLabel')}
          placeholder={t('format.namePlaceholder')}
          value={name}
          onChange={(event) => {
            changeName(event.target.value);
          }}
        />
      ) : (
        <>
          <h2 className="heading-tight">{t('format.foundTitle')}</h2>
          <p className="muted lede">{t('format.foundLede')}</p>
        </>
      )}

      {draft.truncated === true && (
        <p className="small state-note" data-testid="truncated-note">
          {t('format.truncatedNote')}
        </p>
      )}

      <div className="card">
        {editing ? (
          <span className="label">{t('format.sectionsLabel')}</span>
        ) : (
          <>
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
            <span className="label">{t('format.sectionsDetected')}</span>
          </>
        )}

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
                    changeSections(sections.filter((candidate) => candidate !== section));
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
            className="section-list-add"
            data-testid="add-section"
            onClick={() => {
              setAdding(true);
            }}
          >
            {t('format.addSection')}
          </button>
        )}

        {editing && <p className="small note-meta">{t('format.existingNotesNote')}</p>}
      </div>

      {error !== null && (
        <p className="form-error" role="alert" data-testid="format-error">
          {error}
        </p>
      )}

      {!editing && (
        <div className="row gap-12 form-actions-row">
          <button type="button" className="btn grow" onClick={onCancel}>
            {t('format.startOver')}
          </button>
          <button
            type="button"
            className="btn btn-primary grow"
            data-testid="save-format"
            disabled={busy}
            onClick={() => {
              void handleSave();
            }}
          >
            {busy ? t('common.saving') : t('format.looksRight')}
          </button>
        </div>
      )}
    </>
  );
}
