#!/usr/bin/env node
/** P6.2 V1: `node --test scripts/v2/check-manifest.test.mjs`. Offline. */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { checkManifest, releaseAssetPrefix, verifiedTargets } from './check-manifest.mjs';

const GOOD = {
  version: '0.1.0',
  notes: 'First release.',
  pub_date: '2026-10-09T12:00:00Z',
  platforms: {
    'linux-x86_64': {
      signature: 'dW50cnVzdGVkIGNvbW1lbnQ6IHNpZ25hdHVyZQ==',
      url: 'https://github.com/villenull/Apunta/releases/download/v0.1.0/Apunta_0.1.0_amd64.AppImage',
    },
  },
};

const withPlatform = (entry, name = 'linux-x86_64') => ({ ...GOOD, platforms: { [name]: entry } });

test('accepts a signed Linux manifest for this release', () => {
  assert.deepEqual(checkManifest(GOOD, { targets: ['linux-x86_64'], version: '0.1.0' }), []);
});

test('rejects an unverified target', () => {
  const manifest = withPlatform(GOOD.platforms['linux-x86_64'], 'darwin-aarch64');
  const errors = checkManifest(manifest, { targets: ['linux-x86_64'] });
  assert.match(errors.join('\n'), /darwin-aarch64 is not a verified target/);
});

test('rejects a missing or empty signature', () => {
  const url = GOOD.platforms['linux-x86_64'].url;
  assert.match(checkManifest(withPlatform({ url }), { targets: ['linux-x86_64'] }).join(), /no signature/);
  assert.match(
    checkManifest(withPlatform({ url, signature: ' ' }), { targets: ['linux-x86_64'] }).join(),
    /no signature/,
  );
});

test('rejects a URL that is not this release’s own asset', () => {
  const signature = 'c2ln';
  for (const url of [
    'https://example.com/Apunta.AppImage',
    'https://github.com/someone/Apunta/releases/download/v0.1.0/Apunta.AppImage',
    'https://github.com/villenull/Apunta/releases/download/v0.0.9/Apunta.AppImage',
    'https://github.com/villenull/Apunta/releases/download/v0.1.0/Apunta.AppImage?x=1',
    'http://github.com/villenull/Apunta/releases/download/v0.1.0/Apunta.AppImage',
    'https://github.com/villenull/Apunta/releases/download/v0.1.0/',
  ]) {
    const errors = checkManifest(withPlatform({ url, signature }), { targets: ['linux-x86_64'] });
    assert.match(errors.join(), /not at this release's own assets/, url);
  }
});

test('rejects a wrong version, a bad date and a missing platform list', () => {
  assert.match(
    checkManifest(GOOD, { targets: ['linux-x86_64'], version: '0.2.0' }).join(),
    /this release is 0.2.0/,
  );
  assert.match(
    checkManifest({ ...GOOD, pub_date: 'soon' }, { targets: ['linux-x86_64'] }).join(),
    /pub_date/,
  );
  assert.match(
    checkManifest({ ...GOOD, platforms: {} }, { targets: ['linux-x86_64'] }).join(),
    /lists nothing/,
  );
  assert.deepEqual(checkManifest([], {}), ['latest.json is not a JSON object.']);
});

test('verified targets default to Linux and come from the environment', () => {
  assert.deepEqual(verifiedTargets({}), ['linux-x86_64']);
  assert.deepEqual(verifiedTargets({ APUNTA_VERIFIED_TARGETS: 'linux-x86_64, darwin-aarch64' }), [
    'linux-x86_64',
    'darwin-aarch64',
  ]);
});

test('reads the asset location from the app’s own pinned endpoint', () => {
  const pin =
    'pub const ENDPOINT: &str =\n    "https://github.com/villenull/Apunta/releases/latest/download/latest.json";';
  assert.equal(
    releaseAssetPrefix('0.1.0', pin),
    'https://github.com/villenull/Apunta/releases/download/v0.1.0/',
  );
  assert.throws(() => releaseAssetPrefix('0.1.0', 'pub const ENDPOINT: &str = "https://example.com/x";'));
});
