import { describe, expect, it } from 'vitest';

import { CreateNoteFormatRequestSchema, SectionsSchema } from './note-format.js';
import { CreateNoteRequestSchema, UpdateNoteRequestSchema } from './note.js';
import { CreatePatientRequestSchema, UpdatePatientRequestSchema } from './patient.js';
import { SettingsSchema } from './settings.js';

/**
 * These schemas are what the server validates against, so the cases worth
 * pinning are the ones that would otherwise reach SQLite as bad rows.
 */

describe('CreatePatientRequestSchema', () => {
  it('trims the name and treats identifier as optional', () => {
    expect(CreatePatientRequestSchema.parse({ name: '  John Smith ' })).toEqual({ name: 'John Smith' });
    expect(CreatePatientRequestSchema.parse({ name: 'John Smith', identifier: null })).toEqual({
      name: 'John Smith',
      identifier: null,
    });
  });

  it('rejects a blank name', () => {
    expect(CreatePatientRequestSchema.safeParse({ name: '   ' }).success).toBe(false);
  });
});

describe('UpdatePatientRequestSchema', () => {
  it('requires at least one field', () => {
    expect(UpdatePatientRequestSchema.safeParse({}).success).toBe(false);
    expect(UpdatePatientRequestSchema.safeParse({ archived: true }).success).toBe(true);
  });
});

describe('SectionsSchema', () => {
  it('needs at least one section and rejects duplicates case-insensitively', () => {
    expect(SectionsSchema.safeParse([]).success).toBe(false);
    expect(SectionsSchema.safeParse(['Plan', 'plan']).success).toBe(false);
    expect(SectionsSchema.parse([' Subjective ', 'Plan'])).toEqual(['Subjective', 'Plan']);
  });
});

describe('CreateNoteFormatRequestSchema', () => {
  it('leaves source and instructions unset so the server can default them', () => {
    expect(CreateNoteFormatRequestSchema.parse({ name: 'Progress note', sections: ['Plan'] })).toEqual({
      name: 'Progress note',
      sections: ['Plan'],
    });
  });

  it('rejects an unknown source', () => {
    const result = CreateNoteFormatRequestSchema.safeParse({
      name: 'Progress note',
      sections: ['Plan'],
      source: 'imported',
    });
    expect(result.success).toBe(false);
  });
});

describe('note request schemas', () => {
  it('requires both ids on create and allows empty content on update', () => {
    expect(CreateNoteRequestSchema.safeParse({ patient_id: 'not-a-uuid' }).success).toBe(false);
    expect(UpdateNoteRequestSchema.safeParse({ content: '' }).success).toBe(true);
    expect(UpdateNoteRequestSchema.safeParse({}).success).toBe(false);
  });
});

describe('SettingsSchema', () => {
  it('accepts JSON values under lower_snake_case keys only', () => {
    expect(SettingsSchema.safeParse({ keep_audio: false, stt_vocabulary: ['CBT'] }).success).toBe(true);
    expect(SettingsSchema.safeParse({ 'Keep Audio': false }).success).toBe(false);
  });
});
