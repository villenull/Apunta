import { describe, expect, it } from 'vitest';

import { buildBootErrorApp, bootErrorHtml } from './boot-error.js';

describe('boot error page', () => {
  it('names the data folder and gives a recovery action without opening a database', async () => {
    const options = {
      dataDir: '/tmp/apunta-data',
      message: 'Apunta cannot write because the disk is full.',
    };
    expect(bootErrorHtml(options)).toContain(options.dataDir);
    expect(bootErrorHtml(options)).toContain('start Apunta again');

    const app = buildBootErrorApp(options, 80);
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('disk is full');
    await app.close();
  });
});
