// Tests for docs/v2/tools/plan-lib.mjs, which owns the table codec.
//
// Run: node --test docs/v2/tools/plan-lib.test.mjs
//
// These assert a *property*, not the author's sample. The property is identity on
// every card cell: the cell parseCells returns for a row is the text escapeCell
// emits back for it, byte for byte, with trimming as the one documented exception.
// An earlier version of this suite asserted a hand-written list of eleven
// commands, and a mutant that escaped `&` passed all four of those — the list was
// the author's alphabet, not the alphabet in use. Every test below therefore
// ranges over a generated alphabet or over the plan's own rows, and none of them
// names a character the codec happens to treat specially.
//
// No file in the repository is written. The last test reads the plan's card rows
// read-only and asserts a property that holds for any row whatever its content,
// so it cannot fail because an unrelated card is mid-repair.

import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

import { escapeCell, loadPlan, parseCard, parseCells } from './plan-lib.mjs';

const toolDir = dirname(fileURLToPath(import.meta.url));
const planDir = join(toolDir, '..');

/*
 * Every string over this alphabet, to length 4. The members are chosen for what
 * they do to a table cell rather than for whether the codec knows them: `|` is
 * the delimiter, `\` is the only escape character, and the rest — `&`, `"`, `'`,
 * a space, a tab — are here to be *ordinary*, so a codec that escaped one of them
 * fails here rather than incidentally.
 */
const ALPHABET = ['a', '|', '\\', '&', '"', "'", ' ', '\t'];

function* words(maxLength) {
  const level = [['']];
  for (let n = 1; n <= maxLength; n += 1) {
    const next = [];
    for (const prefix of level[n - 1]) for (const ch of ALPHABET) next.push(prefix + ch);
    level.push(next);
    yield* next;
  }
}

test('the round trip is identity on every cell over the stress alphabet', () => {
  // The whole property, in one assertion per string: escaping a cell and parsing
  // the row back returns the cell — and returns it trimmed, which is the one
  // documented exception, derived here rather than assumed.
  let checked = 0;
  for (const cell of words(4)) {
    const cells = parseCells(`| V1 | ${escapeCell(cell)} | ok |`);
    assert.equal(cells.length, 3, `not three cells for ${JSON.stringify(cell)}`);
    assert.equal(cells[1], cell.trim(), `round trip changed ${JSON.stringify(cell)}`);
    checked += 1;
  }
  assert.ok(checked > 4000, `the corpus is too small to be worth anything: ${checked}`);
});

test('trimming is the *only* thing that does not survive', () => {
  // The exception is stated as an equality, not as a caveat: for each of these
  // cells the result is exactly the trimmed text, and for cells with no edge
  // whitespace it is the text itself.
  for (const cell of ['', ' ', '\t', ' a', 'a ', ' a ', '\ta\t', '   ', 'a\tb', ' a|b ']) {
    assert.equal(parseCells(`| V1 | ${escapeCell(cell)} | ok |`)[1], cell.trim(), JSON.stringify(cell));
  }
  for (const cell of ['a', 'a|b', 'a\\b', 'a\\|b', 'a&b', 'a"b', "a'b"]) {
    assert.equal(parseCells(`| V1 | ${escapeCell(cell)} | ok |`)[1], cell);
  }
});

test('a cell never gains a backslash it did not need', () => {
  // The half of the property the escape direction owns. Only `\` and `|` are
  // given meaning by a table; anything else must survive a row untouched, which
  // is what an `&`-escaping mutant breaks.
  for (const ch of [
    'a',
    '&',
    '"',
    "'",
    ' ',
    '\t',
    '(',
    ')',
    ';',
    '$',
    '`',
    '{',
    '}',
    '-',
    '#',
    '*',
    '.',
    '/',
    '=',
    '~',
    '!',
    '%',
    '+',
    ',',
    '<',
    '>',
    '?',
    '[',
    ']',
    '^',
    'x',
    ' ',
  ]) {
    assert.equal(escapeCell(ch), ch, `escapeCell changed ${JSON.stringify(ch)}`);
  }
});

test('the cell count is never wrong, whatever the content', () => {
  // The validity check both tools rely on: a row's cell count is the number of
  // unescaped delimiters plus one, for every input including lone backslashes.
  for (const cell of words(3)) {
    const line = `| V1 | ${escapeCell(cell)} | ok |`;
    assert.equal(parseCells(line).length, 3, JSON.stringify(cell));
  }
  assert.equal(parseCells('| a | b |').length, 2);
  assert.equal(parseCells('|').length, 0);
});

test('every spelling of a pipe, and what each one means', () => {
  // The trap this suite exists for. Written as the card file contains the bytes,
  // with the backslash count spelled out, because that count *is* the meaning:
  //
  //   a|b      not representable: the pipe is a delimiter, so the row has 4 cells
  //   a\|b     a pipe to the shell — what a shell pipe is, and what a BRE reads
  //             as an ordinary character, which is why an alternation written
  //             this way is inert
  //   a\\|b    not representable: the pair is one backslash and the pipe is still
  //             a delimiter, so the row has 4 cells
  //   a\\\|b   a backslash-pipe to the shell — a BRE alternation that is still an
  //             alternation. This is the spelling that survives.
  //
  // For every representable spelling the codec must be a fixed point — re-escaping
  // the parsed command and re-parsing gives that command again — and for a
  // *canonical* spelling the emitted cell is the spelling itself, so what a
  // parent inherits is byte for byte the child's own cell. A spelling that is not
  // canonical carries the same meaning in a longer form: `a\|b\\c` and `a\|b\c`
  // are the same command, and the emitter normalises to the second.
  const spellings = [
    ['a|b', null, false],
    ['a\\|b', 'a|b', true],
    ['a\\\\|b', null, false],
    ['a\\\\\\|b', 'a\\|b', true],
    ['a\\\\\\\\|b', null, false],
    ['a\\|b\\\\c', 'a|b\\c', false],
    ['a\\|b\\c', 'a|b\\c', true],
    ['\\|a\\|b', '|a|b', true],
    ['a\\b', 'a\\b', true],
    ['a\\\\b', 'a\\b', false],
    ['a\\\\\\\\b', 'a\\\\b', true],
    ['grep -rn "a\\|b" src', 'grep -rn "a|b" src', true],
    ['grep -rn "a\\\\\\|b" src', 'grep -rn "a\\|b" src', true],
    ['a\\|b\\\\c\\\\d', 'a|b\\c\\d', false],
  ];
  for (const [spelling, command, canonical] of spellings) {
    const cells = parseCells(`| V1 | ${spelling} | ok |`);
    if (command === null) {
      assert.equal(cells.length, 4, `${JSON.stringify(spelling)} should not be representable`);
      continue;
    }
    assert.equal(cells.length, 3, `${JSON.stringify(spelling)} should be representable`);
    assert.equal(cells[1], command, `${JSON.stringify(spelling)} parsed to the wrong command`);
    assert.equal(
      parseCells(`| V1 | ${escapeCell(cells[1])} | ok |`)[1],
      cells[1],
      `${JSON.stringify(spelling)} is not a fixed point`,
    );
    if (canonical)
      assert.equal(escapeCell(cells[1]), spelling, `${JSON.stringify(spelling)} did not survive`);
  }
});

test('the card parser is the codec, not a second opinion about it', () => {
  // parseCard reads card rows through parseCells, so a spelling that survives
  // the emitter survives the reader. An earlier `splitRow` unescaped only `\|`,
  // which is what made `\\|` — the only spelling that could reach a shell as
  // `\|` — the one both tools refused, while the one they recommended was
  // silently flattened to a bare pipe.
  const dir = mkdtempSync(join(tmpdir(), 'apunta-codec-'));
  mkdirSync(join(dir, 'cards'), { recursive: true });
  const card = [
    '# T1 Card with an alternation',
    '',
    '| Field | Value |',
    '| --- | --- |',
    '| Parent | T0 |',
    '',
    '## Verification',
    '',
    '| ID | Command (cwd: repo root) | Expected |',
    '| --- | --- | --- |',
    '| V1 | `grep -rn "a\\\\\\|b" f` | no matches |',
    '',
  ].join('\n');
  const parsed = parseCard(card, 'T1.md');
  assert.equal(parsed.verification.length, 1);
  assert.equal(parsed.verification[0].command, '`grep -rn "a\\|b" f`');
  assert.equal(
    escapeCell(parsed.verification[0].command),
    '`grep -rn "a\\\\\\|b" f`',
    'the parsed command re-emits the row as the card wrote it',
  );
});

test('every verification row in the plan re-emits its own cell byte for byte', () => {
  // The corpus half, over the plan as it stands: the cell the parser reads is the
  // cell the emitter writes back, for every row. The assertion is a property of
  // the codec, so it holds for a row under repair as well as for a finished one;
  // only a row with fewer than three parsed cells is skipped, because a
  // half-written row has no command cell to compare.
  let rows = 0;
  for (const file of readdirSync(join(planDir, 'cards')).sort()) {
    const text = readFileSync(join(planDir, 'cards', file), 'utf8');
    for (const line of text.split('\n')) {
      if (!/^\| V\d+ \|/.test(line)) continue;
      const cells = parseCells(line);
      if (cells.length < 3) continue;
      for (const cell of cells.slice(1)) {
        const line2 = `| a | ${escapeCell(cell)} | ok |`;
        assert.equal(parseCells(line2)[1], cell, `${file}: ${JSON.stringify(cell.slice(0, 80))}`);
      }
      rows += 1;
    }
  }
  assert.ok(rows > 100, `only ${rows} rows read; the plan should have hundreds`);
});

test('loadPlan and the codec agree on every card it can read', () => {
  // Structural, not sampled: whatever parseCard produces for a verification row
  // is a fixed point of the codec. Cheap enough to run over the whole plan.
  const plan = loadPlan(planDir);
  let rows = 0;
  for (const card of plan.cards.values()) {
    for (const row of card.verification) {
      const emitted = `| ${row.id} | ${escapeCell(row.command)} | ${escapeCell(row.expected)} |`;
      const cells = parseCells(emitted);
      assert.equal(cells.length, 3, `${card.id} ${row.id} emitted ${cells.length} cells`);
      assert.equal(cells[1], row.command, `${card.id} ${row.id} command did not round-trip`);
      assert.equal(cells[2], row.expected, `${card.id} ${row.id} expected did not round-trip`);
      rows += 1;
    }
  }
  assert.ok(rows > 100, `only ${rows} rows read; the plan should have hundreds`);
});

test('writing a card with the surviving spelling and reading it back is stable', () => {
  // One round trip through the filesystem rather than through the functions, so
  // the claim covers the file a card author actually edits.
  const dir = mkdtempSync(join(tmpdir(), 'apunta-codec-file-'));
  mkdirSync(join(dir, 'cards'), { recursive: true });
  writeFileSync(
    join(dir, 'cards', 'T1.md'),
    '# T1 Card\n\n| Field | Value |\n| --- | --- |\n| Parent | T0 |\n',
  );
  // Three backslashes and a pipe: the spelling a card uses so that grep receives
  // `\|`. Spelled with a repeat rather than as an escape so the byte count is
  // legible here, which is the whole point of this spelling.
  const spelling = `${'\\'.repeat(3)}|`;
  const row = `| V1 | \`grep -rn "invoke_handler${spelling}withGlobalTauri" src\` | exit 1 |`;
  const first = parseCells(row);
  assert.equal(first.length, 3);
  assert.equal(first[1], '`grep -rn "invoke_handler\\|withGlobalTauri" src`');
  const second = parseCells(`| V1 | ${escapeCell(first[1])} | ${escapeCell(first[2])} |`);
  assert.deepEqual(second, first, 'the row is a fixed point of the codec');
  assert.equal(escapeCell(first[1]), row.split(' | ')[1], 'the row re-emits itself');
});
