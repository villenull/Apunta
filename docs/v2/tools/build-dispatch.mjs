#!/usr/bin/env node
// Builds a self-contained dispatch file for one card, so a sub-session needs
// nothing else: hard stops, the card, the exact contract excerpts, the run
// configuration, and a return template with every status unverified.
//
//   node docs/v2/tools/build-dispatch.mjs <card-id> --base <commit> --port <7800-7889> [--attempt <n>] [--findings <file>]
//   node docs/v2/tools/build-dispatch.mjs <card-id> --ir --base <commit>     # instruction-review brief
//   node docs/v2/tools/build-dispatch.mjs <card-id> --review --base <commit> --head <commit>
//   node docs/v2/tools/build-dispatch.mjs <card-id> --base <commit> --print  # stdout, writes nothing
//   node docs/v2/tools/build-dispatch.mjs ... --plan-dir <dir>                # another plan directory
//
// Refuses (exit 3) if a dependency is not APPROVED in state/PROGRESS.json.
// Refuses (exit 4) rather than emit a dispatch that is wrong in a way nobody
// would notice — see "Loud refusals" below. Nothing is written on a refusal,
// and --print writes nothing at all.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { escapeCell, loadPlan, parseCells } from './plan-lib.mjs';

// Re-exported so check-plan.mjs, and anything else that reads a table cell, gets
// the same function this file emits with.
export { escapeCell, parseCells };

/*
 * The table codec lives in plan-lib.mjs, next to the parser that reads a card,
 * and that is the fix for the class of defect a parent review used to inherit
 * silently: a child's verification command is *machine-copied* into the parent's
 * table (`parseCard` -> `verification[].command` -> GFM), so anything the copy
 * loses is invisible to the child's own implementer and fatal to the parent,
 * whose reviewer has nothing but the generated table.
 *
 * Two rules make that copy exact, and both are asserted by the colocated tests:
 *
 *   1. emit and parse are inverses. `escapeCell` escapes a backslash and a pipe;
 *      `parseCells` unescapes them in one left-to-right pass. So a pipe that is
 *      already escaped in the source gains no backslash and loses none, and a
 *      cell comes back byte for byte — including for a BRE alternation, which
 *      must still be an alternation after the round trip. There is now *one*
 *      parser, used to read a card as well as to check an emitted row: before,
 *      the two disagreed about `\\`, so a card writing an alternation as `\\|`
 *      was told it must be `\|`, and `\|` is read by the parser as a bare pipe —
 *      in BRE a bare `|` is an ordinary character, so a guard written that way
 *      matched nothing and passed always. The spelling that survives is `\\\|`,
 *      and the refusal a card author actually hits now names it.
 *   2. generation refuses rather than emitting something lossy. Every emitted
 *      row is parsed back and compared; a cell that does not come back
 *      identical, or a row that does not come back as three cells, is exit 4.
 *
 * The alternative — leaving `replaceAll('|', '\\|')` unguarded — is what turned
 * `invoke_handler\|withGlobalTauri` into a bare `|` in an executed command.
 */

// The `{{…}}` tokens this tool claims to substitute. Nothing else is a token.
const TOKEN_TOKENS = ['{{CARD_ID}}', '{{CARD_TITLE}}', '{{BASE}}', '{{HEAD}}', '{{ATTEMPT}}'];

/*
 * The port placeholder family. `--port <p>` is the only spelling this tool
 * substitutes; a card that writes `<p>` in any other position (`APUNTA_P31_PORT=<p>`,
 * `--port <p1>`) has a placeholder nothing will fill, and the shell reads `<p`
 * as an input redirect from a file called `p`. Rather than grow one
 * substitution per spelling, generation *refuses* when one survives: the rule is
 * "no placeholder the tool claims to substitute may reach the output", which is
 * what catches the next card's spelling too.
 */
const PORT_PLACEHOLDER = /<(?:p\d*|port\d*)>/gi;

/** Fills the `{{…}}` tokens. The only substitution for them that exists. */
export function substituteTokens(text, values) {
  let out = String(text);
  for (const token of TOKEN_TOKENS) out = out.replaceAll(token, values[token.slice(2, -2)] ?? '');
  return out;
}

/**
 * Every claimed `{{TOKEN}}` still present in a document. The vocabulary is the
 * five tokens this tool substitutes, not "anything between two braces": a card's
 * prose legitimately writes `{{…}}` when it is talking about tokens, and another
 * packet's own tokens (`{{S32_PORT}}`) are filled by whatever runs that packet —
 * neither is a defect here, and flagging them would block legitimate work. A
 * surviving token from this list always means a substitution did not happen.
 */
export function findUnsubstitutedTokens(text) {
  const found = [];
  for (const token of TOKEN_TOKENS) if (String(text).includes(token)) found.push(token);
  return found;
}

/**
 * Every port placeholder still present in the *command* cells of a document.
 * Scoped to command cells on purpose: prose that explains what `<p>` means is
 * correct and must not fail generation, while a `<p>` that reaches a shell is a
 * syntax error (bash: `p: No such file or directory`, exit 1).
 */
export function findUnfilledPorts(text) {
  const found = [];
  for (const line of String(text).split('\n')) {
    if (!/^\| *[^|]*V\d+ *\|/.test(line)) continue;
    const cells = parseCells(line);
    if (cells.length !== 3) continue;
    for (const m of cells[1].matchAll(new RegExp(PORT_PLACEHOLDER.source, 'gi')))
      found.push(`${cells[0]}: ${m[0]}`);
  }
  return found;
}

function main() {
  const planDirOption = process.env.APUNTA_V2_PLAN_DIR;
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
      'usage: build-dispatch.mjs <card-id> --base <commit> [--port <p>] [--print] [--plan-dir <dir>] [--ir | --review --head <commit>]',
    );
  const base = opt('--base');
  if (!base) fail(2, '--base <commit> is required');
  const planDir = opt('--plan-dir') ?? planDirOption ?? join(dirname(fileURLToPath(import.meta.url)), '..');
  const print = flag('--print');

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
   *
   * P3.4 retains its historical fifth/sixth-attempt exceptions. AM-223
   * reconciles two later recorded grants without raising the general ceiling:
   * P5.3 attempt 5 requires AM-218; P3.6 attempt 7 requires AM-212 or AM-214.
   * Every other card/amendment combination still fails closed.
   */
  const exception = opt('--attempt-exception');
  const FIFTH_ATTEMPT_CARD = 'P3.4'; // AM-189; changes only with another owner amendment
  const SIXTH_ATTEMPT_CARD = 'P3.4'; // AM-nnn (proposed); the only card with a sixth-attempt exception
  const fifthRepair = id === 'P5.3' && exception === 'AM-218';
  const seventhRepair = id === 'P3.6' && (exception === 'AM-212' || exception === 'AM-214');
  if (attempt === 4 || attempt === 5 || attempt === 6 || attempt === 7) {
    if (exception === undefined || !/^AM-\d{3}$/.test(exception))
      fail(
        2,
        `--attempt ${String(attempt)} requires --attempt-exception <AM-nnn> naming the owner amendment that authorised it`,
      );
    if (attempt === 5 && id !== FIFTH_ATTEMPT_CARD && !fifthRepair)
      fail(
        2,
        `--attempt 5 is refused: only ${FIFTH_ATTEMPT_CARD} may carry it, except P5.3 with AM-218; ${id} has no attempt 6 under this grant`,
      );
    if (attempt === 6 && id !== SIXTH_ATTEMPT_CARD)
      fail(
        2,
        `--attempt 6 is refused: only ${SIXTH_ATTEMPT_CARD} may carry it; ${id} has no attempt 7 under this grant`,
      );
    if (attempt === 7 && !seventhRepair)
      fail(2, '--attempt 7 is refused: only P3.6 with AM-212 or AM-214 may carry it; no attempt 8');
  } else if (attempt >= 8) {
    fail(2, `--attempt ${attempt} is beyond any authorised budget; no attempt 8`);
  } else if (!(attempt >= 1 && attempt <= 3)) {
    fail(2, '--attempt must be 1, 2 or 3');
  }

  // Dependencies must be APPROVED.
  const progressPath = join(planDir, 'state', 'PROGRESS.json');
  const progress = existsSync(progressPath) ? JSON.parse(readFileSync(progressPath, 'utf8')) : { cards: {} };
  const missing = card.depends.filter((d) => progress.cards?.[d] !== 'APPROVED');
  if (missing.length > 0) fail(3, `not dispatchable: dependencies not APPROVED: ${missing.join(', ')}`);

  const read = (p) => readFileSync(join(planDir, p), 'utf8');
  const values = {
    CARD_ID: id,
    CARD_TITLE: card.title,
    BASE: base,
    HEAD: head ?? 'NOT RECORDED',
    ATTEMPT: String(attempt),
  };
  // Tokens and the one port spelling this tool substitutes, applied together.
  const substitute = (text) => {
    const filled = substituteTokens(text, values);
    return port ? filled.replaceAll('--port <p>', `--port ${port}`) : filled;
  };

  /*
   * Loud refusals. Every one of these is a defect that used to reach a reviewer
   * as a working-looking row: a truncated command with a dropped control, a
   * literal `{{BASE}}` in a `git diff` (`fatal: bad revision`, exit 128), or a
   * `<p>` that bash reads as an input redirect. Generation stops instead, and
   * names the row, because the alternative is a dispatch that is quietly wrong.
   */
  const refuse = (reason) => fail(4, `${id}: refusing to generate: ${reason}`);

  // Parent reviews borrow their children's verification rows.
  let body;
  let rows;
  const borrowed = plan.reviews.has(id);
  if (borrowed) {
    const children = card.depends.map((c) => plan.cards.get(c));
    rows = children.flatMap((c) => c.verification.map((v) => ({ ...v, id: `${c.id}-${v.id}` })));
    /*
     * The borrowed rows are substituted before they are escaped into the table,
     * so `fill()` reaches a borrowed body exactly as it reaches a card's own
     * return template: `{{BASE}}` in a child's Expected cell used to reach the
     * parent literally, because fill was applied to the template only.
     */
    const prepared = rows.map((r) => ({
      id: r.id,
      command: substitute(r.command),
      expected: substitute(r.expected),
    }));
    const rowLines = prepared.map(
      (r) => `| ${escapeCell(r.id)} | ${escapeCell(r.command)} | ${escapeCell(r.expected)} |`,
    );
    /*
     * Loud refusal 2: every emitted row is parsed back. A cell that does not
     * come back byte-identical means emit and parse are not inverses, which is the
     * bug that turned an escaped BRE alternation into a bare `|` and made a
     * negative guard unfireable.
     */
    for (const [i, line] of rowLines.entries()) {
      const cells = parseCells(line);
      const r = prepared[i];
      if (cells.length !== 3)
        refuse(
          `${r.id}: the emitted row parses as ${cells.length} cells, not 3 — a pipe in this command or expected cell reached the row unescaped, so escapeCell did not carry it (this is a bug in escapeCell, not in the card)`,
        );
      if (cells[0] !== r.id || cells[1] !== r.command || cells[2] !== r.expected)
        refuse(
          `${r.id}: the emitted row does not round-trip — escapeCell and parseCells are not inverses for this cell`,
        );
    }
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
      ...rowLines,
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

  /*
   * Loud refusal 1: a verification row must split into exactly three cells. An
   * unescaped pipe inside a command or an expected cell makes it split into more,
   * and `parseCard` keeps the first three and drops the rest — which is how a
   * parent's inherited command once ended mid-word, unbalanced, with the negative
   * control's `exit $rc` discarded. That loss happens before this file can see
   * the row, so it is asserted on the row's own source text rather than on the
   * command that survived parsing.
   *
   * The advice in the message names the two spellings that survive the pipeline,
   * and only those: a shell pipe is `\|` (the parser gives the shell a bare `|`,
   * which is what a pipe is), and a cell the shell must receive as a backslash-pipe
   * — a BRE alternation — is `\\\|`, because `\|` in a cell is a bare pipe to the
   * parser too, and two backslashes leave a real delimiter behind. Both are
   * asserted to round-trip by the colocated test, so the advice cannot rot into
   * the defect it is warning about.
   */
  for (const r of rows) {
    if (!r.raw) continue;
    const cells = parseCells(r.raw);
    if (cells.length !== 3)
      refuse(
        `${r.id}: its source row parses as ${cells.length} cells, not 3 — every pipe inside a command or expected cell must be written \\| so it is content and not a delimiter, and a cell the shell must receive as a backslash-pipe (a BRE alternation) must be written \\\\\\|: one backslash is read as a bare pipe and two leave a delimiter behind (check-plan.mjs asserts this too)`,
      );
  }

  // The borrowed body gets the same substitution the return template always got.
  body = substitute(body);

  const contractIds = new Set(card.contracts);
  if (borrowed) for (const c of card.depends) for (const k of plan.cards.get(c).contracts) contractIds.add(k);
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

  let template = substitute(
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
  if (!/^#{1,6} +.*known facts/im.test(body))
    template = template.replace(' and match the "Known facts".', '.');

  const findingsFile = opt('--findings');
  const parts = [
    `<!-- dispatch for ${id}, mode ${mode}, base ${base}${port ? `, port ${port}` : ''}, attempt ${attempt} of 3; generated by tools/build-dispatch.mjs -->`,
    '',
    `# Dispatch: ${id} ${card.title}`,
    '',
    `- Mode: **${mode === 'ir' ? 'INSTRUCTION REVIEW' : mode === 'review' ? 'IMPLEMENTATION REVIEW' : card.role}**`,
    `- Base commit: \`${base}\`${head ? `; head \`${head}\`` : ''}`,
    port ? `- Sandbox port for this card: ${port}` : '- No sandbox port assigned',
    /*
     * One branch per attempt rather than an arithmetic form (`attempt - 3`):
     * attempt 4's sentence is one corrective attempt, attempt 5's is two and
     * attempt 6's is three, so the number has to be spelled out. Arithmetic also
     * renders `one` as `1`, which would change attempt 4's line by a byte — and
     * that line is in the three dispatches already shipped, so a byte of drift
     * here is a discrepancy between a reviewed dispatch and the generator that
     * claims to have produced it.
     */
    `- Attempt ${attempt} of ${
      attempt === 4
        ? '3, plus one corrective attempt the owner authorised by ' + exception + ' — there is no attempt 5'
        : attempt === 5
          ? '3, plus two corrective attempts the owner authorised by ' +
            exception +
            ' — there is no attempt 6'
          : attempt === 6
            ? '3, plus three corrective attempts the owner authorised by ' +
              exception +
              ' — there is no attempt 7'
            : attempt === 7
              ? '3, plus four corrective attempts the owner authorised by ' +
                exception +
                ' — there is no attempt 8'
              : '3'
    }. Checkpoint: \`docs/v2/state/cards/${id}.json\`.`,
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

  /*
   * Loud refusal 3 and 4, over the whole assembled document rather than at known
   * positions: no `{{…}}` this tool claims to substitute may survive anywhere, and
   * no unfilled port placeholder may survive in a command cell. A card's own text
   * is checked too, not only a borrowed body, because the same token in a child's
   * own command is the same defect one dispatch earlier.
   */
  const tokens = findUnsubstitutedTokens(out);
  if (tokens.length > 0)
    refuse(
      `the generated document still contains unsubstituted placeholders: ${[...new Set(tokens)].join(', ')} — the body a parent borrows is now filled like the return template, so a surviving token is in a card, a contract, RUN-CONFIG or a template`,
    );
  // An instruction review is a brief to read a card, not to run its commands, so
  // its port placeholders are not a shell hazard and are not checked here.
  if (mode !== 'ir') {
    const ports = findUnfilledPorts(out);
    if (ports.length > 0)
      refuse(
        `these command cells still carry a port placeholder nothing substitutes (only \`--port <p>\` is filled): ${ports.join('; ')} — write a literal in-range port, or spell it \`--port <p>\``,
      );
  }

  const words = out.split(/\s+/).filter(Boolean).length;
  if (print) {
    // --print is meant to be piped; a closed pipe is not an error worth a stack.
    process.stdout.on('error', (e) => {
      if (e.code !== 'EPIPE') throw e;
    });
    process.stdout.write(out);
    return;
  }
  const outDir = join(planDir, 'state', 'dispatch');
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outPath, out);
  process.stdout.write(`${outPath} (${words} words)\n`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
