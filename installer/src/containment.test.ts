import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * The exemption in `eslint.config.js` is sound only while this package runs
 * *before* the app does — a short-lived process the shell spawns for setup,
 * never the Fastify server and never the browser tab.
 *
 * That is a claim about the import graph, so it is checked as one. If anything
 * in `server/` or `web/` ever imports `@apunta/installer`, the code stops
 * being setup-time and the carve-out stops applying — and this test fails
 * before that ships.
 */

const SKIP = new Set(['node_modules', 'dist', '.git', 'coverage', 'test-results', 'playwright-report']);

function* sources(root: string): Generator<string> {
  let entries;
  try {
    entries = readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      yield* sources(path);
      continue;
    }
    if (/\.(ts|tsx|js|mjs|json)$/.test(entry.name)) yield path;
  }
}

describe('the installer is not part of the running app', () => {
  it('is imported by nothing in the server or the browser bundle', () => {
    const offenders: string[] = [];
    for (const root of ['server/src', 'web/src', 'web/public', 'shared/src']) {
      for (const file of sources(join(repoRoot, root))) {
        const text = readFileSync(file, 'utf8');
        if (text.includes('@apunta/installer')) offenders.push(relative(repoRoot, file));
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is not a dependency of the server, the web app, or the shared package', () => {
    for (const workspace of ['server', 'web', 'shared']) {
      const manifest = JSON.parse(readFileSync(join(repoRoot, workspace, 'package.json'), 'utf8')) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const names = [
        ...Object.keys(manifest.dependencies ?? {}),
        ...Object.keys(manifest.devDependencies ?? {}),
      ];
      expect(names, workspace).not.toContain('@apunta/installer');
    }
  });

  /**
   * The other direction matters too: the installer may depend on `shared`
   * (for the model tier table) but must not drag the server or the browser
   * app into a process that runs before either exists.
   */
  it('depends only on the shared package and zod', () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, 'installer', 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>;
    };
    expect(Object.keys(manifest.dependencies ?? {}).sort()).toEqual(['@apunta/shared', 'zod']);
  });

  it('leaves the server’s egress guard exactly where it was', () => {
    const guard = readFileSync(join(repoRoot, 'server', 'src', 'egress-guard.ts'), 'utf8');
    expect(guard).toContain("new Set(['127.0.0.1', 'localhost', '::1'])");
    expect(guard).not.toContain('huggingface');
    expect(guard).not.toContain('ollama.com');
    // And it is still installed first thing at boot.
    const entry = readFileSync(join(repoRoot, 'server', 'src', 'index.ts'), 'utf8');
    expect(entry).toContain('installEgressGuard();');
  });

  it('exists on disk as its own workspace, not inside another one', () => {
    expect(statSync(join(repoRoot, 'installer', 'package.json')).isFile()).toBe(true);
  });
});
