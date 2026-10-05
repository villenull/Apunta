import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { rawHttpError } from '../http/errors.js';
import { parseBody, parseQuery } from '../http/validate.js';
import { currentMaintenance, quiesceFromBridge, type MaintenanceOptions } from '../maintenance.js';
import { setQuiesceHandler } from '../shell-bridge.js';

/**
 * The quiescence channel (FD1): four named routes, and the one AM-215 adds.
 *
 * - `GET  /api/app/quiesce/wait` — held open by every mounted window, from
 *   mount. Registration **is** this request: a window that does not hold one is
 *   invisible to the server, so "no editor" must not become "no window".
 * - `POST /api/app/quiesce/report` — `ok`, or the blockers the flush found.
 * - `POST /api/app/quiesce` — the trigger, and the **same exported entry point**
 *   the shell's `quiesce{}` case calls. One function, two callers: not a
 *   test-only switch and not a fault-injection flag.
 * - `GET  /api/app/quiesce/status` — a read-only sibling, so P5.4 and the browser
 *   rows can wait for a precondition instead of assuming a timing.
 * - `POST /api/app/quiesce/close` — **added by AM-215**, the fifth route: the
 *   window's own last word as it goes, sent on `pagehide` with its tab identity.
 *   `{"clean":boolean}`, and only `clean` discharges anything (see
 *   `server/src/maintenance.ts`).
 *
 * **A server-mode route group, not an updater endpoint** (C-BRIDGE@1 rule 3):
 * these routes exist and are available in browser mode as well as shell mode,
 * ungated. What differs by mode is only what releases a successful quiesce's
 * maintenance state, and that belongs to the controller
 * (`server/src/maintenance.ts`), not to this file.
 *
 * **There is no SSE event and no `BroadcastChannel` message for any of it.** The
 * page talks only to the server over HTTP, and a `quiesceId` is the only thing
 * that ties a report to a quiesce.
 *
 * Named `app-quiesce.ts` so it cannot collide with P5.4's `app-update.ts`.
 */

const WaitQuerySchema = z.object({
  /**
   * The per-tab identity: generated once per tab and kept in `sessionStorage`, so
   * it survives a same-tab reload and is distinct across tabs and windows.
   * Absent only when `sessionStorage` could not be read, in which case the
   * window registers under a fresh per-connection id and can therefore never
   * supersede a retained record (FD1, FD13).
   */
  tab: z.string().min(1).max(200).optional(),
  /**
   * The per-**document** nonce: minted once per page load and never stored, so it
   * is distinct from every other document in this tab and in every other one. A
   * tab id names a *slot* — it survives a reload and Chromium's *Duplicate Tab*
   * copies it — so the record keeps the `doc` of the document that registered it
   * and only that document's clean claim, or clean report, can act on it. Absent
   * only if the client could not mint one, and a claim without one is the
   * fail-closed case: it touches nothing.
   */
  doc: z.string().min(1).max(200).optional(),
});

const ReportQuerySchema = z.object({
  tab: z.string().min(1).max(200).optional(),
  doc: z.string().min(1).max(200).optional(),
});

/**
 * AM-215's last word from a window that is going away.
 *
 * `clean` is the window's own claim — no unpersisted text and no recording — and
 * the **only** claim that discharges anything. A body without it is a dirty
 * window saying so, or a corrupted send; both leave FD13's obligation alone, and
 * so does a send that never arrives.
 */
const CloseBodySchema = z.object({ clean: z.boolean() });

const ReportBodySchema = z.object({
  quiesceId: z.string().min(1),
  ok: z.boolean(),
  /**
   * The three outcomes `NoteView.flush()` already has (FD8). The controller
   * narrows them to that closed list rather than trusting them: a report is a
   * claim about what a window holds, and a claim the server cannot place is a
   * claim it will not act on.
   */
  blockers: z.array(z.string().max(64)).max(8).default([]),
});

/** The trigger takes no field (FD1), and a body carrying one is a 400. */
const TriggerBodySchema = z.object({}).strict();

/**
 * Why the refused report says what it says, in a literal, and the machine reason
 * beside it.
 *
 * No catalogue key, deliberately: this card is licensed exactly one key per
 * catalogue (`errors.maintenance`, the 503 the owner can see), and this 409 is
 * machine-to-machine — the reporter ignores the body's words and re-arms on the
 * status code alone, so a sentence nobody reads is not a sentence to key. The
 * count is on `maintenance.refused()` and in the log line instead.
 *
 * The code stays `conflict` — the vocabulary is the closed one in
 * `shared/src/errors.ts` and this card may add exactly one member to it — so the
 * reason it was refused rides `details`, which `ApiErrorSchema` already carries:
 * `quiesce_not_in_flight` for a stale, foreign or absent `quiesceId`, and
 * `window_not_registered` for a window this quiesce never asked. Those are the
 * controller's own `ReportOutcome` words, so nothing has to parse the sentence.
 */
const REPORT_REFUSED =
  'This window reported against a quiesce that is not in flight, or it is not registered in it.';

export function registerMaintenanceRoutes(app: FastifyInstance, options: MaintenanceOptions = {}): void {
  const maintenance = currentMaintenance();
  // C-BRIDGE@1 rule 2's inbound half: the shell's `quiesce{}` case runs the very
  // function `POST /api/app/quiesce` below calls. Injected rather than imported by
  // `shell-bridge.ts`, which must stay free of runtime imports.
  setQuiesceHandler(quiesceFromBridge);
  // The refusal hook is registered earlier in `buildApp` and reads its language
  // from here, because this is the call site that holds the database (the
  // pattern `registerErrorHandler` uses for the same reason, C-LANG@1 rule 3).
  if (options.locale !== undefined) maintenance.useLocale(options.locale);

  /**
   * Registration and the flush request, in one held-open request.
   *
   * The disconnect is watched on the **response**, not the request, for the
   * reason `http/sse.ts` gives: since Node 16 `request.raw`'s 'close' means the
   * body was read, which would mark every window disconnected within
   * milliseconds of it registering. `writableEnded` tells "the answer was
   * written" from "the client went away".
   */
  app.get('/api/app/quiesce/wait', async (request, reply) => {
    const query = parseQuery(WaitQuerySchema, request.query);
    const windowId = maintenance.registerWindow(query.tab ?? null, query.doc ?? null);
    reply.raw.on('close', () => {
      if (reply.raw.writableEnded) return;
      maintenance.disconnect(windowId);
    });
    return maintenance.holdFor(windowId);
  });

  app.post('/api/app/quiesce/report', async (request) => {
    const query = parseQuery(ReportQuerySchema, request.query);
    const input = parseBody(ReportBodySchema, request.body);
    const outcome = maintenance.report({
      quiesceId: input.quiesceId,
      tabId: query.tab ?? null,
      doc: query.doc ?? null,
      ok: input.ok,
      blockers: input.blockers,
    });
    // A report that does not belong to the quiesce in flight is refused,
    // counted, and never applied (FD2(c)) — otherwise the ignored report from a
    // timed-out quiesce would satisfy the next one, and the text it was
    // protecting would be lost with both rows green. Which of the two reasons it
    // was rides `details`, so nothing has to parse the sentence.
    if (outcome !== 'accepted') {
      throw rawHttpError(409, 'conflict', REPORT_REFUSED, { reason: outcome });
    }
    return { accepted: true };
  });

  /**
   * AM-215's last word from a window that is going away.
   *
   * Sent on `pagehide` with the tab identity and the per-document nonce in the
   * query string, beside the registration and the report, because that is where
   * this channel's identity already lives. It answers nothing and reports nothing
   * back: the browser is leaving and cannot read an answer, and the only thing
   * that matters is whether the send arrives at all. A `clean` claim from the
   * document that holds the record discharges it; `dirty`, a claim from a
   * *different* document, an absent body, an unknown tab and a send that never
   * lands all leave FD13's obligation in place.
   */
  app.post('/api/app/quiesce/close', async (request, reply) => {
    const query = parseQuery(ReportQuerySchema, request.query);
    const input = parseBody(CloseBodySchema, request.body);
    maintenance.closeWindow(query.tab ?? null, query.doc ?? null, input.clean);
    return reply.code(204).send();
  });

  app.post('/api/app/quiesce', async (request) => {
    parseBody(TriggerBodySchema, request.body ?? {});
    const outcome = await maintenance.quiesce();
    return {
      quiesceId: outcome.quiesceId,
      ok: outcome.ok,
      blockers: [...outcome.blockers],
    };
  });

  app.get('/api/app/quiesce/status', () => maintenance.status());
}
