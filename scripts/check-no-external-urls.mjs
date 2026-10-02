#!/usr/bin/env node
/**
 * Hard rule 1, checked where ESLint cannot look.
 *
 * `eslint.config.js` bans non-loopback URL literals, but only in
 * `.ts/.tsx/.js/.mjs`. The one documented violation this project has ever had
 * was `@import url('https://fonts.googleapis.com/…')` on line 1 of a **CSS**
 * file — exactly the file type no ESLint block covers. Someone re-adding that
 * line while porting more of the prototype would pass lint, typecheck, unit
 * tests and e2e, and ship a Google request on every page load. Found by the
 * 2026-08 privacy audit (W6).
 *
 * So this scans two things ESLint is blind to:
 *
 *  1. non-JS source — CSS, HTML, SVG, JSON, SQL;
 *  2. the built browser bundle, when one exists. That is the stronger half:
 *     it catches a URL that arrived through a dependency or a build step,
 *     which no source-level rule can see.
 *
 * Run by `npm run lint`, so it fails locally and in CI alike.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Source trees whose non-JS files ESLint never sees.
 *
 * `macos/` is here because the app shell is Swift, and ESLint has no opinion
 * about Swift at all. The shell may hand a URL to the browser when someone
 * clicks a link, and it may talk to 127.0.0.1 — it may not fetch anything
 * itself, and this is what says so.
 */
const SOURCE_ROOTS = ['web/src', 'web/index.html', 'web/public', 'server/migrations', 'macos'];

/**
 * Shipped assets. Absent before a build; that is not a failure.
 *
 * The packaged app's `Contents/Resources` is the stronger half of this check:
 * it is the actual artifact that reaches her Mac, and scanning it catches a
 * URL that arrived through a dependency or a build step, which no
 * source-level rule can see.
 */
const BUILD_ROOTS = ['web/dist', 'dist-mac/Apunta.app/Contents/Resources'];

const SOURCE_EXTENSIONS = new Set([
  '.css',
  '.html',
  '.svg',
  '.json',
  '.sql',
  '.webmanifest',
  '.swift',
  '.plist',
  '.entitlements',
]);

/**
 * The model-download allow-list, asserted rather than assumed.
 *
 * `installer/src/catalog.ts` is the one file in the product permitted to name
 * a non-loopback host, and these are the only three it may name. Inside the
 * packaged app that file has been bundled into `setup/setup.mjs`, so this is
 * where the claim is checked against the artifact rather than the source.
 *
 * Kept in step with `ALLOWED_DOWNLOAD_HOSTS` by `catalog.test.ts`, which pins
 * the same three names.
 */
const DOWNLOAD_HOSTS = ['huggingface.co', 'registry.ollama.ai', 'ollama.com'];

/** Files that are licence text rather than code. A notice is not a request. */
const LICENCE_TEXT = /(^|\/)(THIRD-PARTY-LICENSES\.md|licenses\/)/;

function isDownloadHost(url) {
  return DOWNLOAD_HOSTS.some((host) => new RegExp(`^https://${host.replaceAll('.', '\\.')}(/|$)`).test(url));
}

/** Only the bundled setup entry point and explicitly authorized comparison
 * downloader may name a pinned model-download host. */
function allowsDownloadHosts(file) {
  return (
    /(^|\/)setup\/setup\.mjs$/.test(file) ||
    /(^|\/)installer\//.test(file) ||
    /(^|\/)scripts\/model-comparison\/acquire\.mjs$/.test(file)
  );
}

/**
 * `src-tauri/target` is skipped for the same reason `node_modules` is: it is
 * machine-local build output holding other people's Rust sources and their own
 * documentation URLs, none of which Apunta fetches. Belt and braces beside the
 * `.gitignore` line — nothing in `SOURCE_ROOTS` walks `src-tauri/` today, so this
 * exclusion guards against that changing rather than fixing a live finding.
 */
const SKIP_DIRECTORIES = new Set(['node_modules', '.git']);

/**
 * `src-tauri/target`, by repository-relative path.
 *
 * Cargo's build output is machine-local and holds other people's Rust sources
 * and their own documentation URLs, none of which Apunta fetches. It is belt
 * and braces beside the `.gitignore` line: nothing in `SOURCE_ROOTS` walks
 * `src-tauri/` today, so this guards against that changing rather than fixing a
 * live finding. A bare `target` is deliberately **not** in `SKIP_DIRECTORIES`,
 * which would hide a `target/` anywhere in the tree.
 */
const SKIP_PATHS = new Set([join('src-tauri', 'target')]);

/**
 * Strings that are identifiers, not addresses: nothing ever fetches them.
 * Keeping the list explicit and short makes this a tripwire on change rather
 * than a running battle with false positives — a new entry here should be a
 * deliberate decision, not a reflex.
 */
const ALLOWED = [
  /^https?:\/\/www\.w3\.org\//, // XML namespaces on inline SVG
  // The Tauri configuration schema, named by `src-tauri/tauri.conf.json`'s
  // `$schema` so an editor can offer completion. It is an identifier a JSON
  // schema loader reads, never a request, and it is admitted by exact string
  // rather than by pattern so no other `schema.tauri.app` path rides along.
  /^https:\/\/schema\.tauri\.app\/config\/2$/,
  /^https?:\/\/json-schema\.org\//, // $schema identifiers
  /^https?:\/\/react\.dev\/errors\//, // React's minified-error text
  /^https?:\/\/reactrouter\.com\//, // react-router's warning text
  // react-router's IE11 message, suggesting a polyfill. Text in a `throw`,
  // never a request.
  /^https:\/\/github\.com\/ungap\/url-search-params/,
  // zod's IPv6/CIDR validators build `http://[${value}]` and hand it to
  // `new URL()` to see whether it parses. A template placeholder cannot be a
  // host, and nothing fetches it.
  /^https?:\/\/\[\$\{/,
  // The DOCTYPE every macOS property list carries. `plutil`, `codesign` and
  // CoreFoundation all parse plists with a built-in DTD and never fetch this;
  // Apple's own templates emit it verbatim.
  /^http:\/\/www\.apple\.com\/DTDs\/PropertyList-1\.0\.dtd$/,
];

/**
 * Comments cannot make a request, and this file would otherwise flag the
 * comment in `web/src/styles/tokens.css` that explains why the Google Fonts
 * `@import` is deliberately absent. Only block comments are stripped: eating
 * `//` line comments would also eat the `//` inside every URL.
 */
function stripComments(text) {
  return text.replaceAll(/\/\*[\s\S]*?\*\//g, ' ').replaceAll(/<!--[\s\S]*?-->/g, ' ');
}

const URL_PATTERN = /https?:\/\/[^\s"'`)>\\]+/g;

function isLoopback(url) {
  return /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(?![\w.-])/.test(url);
}

function* walk(path) {
  let stats;
  try {
    stats = statSync(path);
  } catch {
    return; // Not built yet, or an optional directory that does not exist.
  }
  if (stats.isFile()) {
    yield path;
    return;
  }
  for (const entry of readdirSync(path, { withFileTypes: true })) {
    if (SKIP_DIRECTORIES.has(entry.name)) continue;
    const child = join(path, entry.name);
    if (SKIP_PATHS.has(relative(repoRoot, child))) continue;
    yield* walk(child);
  }
}

function findings(file) {
  const text = stripComments(readFileSync(file, 'utf8'));
  const hits = [];
  const downloadsAllowed = allowsDownloadHosts(file);
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0].replace(/[.,;:]+$/, '');
    if (isLoopback(url) || ALLOWED.some((allowed) => allowed.test(url))) continue;
    if (downloadsAllowed && isDownloadHost(url)) continue;
    const line = text.slice(0, match.index).split('\n').length;
    hits.push({ line, url });
  }
  return hits;
}

const problems = [];

for (const root of SOURCE_ROOTS) {
  for (const file of walk(join(repoRoot, root))) {
    if (!SOURCE_EXTENSIONS.has(extname(file))) continue;
    for (const hit of findings(file)) problems.push({ file, ...hit });
  }
}

for (const root of BUILD_ROOTS) {
  for (const file of walk(join(repoRoot, root))) {
    // Binary assets would produce noise, not findings.
    if (/\.(png|jpe?g|gif|woff2?|ttf|otf|ico|webp|mp[34]|wav|bin|dylib|so|node)$/i.test(file)) continue;
    // Reproducing a licence is an obligation, not an outbound request.
    if (LICENCE_TEXT.test(file)) continue;
    for (const hit of findings(file)) problems.push({ file, ...hit });
  }
}

if (problems.length > 0) {
  console.error('Non-loopback URLs found. Apunta makes no outbound requests (CLAUDE.md hard rule 1).\n');
  for (const problem of problems) {
    console.error(`  ${relative(repoRoot, problem.file)}:${problem.line}  ${problem.url}`);
  }
  console.error(
    '\nIf one of these is an identifier rather than an address, add it to ALLOWED in\nscripts/check-no-external-urls.mjs with a comment saying why.',
  );
  process.exit(1);
}
