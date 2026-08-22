import { SendIcon } from './icons.js';

const QUICK_ACTIONS = ['Shorter', 'More clinical', 'Expand plan', "What's missing?"] as const;

/**
 * The "Refine with AI" half of `prototype/patients.html`, rendered but inert:
 * the whole column — thread, quick actions, composer — is disabled until M4
 * wires it to the streaming chat endpoint.
 */
export function RefineColumn(): React.JSX.Element {
  return (
    <div className="chat-col">
      <div className="chat-header">
        <h3>Refine with AI</h3>
      </div>

      <div className="chat-thread">
        <p className="small chat-placeholder">
          Ask a question about this note, or give feedback to refine it.
        </p>
        <p className="small later-milestone" data-testid="refine-placeholder">
          AI arrives in a later milestone.
        </p>
      </div>

      <div className="quick-actions">
        {QUICK_ACTIONS.map((label) => (
          <button key={label} type="button" className="btn small btn-quick" disabled>
            {label}
          </button>
        ))}
      </div>

      <div className="chat-input-row">
        <input
          type="text"
          placeholder="Ask a question or give feedback..."
          aria-label="Ask a question or give feedback"
          disabled
        />
        <button type="button" className="btn btn-primary" aria-label="Send" disabled>
          <SendIcon className="icon icon-sm" />
        </button>
      </div>
    </div>
  );
}
