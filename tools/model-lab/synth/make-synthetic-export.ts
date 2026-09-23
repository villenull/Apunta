#!/usr/bin/env node
/**
 * A Claude-export-shaped file built entirely from the synthetic generator.
 *
 * The consented pipeline (`pipeline/build-pairs.ts`) reads a real export
 * through the M11 importer. This produces the same *shape* — the keys the
 * importer's own readers look for, taken from `e2e/fixtures/claude-export/` —
 * with the generator's invented sessions inside, so the pipeline can be run end
 * to end, with a real pair count and a real filter report, without a byte of
 * patient text anywhere. It is the rehearsal for the consented run.
 *
 * Usage:
 *   npx tsx tools/model-lab/synth/make-synthetic-export.ts \
 *     --out <dir>/conversations.json --conversations 8 --sessions 4 --seed 5
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { generateCorpus, renderPair } from './generate.js';

function requiredArg(argv: readonly string[], flag: string): string {
  const index = argv.indexOf(flag);
  const value = index === -1 ? undefined : argv[index + 1];
  if (value === undefined) throw new Error(`${flag} is required`);
  return value;
}

function main(): void {
  const argv = process.argv.slice(2);
  const out = resolve(requiredArg(argv, '--out'));
  const conversations = Number(argv[argv.indexOf('--conversations') + 1] ?? 8);
  const sessions = Number(argv[argv.indexOf('--sessions') + 1] ?? 4);
  const seed = Number(argv[argv.indexOf('--seed') + 1] ?? 5);

  const { scenarios, randoms } = generateCorpus(conversations * sessions, seed);
  const exportConversations: unknown[] = [];

  for (let index = 0; index < conversations; index += 1) {
    const messages: unknown[] = [];
    for (let session = 0; session < sessions; session += 1) {
      const offset = index * sessions + session;
      const scenario = scenarios[offset];
      const random = randoms[offset];
      if (scenario === undefined || random === undefined) throw new Error('missing scenario');
      // A day apart per session, so the importer's 6-hour session split cuts
      // exactly where a session ends — the same way it cuts a real export.
      const at = new Date(Date.UTC(2026, 2, 2 + session, 18, 0, 0)).toISOString();
      const { dictation, note } = renderPair(scenario, random);
      messages.push({
        uuid: `synth-${String(index)}-${String(session)}-h`,
        sender: 'human',
        text: dictation,
        created_at: at,
      });
      messages.push({
        uuid: `synth-${String(index)}-${String(session)}-a`,
        sender: 'assistant',
        text: Object.entries(note)
          .map(([section, body]) => `## ${section}\n\n${body}`)
          .join('\n\n'),
        created_at: new Date(Date.parse(at) + 90_000).toISOString(),
      });
    }
    exportConversations.push({
      uuid: `synth-conv-${String(index)}`,
      name: `Synthetic patient ${String(index)} — session notes`,
      created_at: '2026-03-02T18:00:00Z',
      updated_at: '2026-03-30T18:00:00Z',
      chat_messages: messages,
    });
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(exportConversations, null, 2)}\n`, 'utf8');
  process.stdout.write(
    `wrote ${String(exportConversations.length)} synthetic conversations × ${String(sessions)} sessions to ${out}\n`,
  );
}

main();
