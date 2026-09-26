import { t } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { buildBootErrorApp, bootErrorHtml } from './boot-error.js';

describe('boot error page', () => {
  it('names the data folder and gives a recovery action without opening a database', async () => {
    const options = {
      dataDir: '/tmp/apunta-data',
      key: 'errors.storage_error.disk_full',
      params: { dir: '/tmp/apunta-data' },
    } as const;
    const english = t('errors.storage_error.disk_full', { dir: options.dataDir }, 'en');
    const html = bootErrorHtml(options);
    expect(html).toContain(options.dataDir);
    expect(html).toContain('start Apunta again');
    expect(html).toContain(english);

    const app = buildBootErrorApp(options, 80);
    const response = await app.inject({ method: 'GET', url: '/' });
    expect(response.statusCode).toBe(503);
    expect(response.headers['content-type']).toContain('text/html');
    expect(response.body).toContain('disk is full');
    await app.close();
  });

  /**
   * C-LANG@1 and this card's fixed decision 4: the page cannot read the setting
   * — storage is what failed — so it shows **both** languages, English first,
   * under `<html lang="en">`, and its two JSON bodies carry English.
   */
  it('prints the English sentence and then the Spanish one, with html lang en', () => {
    const options = {
      dataDir: '/tmp/apunta-data',
      key: 'errors.storage_error.disk_full',
      params: { dir: '/tmp/apunta-data' },
    } as const;
    const html = bootErrorHtml(options);
    const english = t('errors.storage_error.disk_full', { dir: options.dataDir }, 'en');
    const spanish = t('errors.storage_error.disk_full', { dir: options.dataDir }, 'es-MX');

    expect(html).toContain('<html lang="en">');
    expect(html).not.toBe(spanish);
    // English first: the Spanish paragraph starts where the English one ended.
    expect(html.indexOf(english)).toBeGreaterThan(-1);
    expect(html.indexOf(spanish)).toBeGreaterThan(html.indexOf(english));
    expect(html).toContain('<p lang="es-MX">');
  });

  it('answers its two JSON bodies in English, because nothing can ask which language', async () => {
    const options = {
      dataDir: '/tmp/apunta-data',
      key: 'errors.storage_error.cannot_open',
      params: { file: '/tmp/apunta-data/apunta.db' },
    } as const;
    const english = t('errors.storage_error.cannot_open', { file: options.params.file }, 'en');
    const app = buildBootErrorApp(options, 80);

    const health = await app.inject({ method: 'GET', url: '/api/health' });
    expect(health.statusCode).toBe(503);
    expect(health.json()).toEqual({ error: 'storage_error', message: english });

    const missing = await app.inject({ method: 'GET', url: '/api/nope' });
    expect(missing.statusCode).toBe(503);
    expect(missing.json()).toEqual({ error: 'storage_error', message: english });

    await app.close();
  });
});
