import { Link } from 'react-router';

import { BrandWordmark } from './BrandWordmark.js';
import { BackIcon } from './icons.js';

/**
 * The `.topbar` from `prototype/style.css`, in its two forms: a back link
 * (add-patient, capture, settings, onboarding-preview) or the brand mark
 * (onboarding-format).
 *
 * `back.label` stays a plain `string` and this file holds no literal of its
 * own, so there is nothing here for a catalogue to reach. That is deliberate:
 * retyping the prop to take a `MessageKey` would type every call site, and
 * every call site is a route screen whose strings are S2.4's. The caller
 * resolves the label in its own file and hands over a finished string; the only
 * literal in this component's closure is `BrandWordmark.tsx:34`'s
 * `aria-label="Apunta"`, which is a keep-as-is token in
 * `scripts/check-ui-strings.allow.json` and is never translated.
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
