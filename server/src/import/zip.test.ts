import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import { readZip, ZipFormatError } from './zip.js';

/**
 * The fixture zip was written by Python's `zipfile` (DEFLATE), so the reader
 * is checked against an independent implementation rather than its own
 * idea of the format.
 */
const FIXTURE = join(import.meta.dirname, '..', '..', '..', 'e2e', 'fixtures', 'claude-export');

describe('readZip', () => {
  it('lists and inflates the entries of a real zip', () => {
    const entries = readZip(readFileSync(join(FIXTURE, 'sample-export.zip')));

    expect(entries.map((entry) => entry.name).sort()).toEqual([
      'conversations.json',
      'projects.json',
      'users.json',
    ]);
    const conversations = entries.find((entry) => entry.name === 'conversations.json');
    expect(conversations).toBeDefined();
    const inflated = conversations?.read().toString('utf8') ?? '';
    // As data, not bytes: the zip was written before prettier formatted the JSON.
    expect(JSON.parse(inflated)).toEqual(
      JSON.parse(readFileSync(join(FIXTURE, 'conversations.json'), 'utf8')),
    );
    expect(JSON.parse(inflated)).toHaveLength(5);
  });

  it('reads stored and deflated entries from an archive it builds itself', () => {
    const archive = buildZip([
      { name: 'a.txt', data: Buffer.from('hello'), deflate: false },
      { name: 'dir/b.json', data: Buffer.from(JSON.stringify({ ok: true })), deflate: true },
    ]);

    const entries = readZip(archive);
    expect(entries.map((entry) => [entry.name, entry.read().toString('utf8')])).toEqual([
      ['a.txt', 'hello'],
      ['dir/b.json', '{"ok":true}'],
    ]);
  });

  it('refuses what is not a zip, in words', () => {
    expect(() => readZip(Buffer.from('{"conversations": []}'))).toThrow(ZipFormatError);
    expect(() => readZip(Buffer.alloc(0))).toThrow('not a zip file');
  });

  it('refuses a truncated archive rather than reading past its end', () => {
    const archive = buildZip([{ name: 'a.txt', data: Buffer.from('hello world'), deflate: true }]);
    // Keep the directory, lose the data: the directory says where the entry
    // is, and it is not there.
    const broken = Buffer.concat([Buffer.alloc(4), archive.subarray(4)]);
    expect(() => readZip(broken)[0]?.read()).toThrow(ZipFormatError);
  });
});

/** A minimal writer, for the round trip only — the product never writes a zip. */
function buildZip(files: { name: string; data: Buffer; deflate: boolean }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name, 'utf8');
    const body = file.deflate ? deflateRawSync(file.data) : file.data;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(file.deflate ? 8 : 0, 8);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(file.deflate ? 8 : 0, 10);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const directory = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, directory, end]);
}
