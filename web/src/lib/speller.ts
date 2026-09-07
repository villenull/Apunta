import nspell from 'nspell';

import type { Speller } from './spelling.js';

/**
 * The dictionary, loaded once per tab from the app's own origin.
 *
 * Australian English — the practice's spelling ("behaviour", "counselling") —
 * as a Hunspell pair bundled with the app: two files fetched from
 * `127.0.0.1` like any other asset, never from anywhere else, and read by
 * `nspell` entirely in the tab. Nothing typed leaves the machine to be
 * checked, which is the whole reason this exists (`shared/src/spelling.ts`).
 *
 * The files are addressed relative to this module so that the bundler copies
 * them into the build; the dictionary package itself only exports a Node
 * reader.
 */
const AFF_URL = new URL('../../../node_modules/dictionary-en-au/index.aff', import.meta.url).href;
const DIC_URL = new URL('../../../node_modules/dictionary-en-au/index.dic', import.meta.url).href;

let pending: Promise<Speller> | null = null;

export function loadSpeller(): Promise<Speller> {
  pending ??= (async () => {
    const [aff, dic] = await Promise.all([fetchText(AFF_URL), fetchText(DIC_URL)]);
    const dictionary = nspell(aff, dic);
    return {
      correct: (word) => dictionary.correct(word),
      suggest: (word) => dictionary.suggest(word),
    };
  })();
  return pending;
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`could not load the dictionary (${String(response.status)})`);
  return response.text();
}
