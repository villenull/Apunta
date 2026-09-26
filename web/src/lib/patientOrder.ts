import type { PatientListItem } from '@apunta/shared';

import type { RecencyMap } from '../hooks/usePatientRecency.js';

/**
 * The sidebar's order, in the owner's preview (2026-09-26):
 *
 *  1. pinned patients, in the order she pinned and dragged them;
 *  2. everyone else by when their last note was last edited, newest first.
 *
 * A patient with no notes yet has no edit to sort by, so they fall back to
 * when they were added. The order is stable — ties keep the list the server
 * sent, which is oldest-added first.
 */
export function orderPatients(
  patients: readonly PatientListItem[],
  recency: RecencyMap,
  pinnedIds: readonly string[],
): PatientListItem[] {
  const pinned = pinnedIds
    .map((id) => patients.find((patient) => patient.id === id))
    .filter((patient): patient is PatientListItem => patient !== undefined);
  const rest = patients
    .filter((patient) => !pinnedIds.includes(patient.id))
    .sort((a, b) => sortKey(b, recency) - sortKey(a, recency));
  return [...pinned, ...rest];
}

function sortKey(patient: PatientListItem, recency: RecencyMap): number {
  const lastNote = recency.get(patient.id);
  const at =
    lastNote === null || lastNote === undefined ? Date.parse(patient.created_at) : Date.parse(lastNote);
  return Number.isNaN(at) ? 0 : at;
}

/** Where a patient sits among the pinned rows, or -1 when unpinned. */
export function pinnedIndex(patientId: string, pinnedIds: readonly string[]): number {
  return pinnedIds.indexOf(patientId);
}
