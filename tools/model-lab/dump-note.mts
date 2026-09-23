// Dump one generated note's sections, through the same generation path
// `npm run eval` uses (production prompt, production options, the same
// provider), so a hand audit reads the note the instrument scored.
//
//   npx tsx tools/model-lab/dump-note.mts --model M --corpus DIR --fixture SUBSTR [--url URL]
//
// Read-only with respect to the repository: nothing is written.

import { loadCorpus, draftSourceFor } from '../../server/src/eval/corpus.js';
import { instructionsFor, formatNameFor } from '../../server/src/eval/run.js';
import { OllamaProvider } from '../../server/src/ai/ollama.js';

const args = process.argv.slice(2);
function flag(name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i === -1 ? undefined : args[i + 1];
}

const model = flag('model');
const corpus = flag('corpus');
const fixtureFilter = flag('fixture');
const url = flag('url') ?? 'http://127.0.0.1:11438';
if (model === undefined || corpus === undefined || fixtureFilter === undefined) {
  throw new Error('--model, --corpus and --fixture are required');
}

const provider = new OllamaProvider({ baseUrl: url, resolveModel: () => model });
const fixtures = loadCorpus(corpus).filter((f) => f.filename.includes(fixtureFilter));

for (const fixture of fixtures) {
  const stream = provider.generateNote({
    instructions: instructionsFor(fixture),
    sections: fixture.sections,
    formatName: formatNameFor(fixture),
    ...draftSourceFor(fixture),
  });
  for await (const event of stream) {
    if (event.type === 'sections') {
      console.log(JSON.stringify({ fixture: fixture.filename, model, sections: event.sections }, null, 2));
    }
  }
}
