/**
 * C-PATH@1: the one function that computes the platform data folder.
 *
 * Every consumer — the server's `defaultDataDir`, the installer's
 * `defaultDataDir`, the sandbox wrapper, and later the Tauri shell, the backup
 * and restore helpers — delegates here, so there is one table rather than three
 * copies that happen to agree.
 *
 * Pure string handling on purpose: no `node:` import, so the module stays safe
 * in the browser bundle (`shared/src/index.ts` re-exports it and the web app
 * imports the package root), and `/` is the only separator, so the `win32`
 * rows are the same on every host. A `node:path` `join` would return a POSIX
 * path when this runs on Linux, which is how a Windows row stays green in a
 * Linux test suite and wrong on the one platform it exists to fix.
 */

/** `\` becomes `/`, runs of `/` collapse to one, a trailing `/` is trimmed. */
function normalise(value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/\/{2,}/g, '/')
    .replace(/\/+$/, '');
}

export function platformDataDir(
  platform: string,
  env: Readonly<Record<string, string | undefined>>,
  home: string,
): string {
  const override = env['APUNTA_DATA_DIR'];
  if (override !== undefined && override !== '') return normalise(override);
  if (platform === 'darwin') return `${normalise(home)}/Library/Application Support/Apunta`;
  if (platform === 'win32') {
    const appData = env['APPDATA'];
    if (appData !== undefined && appData !== '') return `${normalise(appData)}/Apunta`;
    return `${normalise(home)}/AppData/Roaming/Apunta`;
  }
  const xdg = env['XDG_DATA_HOME'];
  if (xdg !== undefined && xdg !== '') return `${normalise(xdg)}/apunta`;
  return `${normalise(home)}/.local/share/apunta`;
}
