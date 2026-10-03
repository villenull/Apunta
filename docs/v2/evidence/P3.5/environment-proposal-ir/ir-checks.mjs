// Read-only checks for the P3.5 environment-proposal independent review.
// process.stdout.write only: docs/v2/evidence is linted with `no-console` on.
// It runs no build, no app, no install and no network.
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const out = (line) => process.stdout.write(line + '\n');

const run = (cmd, args) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
};

// 1. gst-inspect-1.0 takes one element/plugin name. A single invocation with
//    several names inspects only the last, so a multi-arg row cannot assert
//    each element.
for (const el of ['appsink', 'autoaudiosrc', 'alsasrc', 'pulsesrc']) {
  const r = run('gst-inspect-1.0', [el]);
  out(`single ${el}: exit=${r.status}`);
}
const multi = run('gst-inspect-1.0', ['appsink', 'autoaudiosrc', 'alsasrc']);
const first = (multi.stdout + multi.stderr).trim().split('\n')[0] ?? '';
out(`multi appsink autoaudiosrc alsasrc: exit=${multi.status} firstLine=${JSON.stringify(first)}`);

// 2. docs/INSTALL.md is the Mac-facing, no-commands guide; it names no package
//    manager, so the proposal's A03 citation of it is not a source for pacman.
const install = readFileSync('docs/INSTALL.md', 'utf8');
for (const needle of ['pacman', 'Ubuntu', 'Arch Linux']) {
  out(`INSTALL.md contains ${JSON.stringify(needle)}: ${install.includes(needle)}`);
}

// 3. patchelf is not on PATH on this host; it is available in Arch `extra`.
const which = run('which', ['patchelf']);
out(`which patchelf: exit=${which.status}`);
const q = run('pacman', ['-Q', 'patchelf']);
out(`pacman -Q patchelf: exit=${q.status} ${(q.stdout + q.stderr).trim().split('\n')[0] ?? ''}`);
