import { afterEach, describe, expect, it, vi } from 'vitest';

import { clearFileVaultCache, fileVaultStatus, parseFdesetupStatus, probeFileVault } from './filevault.js';

afterEach(() => {
  clearFileVaultCache();
});

/**
 * The wordings below are the ones `scripts/preflight-macos.sh` verified from
 * sources. The script and the app have to agree — a Mac that the preflight
 * calls encrypted and the app calls unknown is worse than either answer alone.
 */
describe('parseFdesetupStatus', () => {
  it('reads the three states macOS actually reports', () => {
    expect(parseFdesetupStatus('FileVault is On.')).toBe('on');
    expect(parseFdesetupStatus('FileVault is Off.')).toBe('off');
    expect(
      parseFdesetupStatus(
        "FileVault is Off, but will be enabled after the next restart.\nDeferred enablement appears to be active for user 'her'.",
      ),
    ).toBe('deferred');
  });

  it('calls deferred enablement deferred, not off', () => {
    // The deferred wording contains "FileVault is Off", so order matters. One
    // is a logout away from encrypted; the other is a decision nobody made.
    expect(parseFdesetupStatus('Deferred enablement appears to be active.')).toBe('deferred');
  });

  it('keeps encryption-in-progress as on', () => {
    expect(parseFdesetupStatus('FileVault is On.\nEncryption in progress: Percent completed = 42')).toBe(
      'on',
    );
  });

  it('answers unknown rather than guessing at wording it has not seen', () => {
    expect(parseFdesetupStatus('')).toBe('unknown');
    expect(parseFdesetupStatus('Error: You must be root.')).toBe('unknown');
  });
});

describe('probeFileVault', () => {
  it('does not run fdesetup off darwin, which is what keeps the server portable', async () => {
    const run = vi.fn();
    const status = await probeFileVault({ platform: 'linux', run });

    expect(status.state).toBe('not_applicable');
    expect(run).not.toHaveBeenCalled();
  });

  it('reports what the machine said, first line only', async () => {
    const status = await probeFileVault({
      platform: 'darwin',
      run: async () => 'FileVault is On.\nsomething else entirely',
    });

    expect(status.state).toBe('on');
    expect(status.detail).toBe('FileVault is On.');
  });

  it('answers unknown when the command fails — never off', async () => {
    const status = await probeFileVault({
      platform: 'darwin',
      run: async () => {
        throw new Error('spawn fdesetup ENOENT');
      },
    });

    expect(status.state).toBe('unknown');
    expect(status.detail).toContain('ENOENT');
  });
});

describe('the cache', () => {
  it('shells out once, not once per health poll', async () => {
    const run = vi.fn(async () => 'FileVault is On.');
    const options = { platform: 'darwin', run };

    await fileVaultStatus(1_000, options);
    await fileVaultStatus(1_100, options);
    await fileVaultStatus(200_000, options);
    expect(run).toHaveBeenCalledTimes(1);

    // …and looks again once it is stale, so turning FileVault on is visible
    // without restarting the app.
    await fileVaultStatus(1_000_000, options);
    expect(run).toHaveBeenCalledTimes(2);
  });
});
