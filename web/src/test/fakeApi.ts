import {
  instantToLocalDay,
  type BrainstormMessage,
  type ChatMessage,
  type ClaudeImportReport,
  type ImportBatch,
  type HealthResponse,
  type Note,
  type NoteFormat,
  type Patient,
  type PatientGroup,
  type PatientListItem,
  type PlanGoal,
  PUBLISHED_REFUSAL,
  STANDARD_PROGRESS_FORMAT,
  type SessionBrief,
  type SessionBriefContent,
  type SetupStatusResponse,
  type TreatmentPlan,
} from '@apunta/shared';
import { vi } from 'vitest';

/**
 * A stand-in for the JSON API, small enough to read in one sitting.
 *
 * Component tests want the screens' real behaviour — publish locks the body,
 * deleting a note reloads the counts — without a server. This keeps the same
 * invariants the routes enforce (`server/src/routes/notes.ts`), so a test that
 * passes here is not passing against a friendlier API than production.
 *
 * Every name in the fixtures comes from the prototype's sample practice
 * (CLAUDE.md hard rule 2).
 */
export interface FakeApiState {
  patients: PatientListItem[];
  /** Named lists patients can be filed under, in creation order (owner, 2026-09-27). */
  groups: PatientGroup[];
  notes: Note[];
  formats: NoteFormat[];
  /** Refine-chat turns, across every note. */
  messages: ChatMessage[];
  /** Brainstorm turns, across every patient (M12). */
  brainstorm: BrainstormMessage[];
  /** Treatment plan versions, newest version last (M9). */
  plans: TreatmentPlan[];
  goals: PlanGoal[];
  briefs: SessionBrief[];
  /** The form fields each `POST /api/import/claude/run` sent, in order (M11). */
  imports: Record<string, string>[];
  /** Past import runs (`GET /api/import/batches`); undo removes one. */
  batches: ImportBatch[];
  /** The open key → JSON settings map (`GET|PUT /api/settings`). */
  settings: Record<string, unknown>;
}

export interface FakeApi {
  state: FakeApiState;
  /** "GET /api/patients", in order, for asserting what a screen actually sent. */
  calls: string[];
}

const NOW = '2026-08-22T12:00:00.000Z';

/**
 * Ids are UUIDv7-shaped because the shared schemas validate them: a fixture
 * with a readable id like "note-1" fails at the client boundary, which is
 * exactly what that validation is for.
 */
let idCounter = 0;
export function fakeId(): string {
  idCounter += 1;
  return `0198c0f0-0000-7000-8000-${String(idCounter).padStart(12, '0')}`;
}

export function makePatient(name: string, overrides: Partial<PatientListItem> = {}): PatientListItem {
  return {
    id: fakeId(),
    name,
    identifier: null,
    created_at: '2026-07-01T09:00:00.000Z',
    archived_at: null,
    group_id: null,
    group_position: null,
    note_count: 0,
    ...overrides,
  };
}

export function makeFormat(
  name: string,
  sections: string[],
  overrides: Partial<NoteFormat> = {},
): NoteFormat {
  return {
    id: fakeId(),
    name,
    sections,
    instructions: '',
    source: 'manual',
    locale: 'en',
    created_at: '2026-07-01T09:00:00.000Z',
    ...overrides,
  };
}

export function makeChatMessage(
  noteId: string,
  role: ChatMessage['role'],
  text: string,
  refQuote: string | null = null,
): ChatMessage {
  return {
    id: fakeId(),
    note_id: noteId,
    role,
    text,
    ref_quote: refQuote,
    created_at: '2026-08-08T09:00:00.000Z',
  };
}

export function makeBrainstormMessage(
  patientId: string,
  role: BrainstormMessage['role'],
  text: string,
): BrainstormMessage {
  return {
    id: fakeId(),
    patient_id: patientId,
    role,
    text,
    created_at: '2026-08-08T09:00:00.000Z',
  };
}

export function makeNote(patientId: string, overrides: Partial<Note> = {}): Note {
  return {
    id: fakeId(),
    patient_id: patientId,
    format_id: fakeId(),
    title: 'Progress note',
    status: 'draft',
    revision: 0,
    content: 'Subjective: Patient reports improved sleep since last session.',
    locale: 'en',
    created_at: '2026-08-08T09:00:00.000Z',
    updated_at: '2026-08-08T09:00:00.000Z',
    published_at: null,
    ...overrides,
  };
}

export function makePlan(patientId: string, overrides: Partial<TreatmentPlan> = {}): TreatmentPlan {
  return {
    id: fakeId(),
    patient_id: patientId,
    version: 1,
    status: 'draft',
    created_at: '2026-08-01T09:00:00.000Z',
    activated_at: null,
    review_due: null,
    review_interval_days: 90,
    diagnoses: [],
    presenting_problem: '',
    strengths: '',
    modality: '',
    frequency: '',
    discharge_criteria: '',
    effective_from: null,
    effective_to: null,
    clinician_name: '',
    clinician_credential: '',
    clinician_licence: '',
    clinician_npi: '',
    attested_at: null,
    attestation_text: '',
    client_participation: 'not_recorded',
    client_participation_on: null,
    client_participation_note: '',
    superseded_by: null,
    ...overrides,
  };
}

export function makeGoal(planId: string, overrides: Partial<PlanGoal> = {}): PlanGoal {
  const status = overrides.status ?? 'accepted';
  return {
    id: fakeId(),
    plan_id: planId,
    ordinal: 0,
    statement: 'John sleeps well enough to get through a workday.',
    objectives: [],
    interventions: [],
    target_date: null,
    status,
    source: status === 'proposed' ? 'model_suggested' : 'clinician_authored',
    evidence: [],
    carried_from_goal_id: null,
    created_at: '2026-08-01T09:05:00.000Z',
    accepted_at: status === 'proposed' ? null : '2026-08-01T09:05:00.000Z',
    ...overrides,
  };
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/**
 * An SSE body, streamed one frame at a time.
 *
 * A single pre-built string would arrive as one chunk and the reader would
 * never see the draft assembling — which is the thing the capture screen
 * exists to show, so it is the thing the tests have to be able to observe.
 */
function sse(frames: readonly { event: string; data: unknown }[]): Response {
  const encoder = new TextEncoder();
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      const frame = frames[index];
      if (frame === undefined) {
        controller.close();
        return;
      }
      index += 1;
      // A real macrotask between frames, not just separate enqueues: enqueued
      // synchronously, the whole stream reaches the reader as one burst on a
      // fast machine, React batches it into a single render, and the
      // assembling-draft state the capture tests assert on never exists in
      // the DOM (found on M10's Linux machine).
      await new Promise((resolve) => setTimeout(resolve, 1));
      controller.enqueue(encoder.encode(`event: ${frame.event}\ndata: ${JSON.stringify(frame.data)}\n\n`));
    },
  });
  return new Response(body, { status: 200, headers: { 'content-type': 'text/event-stream' } });
}

/**
 * What `POST /api/generate` streams back, mirroring the server: a status, one
 * `token` event per section carrying *decoded* text, then the saved note.
 * The section bodies are derived from the request so a test can assert that
 * what streamed is what was saved.
 */
export function draftFrames(
  sections: readonly string[],
  typed: string,
  note: Note,
  emptySections: readonly string[] = [],
): { event: string; data: unknown }[] {
  const frames: { event: string; data: unknown }[] = [
    { event: 'status', data: { stage: 'drafting', message: 'Drafting the note…' } },
  ];
  for (const section of sections) {
    if (emptySections.includes(section)) continue;
    for (const word of `${section} from: ${typed}`.split(' ')) {
      frames.push({ event: 'token', data: { section, text: `${word} ` } });
    }
  }
  frames.push({ event: 'note', data: { note, empty_sections: [...emptySections] } });
  return frames;
}

/** `sectionsToText`, as the server writes it: an empty body keeps its header. */
export function draftContent(
  sections: readonly string[],
  typed: string,
  emptySections: readonly string[] = [],
): string {
  return sections
    .map((section) =>
      emptySections.includes(section) ? `${section}:` : `${section}: ${section} from: ${typed}`,
    )
    .join('\n\n');
}

/**
 * What `POST /api/notes/:id/chat` does, mirroring the server closely enough to
 * be worth testing against: a rewrite when she asks for one, an answer when
 * she asks a question, and the prototype's refusal on a published note.
 *
 * The published lock is applied here, not left to the caller, because that is
 * where the real server applies it — a fake that let a published note be
 * rewritten would make every published-lock assertion prove nothing.
 */
export function fakeRefine(note: Note, message: string): { reply: string; content: string | null } {
  const outcome = message.includes('?')
    ? { reply: "Based on the note, that detail isn't currently in the note.", content: null }
    : {
        reply: 'Shortened the Plan section.',
        content: note.content.replace(/Plan:.*$/s, 'Plan: Continue weekly sessions and grounding exercises.'),
      };

  // The lock, applied the way the server applies it: a rewrite of a published
  // note is discarded, and so is the reply describing it.
  if (note.status === 'published' && outcome.content !== null) {
    return { reply: PUBLISHED_REFUSAL, content: null };
  }
  return outcome;
}

const HEALTHY: HealthResponse = {
  ok: true,
  version: '0.0.0',
  fakeAi: true,
  bundled: false,
  db: { path: '/tmp/apunta/apunta.db', migrationLevel: 1 },
  ollama: { reachable: true, model: 'fake-llm', modelPresent: true },
  whisper: {
    binaryPresent: true,
    modelPresent: true,
    binary: 'fake-whisper',
    model: 'fake-whisper-model',
  },
  // The fake stack runs on whatever CI runs on, so disk encryption is a
  // question about a Mac that is not here. `not_applicable` is the honest
  // answer and the one that keeps the health payload honest in fake mode.
  fileVault: { state: 'not_applicable', detail: 'disk encryption is not checked on linux' },
};

/** `GET /api/backup` in fake mode: a data-dir destination and no archives yet. */
const BACKUP_STATUS = {
  directory: '/tmp/apunta/backups',
  destination: { risk: 'data-dir' as const, path: '/tmp/apunta/backups', warning: '' },
  last_backup_at: null,
  last_backup_file: null,
  last_backup_error: null,
  stale: true,
  last_verified_restore: null,
  backups: [],
  counts: { patients: 0, notes: 0 },
  oldest_note_at: null,
  db_bytes: 40960,
  pending_restore: false,
};

function apiError(status: number, code: string, message: string, details?: unknown): Response {
  return json(details === undefined ? { error: code, message } : { error: code, message, details }, status);
}

export interface FakeApiOptions {
  /** Overrides for `GET /api/health` — the AI banner reads this. */
  health?: Partial<HealthResponse>;
  /**
   * The shell's first-run setup mirror (`GET /api/app/setup`). Absent, the
   * route is a 404, as in a browser tab. The object is read on every request,
   * so a test moves setup along by changing it; each POST calls `onAction`.
   */
  setup?: { status: SetupStatusResponse; onAction?: (action: string) => void };
  /**
   * Make `GET /api/patient-groups` fail (F5). The point of the option is that a
   * failed group fetch has to be *distinguishable* from an empty one, and there
   * is no other way to reach that state in a test.
   */
  groupsError?: { status: number; code: string; message: string };
  /** Overrides for `GET /api/backup` — the Settings backup card reads this. */
  backup?: Record<string, unknown>;
  /** Structured note outcome for a refine stream, without inferring from prose. */
  chatOutcome?: { outcome: 'applied' | 'partial' | 'unchanged' | 'withheld'; reason: string | null };
  /** Make `POST /api/notes/:id/chat` fail inside the stream, as the server does. */
  chatError?: { code: string; message: string };
  brainstormError?: { code: string; message: string };
  /**
   * Make `POST /api/generate` fail *inside* the stream, the way the server
   * does once the 200 is committed — "Ollama is not running" is an `error`
   * event, never an HTTP status.
   */
  generateError?: { code: string; message: string };
  /** The same, for `POST /api/transcribe` — "whisper is not installed" (M5). */
  transcribeError?: { code: string; message: string };
  /** What `POST /api/transcribe/preview` returns while she is still speaking. */
  previewText?: string;
  /** The same, one per call in order (the last repeats), for a preview that grows. */
  previewTexts?: string[];
  /** What `POST /api/transcribe/dictation` hands back for a clip spoken into the chat. */
  dictationText?: string;
  /** Make it fail instead — whisper absent, say — with the server's status and message. */
  dictationError?: { status: number; code: string; message: string };
  /** What `POST /api/import/claude/preview` answers for any upload (M11); the run answers it with a batch id. */
  importReport?: ClaudeImportReport;
  /** Make `POST /api/patients/:id/plan/suggest` fail inside the stream. */
  suggestError?: { code: string; message: string };
  /**
   * End a suggestion run with nothing to show. `dropped` separates the two
   * ways that happens: the model proposed nothing (0), or it proposed goals
   * the server could not trace to a note and discarded them.
   */
  suggestNothing?: { dropped: number };
  /** Make `POST /api/patients/:id/prep` fail inside the stream. */
  prepError?: { code: string; message: string };
}

const EMPTY_IMPORT_REPORT: ClaudeImportReport = {
  batch_id: null,
  source: 'assistant',
  cutoff: '2026-07-01',
  patients: [],
  patients_to_create: 0,
  notes: 0,
  unmatched_names: [],
  already_imported: 0,
  sessions_without_body: 0,
  skipped: [],
  totals: { conversations: 0, messages: 0, unreadable: 0, abandoned: 0, attachments: 0 },
  date_range: { from: null, to: null },
};

/**
 * jsdom has no Web Locks, and the primary-window lock fails closed without
 * them — so without a shim every jsdom render of `<App />` would sit behind
 * the unsupported-browser blocker. Single-window tests behave like one
 * supported browser window instead: the first exclusive `request` is granted
 * and stays held until its callback returns (the hold is released by
 * resolving the inner promise, exactly like the real lock), while an
 * `ifAvailable` probe made while it is held gets `null`. Waiting exclusive
 * requests queue until the holder releases, and honour an abort signal.
 * There is no production fallback — this lives in the test harness only.
 */
export function installFakeWebLocks(): void {
  let held = false;
  const queue: Array<() => void> = [];

  const pump = (): void => {
    if (held) return;
    const next = queue.shift();
    if (next === undefined) return;
    held = true;
    next();
  };

  const abortError = (): Error => new DOMException('Aborted', 'AbortError');

  interface FakeLockInfo {
    readonly name: string;
  }

  async function request(
    name: string,
    optionsOrCallback:
      | { mode?: string; ifAvailable?: boolean; signal?: AbortSignal }
      | ((lock: FakeLockInfo | null) => Promise<void>),
    maybeCallback?: (lock: FakeLockInfo | null) => Promise<void>,
  ): Promise<void> {
    const options = typeof optionsOrCallback === 'function' ? {} : optionsOrCallback;
    const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback;
    if (callback === undefined) return;
    const signal = options.signal;
    if (signal?.aborted === true) throw abortError();

    if (options.ifAvailable === true) {
      if (held) {
        await callback(null);
        return;
      }
      held = true;
      try {
        await callback({ name });
      } finally {
        held = false;
        pump();
      }
      return;
    }

    // Exclusive and waiting: queued until the holder releases, abortable.
    await new Promise<void>((resolve, reject) => {
      const run = (): void => {
        if (signal !== undefined) signal.removeEventListener('abort', onAbort);
        void (async () => {
          try {
            await callback({ name });
            resolve();
          } catch (error) {
            reject(error);
          } finally {
            held = false;
            pump();
          }
        })();
      };
      const onAbort = (): void => {
        if (signal === undefined) return;
        const index = queue.indexOf(run);
        if (index !== -1) queue.splice(index, 1);
        reject(abortError());
      };
      queue.push(run);
      signal?.addEventListener('abort', onAbort, { once: true });
      pump();
    });
  }

  Object.defineProperty(globalThis.navigator, 'locks', {
    configurable: true,
    value: { request },
  });
}

/** Installs a `fetch` that answers the endpoints the SPA uses, and returns its state. */
export function installFakeApi(initial: Partial<FakeApiState> = {}, options: FakeApiOptions = {}): FakeApi {
  installFakeWebLocks();
  let previewCalls = 0;
  const state: FakeApiState = {
    patients: [],
    groups: [],
    notes: [],
    formats: [],
    messages: [],
    brainstorm: [],
    plans: [],
    goals: [],
    briefs: [],
    imports: [],
    batches: [],
    settings: {},
    ...initial,
  };
  const calls: string[] = [];
  let sequence = 0;

  function stamp(): string {
    sequence += 1;
    return new Date(new Date(NOW).getTime() + sequence * 1000).toISOString();
  }

  function noteById(id: string): Note | undefined {
    return state.notes.find((note) => note.id === id);
  }

  function patientById(id: string): PatientListItem | undefined {
    return state.patients.find((patient) => patient.id === id);
  }

  function replaceNote(updated: Note): Note {
    state.notes = state.notes.map((note) => (note.id === updated.id ? updated : note));
    return updated;
  }

  vi.stubGlobal(
    'fetch',
    vi.fn(async (path: string, init: RequestInit = {}): Promise<Response> => {
      const method = init.method ?? 'GET';
      calls.push(`${method} ${path}`);
      // A multipart upload (M5) has a FormData body, not a JSON string.
      const body: Record<string, unknown> =
        typeof init.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : {};

      if (path === '/api/health') return json({ ...HEALTHY, ...options.health });

      if (options.setup !== undefined && path === '/api/app/setup' && method === 'GET') {
        return json(options.setup.status);
      }
      if (options.setup !== undefined && path.startsWith('/api/app/setup/') && method === 'POST') {
        options.setup.onAction?.(path.slice('/api/app/setup/'.length));
        return json({ accepted: true }, 202);
      }

      if (path === '/api/backup' && method === 'GET') return json({ ...BACKUP_STATUS, ...options.backup });

      if (path === '/api/backup' && method === 'POST') {
        const encrypted = typeof body['passphrase'] === 'string' && body['passphrase'] !== '';
        return json(
          {
            file: {
              filename: 'apunta-backup-2026-08-24.zip',
              path: '/tmp/apunta/backups/apunta-backup-2026-08-24.zip',
              bytes: 65_536,
              created_at: NOW,
              encrypted,
            },
            manifest: {
              format: 1,
              app_version: '0.0.0',
              generated_at: NOW,
              migration_level: 2,
              sqlite_version: '3.53.4',
              db_bytes: 40_960,
              db_sha256: 'f'.repeat(64),
              integrity_check: 'ok',
              counts: { patients: 2, notes: 4 },
              encrypted,
            },
            destination: BACKUP_STATUS.destination,
            pruned: [],
          },
          201,
        );
      }

      if (path === '/api/backup/restore' && method === 'POST') {
        return json({
          staged: true,
          manifest: {
            format: 1,
            app_version: '0.0.0',
            generated_at: NOW,
            migration_level: 2,
            sqlite_version: '3.53.4',
            db_bytes: 40_960,
            db_sha256: 'f'.repeat(64),
            integrity_check: 'ok',
            counts: { patients: 2, notes: 4 },
            encrypted: false,
          },
          safety_copy: '/tmp/apunta/apunta.db.before-restore-2026-08-24',
        });
      }

      if (path === '/api/backup/restore' && method === 'DELETE') return new Response(null, { status: 204 });

      if (path === '/api/backup/verified' && method === 'POST') {
        return json({ last_verified_restore: NOW });
      }

      if (path === '/api/generate' && method === 'POST') {
        if (options.generateError) return sse([{ event: 'error', data: options.generateError }]);
        const format = state.formats.find((candidate) => candidate.id === body['format_id']);
        if (!format) return apiError(404, 'not_found', 'Note format not found');
        const typed = String(body['typed_notes'] ?? '');
        const empty = format.sections.slice(-1).filter(() => /grief/i.test(typed));
        const note = makeNote(String(body['patient_id']), {
          format_id: format.id,
          title: format.name,
          content: draftContent(format.sections, typed, empty),
          created_at: stamp(),
          updated_at: stamp(),
        });
        state.notes = [note, ...state.notes];
        return sse(draftFrames(format.sections, typed, note, empty));
      }

      if (path === '/api/settings') {
        if (method === 'PUT') state.settings = { ...state.settings, ...body };
        return json(state.settings);
      }

      if (path === '/api/transcribe/preload' && method === 'POST') return new Response(null, { status: 204 });

      /**
       * `POST /api/transcribe` (M5): a multipart upload, then the *same*
       * frames `/api/generate` streams, prefixed by whisper's progress —
       * because on the server it is literally the same drafting code.
       */
      // The live preview during a recording: provisional text, no side
      // effects. `options.previewText` lets a test say what came back.
      if (path === '/api/transcribe/preview' && method === 'POST') {
        const texts = options.previewTexts;
        const text =
          texts !== undefined && texts.length > 0
            ? (texts[Math.min(previewCalls, texts.length - 1)] as string)
            : (options.previewText ?? 'provisional words so far');
        previewCalls += 1;
        return json({ text, seconds: 3 });
      }

      // A clip dictated into the refine chat: text back, nothing created.
      if (path === '/api/transcribe/dictation' && method === 'POST') {
        const failure = options.dictationError;
        if (failure) return apiError(failure.status, failure.code, failure.message);
        return json({
          text: options.dictationText ?? 'Add that he is sleeping better this week.',
          seconds: 3,
        });
      }

      if (path === '/api/transcribe' && method === 'POST') {
        if (options.transcribeError) return sse([{ event: 'error', data: options.transcribeError }]);
        const form = init.body as FormData;
        const format = state.formats.find((candidate) => candidate.id === form.get('format_id'));
        if (!format) return apiError(404, 'not_found', 'Note format not found');
        const transcript = 'Sleeping better since the wind-down routine, fewer intrusive thoughts.';
        const note = makeNote(String(form.get('patient_id')), {
          format_id: format.id,
          title: format.name,
          content: draftContent(format.sections, transcript),
          created_at: stamp(),
          updated_at: stamp(),
        });
        state.notes = [note, ...state.notes];
        return sse([
          { event: 'progress', data: { fraction: 0.5, message: 'Transcribing…' } },
          { event: 'progress', data: { fraction: 1, message: 'Transcribing…' } },
          ...draftFrames(format.sections, transcript, note),
        ]);
      }

      if (path === '/api/formats' && method === 'GET') return json({ formats: state.formats });

      if (path === '/api/formats/standard' && method === 'POST') {
        const format = makeFormat(STANDARD_PROGRESS_FORMAT.name, [...STANDARD_PROGRESS_FORMAT.sections], {
          instructions: 'The owner’s progress-note instructions (server-side in the real app).',
        });
        state.formats = [...state.formats, format];
        return json(format, 201);
      }

      if (path === '/api/formats' && method === 'POST') {
        const format = makeFormat(String(body['name']), body['sections'] as string[], {
          source: (body['source'] as NoteFormat['source'] | undefined) ?? 'manual',
        });
        state.formats = [...state.formats, format];
        return json(format, 201);
      }

      // --- M6: reading a format out of an upload -------------------------
      //
      // Multipart, so `init.body` is a `FormData` and the JSON branch above
      // saw nothing. The answer is derived from the uploaded file's *text*,
      // not from a constant, so a test that asserts on the chips is asserting
      // that the file was read — the same reason the real fake provider scans
      // headings before falling back.
      if (path === '/api/formats/detect' && method === 'POST') {
        const form = init.body instanceof FormData ? init.body : new FormData();
        const uploaded = form.getAll('files').filter((entry): entry is File => entry instanceof File);
        if (uploaded.length === 0) return apiError(400, 'bad_request', 'Choose a file.');

        const text = (await Promise.all(uploaded.map((file) => file.text()))).join('\n');
        if (/^%PDF|^\x89PNG/.test(text)) {
          return apiError(400, 'bad_request', "That's a picture. Apunta can't read text out of an image.");
        }
        const found = text
          .split('\n')
          .map((line) => /^([A-Z][A-Za-z /'-]{2,40}):?\s*$/.exec(line.trim())?.[1])
          .filter((heading): heading is string => heading !== undefined);
        const sections = found.length > 0 ? found : ['Subjective', 'Objective', 'Assessment', 'Plan'];
        return json({
          name: /intake/i.test(text) ? 'Intake note' : 'Progress note',
          sections,
          files: uploaded.length,
          truncated: false,
        });
      }

      const formatMatch = /^\/api\/formats\/([^/]+)$/.exec(path);
      if (formatMatch && method === 'PATCH') {
        const formatId = formatMatch[1] ?? '';
        const format = state.formats.find((candidate) => candidate.id === formatId);
        if (!format) return apiError(404, 'not_found', 'Note format not found');
        const updated: NoteFormat = {
          ...format,
          ...(typeof body['name'] === 'string' ? { name: body['name'] } : {}),
          ...(Array.isArray(body['sections']) ? { sections: body['sections'] as string[] } : {}),
          ...(typeof body['instructions'] === 'string' ? { instructions: body['instructions'] } : {}),
        };
        state.formats = state.formats.map((candidate) => (candidate.id === formatId ? updated : candidate));
        return json(updated);
      }

      if (path === '/api/patient-groups' && method === 'GET') {
        if (options.groupsError) {
          return apiError(options.groupsError.status, options.groupsError.code, options.groupsError.message);
        }
        // Her order, then the order she made them in — the same rule the
        // server's ORDER BY expresses, so a drag in fake mode behaves as it
        // will against the database (migration 011).
        const groups = [...state.groups].sort((left, right) => {
          if (left.position === null && right.position !== null) return 1;
          if (right.position === null && left.position !== null) return -1;
          if (left.position !== right.position) return (left.position ?? 0) - (right.position ?? 0);
          return left.created_at.localeCompare(right.created_at);
        });
        return json({ groups });
      }

      if (path === '/api/patient-groups' && method === 'POST') {
        const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
        if (name === '') return apiError(400, 'validation', 'A group needs a name');
        if (state.groups.some((group) => group.name.toLowerCase() === name.toLowerCase())) {
          return apiError(409, 'conflict', 'You already have a group with that name.');
        }
        const group: PatientGroup = { id: fakeId(), name, created_at: stamp(), position: null };
        state.groups = [...state.groups, group];
        return json(group, 201);
      }

      const groupMatch = /^\/api\/patient-groups\/([^/]+)$/.exec(path);
      if (groupMatch && method === 'PATCH') {
        const group = state.groups.find((candidate) => candidate.id === groupMatch[1]);
        if (!group) return apiError(404, 'not_found', 'Group not found');
        // Name, position, or both — the same PATCH the server has. A move sends
        // no name, so a fake that demanded one would make the reorder untestable.
        const updated: PatientGroup = { ...group };
        if (body['name'] !== undefined) {
          const name = typeof body['name'] === 'string' ? body['name'].trim() : '';
          if (name === '') return apiError(400, 'validation', 'A group needs a name');
          const clash = state.groups.find(
            (candidate) => candidate.id !== group.id && candidate.name.toLowerCase() === name.toLowerCase(),
          );
          if (clash) return apiError(409, 'conflict', 'You already have a group with that name.');
          updated.name = name;
        }
        if (body['position'] !== undefined) {
          updated.position = typeof body['position'] === 'number' ? body['position'] : null;
        }
        state.groups = state.groups.map((candidate) => (candidate.id === group.id ? updated : candidate));
        return json(updated);
      }

      if (path.startsWith('/api/patients') && method === 'GET' && path.split('?')[0] === '/api/patients') {
        // Archived patients are hidden unless asked for, exactly as the server
        // does it — a fake that always returned everyone would make the
        // archive toggle untestable.
        const includeArchived = path.includes('include_archived=1');
        return json({
          patients: includeArchived
            ? state.patients
            : state.patients.filter((candidate) => candidate.archived_at === null),
        });
      }

      if (path === '/api/import/claude/preview' && method === 'POST') {
        return json(options.importReport ?? EMPTY_IMPORT_REPORT);
      }

      if (path === '/api/import/claude/run' && method === 'POST') {
        const fields: Record<string, string> = {};
        if (init.body instanceof FormData) {
          for (const [key, value] of init.body.entries()) if (typeof value === 'string') fields[key] = value;
        }
        state.imports = [...state.imports, fields];
        const exclude = new Set(JSON.parse(fields['exclude'] ?? '[]') as string[]);
        const planned = options.importReport ?? EMPTY_IMPORT_REPORT;
        const patients = planned.patients.filter((patient) => !exclude.has(patient.key));
        const batchId = `01a00000-0000-7000-8000-0000000000b${String(state.batches.length)}`;
        const notes = patients.reduce((sum, patient) => sum + patient.notes, 0);
        state.batches = [
          {
            id: batchId,
            source: planned.source,
            created_at: stamp(),
            notes,
            patients: patients.filter((p) => p.patient_id === null).length,
          },
          ...state.batches,
        ];
        return json(
          {
            ...planned,
            batch_id: batchId,
            patients,
            notes,
            patients_to_create: patients.filter((p) => p.patient_id === null).length,
          },
          201,
        );
      }

      if (path === '/api/import/batches' && method === 'GET') return json({ batches: state.batches });

      const undoMatch = /^\/api\/import\/batches\/([^/]+)\/undo$/.exec(path);
      if (undoMatch && method === 'POST') {
        const batch = state.batches.find((candidate) => candidate.id === undoMatch[1]);
        if (!batch) return apiError(404, 'not_found', 'That import has already been undone.');
        state.batches = state.batches.filter((candidate) => candidate !== batch);
        return json({
          notes_deleted: batch.notes,
          patients_deleted: batch.patients,
          notes_kept: 0,
          patients_kept: 0,
        });
      }

      if (path === '/api/patients' && method === 'POST') {
        const patient = makePatient(String(body['name']));
        state.patients = [...state.patients, patient];
        return json(patient, 201);
      }

      const notesMatch = /^\/api\/patients\/([^/]+)\/notes$/.exec(path);
      if (notesMatch && method === 'GET') {
        const patientId = notesMatch[1];
        return json({ notes: state.notes.filter((note) => note.patient_id === patientId) });
      }

      const patientMatch = /^\/api\/patients\/([^/]+)$/.exec(path);
      if (patientMatch) {
        const patientId = patientMatch[1];
        const patient = state.patients.find((candidate) => candidate.id === patientId);
        if (!patient) return apiError(404, 'not_found', 'Patient not found');
        if (method === 'DELETE') {
          state.patients = state.patients.filter((candidate) => candidate.id !== patientId);
          state.notes = state.notes.filter((note) => note.patient_id !== patientId);
          return new Response(null, { status: 204 });
        }
        if (method === 'PATCH' && typeof body['archived'] === 'boolean') {
          const updated = { ...patient, archived_at: body['archived'] === true ? stamp() : null };
          state.patients = state.patients.map((candidate) =>
            candidate.id === patientId ? updated : candidate,
          );
          const { note_count: _archivedCount, ...archivedRest } = updated;
          return json(archivedRest satisfies Patient);
        }
        if (method === 'PATCH' && ('group_id' in body || 'group_position' in body)) {
          const groupId = 'group_id' in body ? body['group_id'] : patient.group_id;
          if (groupId !== null && !state.groups.some((group) => group.id === groupId)) {
            return apiError(404, 'not_found', 'Group not found');
          }
          const position = 'group_position' in body ? body['group_position'] : patient.group_position;
          const moved = {
            ...patient,
            group_id: (groupId as string | null) ?? null,
            group_position: (position as number | null) ?? null,
          };
          state.patients = state.patients.map((candidate) =>
            candidate.id === patientId ? moved : candidate,
          );
          const { note_count: _movedCount, ...movedRest } = moved;
          return json(movedRest satisfies Patient);
        }
        if (method === 'PATCH' && typeof body['name'] === 'string') {
          const renamed = { ...patient, name: body['name'], name_guessed: false };
          state.patients = state.patients.map((candidate) =>
            candidate.id === patientId ? renamed : candidate,
          );
          const { note_count: _renamedCount, ...renamedRest } = renamed;
          return json(renamedRest satisfies Patient);
        }
        const { note_count: _count, ...rest } = patient;
        return json(rest satisfies Patient);
      }

      if (path === '/api/notes' && method === 'POST') {
        const created = makeNote(String(body['patient_id']), {
          format_id: String(body['format_id']),
          content: typeof body['content'] === 'string' ? body['content'] : '',
          created_at: stamp(),
          updated_at: stamp(),
        });
        state.notes = [created, ...state.notes];
        return json(created, 201);
      }

      const chatMatch = /^\/api\/notes\/([^/]+)\/chat$/.exec(path);
      if (chatMatch) {
        const note = noteById(chatMatch[1] ?? '');
        if (!note) return apiError(404, 'not_found', 'Note not found');
        if (method === 'GET') {
          return json({ messages: state.messages.filter((message) => message.note_id === note.id) });
        }
        if (options.chatError) return sse([{ event: 'error', data: options.chatError }]);

        const text = String(body['message'] ?? '');
        const quote = body['ref_quote'] == null ? null : String(body['ref_quote']);
        const user = makeChatMessage(note.id, 'user', text, quote);
        state.messages = [...state.messages, user];
        const frames: { event: string; data: unknown }[] = [{ event: 'message', data: { message: user } }];
        const outcome = fakeRefine(note, text);
        if (options.chatOutcome !== undefined) {
          frames.push({
            event: 'note-updated',
            data: {
              note,
              empty_sections: [],
              outcome: options.chatOutcome.outcome,
              outcome_reason: options.chatOutcome.reason,
            },
          });
        }
        if (outcome.content !== null && options.chatOutcome === undefined) {
          const updated = replaceNote({
            ...note,
            content: outcome.content,
            revision: note.revision + 1,
            updated_at: stamp(),
          });
          frames.push({
            event: 'note-updated',
            data: { note: updated, empty_sections: [], outcome: 'applied', outcome_reason: null },
          });
        }
        if (outcome.content === null && note.status === 'published' && !text.includes('?')) {
          // The published lock never asks the model to stream an edit.
        } else {
          for (const word of outcome.reply.split(' ')) {
            frames.push({ event: 'token', data: { text: `${word} ` } });
          }
        }
        const assistant = makeChatMessage(note.id, 'assistant', outcome.reply);
        state.messages = [...state.messages, assistant];
        frames.push({ event: 'message', data: { message: assistant } });
        return sse(frames);
      }

      // --- M12: Brainstorm, one thread per patient -----------------------

      const brainstormMatch = /^\/api\/patients\/([^/]+)\/brainstorm$/.exec(path);
      if (brainstormMatch) {
        const patient = patientById(brainstormMatch[1] ?? '');
        if (!patient) return apiError(404, 'not_found', 'Patient not found');
        const thread = (): { messages: BrainstormMessage[]; context: unknown } => {
          const notes = state.notes.filter((note) => note.patient_id === patient.id);
          return {
            messages: state.brainstorm.filter((message) => message.patient_id === patient.id),
            context: {
              notes: notes.map((note) => ({
                id: note.id,
                title: note.title,
                date: instantToLocalDay(note.created_at),
              })),
              total: notes.length,
              dropped_note_ids: [],
              most_recent: true,
            },
          };
        };
        if (method === 'GET') return json(thread());
        if (method === 'DELETE') {
          state.brainstorm = state.brainstorm.filter((message) => message.patient_id !== patient.id);
          return json(thread());
        }
        if (options.brainstormError) return sse([{ event: 'error', data: options.brainstormError }]);

        const text = String(body['message'] ?? '');
        const user = makeBrainstormMessage(patient.id, 'user', text);
        state.brainstorm = [...state.brainstorm, user];

        const included = state.notes.filter((note) => note.patient_id === patient.id).length;
        const reply =
          `Thinking with ${included === 0 ? 'no notes yet' : `the ${String(included)} notes`} for ` +
          `${patient.name}: “${text}” is worth sitting with.`;
        const assistant = makeBrainstormMessage(patient.id, 'assistant', reply);
        state.brainstorm = [...state.brainstorm, assistant];

        const frames: { event: string; data: unknown }[] = [
          { event: 'message', data: { message: user } },
          { event: 'context', data: { context: thread().context } },
        ];
        for (const word of reply.split(' ')) {
          frames.push({ event: 'token', data: { text: `${word} ` } });
        }
        frames.push({ event: 'message', data: { message: assistant } });
        return sse(frames);
      }

      const publishMatch = /^\/api\/notes\/([^/]+)\/(publish|unpublish)$/.exec(path);
      if (publishMatch) {
        const note = noteById(publishMatch[1] ?? '');
        if (!note) return apiError(404, 'not_found', 'Note not found');
        const publishing = publishMatch[2] === 'publish';
        if (publishing === (note.status === 'published')) {
          return apiError(409, 'conflict', publishing ? 'Already published.' : 'Not published.');
        }
        return json(
          replaceNote({
            ...note,
            status: publishing ? 'published' : 'draft',
            revision: note.revision + 1,
            published_at: publishing ? stamp() : null,
            updated_at: stamp(),
          }),
        );
      }

      const noteMatch = /^\/api\/notes\/([^/]+)$/.exec(path);
      if (noteMatch) {
        const note = noteById(noteMatch[1] ?? '');
        if (!note) return apiError(404, 'not_found', 'Note not found');
        if (method === 'DELETE') {
          state.notes = state.notes.filter((candidate) => candidate.id !== note.id);
          return new Response(null, { status: 204 });
        }
        if (body['revision'] !== note.revision) {
          return apiError(409, 'stale_write', 'This note changed in another window.', { note });
        }
        if (note.status === 'published' && body['content'] !== undefined) {
          return apiError(409, 'conflict', 'This note is published, so its content is locked.');
        }
        return json(
          replaceNote({
            ...note,
            ...(typeof body['title'] === 'string' ? { title: body['title'] } : {}),
            ...(typeof body['content'] === 'string' ? { content: body['content'] } : {}),
            revision: note.revision + 1,
            updated_at: stamp(),
          }),
        );
      }

      // --- M9: the treatment plan and session prep ----------------------

      const route = path.split('?')[0] ?? path;
      const query = new URLSearchParams(path.split('?')[1] ?? '');

      function planFor(patientId: string): TreatmentPlan | undefined {
        return [...state.plans]
          .filter((plan) => plan.patient_id === patientId)
          .sort((a, b) => b.version - a.version)[0];
      }

      function goalsFor(planId: string): PlanGoal[] {
        return state.goals.filter((goal) => goal.plan_id === planId);
      }

      const versionsMatch = /^\/api\/patients\/([^/]+)\/plan\/versions$/.exec(route);
      if (versionsMatch) {
        const patientId = versionsMatch[1] ?? '';
        return json({
          versions: state.plans
            .filter((plan) => plan.patient_id === patientId)
            .sort((a, b) => b.version - a.version),
        });
      }

      const suggestMatch = /^\/api\/patients\/([^/]+)\/plan\/suggest$/.exec(route);
      if (suggestMatch && method === 'POST') {
        const patientId = suggestMatch[1] ?? '';
        if (options.suggestError) return sse([{ event: 'error', data: options.suggestError }]);

        if (options.suggestNothing) {
          const read = state.notes.find((candidate) => candidate.patient_id === patientId);
          return sse([
            { event: 'status', data: { stage: 'reading-notes', message: 'Reading note 1 of 1…' } },
            {
              event: 'done',
              data: {
                goals: [],
                lookback: {
                  cap: 5,
                  notes_read: read === undefined ? 0 : 1,
                  oldest_note_date: read?.created_at ?? null,
                  newest_note_date: read?.created_at ?? null,
                  skipped_note_ids: [],
                },
                dropped: options.suggestNothing.dropped,
              },
            },
          ]);
        }

        let plan = planFor(patientId);
        if (!plan) {
          plan = makePlan(patientId);
          state.plans = [...state.plans, plan];
        }
        const note = state.notes.find((candidate) => candidate.patient_id === patientId);
        const proposed = makeGoal(plan.id, {
          statement: 'John keeps a sleep log between sessions.',
          status: 'proposed',
          objectives: [
            {
              statement: 'John will bring a completed sleep log to each session.',
              measure: 'the log itself',
              baseline: 'improved sleep since last session',
              target_value: '',
              target_date: null,
              source: 'model_suggested',
            },
          ],
          evidence:
            note === undefined
              ? []
              : [
                  {
                    note_id: note.id,
                    note_date: note.created_at,
                    section: 'Subjective',
                    excerpt: 'improved sleep since last session',
                  },
                ],
        });
        state.goals = [...state.goals, proposed];

        return sse([
          { event: 'status', data: { stage: 'reading-notes', message: 'Reading note 1 of 1…' } },
          { event: 'goal', data: { goal: proposed } },
          {
            event: 'done',
            data: {
              goals: [proposed],
              lookback: {
                cap: 5,
                notes_read: note === undefined ? 0 : 1,
                oldest_note_date: note?.created_at ?? null,
                newest_note_date: note?.created_at ?? null,
                skipped_note_ids: [],
              },
              dropped: 0,
            },
          },
        ]);
      }

      const planMatch = /^\/api\/patients\/([^/]+)\/plan$/.exec(route);
      if (planMatch) {
        const patientId = planMatch[1] ?? '';
        if (method === 'POST') {
          const previous = planFor(patientId);
          const created = makePlan(patientId, { version: (previous?.version ?? 0) + 1 });
          state.plans = [...state.plans, created];
          for (const goal of previous ? goalsFor(previous.id) : []) {
            if (goal.status !== 'accepted' && goal.status !== 'met') continue;
            state.goals = [
              ...state.goals,
              makeGoal(created.id, {
                ...goal,
                id: fakeId(),
                plan_id: created.id,
                carried_from_goal_id: goal.id,
              }),
            ];
          }
          return json({ plan: created, goals: goalsFor(created.id) }, 201);
        }
        const wanted = query.get('version');
        const plan =
          wanted === null
            ? planFor(patientId)
            : state.plans.find(
                (candidate) => candidate.patient_id === patientId && candidate.version === Number(wanted),
              );
        if (wanted !== null && !plan) return apiError(404, 'not_found', 'No such plan version');
        return json(plan ? { plan, goals: goalsFor(plan.id) } : { plan: null, goals: [] });
      }

      const exportMatch = /^\/api\/plans\/([^/]+)\/export$/.exec(route);
      if (exportMatch) {
        return new Response('TREATMENT PLAN\n\nPatient: John Smith\n', {
          status: 200,
          headers: { 'content-type': 'text/plain' },
        });
      }

      const activateMatch = /^\/api\/plans\/([^/]+)\/activate$/.exec(route);
      if (activateMatch && method === 'POST') {
        const planId = activateMatch[1] ?? '';
        const plan = state.plans.find((candidate) => candidate.id === planId);
        if (!plan) return apiError(404, 'not_found', 'Plan not found');
        const activated: TreatmentPlan = {
          ...plan,
          status: 'active',
          activated_at: stamp(),
          attested_at: stamp(),
          attestation_text: 'I authored and reviewed this treatment plan.',
          effective_from: '2026-08-23',
          review_due: '2026-11-21',
        };
        state.plans = state.plans.map((candidate) => (candidate.id === planId ? activated : candidate));
        return json({ plan: activated, goals: goalsFor(planId) });
      }

      const goalMatch = /^\/api\/plans\/([^/]+)\/goals\/([^/]+)$/.exec(route);
      if (goalMatch) {
        const goalId = goalMatch[2] ?? '';
        const goal = state.goals.find((candidate) => candidate.id === goalId);
        if (!goal) return apiError(404, 'not_found', 'Goal not found');
        if (method === 'DELETE') {
          state.goals = state.goals.filter((candidate) => candidate.id !== goalId);
          return new Response(null, { status: 204 });
        }
        const status = (body['status'] as PlanGoal['status'] | undefined) ?? goal.status;
        const updated: PlanGoal = {
          ...goal,
          ...(typeof body['statement'] === 'string' ? { statement: body['statement'] } : {}),
          ...(Array.isArray(body['objectives'])
            ? { objectives: body['objectives'] as PlanGoal['objectives'] }
            : {}),
          ...(Array.isArray(body['interventions'])
            ? { interventions: body['interventions'] as string[] }
            : {}),
          status,
          accepted_at: status === 'proposed' ? null : (goal.accepted_at ?? stamp()),
        };
        state.goals = state.goals.map((candidate) => (candidate.id === goalId ? updated : candidate));
        return json(updated);
      }

      const goalsMatch = /^\/api\/plans\/([^/]+)\/goals$/.exec(route);
      if (goalsMatch && method === 'POST') {
        const created = makeGoal(goalsMatch[1] ?? '', { statement: String(body['statement'] ?? '') });
        state.goals = [...state.goals, created];
        return json(created, 201);
      }

      const planPatchMatch = /^\/api\/plans\/([^/]+)$/.exec(route);
      if (planPatchMatch && method === 'PATCH') {
        const planId = planPatchMatch[1] ?? '';
        const plan = state.plans.find((candidate) => candidate.id === planId);
        if (!plan) return apiError(404, 'not_found', 'Plan not found');
        const updated = { ...plan, ...(body as Partial<TreatmentPlan>) };
        state.plans = state.plans.map((candidate) => (candidate.id === planId ? updated : candidate));
        return json(updated);
      }

      const prepSaveMatch = /^\/api\/patients\/([^/]+)\/prep\/save$/.exec(route);
      if (prepSaveMatch && method === 'POST') {
        const content = body['content'] as SessionBriefContent;
        const brief: SessionBrief = {
          id: fakeId(),
          patient_id: prepSaveMatch[1] ?? '',
          generated_at: String(body['generated_at']),
          content,
          source_note_ids: content.lines.map((line) => line.note_id),
          saved: true,
          created_at: stamp(),
        };
        state.briefs = [brief, ...state.briefs];
        return json(brief, 201);
      }

      const prepMatch = /^\/api\/patients\/([^/]+)\/prep$/.exec(route);
      if (prepMatch) {
        const patientId = prepMatch[1] ?? '';
        if (method === 'GET') {
          return json({ briefs: state.briefs.filter((brief) => brief.patient_id === patientId) });
        }
        if (options.prepError) return sse([{ event: 'error', data: options.prepError }]);

        const notes = state.notes.filter((note) => note.patient_id === patientId);
        const lines = notes.slice(0, 5).map((note) => ({
          note_id: note.id,
          note_date: note.created_at,
          note_title: note.title,
          text: note.content.split('\n')[0] ?? '',
        }));
        const lookback = {
          cap: 5,
          notes_read: lines.length,
          oldest_note_date: lines.at(-1)?.note_date ?? null,
          newest_note_date: lines[0]?.note_date ?? null,
          skipped_note_ids: [],
        };
        return sse([
          { event: 'status', data: { stage: 'reading-notes', message: 'Reading note 1 of 1…' } },
          ...lines.map((line) => ({ event: 'line', data: { line } })),
          {
            event: 'brief',
            data: { generated_at: '2026-08-23T09:00:00.000Z', content: { lines, lookback } },
          },
        ]);
      }

      return apiError(404, 'not_found', `No fake route for ${method} ${path}`);
    }),
  );

  return { state, calls };
}

/** jsdom has no clipboard; the publish flow writes to it. */
export function installFakeClipboard(): { written: string[] } {
  const written: string[] = [];
  Object.defineProperty(globalThis.navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: async (text: string) => {
        written.push(text);
        return Promise.resolve();
      },
    },
  });
  return { written };
}
