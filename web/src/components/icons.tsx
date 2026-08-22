/**
 * The prototype's inline SVGs, one component each. Copied path-for-path from
 * `prototype/*.html` — nothing is fetched, so there is no icon font and no
 * sprite sheet to load (CLAUDE.md hard rule 1).
 */

export interface IconProps {
  /** Explicitly `| undefined`: the repo compiles with exactOptionalPropertyTypes. */
  className?: string | undefined;
}

interface StrokeIconProps extends IconProps {
  children: React.ReactNode;
}

function StrokeIcon({ className, children }: StrokeIconProps): React.JSX.Element {
  return (
    <svg className={className ?? 'icon'} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      {children}
    </svg>
  );
}

/** The wordless Apunta mark: a scribble resolving into a line. */
export function MarkIcon({ className }: IconProps): React.JSX.Element {
  return (
    <svg className={className ?? 'mark'} viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path
        d="M2 12c1-3 2-4 3-2s1 5 3 3 1-6 3-3 1 5 3 2"
        stroke="var(--accent)"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M14 12h8" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </StrokeIcon>
  );
}

export function BackIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M15 18l-6-6 6-6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function PeopleIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M17 21v-2a4 4 0 00-4-4H7a4 4 0 00-4 4v2M10 11a4 4 0 100-8 4 4 0 000 8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function DocumentIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M14 3v5h5M6 3h8l5 5v13H6z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

/** Same glyph as DocumentIcon, drawn at the heavier weight the option rows use. */
export function TemplateIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M14 3v5h5M6 3h8l5 5v13H6z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function ExamplesIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M9 3h9v13H9zM6 7v14h11"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function PencilIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function UploadIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M12 16V4M7 9l5-5 5 5M4 20h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function MicIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path d="M12 15a3 3 0 003-3V6a3 3 0 00-6 0v6a3 3 0 003 3z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M19 11a7 7 0 01-14 0M12 18v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </StrokeIcon>
  );
}

export function KeyboardIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <rect x="3" y="6" width="18" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M7 10h.01M11 10h.01M15 10h.01M7 14h6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </StrokeIcon>
  );
}

export function TrashIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M3 6h18M8 6V4a1 1 0 011-1h6a1 1 0 011 1v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function CopyIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <rect x="9" y="9" width="12" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.5" />
    </StrokeIcon>
  );
}

export function PublishIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M12 19V5M5 12l7-7 7 7"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function CheckIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M20 6L9 17l-5-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function SendIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function CloseIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </StrokeIcon>
  );
}
