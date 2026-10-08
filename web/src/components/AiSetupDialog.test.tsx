import type { HealthResponse, PlanEvent, SetupStatusResponse } from '@apunta/shared';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { installFakeApi } from '../test/fakeApi.js';
import { AiBanner } from './AiBanner.js';
import { formatBytes } from './AiSetupDialog.js';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** A real-mode install with no speech model yet: what the .dmg opens to. */
const FIRST_LAUNCH: Partial<HealthResponse> = {
  fakeAi: false,
  ollama: { reachable: true, model: 'qwen3.5:4b-q4_K_M', modelPresent: false },
  whisper: { binaryPresent: true, modelPresent: false, binary: 'whisper-cli', model: 'ggml-tiny.en.bin' },
};

const PLAN: PlanEvent = {
  event: 'plan',
  memoryGib: 16,
  model: {
    tag: 'qwen3.5:4b-q4_K_M',
    publisher: 'Alibaba (the Qwen team)',
    reason: 'The same model on every computer.',
    licence: { name: 'Apache-2.0', url: 'https://ollama.com/library/qwen3.5', verified: true },
  },
  steps: [
    {
      id: 'speech_model',
      label: 'The model that reads your recordings',
      needed: true,
      approxBytes: 78_643_200,
    },
    {
      id: 'preview_model',
      label: 'The model that shows your words as you speak',
      needed: false,
      approxBytes: 78_643_200,
    },
    {
      id: 'writing_model',
      label: 'The model that writes your notes',
      needed: true,
      approxBytes: 3_435_973_837,
    },
  ],
  disk: {
    ok: true,
    freeBytes: 100_000_000_000,
    requiredBytes: 3_514_617_037,
    headroomBytes: 5_000_000_000,
    shortfallBytes: 0,
    message: '3.5 GB to download, 100 GB free.',
  },
  ready: false,
};

function shellSetup(initial: SetupStatusResponse): {
  setup: { status: SetupStatusResponse; onAction: (action: string) => void };
  actions: string[];
} {
  const actions: string[] = [];
  const setup = {
    status: initial,
    onAction: (action: string) => {
      actions.push(action);
      if (action === 'plan') {
        setup.status = {
          state: 'planned',
          plan: PLAN,
          steps: [
            { id: 'speech_model', status: 'pending' },
            { id: 'preview_model', status: 'skipped' },
            { id: 'writing_model', status: 'pending' },
          ],
        };
      }
    },
  };
  return { setup, actions };
}

describe('first-run setup', () => {
  it('opens by itself on a first launch, lists what it will download, and downloads nothing yet', async () => {
    const { setup, actions } = shellSetup({ state: 'idle', steps: [] });
    installFakeApi({}, { health: FIRST_LAUNCH, setup });
    render(<AiBanner />);

    const dialog = await screen.findByTestId('ai-setup-dialog');
    await screen.findByTestId('ai-setup-steps');
    expect(actions).toEqual(['plan']);
    expect(dialog.textContent).toContain('Speech model, which reads your recordings');
    expect(dialog.textContent).toContain('About 78.6 MB · from Hugging Face');
    expect(dialog.textContent).toContain('Writing model (qwen3.5:4b-q4_K_M), which drafts your notes');
    expect(dialog.textContent).toContain("About 3.4 GB · from Ollama's model library");
    // The preview shares the speech model's file, so it is not listed as installed.
    expect(screen.queryByTestId('ai-setup-step-preview_model')).toBeNull();
    expect(dialog.textContent).toContain('Nothing about you, your patients or your notes is sent');
    expect(screen.getByTestId('ai-setup-start').textContent).toBe('Download (3.5 GB)');

    // The banner behind it offers setup rather than a retry.
    expect((await screen.findByTestId('ai-banner')).textContent).toContain(
      'Apunta needs to download its AI models',
    );
    expect(screen.getByTestId('ai-banner-setup')).toBeTruthy();
  });

  it('downloads only on her press, shows progress, and stops on request', async () => {
    const { setup, actions } = shellSetup({ state: 'idle', steps: [] });
    installFakeApi({}, { health: FIRST_LAUNCH, setup });
    render(<AiBanner />);
    await screen.findByTestId('ai-setup-steps');
    fireEvent.click(screen.getByTestId('ai-setup-start'));
    await waitFor(() => {
      expect(actions).toEqual(['plan', 'run']);
    });

    setup.status = {
      state: 'running',
      plan: PLAN,
      steps: [
        { id: 'speech_model', status: 'started' },
        { id: 'preview_model', status: 'skipped' },
        { id: 'writing_model', status: 'pending' },
      ],
      progress: {
        event: 'progress',
        id: 'speech_model',
        completedBytes: 39_321_600,
        totalBytes: 78_643_200,
        percent: 50,
        bytesPerSecond: 1_000_000,
        etaSeconds: 39,
        detail: '39.3 MB of 78.6 MB',
      },
    };
    const step = await screen.findByText('Downloaded 39.3 MB of 78.6 MB', {}, { timeout: 3000 });
    expect(step).toBeTruthy();
    expect(screen.getByTestId('ai-setup-later').textContent).toBe('Hide');
    fireEvent.click(screen.getByTestId('ai-setup-stop'));
    await waitFor(() => {
      expect(actions).toEqual(['plan', 'run', 'cancel']);
    });
  });

  it('words a failure from its code and offers to try again', async () => {
    const { setup, actions } = shellSetup({
      state: 'failed',
      plan: PLAN,
      steps: [],
      failure: { code: 'download_failed', retryable: true },
    });
    // Reopened after a failure: a fresh plan is asked for, then the failure is shown.
    setup.onAction = (action: string) => {
      actions.push(action);
    };
    installFakeApi({}, { health: FIRST_LAUNCH, setup });
    render(<AiBanner />);
    expect((await screen.findByTestId('ai-setup-failed')).textContent).toContain(
      'The download stopped. Check the internet connection',
    );
    expect(screen.getByTestId('ai-setup-start').textContent).toBe('Try again');
  });

  it('says when there is no room, and does not offer the download', async () => {
    const { setup } = shellSetup({
      state: 'planned',
      plan: { ...PLAN, disk: { ...PLAN.disk, ok: false, shortfallBytes: 2_500_000_000 } },
      steps: [],
    });
    setup.onAction = () => undefined;
    installFakeApi({}, { health: FIRST_LAUNCH, setup });
    render(<AiBanner />);
    expect((await screen.findByTestId('ai-setup-no-room')).textContent).toContain(
      'needs 2.5 GB more free space',
    );
    expect((screen.getByTestId('ai-setup-start') as HTMLButtonElement).disabled).toBe(true);
  });

  it('re-reads health when setup finishes, and closes on Done', async () => {
    const { setup } = shellSetup({ state: 'done', plan: PLAN, steps: [] });
    setup.onAction = () => undefined;
    const api = installFakeApi({}, { health: FIRST_LAUNCH, setup });
    render(<AiBanner />);
    await screen.findByTestId('ai-setup-ready');
    await waitFor(() => {
      expect(api.calls.filter((call) => call === 'GET /api/health').length).toBeGreaterThan(1);
    });
    fireEvent.click(screen.getByTestId('ai-setup-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('ai-setup-dialog')).toBeNull();
    });
  });

  it('in a browser tab, names the missing speech model and offers no setup', async () => {
    installFakeApi(
      {},
      {
        health: {
          ...FIRST_LAUNCH,
          ollama: { reachable: true, model: 'qwen3.5:4b-q4_K_M', modelPresent: true },
        },
      },
    );
    render(<AiBanner />);
    const banner = await screen.findByTestId('ai-banner');
    expect(banner.textContent).toContain("Apunta can't find its speech model.");
    expect(screen.queryByTestId('ai-banner-setup')).toBeNull();
    expect(screen.queryByTestId('ai-setup-dialog')).toBeNull();
  });
});

describe('formatBytes', () => {
  it('uses decimal units, as the system shows file sizes', () => {
    expect(formatBytes(78_643_200, 'en')).toBe('78.6 MB');
    expect(formatBytes(3_435_973_837, 'en')).toBe('3.4 GB');
    expect(formatBytes(512, 'en')).toBe('512 B');
    expect(formatBytes(3_435_973_837, 'es-MX')).toBe('3.4 GB');
  });
});
