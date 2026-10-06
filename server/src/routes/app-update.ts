import {
  CloseDecisionRequestSchema,
  UpdateAutoCheckRequestSchema,
  UpdateCodeSchema,
  UpdateStateSchema,
  type UpdateAction,
  type UpdateCode,
  type UpdateState,
  type UpdateStatusResponse,
} from '@apunta/shared';
import type { Database } from 'better-sqlite3';
import type { FastifyInstance } from 'fastify';

import type { AppConfig } from '../config.js';
import { getSetting, putSettings } from '../db/settings.js';
import { rawHttpError } from '../http/errors.js';
import { parseBody } from '../http/validate.js';
import { currentMaintenance, quiesceFromBridge, releaseHeldMaintenance } from '../maintenance.js';
import {
  setMaintenanceReleaseHandler,
  setQuiesceHandler,
  setSnapshotHandler,
  setUpdateStatusHandler,
  shellIsListening,
  writeCloseDecision,
  writeUpdateRequest,
  type BridgeEnv,
  type LineWriter,
  type UpdateStatusMessage,
} from '../shell-bridge.js';
import { clearJournal, readJournal } from '../update-journal.js';
import { takePreUpdateSnapshot } from '../update-snapshot.js';

/**
 * The updater's server side (C-BRIDGE@1 rules 2 and 3, C-UPD@1).
 *
 * The shell owns the state machine; this module is the **mirror** the page can
 * read and the **relay** it can ask through. `update_status` lines from the shell
 * land in a small store, `GET /api/app/update` reads it, and each `POST` forwards
 * exactly one `update_request{action}`; the server never decides a transition.
 *
 * **Shell-only.** None of these routes exists unless a shell started the server
 * (`APUNTA_SHELL=1`), so in browser mode they are the ordinary 404. The
 * `/api/app/quiesce*` group is a different, server-mode group and is untouched.
 *
 * The shell's stdin handlers (`update_status`, `snapshot_request`,
 * `maintenance_release`) are installed here, and only in shell mode, for the
 * reason `shell-bridge.ts` gives: it must stay free of runtime imports.
 */

/** The row `PUT /api/app/update/settings` writes. Default (no row) is on. */
export const AUTO_CHECK_SETTING = 'update_auto_check';

/** C-UPD@1: "Launch check after 30 s if the toggle is on". */
const AUTO_CHECK_DELAY_MS = 30_000;

export interface UpdateRoutesOptions {
  /** Whether a shell is in front of this server. Derived from `APUNTA_SHELL`. */
  readonly shell?: boolean;
  /** Where bridge lines go. Production passes nothing (stdout). */
  readonly write?: LineWriter;
  /** The delay before the launch check. Production passes nothing. */
  readonly autoCheckDelayMs?: number;
}

/** What each action requires the shell's current state to be. */
const ACTION_FROM: Record<UpdateAction, readonly UpdateState[]> = {
  check: ['idle', 'available', 'done'],
  download: ['available'],
  install: ['verified'],
};

const CLOSE_CODES: readonly UpdateCode[] = ['close_requested', 'close_refused', 'close_cancelled'];

interface UpdateStore {
  state: UpdateState;
  version: string | undefined;
  code: UpdateCode | undefined;
  closeState: 'none' | 'requested' | 'refused';
  closeBlockers: string[];
  /** The blockers of the last canonical check the shell asked for. */
  lastQuiesceBlockers: string[];
  /** The version the last `snapshotting` status named: the snapshot's target. */
  snapshotTarget: string | undefined;
}

export function registerUpdateRoutes(
  app: FastifyInstance,
  db: Database,
  config: AppConfig,
  options: UpdateRoutesOptions = {},
): void {
  const shell = options.shell ?? shellIsListening(process.env);
  if (!shell) return;

  const env: BridgeEnv = { APUNTA_SHELL: '1' };
  const bridge = options.write === undefined ? { env } : { env, write: options.write };
  const store: UpdateStore = {
    state: 'idle',
    version: undefined,
    code: undefined,
    closeState: 'none',
    closeBlockers: [],
    lastQuiesceBlockers: [],
    snapshotTarget: undefined,
  };

  const autoCheck = (): boolean => getSetting<unknown>(db, AUTO_CHECK_SETTING) !== false;

  // The shell's `quiesce{}` runs the very entry point the HTTP trigger runs; this
  // only remembers its blockers, so a refused close can say what to finish.
  setQuiesceHandler(async () => {
    const result = await quiesceFromBridge();
    store.lastQuiesceBlockers = [...result.blockers];
    return result;
  });

  setUpdateStatusHandler((message: UpdateStatusMessage) => {
    applyStatus(store, message, app);
  });

  setSnapshotHandler(async (id) => {
    const status = currentMaintenance().status();
    const result = await takePreUpdateSnapshot({
      db,
      dataDir: config.dataDir,
      id,
      fromVersion: config.version,
      toVersion: store.snapshotTarget,
      quiesced: () => status.maintenance && !status.quiescing,
    });
    return result.ok ? { ok: true } : { ok: false, code: result.code };
  });

  setMaintenanceReleaseHandler(() => {
    releaseHeldMaintenance();
    // An abandoned or failed update leaves a `pending` journal naming an install
    // that is not going to happen; left there, the next ordinary boot would be
    // read as a failed update. The successful path never sends this message.
    const journal = readJournal(config.dataDir);
    if (journal !== null && journal !== 'corrupt' && journal.phase === 'pending') {
      clearJournal(config.dataDir);
    }
  });

  app.get('/api/app/update', (): UpdateStatusResponse => {
    return {
      state: store.state,
      ...(store.version === undefined ? {} : { version: store.version }),
      ...(store.code === undefined ? {} : { code: store.code }),
      autoCheck: autoCheck(),
      close: { state: store.closeState, blockers: [...store.closeBlockers] },
    };
  });

  for (const action of ['check', 'download', 'install'] as const) {
    app.post(`/api/app/update/${action}`, async (_request, reply) => {
      if (store.closeState !== 'none' || !ACTION_FROM[action].includes(store.state)) {
        throw rawHttpError(409, 'invalid_state', `Cannot ${action} while the updater is ${store.state}.`, {
          state: store.state,
        });
      }
      writeUpdateRequest(action, bridge);
      return reply.code(202).send({ accepted: true });
    });
  }

  app.put('/api/app/update/settings', async (request) => {
    const input = parseBody(UpdateAutoCheckRequestSchema, request.body);
    putSettings(db, { [AUTO_CHECK_SETTING]: input.autoCheck });
    return { autoCheck: input.autoCheck };
  });

  /**
   * The renderer's explicit word after a refused native close. It never grants
   * permission to skip the check: the shell answers `true` with a fresh canonical
   * quiesce and closes only on that one's `ok:true`.
   */
  app.post('/api/app/close/decision', async (request, reply) => {
    const input = parseBody(CloseDecisionRequestSchema, request.body);
    if (store.closeState !== 'refused') {
      throw rawHttpError(409, 'invalid_state', 'No window close is waiting for a decision.', {
        close: store.closeState,
      });
    }
    store.closeState = input.confirm ? 'requested' : 'none';
    store.closeBlockers = [];
    writeCloseDecision(input.confirm, bridge);
    return reply.code(202).send({ accepted: true });
  });

  // The launch check: quiet, once, and only if the toggle is on and the shell is idle.
  const timer = setTimeout(() => {
    if (store.state === 'idle' && autoCheck()) writeUpdateRequest('check', bridge);
  }, options.autoCheckDelayMs ?? AUTO_CHECK_DELAY_MS);
  timer.unref();
  app.addHook('onClose', () => {
    clearTimeout(timer);
  });
}

/** Mirror one `update_status` line; anything this build does not know is logged and dropped. */
function applyStatus(store: UpdateStore, message: UpdateStatusMessage, app: FastifyInstance): void {
  const code = UpdateCodeSchema.safeParse(message.code);
  if (code.success && CLOSE_CODES.includes(code.data)) {
    // Close intent is not an update state: it is reported beside it, never as it.
    if (code.data === 'close_requested') {
      store.closeState = 'requested';
      store.closeBlockers = [];
    } else if (code.data === 'close_refused') {
      store.closeState = 'refused';
      store.closeBlockers = [...store.lastQuiesceBlockers];
    } else {
      store.closeState = 'none';
      store.closeBlockers = [];
    }
    return;
  }
  const state = UpdateStateSchema.safeParse(message.state);
  if (!state.success) {
    app.log.warn({ state: message.state }, 'ignoring an update_status with an unknown state');
    return;
  }
  store.state = state.data;
  store.code = code.success ? code.data : undefined;
  if (message.version !== undefined) store.version = message.version;
  if (state.data === 'snapshotting') store.snapshotTarget = message.version ?? store.snapshotTarget;
  if (state.data === 'idle') store.version = undefined;
}
