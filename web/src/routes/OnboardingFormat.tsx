import { useState } from 'react';
import { useNavigate } from 'react-router';

import { Dialog } from '../components/Dialog.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useI18n } from '../lib/i18n.js';
import { FormatEditor } from './FormatEditor.js';
import { SettingsModalPanel } from './Settings.js';
import { useSettingsClose } from './settingsClose.js';

/**
 * The first-run format question, on its own screen: the workspace sends
 * everyone here when there is no format yet, and this is where the standard
 * progress note is one click away (`docs/decisions.md`, 2026-09-22).
 *
 * The question itself is `FormatEditor`, because Settings asks the same one
 * from inside its modal; this route is only the page around it.
 */
export function OnboardingFormat(): React.JSX.Element {
  const { t } = useI18n();
  useDocumentTitle(t('doc.noteFormat'));
  const navigate = useNavigate();
  const [restoreOpen, setRestoreOpen] = useState(false);
  // Escape on the dialog and the panel's own close button are one action, and
  // that action asks the format editor whether the server has what is on
  // screen before the panel unmounts.
  const { closeRef, close } = useSettingsClose(() => {
    setRestoreOpen(false);
  });

  return (
    <>
      <Screen>
        <div className="progress">
          <div className="dot done" />
          <div className="dot" />
        </div>

        <h2 className="heading-tight">{t('format.addTitle')}</h2>
        <p className="muted lede">{t('format.addLede')}</p>

        <FormatEditor
          onPreview={(draft) => {
            void navigate('/onboarding/preview', { state: draft });
          }}
          onSaved={() => {
            void navigate('/patients/new', { replace: true });
          }}
        />

        {/*
          The way back in after a disaster, and the way a prepared practice
          starts (found in the day-one rehearsal, 2026-08-30). This screen is
          the whole app until a format exists, and it had no links at all — so
          someone restoring onto a new machine, with every note sitting in a
          backup file, was asked to invent a note format instead. Restore lives
          in Settings; this is the door to it, and it opens the same modal
          Settings is rather than a page that no longer exists.
        */}
        <p className="small note-meta onboarding-restore">
          {t('format.restoreLead')}{' '}
          <button
            type="button"
            className="link-button"
            data-testid="onboarding-restore"
            onClick={() => {
              setRestoreOpen(true);
            }}
          >
            {t('format.restoreLink')}
          </button>
          .
        </p>
      </Screen>

      {restoreOpen && (
        <Dialog
          title={t('common.settings')}
          onClose={close}
          showTitle={false}
          className="modal card settings-modal"
          testId="settings-modal"
          backdropTestId="settings-backdrop"
        >
          <SettingsModalPanel initialSection="backup" onClose={close} closeRef={closeRef} />
        </Dialog>
      )}
    </>
  );
}
