import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * `npm run probe:claude` is the one thing in this repository meant to run on
 * her real export, and its whole promise is that it prints shape and nothing
 * else. This runs it on the fabricated fixtures and checks that no title, no
 * message text, no attachment name or content, and no account detail from
 * them reaches the output — while the statistics it exists for do.
 */
const ROOT = join(import.meta.dirname, '..', '..', '..');
const FIXTURE = join(ROOT, 'e2e', 'fixtures', 'claude-export');

interface Message {
  text?: string;
  attachments?: { file_name?: string; extracted_content?: string }[];
  files?: { file_name?: string }[];
}
interface Conversation {
  name?: string;
  chat_messages?: Message[];
}

function secrets(): string[] {
  const found = new Set<string>(['John', 'Smith', 'Maria', 'Emily', 'Ana', 'Torres', 'Jane', 'Doe']);
  for (const file of ['conversations.json', 'patient-chats.json']) {
    const conversations = JSON.parse(readFileSync(join(FIXTURE, file), 'utf8')) as Conversation[];
    for (const conversation of conversations) {
      if (conversation.name) found.add(conversation.name);
      for (const message of conversation.chat_messages ?? []) {
        // A stretch of each message long enough to be its text rather than a common word.
        const text = message.text?.trim() ?? '';
        if (text.length > 0) found.add(text.slice(0, Math.min(24, text.length)));
        for (const attachment of message.attachments ?? []) {
          if (attachment.file_name) found.add(attachment.file_name);
          if (attachment.extracted_content) found.add(attachment.extracted_content.slice(0, 24));
        }
        for (const extra of message.files ?? []) if (extra.file_name) found.add(extra.file_name);
      }
    }
  }
  const users = JSON.parse(readFileSync(join(FIXTURE, 'users.json'), 'utf8')) as {
    full_name: string;
    email_address: string;
  }[];
  for (const user of users) {
    found.add(user.full_name);
    found.add(user.email_address);
  }
  return [...found];
}

describe('probe-claude-export', () => {
  const output = execFileSync(process.execPath, [join(ROOT, 'scripts', 'probe-claude-export.mjs'), FIXTURE], {
    encoding: 'utf8',
  });

  it('prints no title, text, name, file name or account detail', () => {
    const leaked = secrets().filter((secret) => output.includes(secret));
    expect(leaked).toEqual([]);
  });

  it('reports the per-conversation shape the import depends on', () => {
    expect(output).toContain('messages per conversation:');
    expect(output).toMatch(/# 1 {6}9 msgs +706 chars {2}2026-05-12 → 2026-07-14 {2}3 sessions/);
    expect(output).toContain('messages with attachments: 1 (1 attachments)');
    expect(output).toContain('attachments with non-empty extracted_content: 1');
    expect(output).toContain('messages with files: 0 (0 files)');
    expect(output).toContain('branch points (parent is not the previous message): 1 across 1 conversations');
    expect(output).toContain('active since 2026-07-01: 6 conversations, 5 of them with 2+ sessions');
  });
});
