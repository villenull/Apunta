# P3.6 V5 — attempt 7 runtime (AM-214), reviewer evidence

| Field | Value |
| --- | --- |
| Row | **V5** — exact attribution: P3.3's fatal-mode evidence still says what this card pins |
| Order | may run at any point; run 2026-10-06T19:09:41Z, before any build |
| Decoded command sha256 | `5361aac349c06611fffa7195af0b05e8a9fc2c1d7420b0524dbed3c0c9e097cb` |
| Started (UTC) | **2026-10-06T19:09:41Z** |
| Ended (UTC) | **2026-10-06T19:09:41Z** |
| Elapsed | 0 s |
| **Exit code** | **0** → **PASS** |
| Raw log | `/tmp/opencode/p36/logs/V5.log` (9 bytes, sha256 `b7677d3ec37ee1897ba07dc2cfe8292fe421c9ac93396cca5bbece486d1a2a41`) |
| HEAD | `f93e27d3cd9931dbc3e5b4726a1ac635d7c660e9`, tree clean |

## Command, verbatim

```
export PATH="$HOME/.local/share/apunta-node/node-v24.19.0-linux-x64/bin:$PATH" && node --version && E=docs/v2/evidence/P3.3/V4-fatal.md && test -f "$E" && grep -q '^Status: \*\*PASS\*\*$' "$E" && grep -q 'the code is port_in_use and not data_folder_in_use' "$E" && grep -q 'the code is data_folder_in_use and not port_in_use' "$E"
```

## Observed output (complete)

```
v24.19.0
```

## The three greps, each located

| Grep | Line in `docs/v2/evidence/P3.3/V4-fatal.md` |
| --- | --- |
| `^Status: \*\*PASS\*\*$` | **3** — `Status: **PASS**` |
| `the code is port_in_use and not data_folder_in_use` | **27** — `PASS fatal-port the code is port_in_use and not data_folder_in_use` |
| `the code is data_folder_in_use and not port_in_use` | **34** — `PASS fatal-folder the code is data_folder_in_use and not port_in_use` |

File present, 5597 bytes, mtime 2026-10-01 23:11:50 -0600 — predates this
session and untouched by it.

## Notes

- Reads committed files only; starts nothing, binds nothing, writes nothing.
- This is the Stop 8 pin on **P3.3's fatal-mode row set** exercised as a row: a
  reworded or re-derived `V4-fatal.md` would fail one of the three greps rather
  than silently assert a lifecycle code the evidence no longer states. It is
  green here, so that tuple has **not** drifted.
