# Evidence: P0.1 Pin Node 24.19.0 — Acquisition A01

Base commit: `3efed5d`. Branch: `feature/v2`. Date: 2026-09-26.

## Item A01 — Node.js 24.19.0 linux-x64 tarball

- Exact version: **24.19.0**
- URL: `https://nodejs.org/dist/v24.19.0/node-v24.19.0-linux-x64.tar.gz`
  (checksum source: `https://nodejs.org/dist/v24.19.0/SHASUMS256.txt`;
  both hosts are `nodejs.org`, the only allowed host for A01; no redirects)
- Size: 57409532 bytes
- SHA-256 (downloaded file): `f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4`
- SHA-256 (SHASUMS256.txt entry for `node-v24.19.0-linux-x64.tar.gz`):
  `f625d97cd707df4ff96254916fbc5ff014f09c09effe5a1e0ca8f6d41a8789d4`
- Verification: **MATCH** (`sha256sum` output identical to the SHASUMS entry)
- Licence evidence: the extracted tarball ships a top-level `LICENSE` file
  whose first line reads "Node.js is licensed for use as follows:"
  (Node.js is published under the MIT licence; the file is present in the
  user-local install)
- Install location (user-local, system Node untouched):
  `~/.local/share/apunta-node/node-v24.19.0-linux-x64`
- PATH handling: the A01 Node was put first on `PATH` only by prefixing it
  in the shell of each verification command
  (`export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH"`);
  no system Node was replaced and no shell profile was modified.
- Bundled npm with this Node: 11.17.0.

## Pre-existing tool versions (used as found, per ACQUISITION.md §2)

- System/mise Node before this card: v26.8.2 (left in place; not used for
  verification).
- `git`, `curl`, `tar` used as found on the PC.
