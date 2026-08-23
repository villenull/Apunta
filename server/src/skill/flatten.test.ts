import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { zipSync, strToU8 } from 'fflate';
import { describe, expect, it } from 'vitest';

import { ExtractError } from '../extract/index.js';
import { flattenSkill } from './flatten.js';
import { readSkillMarkdown } from './zip.js';

const SKILL_DIR = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'skill');
const SKILL_MD = readFileSync(join(SKILL_DIR, 'SKILL.md'), 'utf8');

describe('flattenSkill — the fixture skill', () => {
  const result = flattenSkill(SKILL_MD);

  it('strips the YAML frontmatter', () => {
    expect(result.removed.frontmatter).toBe(true);
    expect(result.instructions).not.toContain('allowed-tools');
    expect(result.instructions).not.toContain('willow-creek-progress-note');
    expect(result.instructions.startsWith('# Willow Creek progress note')).toBe(true);
  });

  it('drops command code blocks', () => {
    expect(result.removed.commandBlocks).toBe(1);
    expect(result.instructions).not.toContain('python scripts/lint_note.py');
  });

  it('drops lines that tell the model to read a file or run a script', () => {
    expect(result.removed.toolLines).toBeGreaterThanOrEqual(2);
    expect(result.instructions).not.toContain('Read `references/FORMS.md` before you start');
    expect(result.instructions).not.toContain('Run `scripts/lint_note.py`');
  });

  it('drops Claude-specific mechanics', () => {
    expect(result.removed.mechanics).toBeGreaterThanOrEqual(3);
    expect(result.instructions).not.toContain('<thinking>');
    expect(result.instructions).not.toContain('<output_format>');
  });

  it('drops a heading whose whole body was removed', () => {
    // "## Running the checker" had nothing but a tool line and a bash block;
    // "## Formatting" had nothing but a bare tag pair.
    expect(result.removed.emptiedHeadings).toBe(2);
    expect(result.instructions).not.toContain('Running the checker');
    expect(result.instructions).not.toContain('## Formatting');
  });

  it('warns about referenced files instead of inlining them', () => {
    // Choosing which part of a reference file is "the needed content" is a
    // judgement call, and a wrong inline blows the token budget. So: warn.
    expect(result.referencedFiles).toEqual(['references/FORMS.md', 'references/TERMS.md']);
    expect(result.instructions).not.toContain('Fabricated support file');
  });

  it('keeps a line that mentions a reference but also states a rule', () => {
    expect(result.instructions).toContain('Use "client", not "patient"');
    expect(result.instructions).toContain("The clinic's intake vocabulary is listed in");
  });

  it('keeps the instruction body — sections, style, terminology, examples', () => {
    expect(result.instructions).toContain('**Subjective** — what the client reported');
    expect(result.instructions).toContain('leave this section empty rather than inferring one');
    expect(result.instructions).toContain('never remove a\nqualifier');
    expect(result.instructions).toContain('## Example');
    expect(result.instructions).toContain('John Smith reports sleeping better');
  });

  it('never runs more than two blank lines together', () => {
    expect(result.instructions).not.toMatch(/\n{3}/);
  });
});

describe('flattenSkill — rules in isolation', () => {
  it('only treats a leading --- as frontmatter', () => {
    const body = 'Keep this.\n\n---\n\nAnd this.\n';
    const result = flattenSkill(body);
    expect(result.removed.frontmatter).toBe(false);
    expect(result.instructions).toContain('And this.');
  });

  it('leaves an unterminated frontmatter fence alone rather than eating the file', () => {
    const result = flattenSkill('---\nname: x\n\nThe whole body follows and never closes.\n');
    expect(result.removed.frontmatter).toBe(false);
    expect(result.instructions).toContain('The whole body follows');
  });

  it('keeps a prose or json code block', () => {
    const result = flattenSkill('```json\n{"Subjective": ""}\n```\n');
    expect(result.removed.commandBlocks).toBe(0);
    expect(result.instructions).toContain('{"Subjective": ""}');
  });

  it('keeps a heading that still has a body', () => {
    const result = flattenSkill('## Style\n\nPast tense.\n');
    expect(result.removed.emptiedHeadings).toBe(0);
    expect(result.instructions).toContain('## Style');
  });

  it('reports no reference files when the skill is a pure style guide', () => {
    const result = flattenSkill('Write in past tense. Keep her hedging.\n');
    expect(result.referencedFiles).toEqual([]);
    expect(result.removed).toEqual({
      frontmatter: false,
      commandBlocks: 0,
      toolLines: 0,
      mechanics: 0,
      emptiedHeadings: 0,
    });
  });
});

describe('readSkillMarkdown', () => {
  it('reads a bare SKILL.md', () => {
    expect(readSkillMarkdown(Buffer.from(SKILL_MD))).toBe(SKILL_MD);
  });

  it('finds SKILL.md inside a zip of the skill folder', () => {
    const zipped = zipSync({
      'willow-creek/SKILL.md': strToU8(SKILL_MD),
      'willow-creek/references/FORMS.md': strToU8('# Forms\n'),
      'willow-creek/scripts/lint_note.py': strToU8('print("x")\n'),
    });
    expect(readSkillMarkdown(Buffer.from(zipped))).toBe(SKILL_MD);
  });

  it('prefers the shallowest SKILL.md when a zip bundles more than one', () => {
    const zipped = zipSync({
      'SKILL.md': strToU8('# Top level\n'),
      'nested/deeper/SKILL.md': strToU8('# Nested\n'),
    });
    expect(readSkillMarkdown(Buffer.from(zipped))).toBe('# Top level\n');
  });

  it('says what it expected when a zip has no SKILL.md', () => {
    const zipped = zipSync({ 'notes/README.md': strToU8('# nope\n') });
    expect(() => readSkillMarkdown(Buffer.from(zipped))).toThrow(ExtractError);
    expect(() => readSkillMarkdown(Buffer.from(zipped))).toThrow(/SKILL\.md/);
  });

  it('refuses a file over the size ceiling', () => {
    expect(() => readSkillMarkdown(Buffer.alloc(512 * 1024 + 1))).toThrow(/512 KB/);
  });
});
