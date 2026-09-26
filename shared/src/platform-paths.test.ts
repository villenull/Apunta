import { describe, expect, it } from 'vitest';

import { platformDataDir } from './platform-paths.js';

/**
 * C-PATH@1's table, one case per row, with the exact string each row must
 * produce. Written out here rather than derived, because the whole point of
 * the contract is that the string is a decision: the `win32` rows are asserted
 * from a Linux host, where a `node:path` `join` would quietly return a POSIX
 * path and make them green here and wrong on Windows.
 *
 * The normalisation the rows depend on: `\` becomes `/`, runs of `/` collapse,
 * a trailing `/` is trimmed, and `..` is left alone (the value is normalised,
 * not resolved against a real tree).
 */
describe('platformDataDir', () => {
  it('honours a non-empty APUNTA_DATA_DIR byte-for-byte, spaces and all', () => {
    expect(platformDataDir('linux', { APUNTA_DATA_DIR: '/tmp/apunta v2/Ω' }, '/home/x')).toBe(
      '/tmp/apunta v2/Ω',
    );
  });

  it('lets the override beat every platform row, including APPDATA', () => {
    expect(platformDataDir('win32', { APUNTA_DATA_DIR: '/tmp/d', APPDATA: '/appdata' }, 'C:\\Users\\x')).toBe(
      '/tmp/d',
    );
  });

  it('treats an empty APUNTA_DATA_DIR as no override at all', () => {
    expect(platformDataDir('linux', { APUNTA_DATA_DIR: '' }, '/home/x')).toBe('/home/x/.local/share/apunta');
  });

  it('uses Application Support on darwin', () => {
    expect(platformDataDir('darwin', {}, '/Users/x')).toBe('/Users/x/Library/Application Support/Apunta');
  });

  it('uses APPDATA on win32 when it is set, with / separators either way', () => {
    expect(platformDataDir('win32', { APPDATA: 'C:\\Users\\x\\AppData\\Roaming' }, 'C:\\Users\\x')).toBe(
      'C:/Users/x/AppData/Roaming/Apunta',
    );
  });

  it('falls back to Roaming under the home folder on win32', () => {
    expect(platformDataDir('win32', {}, 'C:\\Users\\x')).toBe('C:/Users/x/AppData/Roaming/Apunta');
  });

  it('treats an empty APPDATA as no APPDATA', () => {
    expect(platformDataDir('win32', { APPDATA: '' }, 'C:\\Users\\x')).toBe(
      'C:/Users/x/AppData/Roaming/Apunta',
    );
  });

  it('uses XDG_DATA_HOME on other platforms when it is set', () => {
    expect(platformDataDir('linux', { XDG_DATA_HOME: '/data' }, '/home/x')).toBe('/data/apunta');
  });

  it('uses the XDG default under the home folder otherwise', () => {
    expect(platformDataDir('linux', {}, '/home/x')).toBe('/home/x/.local/share/apunta');
  });

  it('treats any platform that is not darwin or win32 as "other"', () => {
    expect(platformDataDir('freebsd', {}, '/home/x')).toBe('/home/x/.local/share/apunta');
  });
});
