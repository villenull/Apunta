import { useSyncExternalStore } from 'react';

import { useI18n } from '../lib/i18n.js';
import { isWorkspaceFrozen, subscribeWorkspaceFrozen } from '../lib/maintenance.js';

/**
 * The workspace while a quiesce holds it (C-UPD@1).
 *
 * The overlay takes the pointer; the capture-phase listeners take the keyboard
 * and text input that is already focused somewhere underneath it. Nothing here
 * touches the network, the flush's own save, navigation or `pagehide`, and the
 * close dialog (`.close-confirm`) sits above and keeps working. The freeze
 * lifts only when `lib/maintenance.ts` sees an authoritative
 * `settled{held:false}`, never because a wait expired.
 */
export function WorkspaceFreeze(): React.JSX.Element | null {
  const { t } = useI18n();
  const frozen = useSyncExternalStore(subscribeWorkspaceFrozen, isWorkspaceFrozen, isWorkspaceFrozen);

  if (!frozen) return null;
  return (
    <div className="workspace-freeze" data-testid="workspace-freeze" role="status">
      <p className="workspace-freeze-message small">{t('workspaceFreeze.message')}</p>
    </div>
  );
}
