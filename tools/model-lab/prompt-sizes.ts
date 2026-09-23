/**
 * How big the prompts actually are, for both corpora.
 *
 * `num_ctx` is 16,384 in production; this prints what the prompts actually
 * occupy, split into the system prompt (identical across fixtures of the same
 * format, which is what makes the prompt cache reusable) and the user message
 * (the material that changes every draft).
 *
 *   tsx tools/model-lab/prompt-sizes.ts
 */
import { approximateTokens } from '@apunta/shared';

import { buildGeneratePrompt } from '../../server/src/ai/prompts.js';
import { draftSourceFor, loadCorpus } from '../../server/src/eval/corpus.js';
import { formatNameFor, instructionsFor } from '../../server/src/eval/run.js';

const corpora = ['e2e/fixtures/eval', 'e2e/fixtures/eval-owner'];

for (const corpus of corpora) {
  const fixtures = loadCorpus(corpus);
  const rows = fixtures.map((fixture) => {
    const prompt = buildGeneratePrompt({
      instructions: instructionsFor(fixture),
      sections: fixture.sections,
      formatName: formatNameFor(fixture),
      ...draftSourceFor(fixture),
    });
    return {
      fixture: fixture.filename,
      format: fixture.format,
      system: approximateTokens(prompt.system),
      user: approximateTokens(prompt.user),
      total: approximateTokens(prompt.system) + approximateTokens(prompt.user),
    };
  });
  const totals = rows.map((row) => row.total).sort((a, b) => a - b);
  const systems = [...new Set(rows.map((row) => `${String(row.format)}:${String(row.system)}`))];
  console.log(`\n## ${corpus} (${String(rows.length)} fixtures)`);
  for (const row of [...rows].sort((a, b) => b.total - a.total)) {
    console.log(
      `  ${row.fixture.padEnd(34)} system ${String(row.system).padStart(5)}  user ${String(row.user).padStart(5)}  total ${String(row.total).padStart(5)}`,
    );
  }
  console.log(
    `  min ${String(totals[0])} · median ${String(totals[Math.floor(totals.length / 2)])} · max ${String(totals[totals.length - 1])}`,
  );
  console.log(`  distinct system prompts: ${systems.join(', ')}`);
}
