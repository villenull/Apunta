import { Link } from 'react-router';

import { useI18n } from '../lib/i18n.js';
import { BrandMark } from './BrandMark.js';
import { PanelLeftIcon, PeopleIcon, PlusIcon, SearchIcon } from './icons.js';
import { MissionControl } from './PatientsColumn.js';

export interface SidebarRailProps {
  /** Open the full sidebar again. */
  onExpand: () => void;
  /** Open the full sidebar with its search field focused. */
  onSearch: () => void;
  /** "View all": the full patient list. */
  onOpenAll: () => void;
  onOpenSettings: () => void;
  onUnavailable: (what: string) => void;
  /** Opens the language chooser; omitted by a rail rendered without one. */
  onOpenLanguage?: (() => void) | undefined;
}

/**
 * The collapsed sidebar, as ChatGPT's (owner, 2026-09-26): a slim column of
 * icons for the main things instead of nothing at all. The A at the top opens
 * the sidebar again — the panel glyph takes its place under the pointer, so
 * the control says what it does — then New patient, Search and Patients, and
 * "More"'s gear at the foot where the full sidebar keeps it. No
 * library: Apunta has nothing to put there.
 */
export function SidebarRail({
  onExpand,
  onSearch,
  onOpenAll,
  onOpenSettings,
  onUnavailable,
  onOpenLanguage,
}: SidebarRailProps): React.JSX.Element {
  const { t } = useI18n();

  return (
    <nav className="sidebar-rail" aria-label={t('common.patients')} data-testid="sidebar-rail">
      <button
        type="button"
        className="rail-btn rail-brand"
        aria-label={t('patients.showColumn')}
        title={t('patients.showColumn')}
        data-testid="sidebar-reopen"
        onClick={onExpand}
      >
        <BrandMark className="rail-brand-mark" />
        <PanelLeftIcon className="icon rail-icon rail-brand-panel" />
      </button>

      <div className="rail-group">
        <Link
          to="/patients/new"
          className="rail-btn"
          aria-label={t('patients.new')}
          title={t('patients.new')}
          data-testid="rail-new"
        >
          <PlusIcon className="icon rail-icon" />
        </Link>
        <button
          type="button"
          className="rail-btn"
          aria-label={t('common.searchPatients')}
          title={t('common.searchPatients')}
          data-testid="rail-search"
          onClick={onSearch}
        >
          <SearchIcon className="icon rail-icon" />
        </button>
        <button
          type="button"
          className="rail-btn"
          aria-label={t('common.patients')}
          title={t('common.patients')}
          data-testid="rail-patients"
          onClick={onOpenAll}
        >
          <PeopleIcon className="icon rail-icon" />
        </button>
      </div>

      <div className="rail-foot">
        <MissionControl
          t={t}
          onOpenSettings={onOpenSettings}
          onUnavailable={onUnavailable}
          onOpenLanguage={onOpenLanguage}
          compact
        />
      </div>
    </nav>
  );
}
