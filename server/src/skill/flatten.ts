import type { SkillFlattenCounts } from '@apunta/shared';

/**
 * The mechanical half of `docs/skill-porting.md`.
 *
 * The recipe there has seven steps. Three of them are line-level rewrites a
 * machine can do — strip the YAML frontmatter (step 1), delete file and tool
 * references (step 3, the *reference* half), drop Claude-specific mechanics
 * (step 4) — and those are what this file does. The rest are judgement and
 * stay judgement: inlining the content of a referenced file, writing few-shot
 * pairs, and cutting to the token budget.
 *
 * **Every rule here will over-delete on some real skill.** That is why the
 * result lands in a textarea for review with a count beside each rule rather
 * than being saved: "11 tool lines dropped" is something the owner can check,
 * and a silent rewrite is not. Nothing in this file writes anything.
 */

/** rule 3 — a relative path into a skill's support folders. */
const PATH_REF = /(?:^|[\s("'`[])(?:\.\/)?(references|scripts|assets|resources)\/[\w.\-/]+/gi;

/** rule 4 — an imperative line about a file, script, tool or command. */
const TOOL_LINE =
  /^\s*(?:[-*]|\d+\.)?\s*(?:read|open|load|run|execute|invoke|call|consult|see|refer to|check)\b.*\b(?:file|script|tool|command|references?|directory|folder)\b/i;

/** rule 5 — a line that is nothing but an XML-ish tag. */
const BARE_TAG = /^\s*<\/?[a-z_][\w-]*\s*\/?>\s*$/i;

/** rule 5 — Claude-specific mechanics named inline. */
const MECHANICS =
  /<thinking>|extended thinking|allowed-tools|\bBash tool\b|\bRead tool\b|\bWrite tool\b|tool_use|\bSkill\(/i;

/** rule 2 — a fenced block whose info string says it is a command, not prose. */
const COMMAND_LANGS = new Set([
  'bash',
  'sh',
  'zsh',
  'shell',
  'console',
  'bat',
  'cmd',
  'powershell',
  'python',
  'py',
]);

const FENCE = /^\s*(?:```+|~~~+)\s*([\w+-]*)/;
const HEADING = /^\s*(#{1,6})\s+\S/;

export interface FlattenedSkill {
  readonly instructions: string;
  readonly removed: SkillFlattenCounts;
  /** Distinct `references/…` paths the body mentioned. Warned about, never inlined. */
  readonly referencedFiles: readonly string[];
}

/** Rule 1: a `---` fence only counts as frontmatter when the file opens with it. */
function stripFrontmatter(lines: readonly string[]): { lines: string[]; stripped: boolean } {
  if (lines[0]?.trim() !== '---') return { lines: [...lines], stripped: false };
  // Bounded, so a document whose body happens to contain a thematic break
  // cannot swallow the whole skill.
  const limit = Math.min(lines.length, 100);
  for (let index = 1; index < limit; index += 1) {
    const line = lines[index]?.trim();
    if (line === '---' || line === '...') return { lines: lines.slice(index + 1), stripped: true };
  }
  return { lines: [...lines], stripped: false };
}

/** How many lines under a heading survived, so an emptied heading can go too. */
interface Kept {
  readonly text: string;
  readonly headingLevel: number | null;
}

export function flattenSkill(markdown: string): FlattenedSkill {
  const source = markdown.replace(/\r\n?/g, '\n').split('\n');
  const { lines, stripped } = stripFrontmatter(source);

  const referenced = new Set<string>();
  let commandBlocks = 0;
  let toolLines = 0;
  let mechanics = 0;

  const kept: Kept[] = [];
  let fence: { marker: string; drop: boolean } | null = null;

  for (const line of lines) {
    const fenceMatch = FENCE.exec(line);

    if (fence !== null) {
      // Inside a block: only a fence of the same family closes it.
      if (fenceMatch !== null && line.trim().startsWith(fence.marker)) {
        if (fence.drop) commandBlocks += 1;
        else kept.push({ text: line, headingLevel: null });
        fence = null;
        continue;
      }
      if (!fence.drop) kept.push({ text: line, headingLevel: null });
      continue;
    }

    if (fenceMatch !== null) {
      const marker = line.trim().startsWith('~') ? '~~~' : '```';
      const drop = COMMAND_LANGS.has((fenceMatch[1] ?? '').toLowerCase());
      fence = { marker, drop };
      if (!drop) kept.push({ text: line, headingLevel: null });
      continue;
    }

    // Rule 3: note every support-folder path, whatever happens to the line.
    let sawPath = false;
    for (const match of line.matchAll(PATH_REF)) {
      sawPath = true;
      const path = match[0].replace(/^[\s("'`[]+/, '');
      if (match[1]?.toLowerCase() === 'references') referenced.add(path);
    }

    // Rule 5 before rule 4: a bare tag is mechanics, not an instruction.
    if (BARE_TAG.test(line) || MECHANICS.test(line)) {
      mechanics += 1;
      continue;
    }

    // Rule 4, and rule 3's delete half: a line whose whole job was to point at
    // a file. A line that merely *mentions* one is kept — it probably carries
    // content, and the reference warning below is what covers it.
    if (TOOL_LINE.test(line) || (sawPath && isBarePointer(line))) {
      toolLines += 1;
      continue;
    }

    const heading = HEADING.exec(line);
    kept.push({ text: line, headingLevel: heading === null ? null : (heading[1]?.length ?? null) });
  }

  const { lines: withoutEmptyHeadings, emptiedHeadings } = dropEmptiedHeadings(kept);

  return {
    instructions: normaliseBlankLines(withoutEmptyHeadings).trim(),
    removed: { frontmatter: stripped, commandBlocks, toolLines, mechanics, emptiedHeadings },
    referencedFiles: [...referenced].sort(),
  };
}

/**
 * A line that is a path and an instruction verb and nothing else — "See
 * `references/FORMS.md`." — as against one that also states a rule.
 */
function isBarePointer(line: string): boolean {
  const withoutPaths = line.replace(PATH_REF, ' ');
  const words = withoutPaths
    .replace(/[^\w\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return words.length <= 4;
}

/** Rule 6: a heading whose entire body was removed by rules 1–5 goes too. */
function dropEmptiedHeadings(kept: readonly Kept[]): { lines: string[]; emptiedHeadings: number } {
  const survives = new Array<boolean>(kept.length).fill(true);
  let emptiedHeadings = 0;

  for (let index = kept.length - 1; index >= 0; index -= 1) {
    const level = kept[index]?.headingLevel;
    if (level === null || level === undefined) continue;

    let hasBody = false;
    for (let scan = index + 1; scan < kept.length; scan += 1) {
      const next = kept[scan];
      if (next === undefined) break;
      if (next.headingLevel !== null && next.headingLevel <= level) break;
      if (!survives[scan]) continue;
      if (next.headingLevel !== null) {
        hasBody = true;
        break;
      }
      if (next.text.trim() !== '') {
        hasBody = true;
        break;
      }
    }
    if (!hasBody) {
      survives[index] = false;
      emptiedHeadings += 1;
    }
  }

  return {
    lines: kept.filter((_, index) => survives[index]).map((line) => line.text),
    emptiedHeadings,
  };
}

/** Rule 8: three or more blank lines become two; nothing else moves. */
function normaliseBlankLines(lines: readonly string[]): string {
  return lines.join('\n').replace(/\n{3,}/g, '\n\n');
}
