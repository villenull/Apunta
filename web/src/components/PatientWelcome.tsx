import type { PatientListItem } from '@apunta/shared';
import { Link, useLocation } from 'react-router';

import { firstName } from '../lib/format.js';
import { useI18n } from '../lib/i18n.js';
import { ChatIcon, CheckIcon, ExamplesIcon, PencilIcon, PlusIcon } from './icons.js';

/**
 * What the workspace shows for a patient before a note is open (owner,
 * 2026-09-28, backlog #13), in the home screen's style: the patient's name in
 * the serif heading, one plain line, and the things there are to do.
 *
 * **No notes yet:** there is one thing to do, so there is one button. The
 * workspace drops the notes column for this, so the welcome has the whole width;
 * Brainstorm, the plan and the briefing all read notes, and offering them before
 * there is one would be offering something empty.
 *
 * **Notes, none open:** four cards, each with a line that says what it is for,
 * so someone who has never used the app does not have to guess what
 * "Brainstorm" or "Prepare for session" means.
 *
 * Both note links open `/capture/:id` as a window over *this* workspace, so they
 * carry the location they were opened from in the navigation state
 * (`backgroundLocation`); `AppRoutes` reads it and keeps this page mounted
 * behind the modal, and `Capture` uses it as the way back out.
 */
export interface PatientWelcomeProps {
  readonly patient: PatientListItem;
  readonly hasNotes: boolean;
  readonly onOpenView: (view: 'plan' | 'prep' | 'brainstorm') => void;
}

export function PatientWelcome({ patient, hasNotes, onOpenView }: PatientWelcomeProps): React.JSX.Element {
  const { t } = useI18n();
  // The workspace's own location, which is the background the modal needs.
  const location = useLocation();
  const captureState = { backgroundLocation: location };
  const capture = `/capture/${patient.id}`;
  const name = firstName(patient.name);

  if (!hasNotes) {
    return (
      <div className="home patient-welcome" data-testid="patient-welcome-first">
        <div className="home-inner">
          <h1 className="home-title">
            <span>{patient.name}</span>
          </h1>
          <p className="patient-welcome-lede">{t('workspace.welcomeFirst', { name })}</p>
          <div className="patient-welcome-cta-row">
            <Link
              to={capture}
              state={captureState}
              className="btn btn-primary patient-welcome-cta"
              data-testid="write-first-note"
            >
              <PlusIcon className="icon icon-sm" />
              {t('workspace.writeFirst')}
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const cards: readonly {
    readonly id: 'note' | 'plan' | 'prep' | 'brainstorm';
    readonly label: string;
    readonly hint: string;
    readonly icon: React.JSX.Element;
  }[] = [
    {
      id: 'note',
      label: t('home.actionNote'),
      hint: t('workspace.cardNoteHint'),
      icon: <PencilIcon className="icon" />,
    },
    {
      id: 'brainstorm',
      label: t('brainstorm.title'),
      hint: t('workspace.cardBrainstormHint'),
      icon: <ChatIcon className="icon" />,
    },
    {
      id: 'plan',
      label: t('plan.title'),
      hint: t('workspace.cardPlanHint'),
      icon: <CheckIcon className="icon" />,
    },
    {
      id: 'prep',
      label: t('notes.prepareForSession'),
      hint: t('workspace.cardPrepHint'),
      icon: <ExamplesIcon className="icon" />,
    },
  ];

  return (
    <div className="home patient-welcome" data-testid="empty-no-note">
      <div className="home-inner">
        <h1 className="home-title">
          <span>{patient.name}</span>
        </h1>
        <p className="patient-welcome-lede">{t('workspace.welcomeAsk', { name })}</p>
        <ul className="home-actions patient-welcome-cards" aria-label={t('home.actionsLabel')}>
          {cards.map((card) => {
            const body = (
              <>
                <span className="home-action-icon" aria-hidden="true">
                  {card.icon}
                </span>
                <span className="home-action-label">{card.label}</span>
                <span className="patient-welcome-hint">{card.hint}</span>
              </>
            );
            return (
              <li key={card.id}>
                {card.id === 'note' ? (
                  <Link to={capture} state={captureState} className="home-action" data-testid="welcome-note">
                    {body}
                  </Link>
                ) : (
                  <button
                    type="button"
                    className="home-action"
                    data-testid={`welcome-${card.id}`}
                    onClick={() => {
                      onOpenView(card.id as 'plan' | 'prep' | 'brainstorm');
                    }}
                  >
                    {body}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
