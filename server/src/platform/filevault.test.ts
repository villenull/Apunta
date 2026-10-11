import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearFileVaultCache,
  fileVaultStatus,
  parseFdesetupStatus,
  parseLinuxEncryption,
  probeFileVault,
} from './filevault.js';

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
    const status = await probeFileVault({ platform: 'win32', run });

    expect(status.state).toBe('not_applicable');
    expect(run).not.toHaveBeenCalled();
  });

  it('on Linux, asks about the disk under the data folder', async () => {
    const calls: string[][] = [];
    const run = vi.fn(async (command: string, args: readonly string[]) => {
      calls.push([command, ...args]);
      return command === 'findmnt' ? '/dev/mapper/root[/@home] btrfs\n' : 'crypt\npart\ndisk\n';
    });
    const status = await probeFileVault({
      platform: 'linux',
      run,
      dataDir: '/home/john/.local/share/apunta',
    });

    expect(status).toEqual({ state: 'on', detail: 'LUKS (/dev/mapper/root)' });
    expect(calls).toEqual([
      ['findmnt', '-n', '-o', 'SOURCE,FSTYPE', '--target', '/home/john/.local/share/apunta'],
      ['lsblk', '-s', '-n', '-o', 'TYPE', '/dev/mapper/root'],
    ]);
  });

  it('on Linux, answers unknown when the tools fail — never off', async () => {
    const status = await probeFileVault({
      platform: 'linux',
      run: async () => {
        throw new Error('spawn findmnt ENOENT');
      },
    });
    expect(status.state).toBe('unknown');
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

describe('parseLinuxEncryption', () => {
  it('reads LUKS anywhere under the device as encrypted', () => {
    expect(parseLinuxEncryption('/dev/mapper/root btrfs', 'crypt\npart\ndisk').state).toBe('on');
    expect(parseLinuxEncryption('/dev/mapper/vg-home ext4', 'lvm\ncrypt\npart\ndisk').state).toBe('on');
  });

  it('reads a plain partition as not encrypted', () => {
    expect(parseLinuxEncryption('/dev/nvme0n1p2 ext4', 'part\ndisk')).toEqual({
      state: 'off',
      detail: 'no encryption under /dev/nvme0n1p2',
    });
  });

  it('reads an eCryptfs home as encrypted', () => {
    expect(parseLinuxEncryption('/home/.ecryptfs/john/.Private ecryptfs', null).state).toBe('on');
  });

  it('says unknown, not off, for anything that is not a disk device', () => {
    expect(parseLinuxEncryption('tmpfs tmpfs', null).state).toBe('unknown');
    expect(parseLinuxEncryption('server:/share nfs4', null).state).toBe('unknown');
  });
});
