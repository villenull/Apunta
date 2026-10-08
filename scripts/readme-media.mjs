#!/usr/bin/env node
/**
 * Regenerates the README's screenshots and GIFs from the app as it stands.
 *
 *   node scripts/v2/sandbox.mjs env --port 7885 > /tmp/readme.env && . /tmp/readme.env
 *   npm run build && node scripts/readme-media.mjs
 *
 * A fake-AI server on the sandbox's port and data folder, seeded with the
 * prototype's synthetic practice (John Smith and co, HS-8), driven through
 * the real UI in Chromium with a fake microphone. Each scene saves numbered
 * frames under build/readme-media/<scene>/; the README's PNG is a chosen frame
 * and its GIF is all of them, scaled down. Nothing here touches the live data
 * folder or port, and no network is used.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { chromium } from '@playwright/test';

const root = resolve(import.meta.dirname, '..');
const port = Number(process.env.APUNTA_PORT ?? 0);
const dataDir = process.env.APUNTA_DATA_DIR ?? '';
if (!port || port === 7717 || !dataDir.startsWith('/tmp/apunta-v2/')) {
  console.error(
    'Run inside the sandbox: node scripts/v2/sandbox.mjs env --port 78xx, sourced. Never the live port or data.',
  );
  process.exit(2);
}
const base = `http://127.0.0.1:${String(port)}`;
const framesRoot = join(root, 'build', 'readme-media');
const out = join(root, 'docs', 'assets', 'readme');
const env = { ...process.env, APUNTA_FAKE_AI: '1', APUNTA_NO_OPEN: '1' };

function sh(command, args) {
  const result = spawnSync(command, args, { cwd: root, env, stdio: 'inherit' });
  if (result.status !== 0) throw new Error(`${command} ${args.join(' ')} exited ${String(result.status)}`);
}

async function waitForHealth() {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      if ((await fetch(`${base}/api/health`)).ok) return;
    } catch {
      // not up yet
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error('the server never answered /api/health');
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** One scene's frames: `shot()` saves the next numbered frame. */
function scene(page, name) {
  const dir = join(framesRoot, name);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  let index = 0;
  return {
    dir,
    async shot() {
      index += 1;
      await sleep(350); // let transitions settle
      await page.screenshot({ path: join(dir, `${String(index).padStart(2, '0')}.png`) });
    },
  };
}

/** The README's PNG (one frame) and GIF (every frame, scaled to `width`). */
function publish(dir, name, { still, width, delay = 140 }) {
  sh('magick', [join(dir, still), join(out, `${name}.png`)]);
  sh('magick', [
    '-delay',
    String(delay),
    '-loop',
    '0',
    join(dir, '*.png'),
    '-resize',
    `${String(width)}x`,
    '-layers',
    'Optimize',
    join(out, `${name}.gif`),
  ]);
}

sh('npm', ['run', 'seed', '--', '--reset']);
const server = spawn('node', ['server/dist/index.js'], { cwd: root, env, stdio: 'ignore' });
try {
  await waitForHealth();
  const browser = await chromium.launch({
    args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 820 }, deviceScaleFactor: 1.5 });
  await page.goto(base);
  await page.getByText('John Smith', { exact: true }).first().click();
  await sleep(800);

  // Hero: the workspace with a published progress note open.
  const hero = scene(page, 'hero');
  await page.getByText('Progress note').nth(1).click();
  await hero.shot();
  sh('magick', [join(hero.dir, '01.png'), join(out, 'hero.png')]);

  // 01: record a session summary, with the live preview, then draft.
  const record = scene(page, 'feature-01');
  await page.getByText('New note', { exact: true }).click();
  await sleep(800);
  await record.shot();
  await page.getByTestId('record-start').click();
  await sleep(3500); // the dialog grows as the panel opens; let it settle
  await record.shot();
  await sleep(2000);
  await record.shot();
  await page.getByTestId('record-stop').click();
  await sleep(700);
  await record.shot();
  publish(record.dir, 'feature-01-mobile', { still: '03.png', width: 900 });

  // 02: the drafted note it lands on.
  const draft = scene(page, 'feature-02');
  await page.getByTestId('note-body').waitFor({ timeout: 30_000 });
  await sleep(1500);
  await draft.shot();
  await page.getByTestId('note-body').click();
  await draft.shot();
  publish(draft.dir, 'feature-02-mobile', { still: '01.png', width: 1100 });

  // 03: refine in the chat beside the note.
  const refine = scene(page, 'feature-03');
  await page.locator('.chat-fab').click();
  await sleep(3000); // the panel slides in and settles
  await refine.shot();
  // The fake AI's one edit that works on any format (`fakeRefine`).
  await page.getByPlaceholder(/Ask a question or give feedback/).fill('Make it warmer');
  await sleep(1500);
  await refine.shot();
  await page.keyboard.press('Enter');
  await page
    .getByTestId('refine-outcome')
    .first()
    .waitFor({ timeout: 15_000 })
    .catch(() => undefined);
  await sleep(1500);
  await refine.shot();
  publish(refine.dir, 'feature-03-mobile', { still: '03.png', width: 1100 });
  await page.getByTestId('chat-close').click();

  // 04: the patient's tools: plan, session prep, brainstorm.
  const tools = scene(page, 'feature-04');
  await page.getByText('Treatment plan', { exact: true }).first().click();
  await sleep(1200);
  await page.getByText('Draft goals from recent notes', { exact: true }).first().click();
  await sleep(4000);
  await tools.shot();
  await page.getByText('Prepare for session', { exact: true }).first().click();
  await sleep(3000);
  await tools.shot();
  await page.getByText('Brainstorm', { exact: true }).first().click();
  await sleep(1200);
  await page.getByPlaceholder(/Think out loud/).fill('What should I watch for next session?');
  await page.keyboard.press('Enter');
  await sleep(4000);
  await tools.shot();
  publish(tools.dir, 'feature-04-mobile', { still: '02.png', width: 1100, delay: 200 });

  // 05: note formats, in Settings.
  const formats = scene(page, 'feature-05');
  await page.getByText('More', { exact: true }).click();
  await page.getByText('Settings', { exact: true }).first().click();
  await sleep(900);
  await page.getByText('Format', { exact: true }).first().click();
  await sleep(900);
  await formats.shot();
  await page.getByText('Edit', { exact: true }).first().click();
  await sleep(1200);
  await formats.shot();
  publish(formats.dir, 'feature-05-mobile', { still: '02.png', width: 1100, delay: 220 });

  await browser.close();
} finally {
  server.kill('SIGTERM');
}
