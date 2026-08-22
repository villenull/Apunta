import { UpdateSettingsRequestSchema, type Settings } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import { getAllSettings, putSettings } from '../db/settings.js';
import { parseBody } from '../http/validate.js';

export function registerSettingsRoutes(app: FastifyInstance, db: Database): void {
  app.get('/api/settings', async (): Promise<Settings> => getAllSettings(db));

  /**
   * A merge, not a replace: a client that only knows about the vocabulary list
   * must not wipe the model choice by PUTting what it happens to hold.
   */
  app.put('/api/settings', async (request): Promise<Settings> => {
    const patch = parseBody(UpdateSettingsRequestSchema, request.body);
    return putSettings(db, patch);
  });
}
