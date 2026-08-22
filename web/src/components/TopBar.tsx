import { Link } from 'react-router';

import { BackIcon, MarkIcon } from './icons.js';

/**
 * The `.topbar` from `prototype/style.css`, in its two forms: a back link
 * (add-patient, capture, settings, onboarding-preview) or the brand mark
 * (onboarding-format).
 */
export interface TopBarProps {
  back?: { to: string; label: string };
}

export function TopBar({ back }: TopBarProps): React.JSX.Element {
  if (!back) {
    return (
      <div className="topbar">
        <MarkIcon />
        <span className="brand">Apunta</span>
      </div>
    );
  }

  return (
    <div className="topbar">
      <Link to={back.to} className="back">
        <BackIcon className="icon icon-sm" />
        {back.label}
      </Link>
    </div>
  );
}

export interface ScreenProps extends TopBarProps {
  wide?: boolean;
  children: React.ReactNode;
}

/** A single-column screen: `.shell` + `.topbar` + `.content`. */
export function Screen({ back, wide, children }: ScreenProps): React.JSX.Element {
  return (
    <div className={wide === true ? 'shell wide' : 'shell'}>
      <TopBar {...(back ? { back } : {})} />
      <div className="content">{children}</div>
    </div>
  );
}
