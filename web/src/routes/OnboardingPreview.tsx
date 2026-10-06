import { Navigate, useLocation, useNavigate } from 'react-router';

import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useI18n } from '../lib/i18n.js';
import { asFormatDraft } from './formatDraft.js';
import { FormatDraftEditor } from './FormatDraftEditor.js';

/**
 * The confirm-and-save step of the first-run format flow. The step itself is
 * `FormatDraftEditor`, which Settings also uses to edit a format it already
 * has; this route is the page around it, and where "saved" goes afterwards.
 */
export function OnboardingPreview(): React.JSX.Element {
  const { t } = useI18n();
  useDocumentTitle(t('doc.noteFormat'));
  const location = useLocation();
  const navigate = useNavigate();
  const draft = asFormatDraft(location.state);

  // Reached without a draft (a reload, or a typed URL): start the flow again.
  if (!draft) return <Navigate to="/onboarding/format" replace />;

  return (
    <Screen back={{ to: '/onboarding/format', label: t('common.back') }}>
      <div className="progress">
        <div className="dot done" />
        <div className="dot done" />
      </div>

      <FormatDraftEditor
        draft={draft}
        onSaved={() => {
          void navigate('/patients/new', { replace: true });
        }}
        onCancel={() => {
          void navigate('/onboarding/format');
        }}
      />
    </Screen>
  );
}
