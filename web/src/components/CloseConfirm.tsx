import type { MessageKey } from '@apunta/shared';
import { useEffect, useRef, useState } from 'react';

import { ApiRequestError, requestJson, requestVoid } from '../api/client.js';
import { updaterMayBeAvailable } from '../api/update.js';
import type { Translate } from '../lib/i18n.js';
import { discardOwnRecording, isRecordingActive } from '../lib/maintenance.js';
import { Dialog } from './Dialog.js';

/** How often the dialog asks the shell-mode server whether a close was refused. */
const POLL_MS = 1000;

/**
 * What the native close left behind (C-BRIDGE@1, `GET /api/app/update`'s
 * `close` member). `blockers` are the server's own names, which this renderer
 * is the one place that gives words to — the shell only acts on the boolean.
 */
interface CloseStatus {
  readonly state: 'none' | 'requested' | 'refused';
  readonly blockers: readonly string[];
}

const NO_CLOSE: CloseStatus = { state: 'none', blockers: [] };

/** Only the `close` member is read; the rest of the document belongs to the update notice. */
const closeParser = {
  parse(value: unknown): CloseStatus {
    const close = (value as { close?: { state?: unknown; blockers?: unknown } } | null)?.close;
    if (close === undefined || close === null) return NO_CLOSE;
    const state = close.state === 'requested' || close.state === 'refused' ? close.state : 'none';
    const blockers = Array.isArray(close.blockers)
      ? close.blockers.filter((item): item is string => typeof item === 'string')
      : [];
    return { state, blockers };
  },
};

/** The sentence for each blocker the server can name. Anything else gets the generic line. */
const BLOCKER_TEXT: Record<string, MessageKey> = {
  save_error: 'closeConfirm.blocker.save_error',
  conflict: 'closeConfirm.blocker.conflict',
  unsaved_text: 'closeConfirm.blocker.unsaved_text',
  recording: 'closeConfirm.blocker.recording',
  save: 'closeConfirm.blocker.save',
  transcription: 'closeConfirm.blocker.transcription',
  draft: 'closeConfirm.blocker.draft',
  refine: 'closeConfirm.blocker.refine',
  plan: 'closeConfirm.blocker.plan',
  briefing: 'closeConfirm.blocker.briefing',
  brainstorm: 'closeConfirm.blocker.brainstorm',
  import: 'closeConfirm.blocker.import',
  restore: 'closeConfirm.blocker.restore',
  backup: 'closeConfirm.blocker.backup',
  no_response: 'closeConfirm.blocker.no_response',
};

function postDecision(confirm: boolean): Promise<void> {
  return requestVoid('/api/app/close/decision', { method: 'POST', body: { confirm } });
}

/**
 * The window-close confirmation (C-UPD@1, E1).
 *
 * The desktop shell asks the server for a canonical quiesce when the window's
 * close button is pressed. If it is refused the window stays open and the
 * server records `close.state: 'refused'` with the blockers; this component
 * notices that by polling `GET /api/app/update`, says what to finish, and
 * answers through `POST /api/app/close/decision`. Discarding is offered for
 * exactly one thing: **this window's own** running recording. Unsaved typed
 * text and another window's work are only ever named, never discarded.
 *
 * Browser-mode discovery prevents polling an endpoint that cannot exist there.
 */
export function CloseConfirm({ t }: { readonly t: Translate }): React.JSX.Element | null {
  const [close, setClose] = useState<CloseStatus>(NO_CLOSE);
  const [sending, setSending] = useState(false);
  const alive = useRef(true);

  useEffect(() => {
    if (!updaterMayBeAvailable()) return;
    alive.current = true;
    const controller = new AbortController();
    let timer: number | undefined;

    async function tick(): Promise<void> {
      let again = true;
      try {
        const next = await requestJson('/api/app/update', closeParser, { signal: controller.signal });
        if (alive.current) setClose((current) => (sameStatus(current, next) ? current : next));
      } catch (thrown) {
        if (controller.signal.aborted) return;
        // Not a shell window: there is nothing to ask, now or later.
        if (thrown instanceof ApiRequestError && thrown.status === 404) again = false;
      }
      if (again && alive.current) timer = window.setTimeout(() => void tick(), POLL_MS);
    }
    void tick();

    return () => {
      alive.current = false;
      controller.abort();
      clearTimeout(timer);
    };
  }, []);

  if (close.state !== 'refused') return null;

  const ownRecording = isRecordingActive() && close.blockers.includes('recording');

  async function decide(confirm: boolean, discard: boolean): Promise<void> {
    if (sending) return;
    setSending(true);
    // Order matters: the recording is gone, and its flag cleared, before the
    // server is told to run the fresh canonical check.
    if (discard) discardOwnRecording();
    try {
      await postDecision(confirm);
    } catch {
      // A 409 means the close is no longer waiting on an answer; the next poll
      // says what is true now.
    }
    if (!alive.current) return;
    setSending(false);
    setClose(NO_CLOSE);
  }

  const lines = [...new Set(close.blockers)];

  return (
    <Dialog
      title={t('closeConfirm.title')}
      onClose={() => void decide(false, false)}
      className="modal card close-confirm"
      testId="close-confirm"
    >
      <div className="small note-meta modal-body">
        <p>{t('closeConfirm.intro')}</p>
        <ul data-testid="close-confirm-blockers">
          {lines.map((name) => (
            <li key={name}>{t(BLOCKER_TEXT[name] ?? 'closeConfirm.blocker.other')}</li>
          ))}
        </ul>
      </div>
      <div className="modal-actions">
        <button
          type="button"
          className="btn"
          data-testid="close-confirm-cancel"
          disabled={sending}
          onClick={() => void decide(false, false)}
        >
          {t('closeConfirm.keepOpen')}
        </button>
        {ownRecording ? (
          <button
            type="button"
            className="btn btn-danger"
            data-testid="close-confirm-discard"
            disabled={sending}
            onClick={() => void decide(true, true)}
          >
            {t('closeConfirm.discardRecording')}
          </button>
        ) : (
          <button
            type="button"
            className="btn"
            data-testid="close-confirm-retry"
            disabled={sending}
            onClick={() => void decide(true, false)}
          >
            {t('closeConfirm.checkAgain')}
          </button>
        )}
      </div>
    </Dialog>
  );
}

function sameStatus(a: CloseStatus, b: CloseStatus): boolean {
  return (
    a.state === b.state &&
    a.blockers.length === b.blockers.length &&
    a.blockers.every((n, i) => n === b.blockers[i])
  );
}
