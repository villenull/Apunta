import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { createPatient, errorMessage } from '../api/index.js';
import { SpellLayer } from '../components/SpellLayer.js';
import { Screen } from '../components/TopBar.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useI18n } from '../lib/i18n.js';

/** `prototype/add-patient.html` — name plus an optional internal reference. */
export function AddPatient(): React.JSX.Element {
  const { t } = useI18n();
  useDocumentTitle(t('doc.newPatient'));
  const navigate = useNavigate();
  // The home search's "New" option hands over what she typed.
  const [params] = useSearchParams();
  const [name, setName] = useState(() => params.get('name') ?? '');
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
    <Screen back={{ to: '/', label: t('common.back') }}>
      <h2 className="heading-tight">{t('patients.add')}</h2>
      <p className="muted lede">{t('patients.addLede')}</p>

      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
      >
        <div className="card">
          <div className="field">
            <label className="label" htmlFor="patient-name">
              {t('common.name')}
            </label>
            <SpellLayer
              as="input"
              id="patient-name"
              type="text"
              placeholder={t('patients.namePlaceholder')}
              value={name}
              onChange={(value) => {
                setName(value);
              }}
              autoFocus
            />
          </div>
          <div className="field field-last">
            <label className="label" htmlFor="patient-identifier">
              {t('patients.identifierLabel')}
            </label>
            <input
              id="patient-identifier"
              type="text"
              placeholder={t('patients.identifierPlaceholder')}
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
          {busy ? t('common.adding') : t('patients.add')}
        </button>
      </form>
    </Screen>
  );
}
