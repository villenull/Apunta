# P7b.1 Current-tree cleanup for publication

| Field | Value |
| --- | --- |
| Parent | P7b |
| Role | IMPLEMENTATION |
| Level | L1 |
| Contracts | C-ISO@1 |
| Depends | P7a.1, P6.R |
| Findings | R02, R18 |
| Confidence | n/a |

## Objective
Apply the audit's "fix in tree" items, add publication files, and verify
recovery tooling against a **synthetic** installation only.

## Read
`docs/v2/PUBLIC-REPO-AUDIT.md`; `scripts/recover-current-linux.mjs`
(read the code; **never run it against the live install**);
`config/recovery/current-linux.json`.

## May edit
Files the audit lists as "fix in tree" (placeholders for usernames,
hostnames, home paths), except `prototype/` and owner-authored material;
`scripts/v2/check-identifiers.mjs` (new) and its allowlist
`scripts/v2/identifier-allowlist.json`; `package.json` (add it to `lint`);
`LICENSE` (new); `SECURITY.md` (new); `.github/ISSUE_TEMPLATE/*`,
`.github/pull_request_template.md` (new); `scripts/v2/recovery-synthetic.test.mjs` (new).

## Must not edit
`config/recovery/current-linux.json`'s expected hashes or meaning;
`prototype/`; owner-authored files (report them only).

## Fixed decisions
- `check-identifiers.mjs`: targeted patterns (the audit's redacted
  identifiers resolved from the restricted raw folder at run time, plus
  generic home-path and email patterns) with a reviewed allowlist for public
  project URLs, licence notices and approved examples. It never prints a
  matched secret.
- LICENSE: "All rights reserved" placeholder, stating that the source is
  visible but not licensed for reuse, pending the owner's choice.
- SECURITY.md: tells reporters to use GitHub's private vulnerability
  reporting **if the owner has enabled it**, and otherwise to open an issue
  asking for a private contact without details. It invents no email.
- Templates repeat: never put patient data in issues.
- Recovery verification: build a synthetic install in the sandbox that
  mirrors the manifest's structure with fabricated files, and run the
  recovery script's **verify** logic against it by pointing its paths there
  (add a flag if needed, without changing the default behaviour).

## Verification
| ID | Command (cwd: repo root) | Expected |
| --- | --- | --- |
| V1 | `node scripts/v2/check-identifiers.mjs` | exit 0 |
| V2 | `node scripts/v2/recovery-synthetic.test.mjs` | exit 0; the script's default target is unchanged (test asserts the live paths are not read) |
| V3 | `npm run lint && npm test` | exit 0 |
