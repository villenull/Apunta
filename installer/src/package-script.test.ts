import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

/**
 * What can be checked about `scripts/package-mac.sh` from a Linux container.
 *
 * Not whether it builds an app — nothing here has a macOS SDK, `swiftc`,
 * `codesign` or `hdiutil`, and the script's first act is to refuse. What *is*
 * checkable is the class of mistake that survives a careful read:
 *
 * - it refuses on a non-Mac rather than producing a broken artifact, which is
 *   an acceptance criterion in its own right;
 * - `--dry-run` walks every step without executing one;
 * - it never turns `WHISPER_COMMON_FFMPEG` on, which would link whisper.cpp
 *   against libav\* and re-engage every LGPL obligation this project deleted
 *   rather than met;
 * - every binary it downloads is checksum-pinned, and every host it fetches
 *   from is on the installer's own allow-list;
 * - it ad-hoc signs even when there is no Developer ID, because on Apple
 *   Silicon an unsigned arm64 helper may not execute at all.
 */

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(repoRoot, 'scripts', 'package-mac.sh');
const source = readFileSync(script, 'utf8');

interface RunResult {
  readonly status: number;
  readonly output: string;
}

function run(args: readonly string[], env: NodeJS.ProcessEnv = {}): RunResult {
  try {
    const output = execFileSync('bash', [script, '--no-color', ...args], {
      encoding: 'utf8',
      env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60_000,
    });
    return { status: 0, output };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string; stderr?: string };
    return { status: failure.status ?? -1, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
  }
}

describe('the refusal on a non-Mac', () => {
  /**
   * The acceptance criterion, verbatim: "The packaging script fails loudly and
   * clearly when run on a non-Mac rather than producing a broken artifact."
   */
  it('fails, says why, and says what to run instead', () => {
    const result = run([]);
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('can only be built on macOS');
    expect(result.output).toContain('Nothing was created');
    expect(result.output).toContain('APUNTA_PACKAGE_ALLOW_NON_MACOS=1');
  });

  it('refuses a dry run too, unless the escape hatch is set explicitly', () => {
    expect(run(['--dry-run']).status).not.toBe(0);
    expect(run(['--dry-run'], { APUNTA_PACKAGE_ALLOW_NON_MACOS: '1' }).status).toBe(0);
  });

  /**
   * The escape hatch is for *looking*, never for building. A real run with it
   * set must still refuse, or the hatch becomes the way a broken artifact gets
   * made.
   */
  it('never lets the escape hatch turn into a real build', () => {
    const result = run([], { APUNTA_PACKAGE_ALLOW_NON_MACOS: '1' });
    expect(result.status).not.toBe(0);
    expect(result.output).toContain('can only be built on macOS');
  });
});

describe('the dry run', () => {
  const result = run(['--dry-run'], { APUNTA_PACKAGE_ALLOW_NON_MACOS: '1' });

  it('reaches the end without running anything', () => {
    expect(result.status).toBe(0);
    expect(result.output).toContain('Dry run finished. Nothing was built.');
  });

  it('walks every step', () => {
    for (const heading of [
      'Tools',
      'Building Apunta itself',
      'Fetching the runtimes',
      'Compiling whisper-cli',
      'Assembling Apunta.app',
      'Trimming to Apple Silicon',
      'Signing',
      'Notarizing',
      'Building the disk image',
    ]) {
      expect(result.output, heading).toContain(heading);
    }
  });

  it('says plainly that it is neither signing nor notarizing without credentials', () => {
    expect(result.output).toContain('no APUNTA_SIGN_IDENTITY');
    expect(result.output).toContain('no APUNTA_NOTARY_PROFILE');
  });

  it('leaves no output directory behind', () => {
    expect(result.output).not.toContain('Built.');
  });
});

describe('what the script pins', () => {
  it('downloads nothing without a pinned SHA-256', () => {
    const urls = [...source.matchAll(/^[A-Z_]*URL="(https:\/\/[^"]+)"/gm)].map((match) => match[1]);
    expect(urls.length).toBeGreaterThan(0);
    // Every download goes through the same verify-then-use helper.
    expect(source).toContain('fetch_verified');
    expect(source).toMatch(/NODE_SHA256="[0-9a-f]{64}"/);
    expect(source).toMatch(/OLLAMA_SHA256="[0-9a-f]{64}"/);
  });

  it('pins a whisper.cpp tag rather than tracking a branch', () => {
    expect(source).toMatch(/WHISPER_TAG="v\d+\.\d+\.\d+"/);
    expect(source).toContain('--branch "$WHISPER_TAG"');
  });

  /**
   * `WHISPER_COMMON_FFMPEG=ON` adds an ffmpeg decode fallback and links
   * whisper.cpp against libav\*, which re-engages every LGPL obligation this
   * project designed out. Nothing in Apunta has invoked ffmpeg since M5.
   */
  it('never mentions ffmpeg except to switch it off', () => {
    expect(source).toContain('-DWHISPER_COMMON_FFMPEG=OFF');
    expect(source).not.toContain('WHISPER_COMMON_FFMPEG=ON');
  });

  it('embeds the Metal shaders rather than shipping loose .metal files', () => {
    expect(source).toContain('-DGGML_METAL_EMBED_LIBRARY=ON');
  });

  it('builds arm64 only, at the minimum macOS its binaries actually require', () => {
    expect(source).toContain('-DCMAKE_OSX_ARCHITECTURES=arm64');
    expect(source).toMatch(/MIN_MACOS="14\.0"/);
    const plist = readFileSync(join(repoRoot, 'macos', 'Apunta', 'Info.plist'), 'utf8');
    expect(plist).toContain('<key>LSMinimumSystemVersion</key>');
    expect(plist).toContain('<string>14.0</string>');
  });
});

describe('signing', () => {
  /**
   * Deferred distribution signing does not excuse this. On Apple Silicon an
   * unsigned arm64 helper may refuse to execute at all, so `node`, the AI
   * runtime and `whisper-cli` can fail at spawn *after* Gatekeeper has been
   * cleared — the app opens and silently does nothing.
   */
  it('ad-hoc signs when there is no Developer ID, rather than skipping', () => {
    expect(source).toContain('IDENTITY="-"');
    expect(source).toContain('codesign --force --sign "$IDENTITY"');
  });

  it('signs inside-out and verifies with --deep --strict', () => {
    const signLibraries = source.indexOf("-name '*.dylib'");
    const signApp = source.indexOf('--entitlements "$REPO_ROOT/macos/Apunta/Apunta.entitlements"');
    expect(signLibraries).toBeGreaterThan(0);
    expect(signApp).toBeGreaterThan(signLibraries);
    expect(source).toContain('codesign --verify --deep --strict');
  });

  it('refuses to notarize an ad-hoc signed app instead of failing at Apple', () => {
    expect(source).toContain('The notary service rejects ad-hoc signed apps');
  });

  it('ships no get-task-allow entitlement, which would fail notarization outright', () => {
    const entitlements = readFileSync(join(repoRoot, 'macos', 'Apunta', 'Apunta.entitlements'), 'utf8');
    expect(entitlements).not.toContain('<key>com.apple.security.get-task-allow</key>');
  });
});

describe('the app shell', () => {
  const swift = ['Paths', 'ServerProcess', 'SetupRunner', 'SetupWindow', 'AppDelegate', 'main'].map((name) =>
    readFileSync(join(repoRoot, 'macos', 'Apunta', `${name}.swift`), 'utf8'),
  );
  const allSwift = swift.join('\n');

  it('is compiled from exactly the files the script names', () => {
    for (const name of ['Paths', 'ServerProcess', 'SetupRunner', 'SetupWindow', 'AppDelegate', 'main']) {
      expect(source, name).toContain(`macos/Apunta/${name}.swift`);
    }
  });

  /**
   * Hard rule 1, checked in the one language ESLint cannot see. The shell may
   * talk to 127.0.0.1 and may hand a URL to the browser when the user clicks a
   * link; it may not fetch anything itself.
   */
  it('names no host but loopback', () => {
    const urls = [...allSwift.matchAll(/https?:\/\/[^\s"')]+/g)].map((match) => match[0]);
    for (const url of urls) {
      expect(url, url).toMatch(/^https?:\/\/(127\.0\.0\.1|localhost)/);
    }
  });

  it('has no updater, because hard rule 1 has no exception for one', () => {
    expect(allSwift).not.toMatch(/checkForUpdate|Sparkle|autoUpdater|latestVersion/i);
    expect(allSwift).toContain('There is deliberately no "Check for updates"');
  });

  /**
   * The shell spawns `node` and nothing else. Letting it spawn the AI runtime
   * directly is where orphans come from: a flat tree of three unrelated
   * processes has no single owner to tear them down.
   */
  it('spawns only node', () => {
    const executables = [...allSwift.matchAll(/executableURL = (\S+)/g)].map((match) => match[1]);
    expect(executables.length).toBeGreaterThan(0);
    for (const executable of executables) expect(executable).toBe('Paths.node');
  });

  it('never sets OLLAMA_DEBUG, which would write every prompt to a log file', () => {
    expect(allSwift).toContain('environment.removeValue(forKey: "OLLAMA_DEBUG")');
  });

  it('does not add LSMultipleInstancesProhibited, which is about users not instances', () => {
    const plist = readFileSync(join(repoRoot, 'macos', 'Apunta', 'Info.plist'), 'utf8');
    expect(plist).not.toContain('LSMultipleInstancesProhibited');
    expect(allSwift).toContain('applicationShouldHandleReopen');
  });
});
