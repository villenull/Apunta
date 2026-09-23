#!/usr/bin/env node
/**
 * Build (input → target) training pairs from a Claude data export, with the
 * operator blind to the content.
 *
 * This is the consented path, and it is written so the *agent* that built it
 * never sees a word of what it reads. It prints counts and reasons, never
 * text: no pair, no sentence, no name, no excerpt. The only things that leave
 * the machine-readable dataset are the aggregate numbers on stdout.
 *
 * Shape of a pair, and why:
 *
 * - **input** — the therapist's own messages in one session, concatenated. That
 *   is what she gave, in the form she gave it: her account of the session.
 * - **target** — Claude's **last** reply in that session, via the M11
 *   importer's own parsing (`sessionBody(session, 'assistant')`). It is the
 *   note she worked with: the thing she kept, edited and filed.
 *
 * The prompt is assembled by production's own `buildGeneratePrompt`, against
 * her Progress-note sections, so what the adapter learns is the mapping the
 * app actually asks for — not a hand-written imitation of it.
 *
 * The filter is `reviewPair` (`grounding.ts`), which is the eval scorer's own
 * checks applied to a pair: a novel diagnosis, risk or medication term, a
 * gating conclusion marker, or a figure her message never gave drops the pair.
 * A target that invents is worse than no pair at all: it would be trained as
 * correct, and it is Claude's habits that get distilled along with its format.
 *
 * Usage (the flags are mandatory; see `guards.ts` for why):
 *
 *   npx tsx tools/model-lab/pipeline/build-pairs.ts \
 *     --export <path to export.zip or the folder containing conversations.json> \
 *     --out ~/.local/share/apunta/model-lab/datasets/pairs.jsonl \
 *     --i-have-consent
 */

import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

import { OWNER_PROGRESS_INSTRUCTIONS } from '../../../server/src/ai/default-instructions.js';
import { buildGeneratePrompt } from '../../../server/src/ai/prompts.js';
import {
  openExport,
  readConversations,
  sessionBody,
  splitSessions,
  type RawConversation,
} from '../../../server/src/import/claude.js';
import { reviewPair } from './grounding.js';
import {
  CONSENT_FLAG,
  requiredArg,
  requireConsent,
  requireInputOutsideRepo,
  requireOutputUnderLab,
} from './guards.js';

/** Her Progress note's sections, in her order. */
const OWNER_SECTIONS = [
  'Location',
  'Client presentation',
  'Risk review',
  'Discussion',
  'Intervention',
  'Out of session actions',
  'Note for next session',
];

/** A reply shorter than this is not a note; longer than the note budget is not a note either. */
const MIN_TARGET_CHARS = 120;
const MAX_TARGET_CHARS = 12_000;
const MIN_INPUT_CHARS = 40;

/** Deterministic held-out split, by a hash of the pair's own text — no RNG, so two runs agree. */
const HELD_OUT_PERCENT = 15;

function hash(text: string): number {
  let value = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/**
 * The export's conversations, read by the M11 importer itself: a zip with
 * `conversations.json` inside, or the folder holding it. `openExport` and
 * `readConversations` are the importer's own readers, so the live thread, the
 * branch abandonment and the message shape are decided by the code that ships
 * rather than by a second parser here.
 */
function readExport(path: string): readonly RawConversation[] {
  if (statSync(path).isDirectory()) {
    const file = join(path, 'conversations.json');
    return readConversations(JSON.parse(readFileSync(file, 'utf8')) as unknown).conversations;
  }
  return openExport(readFileSync(path), basename(path)).conversations;
}

function main(): void {
  const argv = process.argv.slice(2);
  requireConsent(argv, 'build-pairs');
  const exportPath = requireInputOutsideRepo(requiredArg(argv, '--export'));
  const outPath = requireOutputUnderLab(requiredArg(argv, '--out'));

  const conversations = readExport(exportPath);

  let sessions = 0;
  let pairs = 0;
  let heldOut = 0;
  const dropped: Record<string, number> = {};
  const drop = (reason: string): void => {
    dropped[reason] = (dropped[reason] ?? 0) + 1;
  };

  const lines: string[] = [];
  let inputChars = 0;
  let targetChars = 0;

  for (const conversation of conversations) {
    for (const session of splitSessions(conversation.turns)) {
      sessions += 1;
      const input = sessionBody(session, 'human');
      const target = sessionBody(session, 'assistant');
      if (input.length < MIN_INPUT_CHARS) {
        drop('input too short');
        continue;
      }
      if (target.length < MIN_TARGET_CHARS) {
        drop('target too short');
        continue;
      }
      if (target.length > MAX_TARGET_CHARS) {
        drop('target too long');
        continue;
      }
      const verdict = reviewPair(input, target);
      if (!verdict.keep) {
        for (const reason of verdict.reasons) drop(reason);
        continue;
      }

      const prompt = buildGeneratePrompt({
        instructions: OWNER_PROGRESS_INSTRUCTIONS,
        sections: OWNER_SECTIONS,
        formatName: 'Progress note',
        typedNotes: input,
      });
      // The split key is the prompt, so it is stable across runs and reveals nothing.
      const isHeldOut = hash(prompt.system + prompt.user) % 100 < HELD_OUT_PERCENT;
      pairs += 1;
      inputChars += input.length;
      targetChars += target.length;
      if (isHeldOut) heldOut += 1;
      lines.push(
        JSON.stringify({
          id: `real-${hash(target).toString(16)}`,
          split: isHeldOut ? 'heldout' : 'train',
          sections: OWNER_SECTIONS,
          // The raw input stays in the dataset (0600, lab directory) because the
          // held-out check has to ask whether the model's note added anything
          // her message did not carry; it is never printed.
          input,
          system: prompt.system,
          user: prompt.user,
          target,
        }),
      );
    }
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${lines.join('\n')}\n`, { encoding: 'utf8', mode: 0o600 });

  // Metrics only: no text, no name, no excerpt ever reaches stdout.
  process.stdout.write(
    [
      `export: ${exportPath.replace(process.env.HOME ?? '', '~')}`,
      `conversations: ${String(conversations.length)}`,
      `sessions: ${String(sessions)}`,
      `pairs kept: ${String(pairs)}`,
      `  train: ${String(pairs - heldOut)}`,
      `  held out: ${String(heldOut)}`,
      `dropped: ${JSON.stringify(dropped)}`,
      `mean input chars: ${pairs === 0 ? '0' : String(Math.round(inputChars / pairs))}`,
      `mean target chars: ${pairs === 0 ? '0' : String(Math.round(targetChars / pairs))}`,
      `dataset written (0600): ${outPath.replace(process.env.HOME ?? '', '~')}`,
      `consent flag: ${CONSENT_FLAG} (this run only)`,
      '',
    ].join('\n'),
  );
}

main();
