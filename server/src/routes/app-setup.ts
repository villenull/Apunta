import {
  SetupEventSchema,
  type PlanEvent,
  type ProgressEvent,
  type SetupAction,
  type SetupErrorCode,
  type SetupEvent,
  type SetupState,
  type SetupStatusResponse,
  type SetupStepState,
} from '@apunta/shared';
import type { FastifyInstance } from 'fastify';

import { rawHttpError } from '../http/errors.js';
import {
  setSetupHandlers,
  shellIsListening,
  writeSetupRequest,
  type BridgeEnv,
  type LineWriter,
} from '../shell-bridge.js';

/**
 * First-run setup's server side: a **mirror and a relay**, like the updater's.
 *
 * The page asks (`POST /api/app/setup/{plan,run,cancel}`), this forwards one
 * `setup_request{action}` to the shell, and the shell runs the installer — a
 * separate, short-lived process — and wraps each line it prints as
 * `setup_event{event}`. Those land here, are validated against the installer's
 * own schema, and `GET /api/app/setup` reads the result.
 *
 * The server downloads nothing and contacts nothing (CLAUDE.md hard rule 1):
 * the installer is the only process with the model-acquisition exception, and
 * it runs only after her explicit Start.
 *
 * **Shell-only.** Without `APUNTA_SHELL=1` none of these routes exists, so in
 * browser mode they are the ordinary 404 and the page shows instructions
 * instead.
 */

export interface SetupRoutesOptions {
  /** Whether a shell is in front of this server. Derived from `APUNTA_SHELL`. */
  readonly shell?: boolean;
  /** Where bridge lines go. Production passes nothing (stdout). */
  readonly write?: LineWriter;
}

/** What each action requires the mirrored state to be. */
const ACTION_FROM: Record<SetupAction, readonly SetupState[]> = {
  plan: ['idle', 'planned', 'done', 'failed'],
  run: ['idle', 'planned', 'done', 'failed'],
  cancel: ['running'],
};

const NEXT_STATE: Record<SetupAction, SetupState> = {
  plan: 'planning',
  run: 'running',
  cancel: 'cancelling',
};

interface SetupStore {
  state: SetupState;
  plan: PlanEvent | undefined;
  steps: SetupStepState[];
  progress: ProgressEvent | undefined;
  failure: { code: SetupErrorCode; retryable: boolean } | undefined;
}

export function registerSetupRoutes(app: FastifyInstance, options: SetupRoutesOptions = {}): void {
  const shell = options.shell ?? shellIsListening(process.env);
  if (!shell) return;

  const env: BridgeEnv = { APUNTA_SHELL: '1' };
  const bridge = options.write === undefined ? { env } : { env, write: options.write };
  const store: SetupStore = {
    state: 'idle',
    plan: undefined,
    steps: [],
    progress: undefined,
    failure: undefined,
  };

  setSetupHandlers({
    onEvent: (raw) => {
      const parsed = SetupEventSchema.safeParse(raw);
      if (!parsed.success) {
        app.log.warn('ignoring a setup_event this build cannot read');
        return;
      }
      applyEvent(store, parsed.data);
    },
    onExit: (code) => {
      // For the log only: an exit status is never read as a reason.
      if (code !== 0) app.log.info({ code }, 'the setup process ended without success');
      applyExit(store);
    },
  });
  app.addHook('onClose', () => {
    setSetupHandlers(null);
  });

  app.get('/api/app/setup', (): SetupStatusResponse => {
    return {
      state: store.state,
      ...(store.plan === undefined ? {} : { plan: store.plan }),
      steps: store.steps.map((step) => ({ ...step })),
      ...(store.progress === undefined ? {} : { progress: store.progress }),
      ...(store.failure === undefined ? {} : { failure: { ...store.failure } }),
    };
  });

  for (const action of ['plan', 'run', 'cancel'] as const) {
    app.post(`/api/app/setup/${action}`, async (_request, reply) => {
      if (!ACTION_FROM[action].includes(store.state)) {
        throw rawHttpError(409, 'invalid_state', `Cannot ${action} while setup is ${store.state}.`, {
          state: store.state,
        });
      }
      store.state = NEXT_STATE[action];
      if (action !== 'cancel') {
        store.progress = undefined;
        store.failure = undefined;
      }
      if (action === 'run') {
        store.steps = store.steps.map((step) => ({ ...step, status: 'pending' }));
      }
      writeSetupRequest(action, bridge);
      return reply.code(202).send({ accepted: true });
    });
  }
}

function applyEvent(store: SetupStore, event: SetupEvent): void {
  switch (event.event) {
    case 'plan':
      store.plan = event;
      store.steps = event.steps.map((step) => ({
        id: step.id,
        status: step.needed ? 'pending' : 'skipped',
      }));
      if (store.state === 'planning') store.state = 'planned';
      return;
    case 'step': {
      const existing = store.steps.find((step) => step.id === event.id);
      if (existing === undefined) store.steps.push({ id: event.id, status: event.status });
      else existing.status = event.status;
      if (event.status === 'finished' || event.status === 'skipped') {
        if (store.progress?.id === event.id) store.progress = undefined;
      }
      return;
    }
    case 'progress':
      store.progress = event;
      return;
    case 'message':
      // The installer's status line is English only; the page words each
      // state itself from the step ids and the byte counts.
      return;
    case 'done':
      store.state = 'done';
      store.progress = undefined;
      store.failure = undefined;
      return;
    case 'failed':
      store.state = 'failed';
      store.progress = undefined;
      store.failure = { code: event.code, retryable: event.retryable };
      return;
  }
}

/**
 * The installer ended. If it said `done` or `failed` first, that already
 * settled the state; an exit while still planning or running means it died
 * without a word, which the page must still be able to retry from.
 */
function applyExit(store: SetupStore): void {
  if (store.state === 'planning' || store.state === 'running' || store.state === 'cancelling') {
    store.failure = {
      code: store.state === 'cancelling' ? 'cancelled' : 'unexpected',
      retryable: true,
    };
    store.state = 'failed';
    store.progress = undefined;
  }
}
