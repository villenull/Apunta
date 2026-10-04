#!/usr/bin/env node
/**
 * Independent source-review probe for P3.6 attempt 6 (AM-209's two shutdown
 * exemptions). Run:
 *
 *   node docs/v2/evidence/P3.6/attempt-6/source-review/01-am209-narrowness-probe.mjs
 *
 * Read-only and offline: it imports `scripts/v2/tauri-e2e-smoke.test.mjs` as a
 * module (its `main()` guard means importing runs nothing) and calls its own
 * exported helpers against throwaway folders under `$TMPDIR`. No AppImage, no
 * display, no port, no audio, no network, no git, no build, no server. Every
 * input is synthetic; no patient text appears anywhere.
 *
 * What it asks, one row per question AM-209 bounds:
 *   A  a healthy graceful-shutdown end state PASSES both ownership checks
 *   B  `apunta.db` vanishing FAILS both
 *   C  any other baseline entry vanishing FAILS the containment check
 *   D  a replaced inode (the lock, the database) FAILS the identity check
 *   E  a replaced lock that was also released and recreated under the same
 *      name FAILS (the rule-3 takeover shape)
 *   F  a file appearing under an owned name FAILS (both helpers, given a
 *      baseline that does not already hold that name)
 *   G  a foreign lock holder and a changed nonce FAIL `lockHolderCheck`
 *   H  the WAL pair's inode moving is recorded, never failed on
 *   I  the exemptions are exactly three names and no more
 */

import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const harness = await import(
  new URL('../../../../../../scripts/v2/tauri-e2e-smoke.test.mjs', import.meta.url).href
);
// `ownershipContainment` reads the four owned names through `sandboxEnv()`, so
// the three variables `sandbox.mjs env` exports are set to throwaway values.
// The port is never bound and no directory is ever created at it: the probe
// reads names only, and every folder it touches is its own `mkdtempSync` one.
process.env['APUNTA_PORT'] = '7999';
process.env['APUNTA_DATA_DIR'] = mkdtempSync(join(tmpdir(), 'p36-src-env-'));
process.env['APUNTA_TEST_RUN_ID'] = 'source-review-probe';
const {
  lockHolderCheck,
  ownershipContainment,
  ownershipIdentityDiff,
  ownershipIdentitySnapshot,
} = harness;

const rows = [];
let failed = 0;
function row(id, ok, detail) {
  rows.push(`${ok ? 'OK  ' : 'FAIL'} ${id} ${detail}`);
  if (!ok) failed += 1;
}

/** A data folder with the four C-OWN@1 files and the lock in rule 2's shape. */
function ownedFolder(serverPid = 4242) {
  const dir = mkdtempSync(join(tmpdir(), 'p36-src-'));
  writeFileSync(join(dir, 'apunta.lock'), JSON.stringify({ pid: serverPid, processStart: 'p', appVersion: '0.0.0', protocol: 1, nonce: 'n1' }));
  writeFileSync(join(dir, 'apunta.db'), 'db');
  writeFileSync(join(dir, 'apunta.db-wal'), 'wal');
  writeFileSync(join(dir, 'apunta.db-shm'), 'shm');
  return dir;
}
function names(dir) {
  return readdirSync(dir).sort();
}

/** What the server's onClose hook does on a graceful SIGTERM shutdown. */
function gracefulShutdown(dir) {
  rmSync(join(dir, 'apunta.lock'), { force: true });
  rmSync(join(dir, 'apunta.db-wal'), { force: true });
  rmSync(join(dir, 'apunta.db-shm'), { force: true });
}

// ---- A: the healthy end state passes both checks ----------------------------
{
  const dir = ownedFolder();
  const base = ownershipIdentitySnapshot(dir);
  const baseNames = names(dir);
  gracefulShutdown(dir);
  mkdirSync(join(dir, 'backups'));
  writeFileSync(join(dir, 'backups/2026-10-04T00-00-00Z.zip'), 'zip');
  const diff = ownershipIdentityDiff(base, ownershipIdentitySnapshot(dir));
  const own = ownershipContainment(baseNames, names(dir));
  row('A  identity ok', diff.ok === true, `ok=${String(diff.ok)} why=${diff.why}`);
  row('A  released names', JSON.stringify(diff.released) === '["apunta.lock"]', JSON.stringify(diff.released));
  row('A  containment vanished empty', own.vanished.length === 0, JSON.stringify(own.vanished));
  row('A  containment secondOwned empty', own.secondOwned.length === 0, JSON.stringify(own.secondOwned));
  row('A  containment otherNew is the run\'s own backups/', JSON.stringify(own.otherNew) === '["backups"]', JSON.stringify(own.otherNew));
  rmSync(dir, { recursive: true, force: true });
}

// ---- B: the database vanishing fails both -----------------------------------
{
  const dir = ownedFolder();
  const base = ownershipIdentitySnapshot(dir);
  const baseNames = names(dir);
  gracefulShutdown(dir);
  rmSync(join(dir, 'apunta.db'));
  const diff = ownershipIdentityDiff(base, ownershipIdentitySnapshot(dir));
  const own = ownershipContainment(baseNames, names(dir));
  row('B  identity fails', diff.ok === false, `ok=${String(diff.ok)} lost=${JSON.stringify(diff.lost)}`);
  row('B  lost names the database', JSON.stringify(diff.lost) === '["apunta.db"]', JSON.stringify(diff.lost));
  row('B  containment fails', own.vanished.includes('apunta.db'), JSON.stringify(own.vanished));
  rmSync(dir, { recursive: true, force: true });
}

// ---- C: any other baseline entry vanishing fails containment ---------------
{
  const dir = ownedFolder();
  writeFileSync(join(dir, 'notes-from-an-earlier-run.txt'), 'old');
  writeFileSync(join(dir, 'safety'), 'not really a dir, a plain baseline entry');
  const baseNames = names(dir);
  gracefulShutdown(dir);
  rmSync(join(dir, 'notes-from-an-earlier-run.txt'));
  rmSync(join(dir, 'safety'));
  const own = ownershipContainment(baseNames, names(dir));
  row('C  a stray file vanishing is named', own.vanished.includes('notes-from-an-earlier-run.txt'), JSON.stringify(own.vanished));
  row('C  a stray dir vanishing is named', own.vanished.includes('safety'), JSON.stringify(own.vanished));
  row('C  the three exemptions stay exempt', !own.vanished.some((n) => ['apunta.lock', 'apunta.db-wal', 'apunta.db-shm'].includes(n)), JSON.stringify(own.vanished));
  rmSync(dir, { recursive: true, force: true });
}

// ---- D: a replaced inode fails the identity check ---------------------------
for (const target of ['apunta.db', 'apunta.lock']) {
  const dir = ownedFolder();
  const base = ownershipIdentitySnapshot(dir);
  rmSync(join(dir, target));
  writeFileSync(join(dir, target), 'a different file at the same name');
  const diff = ownershipIdentityDiff(base, ownershipIdentitySnapshot(dir));
  row(`D  ${target} replaced fails`, diff.ok === false && diff.replaced.length === 1, `ok=${String(diff.ok)} replaced=${JSON.stringify(diff.replaced)}`);
  rmSync(dir, { recursive: true, force: true });
}

// ---- E: the rule-3 takeover shape (released, then a fresh lock at the name) --
{
  const dir = ownedFolder();
  const base = ownershipIdentitySnapshot(dir);
  gracefulShutdown(dir);
  writeFileSync(join(dir, 'apunta.lock'), JSON.stringify({ pid: 9999, processStart: 'q', appVersion: '0.0.0', protocol: 1, nonce: 'n2' }));
  const diff = ownershipIdentityDiff(base, ownershipIdentitySnapshot(dir));
  row('E  a fresh lock at the old name fails', diff.ok === false && diff.replaced.length === 1, `ok=${String(diff.ok)} replaced=${JSON.stringify(diff.replaced)} released=${JSON.stringify(diff.released)}`);
  rmSync(dir, { recursive: true, force: true });
}

// ---- F: a file appearing under an owned name fails both helpers -------------
{
  // Identity: the baseline that lacks the name, which is the only shape in
  // which `appearedOwned` can fire (ownershipBaselineProof guarantees all four
  // names are in a real baseline, so this is a unit falsifiability question).
  const dir = ownedFolder();
  const base = ownershipIdentitySnapshot(dir).filter((file) => file.name !== 'apunta.db-shm');
  gracefulShutdown(dir);
  writeFileSync(join(dir, 'apunta.db-shm'), 'shm');
  const diff = ownershipIdentityDiff(base, ownershipIdentitySnapshot(dir));
  row('F  identity appearedOwned fails', diff.ok === false && diff.appearedOwned.includes('apunta.db-shm'), `ok=${String(diff.ok)} appearedOwned=${JSON.stringify(diff.appearedOwned)}`);
  rmSync(dir, { recursive: true, force: true });
}
{
  // Containment: the same question against a baseline that lacks the name.
  const own = ownershipContainment(['apunta.db', 'apunta.lock'], ['apunta.db', 'apunta.lock', 'apunta.db-wal', 'backups']);
  row('F  containment secondOwned fails', own.secondOwned.includes('apunta.db-wal'), JSON.stringify(own.secondOwned));
  row('F  containment vanished empty', own.vanished.length === 0, JSON.stringify(own.vanished));
}

// ---- G: a foreign holder and a changed nonce fail lockHolderCheck -----------
{
  const baseline = { pid: 4242, processStart: 'p', appVersion: '0.0.0', protocol: 1, nonce: 'n1' };
  const foreign = lockHolderCheck(baseline, { pid: 7777, processStart: 'p', appVersion: '0.0.0', protocol: 1, nonce: 'n1' }, 4242);
  row('G  a foreign holder fails', foreign.ok === false, foreign.why);
  const taken = lockHolderCheck(baseline, { pid: 4242, processStart: 'p', appVersion: '0.0.0', protocol: 1, nonce: 'n2' }, 4242);
  row('G  a changed nonce fails', taken.ok === false, taken.why);
  const gone = lockHolderCheck(baseline, null, 4242);
  row('G  a lock gone while the server runs fails', gone.ok === false, gone.why);
  const held = lockHolderCheck(baseline, baseline, 4242);
  row('G  the healthy holder passes', held.ok === true, held.why);
}

// ---- H: the WAL pair's inode moving is recorded, never failed on ------------
{
  const dir = ownedFolder();
  const base = ownershipIdentitySnapshot(dir);
  rmSync(join(dir, 'apunta.db-wal'));
  rmSync(join(dir, 'apunta.db-shm'));
  writeFileSync(join(dir, 'apunta.db-wal'), 'a new wal');
  writeFileSync(join(dir, 'apunta.db-shm'), 'a new shm');
  const diff = ownershipIdentityDiff(base, ownershipIdentitySnapshot(dir));
  row('H  a recreated WAL pair passes', diff.ok === true, `ok=${String(diff.ok)} volatileChanged=${JSON.stringify(diff.volatileChanged)}`);
  row('H  the recreation is recorded', diff.volatileChanged.length === 2, JSON.stringify(diff.volatileChanged));
  rmSync(dir, { recursive: true, force: true });
}

// ---- I: the exemption set is exactly three names ----------------------------
{
  const dir = mkdtempSync(join(tmpdir(), 'p36-src-'));
  process.env['APUNTA_DATA_DIR'] = dir;
  const owned = ['apunta.lock', 'apunta.db', 'apunta.db-wal', 'apunta.db-shm'];
  for (const name of owned) writeFileSync(join(dir, name), 'x');
  const baseNames = names(dir);
  // Every baseline entry gone but the three exempt ones absent too: an emptied
  // folder must still name everything it lost that is not exempt.
  const own = ownershipContainment([...baseNames, 'stray-a', 'stray-b'], ['apunta.db']);
  row('I  an emptied folder names only the non-exempt losses', JSON.stringify(own.vanished) === '["stray-a","stray-b"]', JSON.stringify(own.vanished));
  rmSync(dir, { recursive: true, force: true });
  delete process.env['APUNTA_DATA_DIR'];
}

for (const line of rows) process.stdout.write(`${line}\n`);
process.stdout.write(`\n${String(rows.length - failed)}/${String(rows.length)} probe rows passed\n`);
process.exitCode = failed > 0 ? 1 : 0;
