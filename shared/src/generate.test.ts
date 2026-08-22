import { describe, expect, it } from 'vitest';

import { GenerateRequestSchema } from './generate.js';

const PATIENT = '0198c0f0-0000-7000-8000-000000000001';
const FORMAT = '0198c0f0-0000-7000-8000-000000000002';

describe('GenerateRequestSchema', () => {
  it('accepts typed notes on their own — the primary path', () => {
    const parsed = GenerateRequestSchema.safeParse({
      patient_id: PATIENT,
      format_id: FORMAT,
      typed_notes: 'Sleep improved, intrusive thoughts less frequent.',
    });
    expect(parsed.success).toBe(true);
  });

  it('accepts a transcript on its own, and both together', () => {
    expect(
      GenerateRequestSchema.safeParse({ patient_id: PATIENT, format_id: FORMAT, transcript: 'Okay, so…' })
        .success,
    ).toBe(true);
    expect(
      GenerateRequestSchema.safeParse({
        patient_id: PATIENT,
        format_id: FORMAT,
        typed_notes: 'Sleep improved.',
        transcript: 'Okay, so…',
      }).success,
    ).toBe(true);
  });

  it('rejects a request with nothing to draft from', () => {
    expect(GenerateRequestSchema.safeParse({ patient_id: PATIENT, format_id: FORMAT }).success).toBe(false);
    expect(
      GenerateRequestSchema.safeParse({ patient_id: PATIENT, format_id: FORMAT, typed_notes: '   ' }).success,
    ).toBe(false);
  });
});
