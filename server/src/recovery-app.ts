import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

import fastifyStatic from '@fastify/static';
import {
  CloseDecisionRequestSchema,
  UpdateStatusResponseSchema,
  type RecoveryStatus,
  type UpdateStatusResponse,
} from '@apunta/shared';
import Fastify, { type FastifyInstance, type FastifyServerOptions } from 'fastify';
import type { FastifyReply } from 'fastify';

import { RestoreError, restoreFromSnapshot } from './backup/restore.js';
import type { AppConfig } from './config.js';
import { uuidv7 } from './db/uuid.js';
import { registerCsp } from './http/csp.js';
import { registerRequestGuard } from './http/request-guard.js';
import { quiesceFromBridge, registerMaintenanceRefusal, type MaintenanceOptions } from './maintenance.js';
import { registerMaintenanceRoutes } from './routes/app-quiesce.js';
import {
  setQuiesceHandler,
  setUpdateStatusHandler,
  writeCloseDecision,
  writeRecoveryRequest,
} from './shell-bridge.js';
import { writeJournal, type UpdateJournal } from './update-journal.js';
import { parseBody } from './http/validate.js';

/** Where the shell keeps the image it replaced, beside the running AppImage. */
export const PREVIOUS_IMAGE_NAME = 'Apunta.previous.AppImage';

export type RecoveryRequest = { readonly id: string; readonly action: 'restart' | 'reinstall_previous' };

export interface RecoveryAppOptions {
  readonly config: Pick<AppConfig, 'port' | 'dataDir' | 'webDistDir' | 'sqliteBinding' | 'version'>;
  /** The journal the boot decision found; `null` when it could not be read. */
  readonly journal: UpdateJournal | null;
  /** `process.env` in production. Read for `APPIMAGE` and the shell marker. */
  readonly env?: { readonly [key: string]: string | undefined };
  /**
   * Asks the shell to restart or reinstall. `false` means nobody is listening.
   * Production writes the bridge line; a suite passes a recorder.
   */
  readonly requestShell?: (request: RecoveryRequest) => boolean;
  readonly maintenance?: MaintenanceOptions;
  readonly logger?: FastifyServerOptions['logger'];
}

const RECOVERY_UNAVAILABLE =
  'Apunta is in recovery mode. Nothing can be changed until it is restored or reinstalled.';

/**
 * The server a failed update boots into (C-UPD@1 "Recovery startup").
 *
 * It never opens the user database, runs a migration, sweeps audio, schedules a
 * backup or registers a clinical route: the only thing that touches the
 * database is the explicit restore, which swaps the file before anything has it
 * open. The quiesce routes are registered anyway (they read no database), so a
 * native window close still gets an honest answer.
 *
 * - `GET  /api/app/recovery` — what happened and whether the previous version
 *   can be reinstalled.
 * - `POST /api/app/recovery/restore` — restores the safety snapshot, records
 *   permission for one handed-off health attempt, and asks the shell to restart.
 * - `POST /api/app/recovery/reinstall-previous` — restores the safety snapshot
 *   before asking the shell to atomically reinstall the kept previous image.
 */
export async function buildRecoveryApp(options: RecoveryAppOptions): Promise<FastifyInstance> {
  const { config, journal } = options;
  const env = options.env ?? process.env;
  const requestShell =
    options.requestShell ?? ((request: RecoveryRequest): boolean => writeRecoveryRequest(request, { env }));
  const app = Fastify({ logger: options.logger ?? true });

  registerRequestGuard(app, { port: config.port });
  registerMaintenanceRefusal(app, {
    ...options.maintenance,
    shellMode: true,
    initialHold: journal?.updateId ?? uuidv7(),
  });
  registerCsp(app);
  app.addHook('onSend', async (_request, reply, payload) => {
    reply.header('x-apunta-mode', 'recovery');
    return payload;
  });
  registerMaintenanceRoutes(app, {});

  let restored = false;
  let busy = false;

  const previousImage = (): string | null => {
    const image = env['APPIMAGE'];
    if (image === undefined || image === '') return null;
    const candidate = join(dirname(image), PREVIOUS_IMAGE_NAME);
    return existsSync(candidate) ? candidate : null;
  };

  const status = (): RecoveryStatus => ({
    phase: journal?.phase ?? 'recovery',
    fromVersion: journal?.fromVersion ?? 'unknown',
    toVersion: journal?.toVersion ?? config.version,
    ...(journal === null ? {} : { createdAt: journal.createdAt }),
    previousAvailable: journal !== null && previousImage() !== null,
  });

  const conflict = (message: string): { error: string; message: string } => ({ error: 'conflict', message });

  app.get('/api/health', (_request, reply) => reply.code(503).send({ ok: false, mode: 'recovery' }));

  app.get('/api/app/recovery', () => status());

  let nativeStatus: UpdateStatusResponse = {
    state: 'idle',
    autoCheck: false,
    close: { state: 'none', blockers: [] },
  };
  let closeBlockers: string[] = [];
  setQuiesceHandler(async () => {
    const result = await quiesceFromBridge();
    closeBlockers = [...result.blockers];
    return result;
  });
  setUpdateStatusHandler((message) => {
    const parsed = UpdateStatusResponseSchema.safeParse({
      ...message,
      autoCheck: false,
      close:
        message.code === 'close_requested'
          ? { state: 'requested', blockers: [] }
          : message.code === 'close_refused'
            ? { state: 'refused', blockers: closeBlockers }
            : message.code === 'close_cancelled'
              ? { state: 'none', blockers: [] }
              : nativeStatus.close,
    });
    if (!parsed.success) return;
    nativeStatus = parsed.data;
    if (nativeStatus.code === 'install_failed') busy = false;
  });
  app.addHook('onClose', () => {
    setUpdateStatusHandler(null);
    setQuiesceHandler(quiesceFromBridge);
  });
  app.get('/api/app/update', () => nativeStatus);
  app.post('/api/app/close/decision', (request, reply) => {
    const input = parseBody(CloseDecisionRequestSchema, request.body);
    if (!writeCloseDecision(input.confirm, { env })) {
      return reply.code(409).send(conflict('Apunta is not running inside its desktop shell.'));
    }
    return reply.code(202).send({ accepted: true });
  });

  const recover = (action: RecoveryRequest['action']) => async (_request: unknown, reply: FastifyReply) => {
    if (busy) return reply.code(409).send(conflict('Another recovery action is still running.'));
    if (journal === null)
      return reply.code(409).send(conflict('No safety snapshot is recorded for this update.'));
    if (action === 'reinstall_previous' && previousImage() === null) {
      return reply.code(409).send(conflict('The previous version is not available on this computer.'));
    }
    busy = true;
    let requested = false;
    try {
      if (!restored) {
        restoreFromSnapshot({
          dataDir: config.dataDir,
          snapshotPath: journal.snapshotPath,
          nativeBinding: config.sqliteBinding,
        });
        restored = true;
      }
      // Never authorize an ordinary boot merely because the copy succeeded.
      // A matching shell handoff must claim this permission durably, and only
      // the fresh replacement's positive health acknowledgment clears it.
      writeJournal(config.dataDir, {
        ...journal,
        phase: 'recovery',
        recoveryTarget: action === 'restart' ? journal.toVersion : journal.fromVersion,
      });
      nativeStatus = {
        state: nativeStatus.state,
        autoCheck: false,
        close: nativeStatus.close,
        ...(nativeStatus.version === undefined ? {} : { version: nativeStatus.version }),
      };
      requested = requestShell({ id: journal.updateId, action });
      if (!requested)
        return reply.code(409).send(conflict('Apunta is not running inside its desktop shell.'));
      return action === 'restart'
        ? reply.code(200).send({ restored: true, restarting: true })
        : reply.code(202).send({ reinstalling: true });
    } catch (error) {
      if (
        error instanceof RestoreError &&
        (error.code === 'snapshot_missing' || error.code === 'snapshot_corrupt')
      ) {
        return reply.code(409).send(conflict(error.message));
      }
      app.log.error({ err: error }, 'the safety snapshot could not be restored');
      return reply.code(500).send({
        error: 'storage_error',
        message: error instanceof Error ? error.message : 'The safety snapshot could not be restored.',
      });
    } finally {
      if (!requested) busy = false;
    }
  };
  app.post('/api/app/recovery/restore', recover('restart'));
  app.post('/api/app/recovery/reinstall-previous', recover('reinstall_previous'));

  const hasBuiltSpa = existsSync(config.webDistDir);
  if (hasBuiltSpa) {
    await app.register(fastifyStatic, { root: config.webDistDir });
  }
  app.setNotFoundHandler((request, reply) => {
    if (request.method === 'GET' && !request.url.startsWith('/api') && hasBuiltSpa) {
      return reply.sendFile('index.html');
    }
    return reply.code(503).send({ error: 'maintenance', message: RECOVERY_UNAVAILABLE });
  });

  return app;
}
