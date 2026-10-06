import { lazy, Suspense, useState } from 'react';

import { Dialog } from '../components/Dialog.js';
import { CloseIcon } from '../components/icons.js';
import { useI18n } from '../lib/i18n.js';

/**
 * Import as a window over the workspace (owner, 2026-10-05), the same shape as
 * Settings: the page behind is blurred and dimmed and the workspace stays
 * mounted, so importing no longer means leaving it.
 *
 * Both importers live in this one window and switch inside it (the "More" row
 * has always served both). Code-split for the reason Settings is: the workspace
 * opens first and must not carry the import machinery until she asks for it.
 */
const ClaudeImportPanel = lazy(async () => ({
  default: (await import('./ClaudeImport.js')).ClaudeImportPanel,
}));

const HalaxyImportPanel = lazy(async () => ({
  default: (await import('./HalaxyImport.js')).HalaxyImportPanel,
}));

/**
 * Import as a window over the workspace (owner, 2026-10-05), the same shape as
 * Settings: the page behind is blurred and dimmed and the workspace stays
 * mounted, so importing no longer means leaving it.
 *
 * Both importers live in this one window and switch inside it (the "More" row
 * has always served both). Code-split for the reason Settings is: the workspace
 * opens first and must not carry the import machinery until she asks for it.
 *
 * `onImported` is the workspace's own signal that the list behind must read
 * itself again: the window is over a workspace that stays mounted, so an
 * import or an undo changes data the sidebar has already drawn and nothing
 * would tell it (the page behind is never remounted any more).
 */
export function ImportModal({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: () => void;
}): React.JSX.Element {
  const { t } = useI18n();
  const [source, setSource] = useState<'claude' | 'halaxy'>('claude');

  return (
    <Dialog
      title={t('settings.import')}
      onClose={onClose}
      showTitle={false}
      className="modal card import-modal"
      testId="import-modal"
      backdropTestId="import-backdrop"
    >
      <div className="import-modal-bar">
        <button
          type="button"
          className="icon-btn"
          aria-label={t('import.closeLabel')}
          data-testid="import-close"
          onClick={onClose}
        >
          <CloseIcon className="icon icon-sm" />
        </button>
      </div>
      <div className="import-modal-body">
        <Suspense fallback={null}>
          {source === 'claude' ? (
            <ClaudeImportPanel
              onSwitchToHalaxy={() => {
                setSource('halaxy');
              }}
              onClose={onClose}
              onImported={onImported}
            />
          ) : (
            <HalaxyImportPanel
              onSwitchToClaude={() => {
                setSource('claude');
              }}
              onClose={onClose}
              onImported={onImported}
            />
          )}
        </Suspense>
      </div>
    </Dialog>
  );
}
