import { useI18n } from '../lib/i18n.js';

/**
 * The three-dot thinking cycle — the app's one universal "the AI is working"
 * signal (owner-proxy feedback, 2026-08-28: clicks felt instant and dead;
 * thinking should visibly breathe). Styles live in `styles/motion.css`;
 * under `prefers-reduced-motion` the dots hold steady instead of cycling.
 */
export function ThinkingDots({
  label,
  ariaLabel,
}: {
  label?: string;
  /** Spoken description when the visible label is omitted on purpose. */
  ariaLabel?: string;
}): React.JSX.Element {
  const { t } = useI18n();
  return (
    <span
      className="thinking"
      role="status"
      aria-label={ariaLabel ?? label ?? t('common.working')}
      data-testid="thinking-dots"
    >
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      {label === undefined ? null : <span className="thinking-label">{label}</span>}
    </span>
  );
}
