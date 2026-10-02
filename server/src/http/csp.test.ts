import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../app.js';
import { buildBootErrorApp } from '../boot-error.js';
import { loadConfig } from '../config.js';
import { openDatabase, type Database } from '../db/index.js';
import { seedFormat, seedPatient } from '../test/harness.js';

/**
 * C-BRIDGE@1 rule 6, driven through `app.inject`.
 *
 * Both servers send the header, so every HTML case is asserted against both the
 * main app and the boot-error server, and every non-HTML case against both
 * where each server has one.
 *
 * **The web bundle this row needs is the row's own.** `web/dist` is gitignored
 * and `build:shared` does not build it, so `app.ts` would otherwise take its
 * `hasBuiltSpa` false branch and there would be no static `index.html` and no SPA
 * fallback to assert on — the two HTML cases would be silently absent rather
 * than failing. The directory below is written here and `APUNTA_WEB_DIST` is
 * passed to `loadConfig` **explicitly**, never inherited, so neither a
 * developer's shell nor a stale `web/dist` can change what this row runs
 * against. The data directory is this row's own for the same reason.
 */

/** C-BRIDGE@1 rule 6's six directives, exactly. Nothing weaker, nothing added. */
const RULE_6 = [
  { name: 'default-src', sources: ["'self'"] },
  { name: 'script-src', sources: ["'self'"] },
  { name: 'connect-src', sources: ["'self'"] },
  { name: 'object-src', sources: ["'none'"] },
  { name: 'base-uri', sources: ["'none'"] },
  { name: 'frame-ancestors', sources: ["'none'"] },
] as const;

const HEADER = 'content-security-policy';

/**
 * The one relaxation this card makes, in its one permitted directive.
 *
 * Spelled in parts so that this file holds exactly one copy of the token, which
 * is what lets the case below assert that neither this test nor `csp.ts` names
 * it anywhere else — the assertion that fails if anybody reached for
 * `style-src 'unsafe-inline'` instead.
 */
const INLINE_TOKEN = ['unsafe', 'inline'].join('-');

/**
 * A document this row owns, standing in for the built SPA.
 *
 * It is HTML with a root element and **no `<style>` element**, which is what
 * makes the boot page's nonce rewrite provable: the header reaches these
 * responses, and the payload they send is untouched.
 */
const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>Apunta</title></head>
  <body><div id="root"></div><script type="module" src="/assets/index.js"></script></body>
</html>
`;

/** `directive -> its sources`, for one header value. */
function parsePolicy(value: string): Map<string, string[]> {
  const policy = new Map<string, string[]>();
  for (const part of value.split(';')) {
    const trimmed = part.trim();
    if (trimmed === '') continue;
    const [name, ...sources] = trimmed.split(/\s+/);
    if (name !== undefined) policy.set(name, sources);
  }
  return policy;
}

/** Every directive that names the token, in header order. */
function directivesWithInlineToken(value: string): string[] {
  return [...parsePolicy(value)]
    .filter(([, sources]) => sources.includes(`'${INLINE_TOKEN}'`))
    .map(([name]) => name);
}

/** The nonce `style-src` carries, or `null`. */
function styleNonce(value: string): string | null {
  const sources = parsePolicy(value).get('style-src') ?? [];
  const source = sources.find((candidate) => candidate.startsWith("'nonce-"));
  return source === undefined ? null : source.slice("'nonce-".length, -1);
}

function headerOf(response: LightMyRequestResponse): string {
  return response.headers[HEADER] ?? '';
}

function sibling(relative: string): string {
  return fileURLToPath(new URL(relative, import.meta.url));
}

/**
 * The executable lines of a source file that name `needle`.
 *
 * Comment lines are dropped, because a comment may *describe* a directive while
 * only an executable line can emit one.
 */
function executableLinesWith(file: string, needle: string): string[] {
  return readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(\*|\/\/|\/\*)/.test(line))
    .filter((line) => line.includes(needle));
}

describe("C-BRIDGE@1 rule 6's Content-Security-Policy", () => {
  /** The app is configured with `APUNTA_PORT: '80'` because `inject` writes
   * `Host: localhost:80` for a path-only URL — the same reason `test/harness.ts`
   * does it, and what C-REQ@1's guard checks an injected request against. */
  const MAIN_PORT = 80;
  const BOOT_PORT = 7812;

  const BOOT_OPTIONS = {
    dataDir: '/tmp/apunta-csp-boot',
    key: 'errors.storage_error.disk_full',
    params: { dir: '/tmp/apunta-csp-boot' },
  } as const;

  let dataDir = '';
  let webDistDir = '';
  let db: Database | undefined;
  let main: FastifyInstance | undefined;
  let boot: FastifyInstance | undefined;

  beforeAll(async () => {
    dataDir = mkdtempSync(join(tmpdir(), 'apunta-csp-data-'));
    webDistDir = mkdtempSync(join(tmpdir(), 'apunta-csp-web-'));
    writeFileSync(join(webDistDir, 'index.html'), INDEX_HTML, 'utf8');

    const config = loadConfig({
      APUNTA_PORT: String(MAIN_PORT),
      APUNTA_DATA_DIR: dataDir,
      APUNTA_FAKE_AI: '1',
      APUNTA_FAKE_STREAM_DELAY_MS: '0',
      APUNTA_WEB_DIST: webDistDir,
    });
    db = openDatabase({ file: config.dbFile, migrationsDir: config.migrationsDir }).db;
    main = await buildApp({ config, db, logger: false });
    await main.ready();
    boot = buildBootErrorApp(BOOT_OPTIONS, BOOT_PORT);
    await boot.ready();
  });

  afterAll(async () => {
    if (main !== undefined) await main.close();
    if (boot !== undefined) await boot.close();
    if (db !== undefined) db.close();
    rmSync(dataDir, { recursive: true, force: true });
    rmSync(webDistDir, { recursive: true, force: true });
  });

  function inject(server: 'main' | 'boot', options: InjectOptions): Promise<LightMyRequestResponse> {
    const app = server === 'main' ? main : boot;
    if (app === undefined) throw new Error('the fixture is not built');
    const port = server === 'main' ? MAIN_PORT : BOOT_PORT;
    return app.inject({
      ...options,
      headers: {
        host: `localhost:${String(port)}`,
        origin: `http://127.0.0.1:${String(port)}`,
        'sec-fetch-site': 'same-origin',
        ...options.headers,
      },
    });
  }

  /** The header on every HTML response this row can reach, from both servers. */
  async function everyHtmlHeader(): Promise<string[]> {
    const headers: string[] = [];
    for (const [server, url] of [
      ['main', '/'],
      ['main', '/patients'],
      ['boot', '/'],
      ['boot', '/anything'],
    ] as const) {
      const response = await inject(server, { method: 'GET', url });
      expect(response.headers['content-type'], `${server} ${url}`).toContain('text/html');
      headers.push(headerOf(response));
    }
    return headers;
  }

  // ---------------------------------------------------------------- (i) ----

  describe('is sent on every HTML response, and carries rule 6 verbatim', () => {
    const cases = [
      { name: 'the static index.html @fastify/static serves', server: 'main', url: '/' },
      { name: 'the SPA fallback a client-side route lands on', server: 'main', url: '/patients' },
      { name: 'the boot-error page', server: 'boot', url: '/' },
      { name: 'the boot-error server non-API not-found page', server: 'boot', url: '/anything' },
    ] as const;

    for (const testCase of cases) {
      it(testCase.name, async () => {
        const response = await inject(testCase.server, { method: 'GET', url: testCase.url });
        const header = headerOf(response);

        expect(response.headers['content-type']).toContain('text/html');
        expect(header).not.toBe('');
        for (const directive of RULE_6) {
          expect(parsePolicy(header).get(directive.name)).toEqual(directive.sources);
          // Verbatim, so a weakened spelling (`script-src 'self' 'unsafe-inline'`)
          // fails on the string as well as on the parsed sources.
          expect(header).toContain(`${directive.name} ${directive.sources.join(' ')}`);
        }
      });
    }
  });

  // ---------------------------------------------------------------- (ii) ----

  it("matches the boot page's header nonce to the nonce on its own inline <style>", async () => {
    const response = await inject('boot', { method: 'GET', url: '/' });
    const header = headerOf(response);
    const nonce = styleNonce(header);

    expect(nonce).not.toBeNull();
    expect(parsePolicy(header).get('style-src')).toEqual(["'self'", `'nonce-${String(nonce)}'`]);
    expect(parsePolicy(header).get('style-src-attr')).toEqual([`'${INLINE_TOKEN}'`]);

    // The nonce in **the payload the hook decorated**, which is the only place
    // it exists: `bootErrorHtml` is built once at construction and the hook puts
    // it on the element it rewrites, so this cannot be a coincidence of two
    // independently generated values.
    expect(response.body).toContain(`<style nonce="${String(nonce)}">`);
    expect(response.body).not.toContain('<style>');

    // The rewritten payload is intact end to end, which is what proves the byte
    // length Fastify re-measures after `onSend` matches what it sends.
    expect(response.headers['content-length']).toBe(String(Buffer.byteLength(response.body)));
    expect(response.body).toContain('<html lang="en">');
    expect(response.body).toContain('</html>');
  });

  it('gives two consecutive boot-page responses different nonces', async () => {
    const first = await inject('boot', { method: 'GET', url: '/' });
    const second = await inject('boot', { method: 'GET', url: '/again' });
    const firstNonce = styleNonce(headerOf(first));
    const secondNonce = styleNonce(headerOf(second));

    expect(firstNonce).not.toBeNull();
    expect(secondNonce).not.toBeNull();
    expect(firstNonce).not.toBe(secondNonce);
    expect(first.body).toContain(`<style nonce="${String(firstNonce)}">`);
    expect(second.body).toContain(`<style nonce="${String(secondNonce)}">`);
  });

  it('emits the header and nothing else on app HTML, which has no <style> element', async () => {
    for (const url of ['/', '/patients']) {
      const response = await inject('main', { method: 'GET', url });

      expect(response.body).toBe(INDEX_HTML);
      expect(response.body).not.toContain('nonce=');
      // The header still carries a nonce, because it is emitted on every HTML
      // response; there is simply no element for it to authorise.
      expect(styleNonce(headerOf(response))).not.toBeNull();
    }
  });

  // --------------------------------------------------------------- (iii) ----

  it('allows the inline token in style-src-attr and in no other directive', async () => {
    const headers = await everyHtmlHeader();

    expect(headers.length).toBeGreaterThan(0);
    for (const header of headers) {
      expect(directivesWithInlineToken(header)).toEqual(['style-src-attr']);
      // Spelled out separately, so substituting `style-src 'unsafe-inline'`
      // fails here and is not merely caught by the set comparison above.
      expect(parsePolicy(header).get('style-src')).not.toContain(`'${INLINE_TOKEN}'`);
      for (const directive of RULE_6) {
        expect(parsePolicy(header).get(directive.name)).toEqual(directive.sources);
      }
    }

    // And in the source that builds the header: on exactly one line of executable
    // code, and on the `style-src-attr` line. Prose is excluded because prose
    // *describes* the directive and cannot emit one; a second executable copy in
    // `csp.ts` is the substitution this row's decision refuses, and it fails here
    // rather than being argued about.
    expect(executableLinesWith(sibling('./csp.ts'), INLINE_TOKEN)).toEqual([
      expect.stringContaining('style-src-attr'),
    ]);
    // This test names the token zero times in code: it builds the one it compares
    // with from parts, above, so that this assertion can exist at all.
    expect(executableLinesWith(fileURLToPath(import.meta.url), INLINE_TOKEN)).toEqual([]);
  });

  // ---------------------------------------------------------------- (iv) ----

  it('is absent from JSON, from an SSE response and from the /api 404 JSON', async () => {
    const json = await inject('main', { method: 'GET', url: '/api/patients' });
    expect(json.statusCode).toBe(200);
    expect(json.headers[HEADER]).toBeUndefined();

    const notFound = await inject('main', { method: 'GET', url: '/api/nothing-here' });
    expect(notFound.statusCode).toBe(404);
    expect(notFound.headers['content-type']).toContain('application/json');
    expect(notFound.headers[HEADER]).toBeUndefined();

    // A real SSE reply, so "not HTML" is proved on the one response type that
    // never settles its own content type before the hook runs.
    if (main === undefined) throw new Error('the fixture is not built');
    const patient = await seedPatient(main, 'John Smith');
    const format = await seedFormat(main);
    const stream = await main.inject({
      method: 'POST',
      url: '/api/generate',
      headers: {
        host: `localhost:${String(MAIN_PORT)}`,
        origin: `http://127.0.0.1:${String(MAIN_PORT)}`,
        'sec-fetch-site': 'same-origin',
        'content-type': 'application/json',
      },
      payload: {
        patient_id: patient.id,
        format_id: format.id,
        typed_notes: 'Sleep improved this fortnight.',
      },
    });
    expect(stream.headers['content-type']).toContain('text/event-stream');
    expect(stream.headers[HEADER]).toBeUndefined();

    // The boot server's two JSON bodies.
    const bootHealth = await inject('boot', { method: 'GET', url: '/api/health' });
    expect(bootHealth.headers['content-type']).toContain('application/json');
    expect(bootHealth.headers[HEADER]).toBeUndefined();

    const bootNotFound = await inject('boot', { method: 'GET', url: '/api/nothing' });
    expect(bootNotFound.headers['content-type']).toContain('application/json');
    expect(bootNotFound.headers[HEADER]).toBeUndefined();
  });

  // ----------------------------------------------------------------- (v) ----

  it('registers as an onSend hook behind the request guard, in both servers', () => {
    // Fastify exposes no public API for hook order, so the two source files are
    // the only instrument available. Each registers the guard first and the CSP
    // second: the guard answers before any route exists, and the CSP only ever
    // decorates a reply that is already on its way out.
    for (const file of ['../app.ts', '../boot-error.ts']) {
      const source = readFileSync(sibling(file), 'utf8');
      const guard = source.indexOf('registerRequestGuard(app,');
      const csp = source.indexOf('registerCsp(app)');

      expect(guard, `${file} registers the request guard`).toBeGreaterThanOrEqual(0);
      expect(csp, `${file} registers the CSP hook`).toBeGreaterThan(guard);
    }

    // And the hook itself is an `onSend`, in `csp.ts`, beside the guard and not
    // in place of it.
    expect(readFileSync(sibling('./csp.ts'), 'utf8')).toContain("addHook('onSend'");
    expect(executableLinesWith(sibling('./csp.ts'), 'onRequest')).toEqual([]);
  });

  it('leaves registerRequestGuard an onRequest hook that names no CSP', () => {
    const source = readFileSync(sibling('./request-guard.ts'), 'utf8');
    expect(source).toContain("app.addHook('onRequest', guard)");
    expect(source).not.toContain('onSend');
    expect(source).not.toContain(HEADER);
  });

  // ---------------------------------------------------------------- (vi) ----

  it("permits the app's inline style attributes on its own HTML, by header alone", async () => {
    // `web/src` sets `style={{…}}` in 8 files. A nonce authorises `<style>`
    // **elements** only, and CSP3's `style-src-attr` falls back to `style-src`
    // when it is absent, so without this directive every one of those
    // attributes would be blocked — silently, since nothing in this row renders.
    // This is the permission half; V2(e) is the runtime half, and neither may
    // stand for the other.
    for (const url of ['/', '/patients']) {
      const header = headerOf(await inject('main', { method: 'GET', url }));
      const policy = parsePolicy(header);

      expect(policy.get('style-src-attr')).toEqual([`'${INLINE_TOKEN}'`]);
      expect(policy.get('style-src')).toEqual(["'self'", `'nonce-${String(styleNonce(header))}'`]);

      // The relaxation is style **attributes**: no script, no remote source, no
      // origin, and all six of rule 6 exactly as written.
      expect(policy.get('script-src')).toEqual(["'self'"]);
      expect(policy.get('connect-src')).toEqual(["'self'"]);
      expect(policy.get('default-src')).toEqual(["'self'"]);
      expect(policy.get('object-src')).toEqual(["'none'"]);
    }
  });
});
