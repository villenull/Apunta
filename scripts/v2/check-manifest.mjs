#!/usr/bin/env node
/**
 * P6.2: checks a release's `latest.json` before it is uploaded.
 *
 *   node scripts/v2/check-manifest.mjs path/to/latest.json [--version 0.1.0]
 *
 * The installed app trusts this file to name what it downloads, so the release
 * script refuses to upload one that:
 *
 * - is not the static-manifest shape the Tauri updater reads;
 * - lists a platform not in `APUNTA_VERIFIED_TARGETS` (default `linux-x86_64`):
 *   an unverified build is never advertised to installed apps;
 * - has a platform without a minisign signature;
 * - points anywhere but this repository's own release assets for this version.
 *
 * The signature itself is checked by the app, against the public key it was
 * built with, before it keeps a byte (CLAUDE.md hard rule 1, second exception).
 * No network.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+$/;
const FETCH_RS = resolve(dirname(fileURLToPath(import.meta.url)), '../../src-tauri/src/fetch.rs');

/**
 * Where a version's assets live, derived from the endpoint the app itself is
 * pinned to (`ENDPOINT` in src-tauri/src/fetch.rs) rather than restated here:
 * `…/releases/latest/download/latest.json` becomes `…/releases/download/v<x.y.z>/`.
 */
export function releaseAssetPrefix(version, fetchRs = readFileSync(FETCH_RS, 'utf8')) {
  const endpoint = fetchRs.match(/pub const ENDPOINT: &str =\s*"([^"]+)";/)?.[1];
  const suffix = '/releases/latest/download/latest.json';
  if (endpoint === undefined || !endpoint.endsWith(suffix)) {
    throw new Error("The app's pinned update endpoint is missing or has moved.");
  }
  return `${endpoint.slice(0, -suffix.length)}/releases/download/v${version}/`;
}

/** The targets the owner has verified, from the environment or the default. */
export function verifiedTargets(env = process.env) {
  const raw = env.APUNTA_VERIFIED_TARGETS?.trim();
  return raw
    ? raw
        .split(',')
        .map((target) => target.trim())
        .filter(Boolean)
    : ['linux-x86_64'];
}

/** Every reason this manifest must not be uploaded; empty when it may. */
export function checkManifest(manifest, { targets, version } = {}) {
  const errors = [];
  const allowed = targets ?? verifiedTargets();
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return ['latest.json is not a JSON object.'];
  }
  if (typeof manifest.version !== 'string' || !SEMVER.test(manifest.version)) {
    errors.push('version must be a plain x.y.z version.');
  } else if (version !== undefined && manifest.version !== version) {
    errors.push(`version is ${manifest.version}, but this release is ${version}.`);
  }
  if (typeof manifest.pub_date !== 'string' || Number.isNaN(Date.parse(manifest.pub_date))) {
    errors.push('pub_date must be an RFC 3339 date.');
  }
  if (manifest.notes !== undefined && typeof manifest.notes !== 'string') {
    errors.push('notes must be text.');
  }
  const platforms = manifest.platforms;
  if (platforms === null || typeof platforms !== 'object' || Array.isArray(platforms)) {
    errors.push('platforms must be an object.');
    return errors;
  }
  const names = Object.keys(platforms);
  if (names.length === 0) errors.push('platforms lists nothing.');
  const prefix = releaseAssetPrefix(String(manifest.version));
  for (const name of names) {
    const entry = platforms[name];
    if (!allowed.includes(name)) {
      errors.push(`${name} is not a verified target (${allowed.join(', ')}).`);
    }
    if (entry === null || typeof entry !== 'object') {
      errors.push(`${name} is not an object.`);
      continue;
    }
    if (typeof entry.signature !== 'string' || entry.signature.trim() === '') {
      errors.push(`${name} has no signature.`);
    }
    let url;
    try {
      url = new URL(entry.url);
    } catch {
      errors.push(`${name} has no valid url.`);
      continue;
    }
    const file = url.href.startsWith(prefix) ? url.href.slice(prefix.length) : '';
    if (
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      file === '' ||
      file.includes('/') ||
      !url.href.startsWith(prefix)
    ) {
      errors.push(`${name} points at ${entry.url}, not at this release's own assets (${prefix}…).`);
    }
  }
  return errors;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [file, flag, value] = process.argv.slice(2);
  if (file === undefined || (flag !== undefined && (flag !== '--version' || value === undefined))) {
    console.error('usage: check-manifest.mjs latest.json [--version x.y.z]');
    process.exit(2);
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`check-manifest: ${file} is not readable JSON: ${error.message}`);
    process.exit(1);
  }
  const errors = checkManifest(manifest, value === undefined ? {} : { version: value });
  if (errors.length > 0) {
    for (const error of errors) console.error(`check-manifest: ${error}`);
    process.exit(1);
  }
  console.log(`check-manifest: ${file} is fine (${Object.keys(manifest.platforms).join(', ')}).`);
}
