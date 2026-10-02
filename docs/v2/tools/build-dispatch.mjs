#!/usr/bin/env node
// Builds a self-contained dispatch file for one card, so a sub-session needs
// nothing else: hard stops, the card, the exact contract excerpts, the run
// configuration, and a return template with every status unverified.
//
//   node docs/v2/tools/build-dispatch.mjs <card-id> --base <commit> --port <7800-7889> [--attempt <n>] [--findings <file>]
//   node docs/v2/tools/build-dispatch.mjs <card-id> --ir --base <commit>     # instruction-review brief
//   node docs/v2/tools/build-dispatch.mjs <card-id> --review --base <commit> --head <commit>
//
// Refuses (exit 3) if a dependency is not APPROVED in state/PROGRESS.json.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { loadPlan } from './plan-lib.mjs';

const planDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const id = argv[0];
const opt = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? undefined : argv[i + 1];
};
const flag = (name) => argv.includes(name);

function fail(code, message) {
  console.error(message);
  process.exit(code);
}

if (!id || id.startsWith('--'))
  fail(
    2,
    'usage: build-dispatch.mjs <card-id> --base <commit> [--port <p>] [--ir | --review --head <commit>]',
  );
const base = opt('--base');
if (!base) fail(2, '--base <commit> is required');

const plan = loadPlan(planDir);
const card = plan.cards.get(id) ?? plan.reviews.get(id);
if (!card) fail(2, `unknown card ${id}`);

const mode = flag('--ir') ? 'ir' : flag('--review') ? 'review' : 'implement';
const port = opt('--port');
const needsPort = mode !== 'ir' && card.role !== 'SETUP' && card.level !== 'L0';
if (port !== undefined || needsPort) {
  const n = Number(port);
  if (!Number.isInteger(n) || n < 7800 || n > 7889) fail(2, '--port must be an integer from 7800 to 7889');
}
const head = opt('--head');
if (mode === 'review' && !head) fail(2, '--review needs --head <commit>');
const attempt = Number(opt('--attempt') ?? '1');
/*
 * The budget is three attempts (COORDINATOR.md §4). Attempt 4 exists only
 * because S2.5's third attempt failed and the owner resolved the block by
 * authorising one corrective attempt (AM-049), so it is reachable *only* by
 * naming the amendment that authorised it, and the generated dispatch says so.
 * The ceiling stays 3 without that flag: the guard has not been relaxed, it has
 * been given a keyed exception, and there is no attempt 5 for any card.
 */
const exception = opt('--attempt-exception');
if (attempt === 4) {
  if (exception === undefined || !/^AM-\d{3}$/.test(exception))
    fail(
      2,
      '--attempt 4 requires --attempt-exception <AM-nnn> naming the owner amendment that authorised it',
    );
} else if (attempt >= 5) {
  fail(
    2,
    `--attempt must be 1, 2, 3, or 4 with --attempt-exception; ${attempt} is beyond any authorised budget`,
  );
} else if (!(attempt >= 1 && attempt <= 3)) {
  fail(2, '--attempt must be 1, 2 or 3');
}

// Dependencies must be APPROVED.
const progressPath = join(planDir, 'state', 'PROGRESS.json');
const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, 'utf8')) : { cards: {} };
const missing = card.depends.filter((d) => progress.cards?.[d] !== 'APPROVED');
if (missing.length > 0) fail(3, `not dispatchable: dependencies not APPROVED: ${missing.join(', ')}`);

const read = (p) => readFileSync(join(planDir, p), 'utf8');
const fill = (text) =>
  text
    .replaceAll('{{CARD_ID}}', id)
    .replaceAll('{{CARD_TITLE}}', card.title)
    .replaceAll('{{BASE}}', base)
    .replaceAll('{{HEAD}}', head ?? 'NOT RECORDED')
    .replaceAll('{{ATTEMPT}}', String(attempt));

// Parent reviews borrow their children's verification rows.
let body;
let rows;
if (plan.reviews.has(id)) {
  const children = card.depends.map((c) => plan.cards.get(c));
  rows = children.flatMap((c) => c.verification.map((v) => ({ ...v, id: `${c.id}-${v.id}` })));
  body = [
    `# ${id} ${card.title}`,
    '',
    `Role: IMPLEMENTATION REVIEWER for parent ${card.parent}. Level: ${card.level}.`,
    `Children: ${card.depends.join(', ')}.`,
    '',
    "## Re-run on the parent's final commit",
    '',
    '| ID | Command (cwd: repo root) | Expected |',
    '| --- | --- | --- |',
    ...rows.map(
      (r) => `| ${r.id} | ${r.command.replaceAll('|', '\\|')} | ${r.expected.replaceAll('|', '\\|')} |`,
    ),
    '',
    '## Then',
    '',
    `- The ${card.level.includes('L2') ? 'L2 suite in RUN-CONFIG.md §3' : `level ${card.level} checks in RUN-CONFIG.md §2`}.`,
    `- Extra checks: ${card.extra}`,
    '',
  ].join('\n');
  rows = [...rows, { id: 'SUITE' }, { id: 'EXTRA' }];
} else {
  rows = card.verification;
  body = card.text;
}

if (port) body = body.replaceAll('--port <p>', `--port ${port}`);

const contractIds = new Set(card.contracts);
if (plan.reviews.has(id))
  for (const c of card.depends) for (const k of plan.cards.get(c).contracts) contractIds.add(k);
const contractText = [...contractIds].map((c) => plan.contracts.get(c)).join('\n');
const needsAcquisition = /\bA\d{2}\b|ACQUISITION/.test(body);

const criteriaRows = rows.map((r) => `| ${r.id} | NOT RUN | | | |`).join('\n');

const suffix = mode === 'ir' ? '-ir' : mode === 'review' ? '-review' : '';
const outPath = join(planDir, 'state', 'dispatch', `${id}${suffix}.md`);
const dispatchPath = `docs/v2/state/dispatch/${id}${suffix}.md`;

/*
 * The commit this file is generated at, which is not the base: the base is the
 * source the implementer branches from and HEAD moves on as documentation-only
 * commits land. The stop rule below names this, so a reviewer is stopped by a
 * reviewed source path moving, not by the clock.
 */
const generatedAt = (() => {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], {
    cwd: join(planDir, '..', '..'),
    encoding: 'utf8',
  });
  return r.status === 0 ? r.stdout.trim() : null;
})();

let template = fill(
  read(
    mode === 'ir'
      ? 'templates/INSTRUCTION-REVIEW.md'
      : mode === 'review'
        ? 'templates/IMPLEMENTATION-REVIEW.md'
        : 'templates/IMPLEMENTATION-RETURN.md',
  ),
).replaceAll('{{CRITERIA_ROWS}}', criteriaRows);
// The return-file section names this file's own name: for an instruction review
// or an implementation review there is no unsuffixed dispatch to point at.
template = template.replaceAll(`docs/v2/state/dispatch/${id}.md`, dispatchPath);
// "Known facts" is offered only where the embedded card actually has it.
if (!/^#{1,6} +.*known facts/im.test(body)) template = template.replace(' and match the "Known facts".', '.');

const findingsFile = opt('--findings');
const parts = [
  `<!-- dispatch for ${id}, mode ${mode}, base ${base}${port ? `, port ${port}` : ''}, attempt ${attempt} of 3; generated by tools/build-dispatch.mjs -->`,
  '',
  `# Dispatch: ${id} ${card.title}`,
  '',
  `- Mode: **${mode === 'ir' ? 'INSTRUCTION REVIEW' : mode === 'review' ? 'IMPLEMENTATION REVIEW' : card.role}**`,
  `- Base commit: \`${base}\`${head ? `; head \`${head}\`` : ''}`,
  port ? `- Sandbox port for this card: ${port}` : '- No sandbox port assigned',
  `- Attempt ${attempt} of ${attempt === 4 ? '3, plus one corrective attempt the owner authorised by ' + exception + ' — there is no attempt 5' : '3'}. Checkpoint: \`docs/v2/state/cards/${id}.json\`.`,
  '- Do not pull, merge, rebase or reset. This file was generated at ' +
    (generatedAt ? `\`${generatedAt}\`` : 'an unrecorded commit') +
    ', which is not the base commit, and HEAD may have moved past it on ' +
    'documentation-only commits: that alone is not a stop. Stop and report if ' +
    (generatedAt
      ? 'a source path this card reviews — any path it lists under "Read", ' +
        'writes, or tests — differs between `' +
        generatedAt +
        '` and current HEAD.'
      : 'HEAD is not recorded in this file, so you cannot tell whether a reviewed source path moved.') +
    (mode === 'review' && head
      ? ` Your role is implementation review: HEAD must be \`${head}\`, and anything else is a stop.`
      : ''),
  '',
  read('HARD-STOPS.md'),
  '',
  '---',
  '',
  body,
  '',
  '---',
  '',
  '# Contract excerpts (authoritative)',
  '',
  contractText || 'No contract applies to this card.',
  '',
  '---',
  '',
  read('RUN-CONFIG.md'),
  needsAcquisition ? `\n---\n\n${read('ACQUISITION.md')}` : '',
  findingsFile
    ? `\n---\n\n# Findings from the previous attempt\n\n${readFileSync(findingsFile, 'utf8')}`
    : '',
  '',
  '---',
  '',
  '# Your return file',
  '',
  template,
];

const out = parts.join('\n');
const outDir = join(planDir, 'state', 'dispatch');
mkdirSync(outDir, { recursive: true });
writeFileSync(outPath, out);
const words = out.split(/\s+/).filter(Boolean).length;
process.stdout.write(`${outPath} (${words} words)\n`);
