import {
  CLINICIAN_CREDENTIAL_SETTING,
  CLINICIAN_LICENCE_SETTING,
  CLINICIAN_NAME_SETTING,
  CLINICIAN_NPI_SETTING,
  DEFAULT_LOOKBACK_NOTES,
  DEFAULT_REVIEW_INTERVAL_DAYS,
  LOOKBACK_SETTING,
  MAX_LOOKBACK_NOTES,
  REVIEW_INTERVAL_SETTING,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';

import { getSetting } from '../db/settings.js';

/**
 * The settings M9 reads.
 *
 * Every one of them has a default that works, because a plan she has not
 * configured must still be usable — and because a wrong number typed once and
 * trusted forever is the failure mode this area invites.
 */

function positiveInteger(value: unknown, fallback: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  const rounded = Math.floor(value);
  if (rounded < 1) return fallback;
  return Math.min(rounded, max);
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * How many recent notes the two-stage paths read.
 *
 * Capped hard as well as by the setting: the cap is what keeps the second
 * stage's prompt inside the context window, so it is not something a typo in
 * Settings gets to raise.
 */
export function resolveLookback(db: Database): number {
  return positiveInteger(getSetting(db, LOOKBACK_SETTING), DEFAULT_LOOKBACK_NOTES, MAX_LOOKBACK_NOTES);
}

/** Review cadence varies by payer, so it is data with a default, not a constant. */
export function resolveReviewInterval(db: Database): number {
  return positiveInteger(getSetting(db, REVIEW_INTERVAL_SETTING), DEFAULT_REVIEW_INTERVAL_DAYS, 3650);
}

export interface ClinicianIdentity {
  readonly clinician_name: string;
  readonly clinician_credential: string;
  readonly clinician_licence: string;
  readonly clinician_npi: string;
}

/** Snapshotted onto a plan version at activation, never joined at render time. */
export function resolveClinician(db: Database): ClinicianIdentity {
  return {
    clinician_name: text(getSetting(db, CLINICIAN_NAME_SETTING)),
    clinician_credential: text(getSetting(db, CLINICIAN_CREDENTIAL_SETTING)),
    clinician_licence: text(getSetting(db, CLINICIAN_LICENCE_SETTING)),
    clinician_npi: text(getSetting(db, CLINICIAN_NPI_SETTING)),
  };
}
