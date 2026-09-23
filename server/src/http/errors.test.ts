import { describe, expect, it } from 'vitest';

import { storageErrorFor } from './errors.js';

const folder = '/tmp/apunta-storage';

describe('storageErrorFor', () => {
  it.each([
    ['ENOSPC', 'disk is full'],
    ['SQLITE_FULL', 'disk is full'],
    ['EACCES', 'read-only or permissions'],
    ['EPERM', 'read-only or permissions'],
    ['EROFS', 'read-only or permissions'],
    ['SQLITE_READONLY', 'read-only or permissions'],
    ['SQLITE_READONLY_DIRECTORY', 'read-only or permissions'],
    ['SQLITE_CANTOPEN', 'read-only or permissions'],
  ])('maps %s to an actionable message', (code, phrase) => {
    const mapped = storageErrorFor({ code }, folder);
    expect(mapped).not.toBeNull();
    expect(mapped?.code).toBe('storage_error');
    expect(mapped?.message).toContain(folder);
    expect(mapped?.message).toContain(phrase);
  });

  it('does not disguise unrelated failures as storage failures', () => {
    expect(storageErrorFor({ code: 'EIO' }, folder)).toBeNull();
    expect(storageErrorFor(new Error('model failed'), folder)).toBeNull();
  });
});
