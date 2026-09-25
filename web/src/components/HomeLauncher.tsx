import type { PatientListItem } from '@apunta/shared';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';

import { MarkIcon, PlusIcon } from './icons.js';

export interface HomeLauncherProps {
  /** The patients the list column has loaded; empty while it is loading. */
  patients: PatientListItem[];
  onSelect: (patientId: string) => void;
}

/** Enough to scan at a glance; the patients column still holds everyone. */
const MAX_MATCHES = 8;

/**
 * The home screen: what she sees before choosing a patient, and where the
 * wordmark takes her back to. One question and one search box, modelled on
 * a chat app's welcome screen (owner, 2026-09-24). Typing narrows the
 * patients live; the last option is always "New", which carries what she
 * typed into the add-patient form.
 */
export function HomeLauncher({ patients, onSelect }: HomeLauncherProps): React.JSX.Element {
  const navigate = useNavigate();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const needle = query.trim().toLowerCase();
  const matches =
    needle === ''
      ? []
      : patients.filter((patient) => patient.name.toLowerCase().includes(needle)).slice(0, MAX_MATCHES);
  const open = needle !== '';
  // Matches first, then "New" — so the option count is one more than matches.
  const optionCount = matches.length + 1;
  const active = Math.min(activeIndex, optionCount - 1);

  function createNew(): void {
    void navigate(`/patients/new?name=${encodeURIComponent(query.trim())}`);
  }

  function choose(index: number): void {
    const patient = matches[index];
    if (patient) onSelect(patient.id);
    else createNew();
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>): void {
    if (!open) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((active + 1) % optionCount);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((active - 1 + optionCount) % optionCount);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(active);
    } else if (event.key === 'Escape') {
      setQuery('');
    }
  }

  const optionId = (index: number): string => `${listId}-option-${String(index)}`;

  return (
    <div className="home" data-testid="home">
      <div className="home-inner">
        <h1 className="home-title">
          <MarkIcon className="mark home-mark" />
          <span>Let’s focus on…</span>
        </h1>
        <div className="home-search">
          <input
            type="text"
            role="combobox"
            value={query}
            placeholder="Search patients"
            aria-label="Find a patient"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            {...(open ? { 'aria-activedescendant': optionId(active) } : {})}
            data-testid="home-search"
            autoFocus
            onChange={(event) => {
              setQuery(event.target.value);
              setActiveIndex(0);
            }}
            onKeyDown={onKeyDown}
          />
          {open && (
            <ul className="home-results" id={listId} role="listbox" aria-label="Patients">
              {matches.map((patient, index) => (
                <li
                  key={patient.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  className={index === active ? 'home-result is-active' : 'home-result'}
                  onMouseEnter={() => {
                    setActiveIndex(index);
                  }}
                  onMouseDown={(event) => {
                    // Keep focus in the input; the click still lands.
                    event.preventDefault();
                  }}
                  onClick={() => {
                    choose(index);
                  }}
                >
                  {patient.name}
                </li>
              ))}
              <li
                id={optionId(matches.length)}
                role="option"
                aria-selected={active === matches.length}
                className={
                  active === matches.length ? 'home-result home-new is-active' : 'home-result home-new'
                }
                data-testid="home-new"
                onMouseEnter={() => {
                  setActiveIndex(matches.length);
                }}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={createNew}
              >
                <PlusIcon className="icon icon-sm" />
                <span>
                  New: <strong>{query.trim()}</strong>
                </span>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
