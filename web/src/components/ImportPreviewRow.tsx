import { calendarDay } from '@apunta/shared';

import { formatPlanDate } from '../lib/format.js';

export interface ImportPreviewRowProps {
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly title: string;
  readonly date?: string;
  readonly excerpt?: string;
  readonly ariaLabel: string;
  readonly testId?: string;
}

/** One compact, reviewable row shared by Claude and Halaxy previews. */
export function ImportPreviewRow({
  checked,
  onChange,
  title,
  date,
  excerpt,
  ariaLabel,
  testId,
}: ImportPreviewRowProps): React.JSX.Element {
  return (
    <label className="import-preview-row">
      <input
        type="checkbox"
        checked={checked}
        aria-label={ariaLabel}
        {...(testId === undefined ? {} : { 'data-testid': testId })}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="import-preview-copy">
        <span className="import-preview-title">
          <span className="import-preview-title-text">{title}</span>
          {date !== undefined && (
            <span className="import-preview-date"> · {formatPlanDate(calendarDay(date))}</span>
          )}
        </span>
        {excerpt !== undefined && <span className="import-preview-excerpt">{excerpt}</span>}
      </span>
    </label>
  );
}
