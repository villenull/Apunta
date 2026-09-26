import type { PatientListItem } from '@apunta/shared';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';

import { formatShortDate } from '../lib/format.js';
import { useI18n } from '../lib/i18n.js';
import { PinIcon, SearchIcon } from './icons.js';
import { PatientMenu } from './PatientMenu.js';
import { PatientRenameForm } from './PatientRenameForm.js';

export interface PatientDirectoryProps {
  patients: PatientListItem[];
  status: 'loading' | 'error' | 'ready';
  errorMessage: string | null;
  onRetry: () => void;
  tab: 'active' | 'archived';
  onTab: (tab: 'active' | 'archived') => void;
  onSelect: (patientId: string) => void;
  onSetArchived: (patient: PatientListItem, archived: boolean) => void;
  onRename: (patient: PatientListItem, name: string) => void;
  onDelete: (patient: PatientListItem) => void;
  onTogglePin: (patientId: string) => void;
  /** patientId → when their last note was edited. */
  lastNoteAt: ReadonlyMap<string, string | null>;
  pinnedIds: readonly string[];
  /**
   * Multi-select is not in this preview; the button says so rather than lying.
   *
   * `what` is the control's own label, already in the active locale, so the
   * workspace's toast names it in the same language.
   */
  onUnavailable: (what: string) => void;
}

/**
 * "View all" — the full patient list, in the shape of Claude's Recents page
 * (owner preview, 2026-09-26): a page title with the three controls Claude puts
 * at its top right (search, Select, a light "New" pill), an Active / Archived
 * tab pair, and one row per patient with the name on the left and the date of
 * their last note on the right. The archived practice lives here rather than
 * behind a checkbox in the sidebar.
 */
export function PatientDirectory({
  patients,
  status,
  errorMessage: failure,
  onRetry,
  tab,
  onTab,
  onSelect,
  onSetArchived,
  onRename,
  onDelete,
  onTogglePin,
  lastNoteAt,
  pinnedIds,
  onUnavailable,
}: PatientDirectoryProps): React.JSX.Element {
  const { t } = useI18n();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const archived = tab === 'archived';

  // Typing narrows the list as she types, the way the sidebar's field does, so
  // a long practice can be searched from either side of the app.
  const needle = query.trim().toLowerCase();
  const visible = useMemo(
    () => (needle === '' ? patients : patients.filter((p) => p.name.toLowerCase().includes(needle))),
    [patients, needle],
  );

  useEffect(() => {
    if (searching) searchRef.current?.focus();
  }, [searching]);

  const search = (
    <div className="directory-search" data-testid="directory-search">
      <span className="directory-search-icon" aria-hidden="true">
        <SearchIcon className="icon icon-sm" />
      </span>
      <input
        ref={searchRef}
        type="text"
        value={query}
        placeholder={t('common.search')}
        aria-label={t('common.searchPatients')}
        data-testid="directory-search-input"
        onChange={(event) => {
          setQuery(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key !== 'Escape') return;
          setQuery('');
          setSearching(false);
        }}
      />
    </div>
  );

  return (
    <div className="directory" data-testid="patient-directory">
      <div className="directory-head">
        <div className="directory-head-top">
          <h1 className="directory-title">{t('common.patients')}</h1>
          <div className="directory-actions">
            {searching && search}
            <button
              type="button"
              className="icon-btn directory-action-btn"
              aria-label={searching ? t('directory.clearSearch') : t('common.searchPatients')}
              aria-expanded={searching}
              data-testid="directory-search-toggle"
              onClick={() => {
                setSearching((was) => {
                  if (was) setQuery('');
                  return !was;
                });
              }}
            >
              <SearchIcon className="icon icon-sm" />
            </button>
            <button
              type="button"
              className="directory-select-btn"
              data-testid="directory-select"
              onClick={() => {
                onUnavailable(t('directory.select'));
              }}
            >
              {t('directory.select')}
            </button>
            <Link to="/patients/new" className="btn directory-new" data-testid="directory-new">
              {t('patients.new')}
            </Link>
          </div>
        </div>
        <div className="directory-tabs" role="tablist" aria-label={t('common.patients')}>
          <button
            type="button"
            role="tab"
            aria-selected={!archived}
            className={archived ? 'directory-tab' : 'directory-tab is-active'}
            data-testid="directory-tab-active"
            onClick={() => {
              onTab('active');
            }}
          >
            {t('patients.tabActive')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={archived}
            className={archived ? 'directory-tab is-active' : 'directory-tab'}
            data-testid="directory-tab-archived"
            onClick={() => {
              onTab('archived');
            }}
          >
            {t('patients.tabArchived')}
          </button>
        </div>
      </div>

      {status === 'loading' && <p className="small state-note">{t('patients.loading')}</p>}
      {status === 'error' && (
        <p className="small state-note error-state" role="alert">
          {failure}{' '}
          <button type="button" className="btn small btn-quick" onClick={onRetry}>
            {t('common.tryAgain')}
          </button>
        </p>
      )}
      {status === 'ready' && patients.length === 0 && (
        <p className="small col-hint">
          {archived ? t('directory.emptyArchived') : t('directory.emptyActive')}
        </p>
      )}
      {status === 'ready' && patients.length > 0 && visible.length === 0 && (
        <p className="small col-hint">{t('directory.noMatch', { query: query.trim() })}</p>
      )}

      <ul className="directory-list">
        {visible.map((patient) => {
          const pinned = pinnedIds.includes(patient.id);
          return (
            <li
              key={patient.id}
              className={pinned ? 'directory-row is-pinned' : 'directory-row'}
              data-testid={`directory-row-${patient.id}`}
            >
              {renaming !== patient.id && (
                <button
                  type="button"
                  className="directory-row-main"
                  onClick={() => {
                    onSelect(patient.id);
                  }}
                >
                  {pinned ? <PinIcon className="icon icon-xs directory-row-pin" /> : null}
                  <span className="directory-row-name">{patient.name}</span>
                  <span className="directory-row-date">
                    {formatShortDate(lastNoteAt.get(patient.id) ?? null)}
                  </span>
                </button>
              )}
              {renaming === patient.id && (
                <PatientRenameForm
                  patient={patient}
                  onRename={onRename}
                  onDone={() => {
                    setRenaming(null);
                  }}
                />
              )}
              <PatientMenu
                patient={patient}
                archived={archived}
                pinned={pinned}
                scope="directory"
                onTogglePin={() => {
                  onTogglePin(patient.id);
                }}
                onRename={() => {
                  setRenaming(patient.id);
                }}
                onSetArchived={(next) => {
                  onSetArchived(patient, next);
                }}
                onDelete={() => {
                  onDelete(patient);
                }}
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}
