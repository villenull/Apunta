import { Link } from 'react-router';

import { BrandWordmark } from './BrandWordmark.js';
import { BackIcon } from './icons.js';

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
        {/* The wordmark, as outlines: the name is not typed in a font at
            runtime (P2.1). The old prototype treatment — scribble mark plus a
            lowercased label — is gone; `BrandWordmark` carries the colour.
            The foreground colour (owner preview, 2026-09-26): the mark sits at
            Claude-logo size, in the body colour rather than the brand's teal,
            and its height is the `--logo-h` token rather than a number here. */}
        <BrandWordmark tone="text" />
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
