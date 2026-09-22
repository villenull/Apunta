import { UpdateSettingsRequestSchema, type Settings } from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';
import { putSettings } from '../db/settings.js';
import { settingsWithLlmProfiles } from '../ai/profiles.js';
import { parseBody } from '../http/validate.js';
export function registerSettingsRoutes(app: FastifyInstance, db: Database, config?: AppConfig): void {
  const profileOptions: { baseUrl?: string; fakeAi?: boolean } = {};
  if (config?.ollamaUrl !== undefined) profileOptions.baseUrl = config.ollamaUrl;
  if (config?.fakeAi !== undefined) profileOptions.fakeAi = config.fakeAi;
  app.get('/api/settings', async (): Promise<Settings> => settingsWithLlmProfiles(db, profileOptions));

  /**
   * A merge, not a replace: a client that only knows about the vocabulary list
   * must not wipe the model choice by PUTting what it happens to hold.
   */
  app.put('/api/settings', async (request): Promise<Settings> => {
    const patch = parseBody(UpdateSettingsRequestSchema, request.body);
    putSettings(db, patch);
    return settingsWithLlmProfiles(db, profileOptions);
  });
}
