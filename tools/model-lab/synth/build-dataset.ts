#!/usr/bin/env node
/**
 * Build the synthetic training corpus as JSONL, with each example's prompt
 * assembled by **production's own prompt builder**.
 *
 * That is the point of this script: the LoRA must learn the mapping the app
 * actually asks for, so the system and user turns here are byte-identical to
 * what `buildGeneratePrompt` sends at draft time — the shipped (decontaminated)
 * instruction file, the output-format block, the clinical-knowledge guide, the
 * faithfulness close, the conditional user-turn reminders, and the tail
 * reminder. A corpus built with a hand-written prompt would measure a model
 * nobody runs.
 *
 * Usage:
 *   npx tsx tools/model-lab/synth/build-dataset.ts --out <path.jsonl> [--count 400] [--seed 7]
 *
 * The output is synthetic only. It contains no patient text, no fixture text,
 * and no sentence from either — the eval corpora are the test set and are
 * never trained on.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { defaultInstructionsFor } from '../../../server/src/ai/default-instructions.js';
import { buildGeneratePrompt } from '../../../server/src/ai/prompts.js';
import {
  generateCorpus,
  renderPair,
  SOAP_SECTIONS,
  OWNER_SECTIONS,
  INTAKE_SECTIONS,
  type FormatKind,
} from './generate.js';

interface Args {
  out: string;
  count: number;
  seed: number;
}

function parseArgs(argv: readonly string[]): Args {
  const args: Args = { out: '', count: 400, seed: 7 };
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (flag === '--out' && value !== undefined) {
      args.out = value;
      index += 1;
    } else if (flag === '--count' && value !== undefined) {
      args.count = Number(value);
      index += 1;
    } else if (flag === '--seed' && value !== undefined) {
      args.seed = Number(value);
      index += 1;
    } else {
      throw new Error(`unknown argument ${String(flag)}`);
    }
  }
  if (args.out === '') throw new Error('--out is required');
  if (!Number.isInteger(args.count) || args.count < 1) throw new Error('--count must be a positive integer');
  return args;
}

const SECTIONS_BY_FORMAT: Record<FormatKind, readonly string[]> = {
  owner: [...OWNER_SECTIONS],
  soap: [...SOAP_SECTIONS],
  intake: [...INTAKE_SECTIONS],
};

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const { scenarios, randoms } = generateCorpus(args.count, args.seed);
  const out = resolve(args.out);
  mkdirSync(dirname(out), { recursive: true });

  const lines: string[] = [];
  let maxSystemChars = 0;
  let maxUserChars = 0;

  scenarios.forEach((scenario, index) => {
    const random = randoms[index];
    if (random === undefined) throw new Error('missing rng');
    const sections = SECTIONS_BY_FORMAT[scenario.format];
    const { dictation, note } = renderPair(scenario, random);
    const source = scenario.source === 'dictated' ? { transcript: dictation } : { typedNotes: dictation };
    const prompt = buildGeneratePrompt({
      instructions: defaultInstructionsFor(
        scenario.format === 'intake' ? 'Intake note' : 'Progress note',
        sections,
      ),
      sections,
      formatName: scenario.format === 'intake' ? 'Intake note' : 'Progress note',
      ...source,
    });
    maxSystemChars = Math.max(maxSystemChars, prompt.system.length);
    maxUserChars = Math.max(maxUserChars, prompt.user.length);
    lines.push(
      JSON.stringify({
        id: `${scenario.format}-${String(index).padStart(4, '0')}`,
        format: scenario.format,
        sections,
        source: dictation,
        target: JSON.stringify(note, null, 2),
        system: prompt.system,
        user: prompt.user,
      }),
    );
  });

  writeFileSync(out, `${lines.join('\n')}\n`, 'utf8');
  process.stderr.write(
    `wrote ${String(lines.length)} synthetic pairs to ${out}\n` +
      `longest system turn: ${String(maxSystemChars)} chars; longest user turn: ${String(maxUserChars)} chars\n`,
  );
}

main();
