#!/usr/bin/env node
/**
 * Report the *shape* of a Claude data export, and none of its content.
 *
 *   node scripts/probe-claude-export.mjs ~/Downloads/data-export.zip
 *   node scripts/probe-claude-export.mjs ~/Downloads/export-folder
 *
 * Why this exists before the importer does (`docs/agents/M11-claude-import.md`):
 * nothing in this repository has ever seen a real Claude export, so the
 * importer's schema is a guess. This turns the guess into a fact first.
 *
 * **It prints no message text, no titles and no names.** Field names, counts,
 * roles and dates only — the per-conversation statistics identify a
 * conversation by its rank, never its title. `server/src/import/probe.test.ts`
 * runs it on the fixtures and asserts that none of their text, titles,
 * names or file names reaches the output. That restraint is not politeness: the archive holds
 * everything its owner has ever discussed with Claude, most of which is
 * nobody's business and some of which is other people's health information.
 * A probe that echoed content would be the first thing in this project to
 * leak it, and it would do so into a terminal scrollback.
 *
 * Offline by construction — it opens a local path and nothing else.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { extname, join } from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('usage: node scripts/probe-claude-export.mjs <export.zip | export-folder>');
  process.exit(2);
}
if (!existsSync(target)) {
  console.error(`No such file or folder: ${target}`);
  process.exit(2);
}

/** Unzip to a scratch directory we delete, or read a folder where it lies. */
function openExport(path) {
  if (statSync(path).isDirectory()) return { root: path, cleanup: () => {} };
  const work = mkdtempSync(join(tmpdir(), 'claude-export-probe-'));
  try {
    // unzip writes a wall of ASCII about multi-part archives to stderr, which
    // execFileSync passes straight through. Capture it and say the one useful
    // thing instead.
    execFileSync('unzip', ['-o', '-q', path, '-d', work], { stdio: ['ignore', 'ignore', 'pipe'] });
  } catch (error) {
    rmSync(work, { recursive: true, force: true });
    console.error(
      error?.code === 'ENOENT'
        ? 'This needs the `unzip` command, which is not installed here. Unpack the export yourself and pass the folder instead.'
        : 'Could not unzip that file. If it is already unpacked, pass the folder instead.',
    );
    process.exit(2);
  }
  return { root: work, cleanup: () => rmSync(work, { recursive: true, force: true }) };
}

function walk(dir, depth = 0) {
  const found = [];
  if (depth > 4) return found;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) found.push(...walk(path, depth + 1));
    else found.push({ name: entry.name, path, bytes: statSync(path).size });
  }
  return found;
}

/** Every key that appears anywhere in a sample of objects, with how often. */
function keyTally(items, limit = 400) {
  const tally = new Map();
  for (const item of items.slice(0, limit)) {
    if (item === null || typeof item !== 'object') continue;
    for (const key of Object.keys(item)) tally.set(key, (tally.get(key) ?? 0) + 1);
  }
  return [...tally.entries()].sort((a, b) => b[1] - a[1]);
}

function describeDates(values) {
  const stamps = values.filter((v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))).sort();
  if (stamps.length === 0) return 'none parsed';
  return `${stamps[0].slice(0, 10)} → ${stamps[stamps.length - 1].slice(0, 10)}`;
}

/** The importer's session gap and default cutoff (server/src/import/claude.ts, shared/src/import.ts). */
const SESSION_GAP_MS = 6 * 60 * 60 * 1000;
const DEFAULT_CUTOFF = '2026-07-01';
const MESSAGE_BUCKETS = [
  [1, 1],
  [2, 5],
  [6, 10],
  [11, 25],
  [26, 50],
  [51, 100],
  [101, 200],
  [201, Infinity],
];

function bucketLabel([low, high]) {
  if (high === Infinity) return `${String(low)}+`;
  return low === high ? String(low) : `${String(low)}–${String(high)}`;
}

function tallyBuckets(counts, buckets) {
  return buckets.map((bucket) => ({
    label: bucketLabel(bucket),
    count: counts.filter((n) => n >= bucket[0] && n <= bucket[1]).length,
  }));
}

function textLength(message) {
  if (typeof message?.text === 'string') return message.text.length;
  if (Array.isArray(message?.content)) {
    return message.content.reduce(
      (sum, block) => sum + (typeof block?.text === 'string' ? block.text.length : 0),
      0,
    );
  }
  return 0;
}

function day(iso) {
  return typeof iso === 'string' && !Number.isNaN(Date.parse(iso))
    ? new Date(iso).toISOString().slice(0, 10)
    : '?';
}

/**
 * Per-conversation shape: how long conversations are, which are the biggest
 * (by rank, count, size and dates — never a title), how attachments are
 * used, where the message array branches, and how the importer's session
 * gap and default cutoff would cut it. Numbers and dates only.
 */
function describeConversations(conversations) {
  const rows = conversations.map((conversation) => {
    const messages = conversation.chat_messages ?? conversation.messages;
    const stamps = messages
      .map((m) => m?.created_at)
      .filter((v) => typeof v === 'string' && !Number.isNaN(Date.parse(v)))
      .sort();
    let sessions = stamps.length > 0 ? 1 : 0;
    for (let i = 1; i < stamps.length; i += 1) {
      if (Date.parse(stamps[i]) - Date.parse(stamps[i - 1]) > SESSION_GAP_MS) sessions += 1;
    }
    let branchPoints = 0;
    for (let i = 1; i < messages.length; i += 1) {
      const parent = messages[i]?.parent_message_uuid;
      if (typeof parent === 'string' && parent !== messages[i - 1]?.uuid) branchPoints += 1;
    }
    return {
      messages: messages.length,
      chars: messages.reduce((sum, m) => sum + textLength(m), 0),
      first: stamps[0] ?? null,
      last: stamps.at(-1) ?? null,
      sessions,
      branchPoints,
      list: messages,
    };
  });

  console.log('  messages per conversation:');
  for (const { label, count } of tallyBuckets(
    rows.map((r) => r.messages),
    MESSAGE_BUCKETS,
  )) {
    console.log(`    ${label.padStart(8)}: ${String(count)}`);
  }

  console.log('  top 30 conversations by message count (rank, messages, characters, first → last):');
  const top = [...rows].sort((a, b) => b.messages - a.messages).slice(0, 30);
  top.forEach((row, index) => {
    console.log(
      `    #${String(index + 1).padStart(2)}  ${String(row.messages).padStart(5)} msgs  ${String(row.chars).padStart(9)} chars  ${day(row.first)} → ${day(row.last)}  ${String(row.sessions)} sessions`,
    );
  });

  const all = rows.flatMap((r) => r.list);
  const withAttachments = all.filter((m) => Array.isArray(m?.attachments) && m.attachments.length > 0);
  const attachments = withAttachments.flatMap((m) => m.attachments);
  const extracted = attachments.filter(
    (a) => typeof a?.extracted_content === 'string' && a.extracted_content.trim() !== '',
  );
  const withFiles = all.filter((m) => Array.isArray(m?.files) && m.files.length > 0);
  console.log('  attachments:');
  console.log(
    `    messages with attachments: ${String(withAttachments.length)} (${String(attachments.length)} attachments)`,
  );
  console.log(`    attachments with non-empty extracted_content: ${String(extracted.length)}`);
  console.log(
    `    messages with files: ${String(withFiles.length)} (${String(withFiles.reduce((n, m) => n + m.files.length, 0))} files)`,
  );

  const branched = rows.filter((r) => r.branchPoints > 0);
  console.log(
    `  branch points (parent is not the previous message): ${String(rows.reduce((n, r) => n + r.branchPoints, 0))} across ${String(branched.length)} conversations`,
  );

  console.log(`  sessions at a ${String(SESSION_GAP_MS / 3_600_000)}-hour gap, per conversation:`);
  for (const { label, count } of tallyBuckets(
    rows.map((r) => r.sessions),
    [
      [0, 0],
      [1, 1],
      [2, 5],
      [6, 20],
      [21, Infinity],
    ],
  )) {
    console.log(`    ${label.padStart(8)}: ${String(count)}`);
  }
  const active = rows.filter((r) => r.last !== null && day(r.last) >= DEFAULT_CUTOFF);
  console.log(
    `  active since ${DEFAULT_CUTOFF}: ${String(active.length)} conversations, ${String(active.filter((r) => r.sessions >= 2).length)} of them with 2+ sessions`,
  );
}

const { root, cleanup } = openExport(target);
try {
  const files = walk(root);
  console.log('--- files in the archive ---');
  for (const file of files.sort((a, b) => b.bytes - a.bytes).slice(0, 20)) {
    console.log(`  ${(file.bytes / 1024).toFixed(0).padStart(8)} KB  ${file.name}`);
  }
  if (files.length > 20) console.log(`  … and ${String(files.length - 20)} more`);

  const jsonFiles = files.filter((f) => extname(f.name) === '.json');
  if (jsonFiles.length === 0) {
    console.log('\nNo .json files found — the export format is not what M11 assumed.');
    process.exit(0);
  }

  for (const file of jsonFiles) {
    let parsed;
    try {
      parsed = JSON.parse(readFileSync(file.path, 'utf8'));
    } catch {
      console.log(`\n--- ${file.name} ---\n  not valid JSON`);
      continue;
    }
    console.log(`\n--- ${file.name} ---`);
    const items = Array.isArray(parsed) ? parsed : [parsed];
    console.log(`  ${Array.isArray(parsed) ? 'array' : 'object'}, ${String(items.length)} top-level item(s)`);
    console.log('  keys seen (key × how many items have it):');
    for (const [key, count] of keyTally(items)) console.log(`    ${key} × ${String(count)}`);

    // The nested message arrays are the thing the importer actually reads.
    for (const arrayKey of ['chat_messages', 'messages', 'turns']) {
      const nested = items.flatMap((item) => (Array.isArray(item?.[arrayKey]) ? item[arrayKey] : []));
      if (nested.length === 0) continue;
      console.log(`  ${arrayKey}: ${String(nested.length)} across ${String(items.length)} item(s)`);
      console.log('    keys:');
      for (const [key, count] of keyTally(nested, 2000)) console.log(`      ${key} × ${String(count)}`);
      const roles = new Map();
      for (const message of nested.slice(0, 5000)) {
        for (const field of ['sender', 'role', 'author']) {
          const value = message?.[field];
          if (typeof value === 'string')
            roles.set(`${field}=${value}`, (roles.get(`${field}=${value}`) ?? 0) + 1);
        }
      }
      if (roles.size > 0) {
        console.log('    roles:');
        for (const [role, count] of [...roles].sort((a, b) => b[1] - a[1])) {
          console.log(`      ${role} × ${String(count)}`);
        }
      }
      const lengths = nested
        .map((m) => (typeof m?.text === 'string' ? m.text.length : null))
        .filter((n) => n !== null)
        .sort((a, b) => a - b);
      if (lengths.length > 0) {
        const median = lengths[Math.floor(lengths.length / 2)];
        console.log(
          `    text length: median ${String(median)}, longest ${String(lengths[lengths.length - 1])} chars`,
        );
      }
    }

    const conversations = items.filter((item) => Array.isArray(item?.chat_messages ?? item?.messages));
    if (conversations.length > 0) describeConversations(conversations);

    for (const dateKey of ['created_at', 'updated_at']) {
      const values = items.map((item) => item?.[dateKey]).filter(Boolean);
      if (values.length > 0) console.log(`  ${dateKey}: ${describeDates(values)}`);
    }
  }

  console.log('\nNo message text, title or name was printed, by design.');
  console.log('Next: docs/import-existing-notes.md, step 2.');
} finally {
  cleanup();
}
