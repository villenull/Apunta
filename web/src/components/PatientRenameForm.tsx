import type { PatientListItem } from '@apunta/shared';
import { useState } from 'react';
import { createPortal } from 'react-dom';

import { useI18n } from '../lib/i18n.js';
import { Dialog } from './Dialog.js';
import { SpellLayer } from './SpellLayer.js';

export interface PatientRenameFormProps {
  patient: PatientListItem;
  /** Save a new name; imported names may be misspelt, and saving clears the guess flag. */
  onRename: (patient: PatientListItem, name: string) => void;
  onDone: () => void;
}

/**
 * The name editor Rename opens, as claude.ai's (AM-047): a small modal with the
 * name, one field, and Cancel / Save on the right. Portalled to the body so the
 * row it came from — draggable, animated, inside a scroll box — cannot clip or
 * transform it. Shared by the sidebar and the "View all" page so the two
 * spell-check the same way.
 */
export function PatientRenameForm({ patient, onRename, onDone }: PatientRenameFormProps): React.JSX.Element {
  const { t } = useI18n();
  const [name, setName] = useState(patient.name);
  const trimmed = name.trim();

  return createPortal(
    <Dialog
      title={t('patients.renameTitle', { name: patient.name })}
      onClose={onDone}
      className="modal card rename-modal"
      testId={`rename-dialog-${patient.id}`}
    >
      <form
        className="stack patient-rename"
        onSubmit={(event) => {
          event.preventDefault();
          if (trimmed === '') return;
          if (trimmed !== patient.name || patient.name_guessed === true) onRename(patient, trimmed);
          onDone();
        }}
      >
        <SpellLayer
          as="input"
          type="text"
          value={name}
          allowWords={[patient.name]}
          aria-label={t('patients.renameLabel', { name: patient.name })}
          autoFocus
          onChange={setName}
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <div className="modal-actions">
          <button type="button" className="btn" onClick={onDone}>
            {t('common.cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={trimmed === ''}
            data-testid={`save-name-${patient.id}`}
          >
            {t('common.save')}
          </button>
        </div>
      </form>
    </Dialog>,
    document.body,
  );
}
