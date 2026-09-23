import { afterEach, describe, expect, it } from 'vitest';

import { FakeLlmProvider, FakeSttProvider } from '../ai/fake.js';
import { createTestApp, type TestApp } from '../test/harness.js';

class PendingPreloadProvider extends FakeLlmProvider {
  calls = 0;
  readonly finished: Promise<void>;
  private releaseFinished!: () => void;

  constructor() {
    super({ streamDelayMs: 0 });
    this.finished = new Promise<void>((resolve) => {
      this.releaseFinished = resolve;
    });
  }

  override preloadDraft(): Promise<void> {
    this.calls += 1;
    return this.finished;
  }

  release(): void {
    this.releaseFinished();
  }
}

let app: TestApp | null = null;
afterEach(async () => {
  await app?.close();
  app = null;
});

describe('POST /api/transcribe/preload', () => {
  it('answers before the provider warm-up settles', async () => {
    const provider = new PendingPreloadProvider();
    app = await createTestApp({ providers: { llm: provider, stt: new FakeSttProvider() } });

    const response = await app.app.inject({ method: 'POST', url: '/api/transcribe/preload' });

    expect(response.statusCode).toBe(204);
    expect(provider.calls).toBe(1);
    provider.release();
    await provider.finished;
  });

  it('swallows a provider failure without failing recording setup', async () => {
    const provider = new FakeLlmProvider({ streamDelayMs: 0 });
    provider.preloadDraft = async () => {
      throw new Error('synthetic preload failure');
    };
    app = await createTestApp({ providers: { llm: provider, stt: new FakeSttProvider() } });

    const response = await app.app.inject({ method: 'POST', url: '/api/transcribe/preload' });

    expect(response.statusCode).toBe(204);
  });
});
