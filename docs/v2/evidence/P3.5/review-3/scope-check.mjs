#!/usr/bin/env node
/**
 * P3.5 final source review (review-3) — function-level scope proof.
 *
 * Extracts every top-level `function NAME(...)` / `async function NAME(...)`
 * body from two copies of the harness by brace matching and reports which names
 * differ. If only `tidsFromNewestMarker` differs, the candidate's source change
 * is confined to that one function and every other body — including
 * `readReported`, `waitForPublished`, `rectOf`, `parseSourceTable`,
 * `classifySourceOutputs`, `classifyPactlReads` and `rectInsideWindow` — is
 * byte-identical.
 *
 * Usage:
 *   node scope-check.mjs <current.mjs> <baseline.mjs>
 *
 * `process.stdout.write` only, so a durable copy stays lint-clean. Reads two
 * files, touches nothing else.
 */
import { readFileSync } from 'node:fs';

const [currentPath, baselinePath] = process.argv.slice(2);
if (!currentPath || !baselinePath) {
  process.stderr.write('usage: node scope-check.mjs <current.mjs> <baseline.mjs>\n');
  process.exit(2);
}

function bodies(path) {
  const text = readFileSync(path, 'utf8');
  const out = new Map();
  const re = /^(?:async )?function ([A-Za-z0-9_]+)\(/gm;
  let match;
  while ((match = re.exec(text)) !== null) {
    const start = match.index;
    const brace = text.indexOf('{', text.indexOf(')', start));
    let depth = 0;
    let index = brace;
    for (; index < text.length; index += 1) {
      const char = text[index];
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.set(match[1], text.slice(start, index + 1));
  }
  return out;
}

const current = bodies(currentPath);
const baseline = bodies(baselinePath);
const names = [...new Set([...current.keys(), ...baseline.keys()])].sort();

const changed = names.filter((name) => current.get(name) !== baseline.get(name));
const onlyInCurrent = names.filter((name) => !baseline.has(name));
const onlyInBaseline = names.filter((name) => !current.has(name));

process.stdout.write(`current:  ${currentPath} (${String(current.size)} functions)\n`);
process.stdout.write(`baseline: ${baselinePath} (${String(baseline.size)} functions)\n`);
process.stdout.write(`changed bodies: ${JSON.stringify(changed)}\n`);
process.stdout.write(`only in current: ${JSON.stringify(onlyInCurrent)}\n`);
process.stdout.write(`only in baseline: ${JSON.stringify(onlyInBaseline)}\n`);
process.exitCode = changed.length === 0 ? 0 : 1;
