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

export function ChatIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v8a2.5 2.5 0 0 1-2.5 2.5H12l-4.6 3.4a.6.6 0 0 1-.95-.48V17H6.5A2.5 2.5 0 0 1 4 14.5v-8Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
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

/** Brainstorm's Stop, in the send arrow's place while a reply streams. Not in the prototype. */
export function StopIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <rect x="7" y="7" width="10" height="10" rx="1.5" fill="currentColor" />
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

/** Three dots: "more actions" for a row. */
export function MoreIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <circle cx="5" cy="12" r="1.6" fill="currentColor" />
      <circle cx="12" cy="12" r="1.6" fill="currentColor" />
      <circle cx="19" cy="12" r="1.6" fill="currentColor" />
    </StrokeIcon>
  );
}

/*
 * The owner preview's Claude-flavoured glyphs. Drawn here rather than loaded
 * anywhere: still no icon font, no sprite, nothing fetched (hard rule 1).
 */

/** The magnifier in the sidebar's search field. */
export function SearchIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <circle cx="11" cy="11" r="6.5" stroke="currentColor" strokeWidth="1.6" />
      <path d="M16 16l4.5 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </StrokeIcon>
  );
}

/** The panel toggle at the top-left of the sidebar. */
export function PanelLeftIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9.5 4v16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </StrokeIcon>
  );
}

/**
 * A pushpin leaning to the right, as claude.ai draws its Pin: the head up and to
 * the right, the needle down and to the left.
 */
export function PinIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <g transform="translate(12 12) rotate(45) scale(1.15) translate(-12 -12)">
        <path
          d="M7.5 2h9M9 2v6.5L5.5 14h13L15 8.5V2z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path d="M12 14v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </StrokeIcon>
  );
}

/** Two upright sliders, the control beside claude.ai's "Older" label. */
export function SortIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path d="M8 4v2M8 10v10M16 4v9M16 17v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="15" r="2" stroke="currentColor" strokeWidth="1.5" />
    </StrokeIcon>
  );
}

/** The box a patient is archived into. */
export function ArchiveIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M3.5 7.5h17v3h-17zM5 10.5v8.5a1 1 0 001 1h12a1 1 0 001-1v-8.5M10 14.5h4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

export function GearIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
    </StrokeIcon>
  );
}

export function GlobeIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M3.5 12h17M12 3.5c2.4 2.3 3.6 5.1 3.6 8.5S14.4 18.2 12 20.5c-2.4-2.3-3.6-5.1-3.6-8.5S9.6 5.8 12 3.5z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </StrokeIcon>
  );
}

export function HelpIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M9.6 9.4a2.5 2.5 0 114 2.2c-.9.6-1.6 1.1-1.6 2.4M12 17.2h.01"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </StrokeIcon>
  );
}

/*
 * The glyphs Claude puts where Apunta has no prototype icon: the three themes,
 * and one per settings section. Same set as everything above — the wrapper's
 * 24-unit box drawn at 16px by `.icon-sm`, `fill="none"`, `currentColor`, and
 * a stroke of 1.5 on every path so a row of them reads at one weight.
 */

/** Theme → System: the machine's own setting, so a display with a stand. */
export function MonitorIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 17v3.5M8.5 20.5h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </StrokeIcon>
  );
}

/** Theme → Light. */
export function SunIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12 2.5v2.2M12 19.3v2.2M2.5 12h2.2M19.3 12h2.2M5.2 5.2l1.6 1.6M17.2 17.2l1.6 1.6M18.8 5.2l-1.6 1.6M6.8 17.2l-1.6 1.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </StrokeIcon>
  );
}

/** Theme → Dark. A crescent, the way every desktop app draws it. */
export function MoonIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M20.4 14.7A8.6 8.6 0 0 1 9.3 3.6a8.6 8.6 0 1 0 11.1 11.1z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

/** Settings → Backup: the store the backups are written out of. */
export function DatabaseIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <ellipse cx="12" cy="6" rx="7.5" ry="3" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </StrokeIcon>
  );
}

/** Settings → Import: the mirror of UploadIcon, which lifts a file out. */
export function DownloadIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M12 4v12M7.5 11.5L12 16l4.5-4.5M4 20h16"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </StrokeIcon>
  );
}

/** Settings → Advanced: three rows, each with a knob to move. */
export function SlidersIcon({ className }: IconProps): React.JSX.Element {
  return (
    <StrokeIcon className={className}>
      <path
        d="M3.5 7h5M13.5 7h7M3.5 12h9.5M16.5 12h4M3.5 17h4.5M13 17h7.5"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="11" cy="7" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="15.5" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="10.5" cy="17" r="2.5" stroke="currentColor" strokeWidth="1.5" />
    </StrokeIcon>
  );
}
