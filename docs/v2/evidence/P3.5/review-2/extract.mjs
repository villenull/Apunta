/**
 * Shared extraction helper for the P3.5 attempt-2 review (review-2).
 *
 * Extracts the *shipped* function bodies out of `scripts/v2/tauri-audio.test.mjs`
 * by brace matching, and refuses to run unless each extracted body is a verbatim
 * substring of the file it came from. Nothing is copied and nothing is retyped:
 * the code under test is the candidate's own text.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const SOURCE = resolve(
  process.env['REVIEW_SOURCE'] ?? 'scripts/v2/tauri-audio.test.mjs',
);

export const sourceText = readFileSync(SOURCE, 'utf8');

/** The candidate's own constants, taken from the file rather than hardcoded. */
export function constantsFrom(text) {
  const read = (name) => {
    const match = new RegExp(`^const ${name} = '([^']*)';$`, 'm').exec(text);
    if (match === null) throw new Error(`constant ${name} not found in ${SOURCE}`);
    return match[1];
  };
  const readNumber = (name) => {
    const match = new RegExp(`^const ${name} = ([\\d_]+);$`, 'm').exec(text);
    if (match === null) throw new Error(`constant ${name} not found in ${SOURCE}`);
    return Number(match[1].replace(/_/g, ''));
  };
  return {
    SOURCE_NAME: read('SOURCE_NAME'),
    REAL_MIC_PREFIX: read('REAL_MIC_PREFIX'),
    MARKER_PATH: read('MARKER_PATH'),
    OBSERVE_PATH: read('OBSERVE_PATH'),
    MAX_TEXT_LEAF: readNumber('MAX_TEXT_LEAF'),
  };
}

/** One top-level `function NAME(...) { … }`, brace matched, comment-aware. */
export function extractFunction(name, text = sourceText) {
  const candidates = [`\nasync function ${name}(`, `\nfunction ${name}(`];
  const starts = candidates.map((needle) => text.indexOf(needle)).filter((at) => at >= 0);
  if (starts.length === 0) throw new Error(`function ${name} not found in ${SOURCE}`);
  const start = Math.min(...starts);
  const open = text.indexOf('{', text.indexOf(')', start));
  let depth = 0;
  let index = open;
  for (; index < text.length; index += 1) {
    const char = text[index];
    if (char === '/' && text[index + 1] === '/') {
      while (index < text.length && text[index] !== '\n') index += 1;
      continue;
    }
    if (char === '/' && text[index + 1] === '*') {
      index = text.indexOf('*/', index) + 1;
      continue;
    }
    if (char === "'" || char === '"' || char === '`') {
      const quote = char;
      index += 1;
      while (index < text.length && text[index] !== quote) {
        if (text[index] === '\\') index += 1;
        index += 1;
      }
      continue;
    }
    if (char === '{') depth += 1;
    if (char === '}') {
      depth -= 1;
      if (depth === 0) break;
    }
  }
  const body = text.slice(start + 1, index + 1);
  if (!text.includes(body)) throw new Error(`extracted ${name} is not verbatim in ${SOURCE}`);
  return body;
}

/** Evaluate shipped functions against the candidate's own constants. */
export function loadFunctions(names) {
  const constants = constantsFrom(sourceText);
  const parts = names.map((name) => extractFunction(name));
  const factory = new Function(
    'results',
    'SOURCE_NAME',
    'REAL_MIC_PREFIX',
    'MARKER_PATH',
    'OBSERVE_PATH',
    'MAX_TEXT_LEAF',
    `${parts.join('\n\n')}\nreturn { ${names.join(', ')} };`,
  );
  return {
    ...factory(
      [],
      constants.SOURCE_NAME,
      constants.REAL_MIC_PREFIX,
      constants.MARKER_PATH,
      constants.OBSERVE_PATH,
      constants.MAX_TEXT_LEAF,
    ),
    constants,
  };
}

let checks = 0;
let failures = 0;

/** Records one check. Writes with process.stdout.write, never console (repo lint). */
export function report(name, ok, detail = '') {
  checks += 1;
  if (!ok) failures += 1;
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${detail === '' ? '' : `: ${detail}`}\n`);
}

export function summary(label) {
  process.stdout.write(`${label}: ${String(checks - failures)}/${String(checks)} passed\n`);
  return failures;
}

/** Run `fn`, returning the thrown error or null. */
export function thrown(fn) {
  try {
    fn();
    return null;
  } catch (error) {
    return error;
  }
}