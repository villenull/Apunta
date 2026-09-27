import type { PatientGroup } from '@apunta/shared';
import { useCallback, useEffect, useRef, useState } from 'react';

import { listPatientGroups } from '../api/index.js';

/**
 * The named lists patients can be filed under, in creation order (owner,
 * 2026-09-27).
 *
 * Held here rather than fetched per menu because the sidebar headings and every
 * row's "Move to group" submenu read the same list, and a group list that
 * arrives twice would show a patient under a heading that does not exist yet.
 * `reload` is what Workspace calls after a move or a create, so the headings and
 * the submenu cannot disagree.
 */
/**
 * Which of the three things is true, because they are three different sentences.
 *
 * This was a `failed: boolean` with nothing reading it, and the submenu rendered
 * "No groups yet" whenever the list was empty — which is simultaneously *before
 * the first answer arrives*, *a practice with no groups*, and *a request that
 * failed*. The third of those is a claim about her data, and it is false. One
 * field rather than two booleans, because "loading and failed" is not a state
 * this can be in and two booleans would let it look so.
 */
export type PatientGroupsState = 'loading' | 'ready' | 'error';

export interface PatientGroups {
  readonly groups: readonly PatientGroup[];
  /** Refetch after something changed the list, and after a failure. */
  readonly reload: () => void;
  readonly state: PatientGroupsState;
}

export function usePatientGroups(): PatientGroups {
  const [groups, setGroups] = useState<readonly PatientGroup[]>([]);
  const [state, setState] = useState<PatientGroupsState>('loading');
  /**
   * Whether an answer has ever arrived, in a ref rather than read off `state`.
   * `reload` is in the dependency list of the effect that calls it, so anything
   * it closes over has to be stable — a `groups.length` dependency would have
   * re-fetched every time the list changed length, which is exactly when
   * Workspace asks for a reload.
   */
  const answered = useRef(false);

  const reload = useCallback(() => {
    const controller = new AbortController();
    // Only claim "loading" when there is nothing to show. A reload after a move
    // is not a blank sidebar: the headings she already has stay, and the state
    // goes back to what it was.
    setState((was) => (answered.current ? was : 'loading'));
    void listPatientGroups(controller.signal).then(
      (loaded) => {
        answered.current = true;
        setGroups(loaded);
        setState('ready');
      },
      /*
       * A failure is no longer swallowed, and it is still not a toast: the
       * feature is additive, so a practice that cannot list its groups can still
       * see, draft and file everything else. What changed is that the submenu
       * says *this request failed* and offers to try again, instead of claiming
       * she has no groups. The move itself still reports its own failure.
       */
      () => {
        setState('error');
      },
    );
    return () => {
      controller.abort();
    };
  }, []);

  useEffect(reload, [reload]);

  return { groups, reload, state };
}
