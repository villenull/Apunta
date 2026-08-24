import { useState } from 'react';
import { useNavigate } from 'react-router';

import { createPatient, errorMessage } from '../api/index.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';

/** `prototype/add-patient.html` — name plus an optional internal reference. */
export function AddPatient(): React.JSX.Element {
  useDocumentTitle('New patient');
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [identifier, setIdentifier] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (name.trim().length === 0 || busy) return;

    setBusy(true);
    setError(null);
    try {
      const trimmedIdentifier = identifier.trim();
      const patient = await createPatient({
        name: name.trim(),
        ...(trimmedIdentifier.length > 0 ? { identifier: trimmedIdentifier } : {}),
      });
      await navigate(`/?patient=${patient.id}`, { replace: true });
    } catch (thrown) {
      setError(errorMessage(thrown));
      setBusy(false);
    }
  }

  return (
    <Screen back={{ to: '/', label: 'Back' }}>
      <h2 className="heading-tight">Add patient</h2>
      <p className="muted lede">Just enough to organize her notes.</p>

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="card">
          <div className="field">
            <label className="label" htmlFor="patient-name">
              Name
            </label>
            <input
              id="patient-name"
              type="text"
              placeholder="e.g. John Smith"
              value={name}
              onChange={(event) => {
                setName(event.target.value);
              }}
              autoFocus
            />
          </div>
          <div className="field field-last">
            <label className="label" htmlFor="patient-identifier">
              Identifier (optional)
            </label>
            <input
              id="patient-identifier"
              type="text"
              placeholder="Internal reference, chart number, etc."
              value={identifier}
              onChange={(event) => {
                setIdentifier(event.target.value);
              }}
            />
          </div>
        </div>

        {error !== null && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-block form-actions"
          disabled={busy || name.trim().length === 0}
        >
          {busy ? 'Adding…' : 'Add patient'}
        </button>
      </form>
    </Screen>
  );
}
