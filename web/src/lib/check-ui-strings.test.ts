import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The checker's own negative case.
 *
 * V2 alone cannot tell a working checker from a script that prints `0` and
 * exits 0, so this builds a tree the checker cannot know anything about, with
 * one literal of each kind S1.4's enumerator took, and asks it to find them.
 *
 * The tree lives in a `mkdtemp` directory outside the checkout and is removed
 * in `afterAll`; nothing is written inside the repository, and no file this
 * card owns is scanned by the run it makes.
 *
 * It lives under `web/src/lib/` rather than beside the script because
 * `scripts/` is in no vitest project (`vitest.config.ts`), and because the
 * checker guards the web tree.
 */

/**
 * The checker, found by walking up from this file.
 *
 * Not `new URL(…, import.meta.url)`: Vite rewrites that form into an asset
 * URL, which is not a path. Not `process.cwd()` either, which is wherever
 * vitest was started from. The script's own path is what the card's rows
 * invoke, so this resolves the same one they do.
 */
const SCRIPT = (() => {
  let directory = import.meta.dirname;
  while (!existsSync(join(directory, 'scripts', 'check-ui-strings.mjs'))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error('scripts/check-ui-strings.mjs is in no parent of this file');
    directory = parent;
  }
  return join(directory, 'scripts', 'check-ui-strings.mjs');
})();

/** Shaped like `web/src`, so the scan root and the exclusions are the real ones. */
const CARD = 'web/src/components/Card.tsx';

const SOURCE = `export function Card(): React.JSX.Element {
  return (
    <section className="card">
      <input placeholder="Find a patient" />
      <img src="avatar.png" alt="Patient directory" />
      <button type="button" title="Delete note">
        No notes yet
      </button>
      <span aria-label="Apunta">Apunta</span>
    </section>
  );
}
`;

/** The four literals that must be reported, and the one that must not. */
const REPORTED: ReadonlyArray<readonly [string, string]> = [
  ['placeholder="Find a patient"', 'Find a patient'],
  ['alt="Patient directory"', 'Patient directory'],
  ['title="Delete note"', 'Delete note'],
  ['No notes yet', 'No notes yet'],
];

/** The allowlist's job, on the one node kind the app uses it on today. */
const ALLOWLISTED = 'aria-label="Apunta"';

let root = '';
let report = '';
let status: number | null = null;

/** The 1-based line the marker sits on, so the assertion names the real line. */
function lineOf(marker: string): number {
  return SOURCE.split('\n').findIndex((line) => line.includes(marker)) + 1;
}

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'apunta-check-ui-strings-'));
  const file = join(root, CARD);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, SOURCE);

  // `process.execPath` rather than `node`, so the run is the same runtime the
  // test is in rather than whatever the ambient PATH resolves to.
  const run = spawnSync(process.execPath, [SCRIPT, '--report', root], { encoding: 'utf8' });
  status = run.status;
  report = run.stdout;
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('check-ui-strings', () => {
  it('reports each visible literal once, with its file, its line and its text', () => {
    const lines = report.trimEnd().split('\n');
    for (const [marker, text] of REPORTED) {
      const expected = `${join(root, CARD)}:${lineOf(marker)}: ${text}`;
      expect(
        lines.filter((line) => line === expected),
        expected,
      ).toEqual([expected]);
    }
  });

  it('does not report an allowlisted literal', () => {
    // `Apunta` is one of S1.4 §3.4's ten keep-as-is tokens, and the
    // `aria-label="Apunta"` at `BrandWordmark.tsx:34` is the only place the
    // tree uses one. A checker that matched everything, or that read the
    // allowlist as a prefix, would print it.
    expect(report).not.toContain('Apunta');
    expect(lineOf(ALLOWLISTED)).toBeGreaterThan(0);
  });

  it('ends with a TOTAL that counts the lines above it', () => {
    const lines = report.trimEnd().split('\n');
    const total = lines.at(-1) ?? '';
    expect(total).toMatch(/^TOTAL \d+$/);
    expect(lines.slice(0, -1)).toHaveLength(Number(total.slice('TOTAL '.length)));
    expect(Number(total.slice('TOTAL '.length))).toBe(REPORTED.length);
  });

  it('exits 0 in the documented report-only mode, and finds nothing that is not there', () => {
    expect(status).toBe(0);
    // No line from a file the fixture does not have, and no test path: the
    // report is exactly the four literals above.
    for (const line of report.trimEnd().split('\n').slice(0, -1)) {
      expect(line.startsWith(`${join(root, CARD)}:`), line).toBe(true);
    }
  });
});
