/**
 * The three-dot thinking cycle — the app's one universal "the AI is working"
 * signal (owner-proxy feedback, 2026-08-28: clicks felt instant and dead;
 * thinking should visibly breathe). Styles live in `styles/motion.css`;
 * under `prefers-reduced-motion` the dots hold steady instead of cycling.
 */
export function ThinkingDots({ label }: { label?: string }): React.JSX.Element {
  return (
    <span className="thinking" role="status" aria-label={label ?? 'Working'} data-testid="thinking-dots">
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      {label === undefined ? null : <span className="thinking-label">{label}</span>}
    </span>
  );
}
