import type { PatientListItem } from '@apunta/shared';
import { useEffect, useMemo, useState } from 'react';

import { listNotes } from '../api/index.js';

/**
 * When each patient's notes were last edited — the order the sidebar and the
 * "View all" page sort by.
 *
 * preview-only: persist server-side in the real card. `GET /api/patients`
 * carries a note *count* and nothing about dates, so this preview asks for
 * each patient's notes and keeps the newest `updated_at`. That is N extra
 * loopback reads (six at a time, once per patient per session, cached below)
 * where the real card would return one `last_note_at` column in the list
 * response it already sends.
 */

/** patientId → the instant its last note was edited; `null` when it has none. */
export type RecencyMap = ReadonlyMap<string, string | null>;

/** Kept for the life of the tab: a patient is only ever asked once. */
const cache = new Map<string, string | null>();
const inFlight = new Set<string>();
const CONCURRENCY = 6;

function latestEdit(notes: readonly { updated_at: string }[]): string | null {
  let latest: number | null = null;
  let stamp: string | null = null;
  for (const note of notes) {
    const at = Date.parse(note.updated_at);
    if (Number.isNaN(at)) continue;
    if (latest === null || at > latest) {
      latest = at;
      stamp = note.updated_at;
    }
  }
  return stamp;
}

export function usePatientRecency(patients: readonly PatientListItem[]): RecencyMap {
  const [version, setVersion] = useState(0);
  const key = patients.map((patient) => patient.id).join(',');

  useEffect(() => {
    const queue = patients.map((patient) => patient.id).filter((id) => !cache.has(id) && !inFlight.has(id));
    if (queue.length === 0) return undefined;
    const controller = new AbortController();
    let live = true;

    const worker = async (): Promise<void> => {
      for (;;) {
        const id = queue.shift();
        if (id === undefined) return;
        inFlight.add(id);
        try {
          cache.set(id, latestEdit(await listNotes(id, controller.signal)));
        } catch {
          // A patient whose notes will not load sorts by their created date
          // rather than disappearing: a missing date is not an error here.
          cache.set(id, null);
        } finally {
          inFlight.delete(id);
          if (live) setVersion((count) => count + 1);
        }
      }
    };

    const running = Promise.all(
      Array.from({ length: Math.min(CONCURRENCY, queue.length) }, () => worker()),
    ).catch(() => undefined);
    void running.then(() => {
      live = false;
      controller.abort();
    });
    return () => {
      live = false;
      controller.abort();
    };
    // `key` is the identity of the list: same ids, nothing to ask for again.
  }, [key, patients]);

  return useMemo(() => {
    const map = new Map<string, string | null>();
    for (const patient of patients) map.set(patient.id, cache.get(patient.id) ?? null);
    return map;
  }, [patients, version]);
}
