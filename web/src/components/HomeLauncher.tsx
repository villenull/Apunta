import type { PatientListItem } from '@apunta/shared';
import { useId, useState } from 'react';
import { useNavigate } from 'react-router';

import { useI18n } from '../lib/i18n.js';
import { BrandWordmark } from './BrandWordmark.js';
import { CheckIcon, DocumentIcon, PencilIcon, PlusIcon } from './icons.js';

export interface HomeLauncherProps {
  /** The patients the list column has loaded; empty while it is loading. */
  patients: PatientListItem[];
  onSelect: (patientId: string) => void;
}

/** Enough to scan at a glance; the patients column still holds everyone. */
const MAX_MATCHES = 8;

/**
 * The three things she opens a session to do, as the home screen (owner,
 * 2026-09-27, "Simple workbench"): the wordmark, one question, three cards.
 *
 * **An action first, then a patient**, which is the order the cards impose and
 * the reason they exist. The greeting-and-search home asked
 * her *who* before asking her *what*, and the answer to "what" is the thing she
 * actually knows when she opens the app.
 *
 * Each card starts a flow that already exists rather than a screen built for it:
 *
 * - **Write a note** → the capture screen, where a typed summary becomes a draft;
 * - **Create a treatment plan** → that patient's plan, in the main pane;
 * - **Continue a draft** → that patient's notes, which is where their drafts are.
 *   The app has no "most recent draft" index, so this lands on their list rather
 *   than inside a draft; that is the one card whose label promises slightly more
 *   than the app can do today, and it is the owner's call whether to close the
 *   gap by having the workspace open the newest draft itself.
 *
 * The patient step is the old search box, unchanged, including its "New" row —
 * so typing a name and pressing Enter still reaches the add-patient form with
 * the name filled in, one step deeper than it used to be.
 *
 * Every string here is a catalogue key, the "New" row included. That row used
 * to be `New: <strong>{query.trim()}</strong>` — a sentence split around an
 * inline element, the class `check-ui-strings.mjs` deliberately does not
 * report — so it is one key with the typed name as a `{name}` parameter and the
 * line renders as a single string.
 */
type HomeAction = 'note' | 'draft' | 'plan';

export function HomeLauncher({ patients, onSelect }: HomeLauncherProps): React.JSX.Element {
  const navigate = useNavigate();
  const { t } = useI18n();
  const listId = useId();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [action, setAction] = useState<HomeAction | null>(null);

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

  /** Where each action lands. `capture` is a screen of its own; the rest are
   *  the main pane's own modes, which are already in the query string. */
  function start(picked: HomeAction, patientId: string): void {
    if (picked === 'note') {
      void navigate(`/capture/${encodeURIComponent(patientId)}`);
      return;
    }
    if (picked === 'plan') {
      onSelect(patientId);
      navigate(`/?patient=${encodeURIComponent(patientId)}&view=plan`);
      return;
    }
    onSelect(patientId);
  }

  function choose(index: number): void {
    const patient = matches[index];
    if (patient && action !== null) start(action, patient.id);
    else if (patient) onSelect(patient.id);
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

  const cards: readonly { id: HomeAction; label: string; icon: React.JSX.Element }[] = [
    { id: 'note', label: t('home.actionNote'), icon: <PencilIcon className="icon" /> },
    { id: 'draft', label: t('home.actionDraft'), icon: <DocumentIcon className="icon" /> },
    { id: 'plan', label: t('home.actionPlan'), icon: <CheckIcon className="icon" /> },
  ];

  return (
    <div className="home" data-testid="home">
      <div className="home-inner">
        {/* The full wordmark immediately above the question (owner, 2026-09-27).
            Decorative here: the sidebar's wordmark already names the app, and a
            screen reader should hear the name once. */}
        <BrandWordmark className="home-wordmark" height={48} decorative />
        <h1 className="home-title">
          <span>{t('home.ask')}</span>
        </h1>

        {action === null ? (
          <>
            <ul className="home-actions" aria-label={t('home.actionsLabel')}>
              {cards.map((card) => (
                <li key={card.id}>
                  <button
                    type="button"
                    className="home-action"
                    data-testid={`home-action-${card.id}`}
                    onClick={() => {
                      setAction(card.id);
                      setQuery('');
                      setActiveIndex(0);
                    }}
                  >
                    <span className="home-action-icon" aria-hidden="true">
                      {card.icon}
                    </span>
                    <span className="home-action-label">{card.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <h2 className="home-step-title">{t('home.pickPatient')}</h2>
            <div className="home-search">
              <input
                type="text"
                role="combobox"
                value={query}
                placeholder={t('home.searchPlaceholder')}
                aria-label={t('home.searchLabel')}
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
                <ul className="home-results" id={listId} role="listbox" aria-label={t('home.resultsLabel')}>
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
                    <span>{t('home.newWith', { name: query.trim() })}</span>
                  </li>
                </ul>
              )}
            </div>
            <button
              type="button"
              className="home-back"
              data-testid="home-back"
              onClick={() => {
                setAction(null);
                setQuery('');
              }}
            >
              {t('common.back')}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
