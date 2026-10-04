#!/usr/bin/env node
/**
 * The npm half of `THIRD-PARTY-LICENSES.md`, generated rather than typed.
 *
 *   node scripts/collect-licenses.mjs            # rewrite the generated block
 *   node scripts/collect-licenses.mjs --check    # fail if it is out of date
 *
 * A hand-maintained licence list in a project that pins exact dependency
 * versions is wrong within two releases, so the part that can be derived is
 * derived: every package in `package-lock.json` that is *not* dev-only ends up
 * in the app, and every one of them owes a notice. The block between the
 * markers below is regenerated from the lockfile; everything else in the file
 * is written by hand, because binaries downloaded at packaging time are not in
 * any lockfile.
 *
 * It also refuses: a GPL or AGPL package appearing in the shipped tree fails
 * this script, which `npm run lint` runs. Apunta is distributed as a binary to
 * one therapist and a copyleft dependency arriving through a transitive bump
 * is exactly the kind of thing nobody notices until distribution.
 *
 * No network. It reads the lockfile and `node_modules`, both of which are
 * already here.
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(repoRoot, 'THIRD-PARTY-LICENSES.md');

const START = '<!-- npm-dependencies:start -->';
const END = '<!-- npm-dependencies:end -->';

/** Anything matching this fails the build rather than being quietly listed. */
const FORBIDDEN = /\b(GPL|AGPL|LGPL|SSPL|CC-BY-NC|BUSL)\b/i;

/**
 * Dual licences where Apunta has deliberately taken the permissive arm.
 *
 * A package published as `MIT OR GPL-3.0-or-later` is offered under either,
 * and taking MIT is a real choice a distributor makes — so it is recorded
 * here by name rather than waved through by a regex that ignores `OR`. A new
 * copyleft-armed dependency fails the build until somebody adds a line here
 * and means it.
 *
 * `jszip` arrives through `mammoth` (.docx text extraction, M6). MIT taken.
 */
const DUAL_LICENSED_CHOICES = new Map([['jszip', { offered: '(MIT OR GPL-3.0-or-later)', taken: 'MIT' }]]);

/**
 * Data objects shipped under a non-permissive arm of a multi-licence, elected
 * by the owner and recorded in THIRD-PARTY-LICENSES.md and docs/decisions.md.
 * Kept apart from DUAL_LICENSED_CHOICES on purpose: that map is for permissive
 * arms, and a copyleft arm described as a permissive choice would make this
 * guard say the opposite of what it is for.
 *
 * `dictionary-es-mx` — the Mexican Spanish Hunspell word list, data only
 * (`index.aff` + `index.dic`), shipped unmodified under its own names.
 */
const DATA_LICENCE_CHOICES = new Map([
  ['dictionary-es-mx', { offered: '(GPL-3.0 OR LGPL-3.0 OR MPL-1.1)', taken: 'MPL-1.1' }],
]);

/** `MIT OR Apache-2.0` is fine; a bare GPL, or an unrecorded dual, is not. */
function isForbidden(name, license) {
  if (typeof license !== 'string') return false;
  if (!FORBIDDEN.test(license)) return false;
  const choice = DUAL_LICENSED_CHOICES.get(name) ?? DATA_LICENCE_CHOICES.get(name);
  return choice === undefined || choice.offered !== license;
}

/** The licence as this file reports it: the chosen arm, said out loud. */
function reportedLicense(name, license) {
  const choice = DUAL_LICENSED_CHOICES.get(name) ?? DATA_LICENCE_CHOICES.get(name);
  if (choice !== undefined && choice.offered === license) {
    return `${choice.taken} (offered as ${choice.offered})`;
  }
  return license;
}

const LICENSE_FILENAMES = [
  'LICENSE',
  'LICENSE.md',
  'LICENSE.txt',
  'LICENCE',
  'LICENCE.md',
  'LICENSE-MIT',
  'COPYING',
];

/** The copyright line, which is the part a notice actually has to carry. */
function copyrightOf(packageDir) {
  let names;
  try {
    names = readdirSync(packageDir);
  } catch {
    return null;
  }
  const candidates = names.filter((name) =>
    LICENSE_FILENAMES.some((wanted) => name.toLowerCase() === wanted.toLowerCase()),
  );
  for (const name of candidates) {
    let text;
    try {
      text = readFileSync(join(packageDir, name), 'utf8');
    } catch {
      continue;
    }
    const match = text.match(/Copyright[^\n]*/i);
    if (match) return match[0].replace(/\s+/g, ' ').trim().slice(0, 100);
  }
  // Some packages put it only in the README or the package.json author field.
  try {
    const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
    if (typeof pkg.author === 'string') return `Author: ${pkg.author}`;
    if (pkg.author && typeof pkg.author.name === 'string') return `Author: ${pkg.author.name}`;
  } catch {
    // Nothing to add.
  }
  return null;
}

function collect() {
  const lock = JSON.parse(readFileSync(join(repoRoot, 'package-lock.json'), 'utf8'));
  const rows = new Map();
  const problems = [];

  for (const [path, entry] of Object.entries(lock.packages ?? {})) {
    if (!path.startsWith('node_modules/')) continue;
    // Dev-only packages are not distributed; workspace links are our own code.
    if (entry.dev === true || entry.link === true) continue;

    const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
    const license = entry.license ?? readLicenseField(join(repoRoot, path)) ?? 'UNKNOWN';
    if (isForbidden(name, license)) problems.push(`${name} is ${license}`);

    const existing = rows.get(name);
    if (existing !== undefined && existing.version === entry.version) continue;
    rows.set(`${name}@${entry.version ?? '?'}`, {
      name,
      version: entry.version ?? '?',
      license: reportedLicense(name, license),
      copyright: copyrightOf(join(repoRoot, path)),
    });
  }

  if (problems.length > 0) {
    console.error('Copyleft licences in the shipped dependency tree:\n');
    for (const problem of problems) console.error(`  ${problem}`);
    console.error(
      '\nApunta ships as a binary. Remove the dependency, or — for a dual licence with a\n' +
        'permissive arm — record the choice in DUAL_LICENSED_CHOICES in this script.',
    );
    process.exit(1);
  }

  return [...rows.values()].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

function readLicenseField(packageDir) {
  try {
    const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));
    if (typeof pkg.license === 'string') return pkg.license;
    if (Array.isArray(pkg.licenses) && pkg.licenses[0]?.type) return pkg.licenses[0].type;
  } catch {
    // Falls through to UNKNOWN.
  }
  return null;
}

function render(rows) {
  const counts = new Map();
  for (const row of rows) counts.set(row.license, (counts.get(row.license) ?? 0) + 1);
  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([license, count]) => `${license} (${count})`)
    .join(', ');

  const lines = [
    START,
    '',
    `<!-- Generated by scripts/collect-licenses.mjs. Do not edit by hand. -->`,
    '',
    `${rows.length} packages ship inside Apunta: ${summary}.`,
    '',
    '| Package | Version | Licence | Copyright |',
    '| --- | --- | --- | --- |',
    ...rows.map(
      (row) =>
        `| \`${row.name}\` | ${row.version} | ${row.license} | ${(row.copyright ?? '—').replaceAll('|', '\\|')} |`,
    ),
    '',
    END,
  ];
  return lines.join('\n');
}

const rows = collect();
const block = render(rows);
const current = readFileSync(target, 'utf8');

const start = current.indexOf(START);
const end = current.indexOf(END);
if (start === -1 || end === -1) {
  console.error(`THIRD-PARTY-LICENSES.md is missing the ${START} / ${END} markers.`);
  process.exit(1);
}

const updated = `${current.slice(0, start)}${block}${current.slice(end + END.length)}`;

if (process.argv.includes('--check')) {
  if (updated !== current) {
    console.error(
      'THIRD-PARTY-LICENSES.md is out of date with the dependency tree.\n' +
        'Run: node scripts/collect-licenses.mjs',
    );
    process.exit(1);
  }
  console.log(`THIRD-PARTY-LICENSES.md lists all ${rows.length} shipped packages.`);
} else {
  writeFileSync(target, updated);
  console.log(`Wrote ${rows.length} packages into THIRD-PARTY-LICENSES.md`);
}

// `statSync` keeps the import honest: the file must exist to be checked.
statSync(target);
