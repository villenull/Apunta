import { useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';

import { createPatient, errorMessage } from '../api/index.js';
import { Dialog } from '../components/Dialog.js';
import { CloseIcon } from '../components/icons.js';
import { SpellLayer } from '../components/SpellLayer.js';
import { useDocumentTitle } from '../hooks/useDocumentTitle.js';
import { useI18n } from '../lib/i18n.js';
import { Workspace } from './Workspace.js';

/**
 * Adding a patient, as a little window over the workspace rather than a screen
 * of its own (owner, 2026-09-27, after Claude's): the practice is still there,
 * dimmed and blurred behind, and the way out is the × at the top right instead
 * of a Back link — the same close control Settings has. The fields are the ones
 * that were here: a name and an optional internal reference. The lede is gone;
 * the window says what it is.
 *
 * It stays the `/patients/new` route, so every existing way in still works and
 * the home search's "New: Ana Torres" still arrives with the name filled in.
 * `Dialog` owns Escape, the trapped tab order and returning focus to whatever
 * opened it.
 */
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
  // The name field, not the × that precedes it in the panel: the first thing
  // she does in this window is type a name. This holds for every way in from
  // inside the app, all of which are client-side navigations. Loading
  // /patients/new cold is the one case that does not: `usePrimaryWindow` parks
  // focus on the route wrapper when the window first wins the primary lock,
  // and it does that in the frame after this one. Left as it is rather than
  // papered over with a second focus call — the caret is in the name by the
  // time she can see the window, which is a frame later than this.
  const nameRef = useRef<HTMLInputElement>(null);

  /**
   * Back where she came from. `history.state.idx` is react-router's own depth
   * counter, so a window opened from a link has something to go back to and a
   * link typed straight into the address bar does not — that one leaves for the
   * workspace, which is where every entry point lives anyway.
   */
  function close(): void {
    const depth = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (depth > 0) {
      navigate(-1);
    } else {
      navigate('/', { replace: true });
    }
  }

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
    <>
      <Workspace />
      <Dialog
        title={t('patients.add')}
        onClose={close}
        showTitle={false}
        className="modal card add-patient-modal"
        testId="add-patient-modal"
        backdropTestId="add-patient-backdrop"
        initialFocusRef={nameRef}
      >
        <div className="add-patient-head">
          <h2 className="heading-tight">{t('patients.add')}</h2>
          <button
            type="button"
            className="icon-btn"
            aria-label={t('patients.addClose')}
            data-testid="add-patient-close"
            onClick={close}
          >
            <CloseIcon className="icon icon-sm" />
          </button>
        </div>

        <form
          data-testid="add-patient-form"
          onSubmit={(event) => {
            void handleSubmit(event);
          }}
        >
          <div className="field">
            <label className="label" htmlFor="patient-name">
              {t('common.name')}
            </label>
            <SpellLayer
              as="input"
              ref={nameRef}
              id="patient-name"
              type="text"
              placeholder={t('patients.namePlaceholder')}
              value={name}
              onChange={(value) => {
                setName(value);
              }}
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
      </Dialog>
    </>
  );
}
