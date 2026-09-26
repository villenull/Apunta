import type { PatientListItem } from '@apunta/shared';
import { useState } from 'react';

import { SpellLayer } from './SpellLayer.js';

export interface PatientRenameFormProps {
  patient: PatientListItem;
  /** Save a new name; imported names may be misspelt, and saving clears the guess flag. */
  onRename: (patient: PatientListItem, name: string) => void;
  onDone: () => void;
}

/**
 * The inline name editor a row swaps into when Rename is chosen. Shared by the
 * sidebar and the "View all" page so the two spell-check the same way.
 */
export function PatientRenameForm({ patient, onRename, onDone }: PatientRenameFormProps): React.JSX.Element {
  const [name, setName] = useState(patient.name);

  return (
    <form
      className="row gap-8 patient-rename"
      onSubmit={(event) => {
        event.preventDefault();
        const trimmed = name.trim();
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
        aria-label={`Name for ${patient.name}`}
        autoFocus
        onChange={setName}
        onKeyDown={(event) => {
          if (event.key === 'Escape') onDone();
        }}
      />
      <button type="submit" className="btn small" data-testid={`save-name-${patient.id}`}>
        Save
      </button>
    </form>
  );
}
