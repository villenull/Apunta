#!/usr/bin/env node
/** P5.4: inspect the actual release ELF and production configuration. No network. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const options = {
  binary: resolve(root, 'src-tauri/target/release/apunta'),
  config: resolve(root, 'src-tauri/tauri.conf.json'),
};
const errors = [];
const blocked = [];

try {
  // Inspect the native pin rather than introducing a second endpoint constant.
  const endpoint = readFileSync(resolve(root, 'src-tauri/src/fetch.rs'), 'utf8').match(
    /pub const ENDPOINT: &str =\s*"([^"]+)";/,
  )?.[1];
  if (!endpoint) throw new Error('The native production endpoint pin is missing.');
  const pin = new URL(endpoint);
  if (
    pin.protocol !== 'https:' ||
    pin.hostname !== 'github.com' ||
    pin.port ||
    pin.username ||
    pin.password ||
    pin.search ||
    pin.hash ||
    pin.pathname !== '/villenull/Apunta/releases/latest/download/latest.json'
  ) {
    throw new Error('The native production endpoint no longer matches the approved release location.');
  }
  const args = process.argv.slice(2);
  for (let index = 0; index < args.length; index += 2) {
    const name = args[index];
    if ((name !== '--binary' && name !== '--config') || args[index + 1] === undefined) {
      throw new Error('Usage: check-release-config.mjs [--binary ELF] [--config tauri.conf.json]');
    }
    options[name.slice(2)] = resolve(args[index + 1]);
  }
  const rawConfig = readFileSync(options.config, 'utf8');
  const config = JSON.parse(rawConfig);
  const binary = readFileSync(options.binary);
  if (!binary.subarray(0, 4).equals(Buffer.from([0x7f, 0x45, 0x4c, 0x46])))
    errors.push('The release binary is not a Linux ELF.');
  if (config.identifier !== 'app.apunta.desktop')
    errors.push('The configuration carries a non-production application identity.');
  const forbidden = [
    ['127.0.0.1:78', 'test loopback endpoint'],
    ['dangerousInsecureTransportProtocol', 'insecure transport configuration'],
    ['APUNTA_UPDATER_TEST_', 'test-updater environment hook'],
    ['app.apunta.desktop.test', 'test application identity'],
  ];
  const testKey = process.env.APUNTA_UPDATER_TEST_PUBKEY?.trim();
  if (testKey) forbidden.push([testKey, 'test verification key']);
  for (const [needle, label] of forbidden) {
    if (rawConfig.includes(needle) || binary.includes(Buffer.from(needle)))
      errors.push(`The release contains ${label}.`);
  }
  const publicKey = process.env.APUNTA_UPDATER_PUBKEY?.trim() || config.plugins?.updater?.pubkey?.trim();
  if (!publicKey) {
    blocked.push(
      'The owner has not supplied a production verification key. No production updater release is verified.',
    );
  } else {
    const decoded = Buffer.from(publicKey, 'base64');
    const lines = decoded.toString('utf8').trim().split(/\r?\n/);
    const keyBytes = Buffer.from(lines[1] ?? '', 'base64');
    if (
      decoded.toString('base64') !== publicKey ||
      lines.length !== 2 ||
      !lines[0].startsWith('untrusted comment:') ||
      keyBytes.length !== 42 ||
      keyBytes[0] !== 0x45 ||
      keyBytes[1] !== 0x64
    ) {
      errors.push('The production verification key is not a Tauri/minisign public key.');
    }
    if (testKey === publicKey) errors.push('The production trust root is the test verification key.');
    if (!binary.includes(Buffer.from(publicKey)))
      errors.push('The supplied production verification key is absent from the release ELF.');
    if (!binary.includes(Buffer.from(endpoint)))
      errors.push('The pinned production endpoint is absent from the release ELF.');
    const endpoints = config.plugins?.updater?.endpoints;
    if (endpoints !== undefined && (endpoints.length !== 1 || endpoints[0] !== endpoint)) {
      errors.push('The release configuration does not use the single pinned production endpoint.');
    }
  }
  for (const message of errors) console.error(`FAIL: ${message}`);
  for (const message of blocked) console.error(`BLOCKED: ${message}`);
  if (errors.length > 0) process.exitCode = 1;
  else if (blocked.length > 0) process.exitCode = 2;
  else
    console.log(
      'PASS: production identity, verification key, pinned endpoint, and release artifact isolation.',
    );
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
