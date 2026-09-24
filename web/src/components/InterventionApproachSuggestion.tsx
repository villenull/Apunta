/**
 * A suggested intervention-approach label beside the draft, never in it.
 *
 * The shared matcher only names an approach already evidenced by the
 * Intervention prose; this card shows that exact label with its exact
 * evidence substring so the therapist can confirm it into the note or leave
 * the note byte-identical. It renders outside the note body, so save, Copy
 * and Finish & copy never see it until she explicitly adds it.
 */
export interface InterventionApproachSuggestionProps {
  /** The exact PDF approach label from the shared matcher. */
  readonly approach: string;
  /** The exact evidence substring from the Intervention prose. */
  readonly evidence: string;
  /** Locked while a refine may rewrite the note, like the editor itself. */
  readonly disabled?: boolean | undefined;
  readonly onAdd: () => void;
  readonly onDismiss: () => void;
}

export function InterventionApproachSuggestion({
  approach,
  evidence,
  disabled = false,
  onAdd,
  onDismiss,
}: InterventionApproachSuggestionProps): React.JSX.Element {
  return (
    <section
      className="approach-suggestion"
      data-testid="approach-suggestion"
      aria-label="Suggested intervention approach"
    >
      <p className="approach-suggestion-title" data-testid="approach-suggestion-title">
        Possible approach for Intervention
      </p>
      <p className="small" data-testid="approach-suggestion-approach">
        {approach}
      </p>
      <blockquote className="approach-suggestion-evidence" data-testid="approach-suggestion-evidence">
        &ldquo;{evidence}&rdquo;
      </blockquote>
      <div className="row gap-8 approach-suggestion-actions">
        <button
          type="button"
          className="btn small btn-compact"
          data-testid="approach-suggestion-add"
          disabled={disabled}
          onClick={onAdd}
        >
          Add {approach} to Intervention
        </button>
        <button
          type="button"
          className="btn small btn-compact"
          data-testid="approach-suggestion-dismiss"
          disabled={disabled}
          onClick={onDismiss}
        >
          Not now
        </button>
      </div>
    </section>
  );
}
