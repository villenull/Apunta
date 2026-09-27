import type { PatientListItem } from '@apunta/shared';
import { useRef, useState } from 'react';

import { useI18n } from '../lib/i18n.js';
import { SpellLayer } from './SpellLayer.js';

export interface PatientRenameFieldProps {
  patient: PatientListItem;
  /** Save a new name; imported names may be misspelt, and saving clears the guess flag. */
  onRename: (patient: PatientListItem, name: string) => void;
  onDone: () => void;
  className?: string;
}

/**
 * Rename, as claude.ai does it (owner, 2026-09-26): the row itself becomes the
 * field, the whole name already selected in the system's highlight colour, so
 * she types the new one straight over it. Enter or clicking away saves, Escape
 * puts the old name back, and an empty field saves nothing. Shared by the
 * sidebar and the "View all" page so the two spell-check the same way.
 */
export function PatientRenameField({
  patient,
  onRename,
  onDone,
  className,
}: PatientRenameFieldProps): React.JSX.Element {
  const { t } = useI18n();
  const [name, setName] = useState(patient.name);
  // Enter saves and then unmounts the field, which blurs it: without this the
  // blur would save a second time.
  const settled = useRef(false);

  function finish(save: boolean): void {
    if (settled.current) return;
    settled.current = true;
    const trimmed = name.trim();
    if (save && trimmed !== '' && (trimmed !== patient.name || patient.name_guessed === true)) {
      onRename(patient, trimmed);
    }
    onDone();
  }

  return (
    <div
      className={['rename-field', className].filter(Boolean).join(' ')}
      data-testid={`rename-field-${patient.id}`}
      onBlur={(event) => {
        // The spelling menu opens inside the field; moving into it is not
        // leaving.
        if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
        finish(true);
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
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            finish(true);
          } else if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            finish(false);
          }
        }}
      />
    </div>
  );
}
