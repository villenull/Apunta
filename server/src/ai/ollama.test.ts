import type { Sections } from '@apunta/shared';
import { PROMOTED_DEFAULT_MODEL } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import { AiError } from './errors.js';
import {
  NUM_CTX,
  NUM_PREDICT_BRAINSTORM,
  NUM_PREDICT_BRIEF,
  NUM_PREDICT_DETECT,
  NUM_PREDICT_PLAN,
  NUM_PREDICT_RETRACTIONS,
  NUM_PREDICT_SUMMARY,
  OllamaProvider,
} from './ollama.js';
import { RETRACTION_REMINDER } from './prompts.js';
import type { LlmEvent } from './types.js';

/**
 * The Ollama provider against a stubbed `fetch`.
 *
 * Every scenario here is a failure mode `docs/research/m3-preflight-2026-08.md`
 * §3 records against a real Ollama, reproduced at the wire level: they all
 * return HTTP 200 with `done_reason: "stop"` and no other signal, which is
 * exactly why the server has to detect them itself.
 */

const MODEL = 'gemma4:12b-it-qat';
const SOAP = ['Subjective', 'Objective', 'Assessment', 'Plan'];

const GOOD: Sections = {
  Subjective: 'Patient reports improved sleep.',
  Objective: '',
  Assessment: 'Progressing.',
  Plan: 'Continue weekly.',
};

interface ChatCall {
  readonly body: Record<string, unknown>;
}

interface StubOptions {
  /** One entry per `/api/chat` call, in order. The last repeats. */
  readonly chats: readonly (ChatReply | (() => ChatReply))[];
  readonly tags?: unknown;
  readonly capabilities?: readonly string[];
}

interface ChatReply {
  readonly status?: number;
  /** The assistant content, streamed as NDJSON. */
  readonly content?: string;
  readonly thinking?: string;
  readonly doneReason?: string;
  readonly promptTokens?: number;
  readonly body?: string;
  readonly error?: unknown;
}

function ndjson(reply: ChatReply): string {
  const lines: string[] = [];
  for (const piece of (reply.content ?? '').match(/.{1,7}/gs) ?? []) {
    lines.push(JSON.stringify({ model: MODEL, message: { content: piece }, done: false }));
  }
  if (reply.thinking !== undefined) {
    lines.push(JSON.stringify({ model: MODEL, message: { thinking: reply.thinking }, done: false }));
  }
  lines.push(
    JSON.stringify({
      model: MODEL,
      message: { content: '' },
      done: true,
      done_reason: reply.doneReason ?? 'stop',
      prompt_eval_count: reply.promptTokens ?? 1200,
      eval_count: 240,
      eval_duration: 4_000_000_000,
      load_duration: 1_000_000,
    }),
  );
  return `${lines.join('\n')}\n`;
}

function stub(options: StubOptions): {
  fetchImpl: typeof globalThis.fetch;
  calls: ChatCall[];
  generateCalls: ChatCall[];
} {
  const calls: ChatCall[] = [];
  const generateCalls: ChatCall[] = [];
  let index = 0;

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.endsWith('/api/tags')) {
      return new Response(
        JSON.stringify(options.tags ?? { models: [{ name: MODEL, details: { format: 'gguf' } }] }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    if (url.endsWith('/api/show')) {
      return new Response(
        JSON.stringify({ capabilities: options.capabilities ?? ['completion', 'thinking'] }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      );
    }
    if (url.endsWith('/api/generate')) {
      generateCalls.push({ body: JSON.parse(String(init?.body)) as Record<string, unknown> });
      return new Response(JSON.stringify({ model: MODEL, response: '', done: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }
    if (!url.endsWith('/api/chat')) throw new Error(`unexpected request to ${url}`);

    const sent = JSON.parse(String(init?.body)) as Record<string, unknown>;
    calls.push({ body: sent });
    const entry = options.chats[Math.min(index, options.chats.length - 1)];
    index += 1;
    const reply = typeof entry === 'function' ? entry() : (entry as ChatReply);
    if (reply.error !== undefined) throw reply.error;

    const status = reply.status ?? 200;
    if (status !== 200) return new Response(reply.body ?? '', { status });
    if (sent['stream'] === false) {
      // `detectFormat` does not stream, so Ollama answers with one object.
      return new Response(
        JSON.stringify({
          model: MODEL,
          message: { content: reply.content ?? '' },
          done: true,
          done_reason: reply.doneReason ?? 'stop',
          prompt_eval_count: reply.promptTokens ?? 1200,
          eval_count: 240,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      );
    }
    return new Response(ndjson(reply), { status: 200, headers: { 'content-type': 'application/x-ndjson' } });
  }) as typeof globalThis.fetch;

  return { fetchImpl, calls, generateCalls };
}

function provider(options: StubOptions, overrides: Record<string, unknown> = {}): OllamaProvider {
  const { fetchImpl } = stub(options);
  return new OllamaProvider({ resolveModel: () => MODEL, fetchImpl, ...overrides });
}

async function drain(events: AsyncIterable<LlmEvent>): Promise<LlmEvent[]> {
  const collected: LlmEvent[] = [];
  for await (const event of events) collected.push(event);
  return collected;
}

async function expectAiError(events: AsyncIterable<LlmEvent>): Promise<AiError> {
  try {
    await drain(events);
  } catch (error) {
    if (error instanceof AiError) return error;
    throw error;
  }
  throw new Error('expected the call to throw an AiError');
}

const REQUEST = {
  instructions: '',
  formatName: 'Progress note',
  sections: SOAP,
  typedNotes: 'Sleep improved, intrusive thoughts less frequent. Engaged. Keep weekly, add grounding.',
} as const;

describe('OllamaProvider.generateNote — the happy path', () => {
  it('streams decoded section text and yields the validated sections', async () => {
    const events = await drain(
      provider({ chats: [{ content: JSON.stringify(GOOD) }] }).generateNote(REQUEST),
    );
    const last = events.at(-1);
    expect(last?.type).toBe('sections');
    if (last?.type !== 'sections') throw new Error('unreachable');
    expect(last.sections).toEqual(GOOD);
    expect(last.stats.attempts).toBe(1);

    const streamed: Record<string, string> = {};
    for (const event of events) {
      if (event.type === 'token') streamed[event.section] = (streamed[event.section] ?? '') + event.text;
    }
    expect(streamed['Subjective']).toBe(GOOD['Subjective']);
    expect(streamed).not.toHaveProperty('Objective');
  });

  it('sends the settings PLAN §2 requires', async () => {
    const { fetchImpl, calls } = stub({ chats: [{ content: JSON.stringify(GOOD) }] });
    await drain(new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(REQUEST));

    const body = calls[0]?.body as {
      options: Record<string, number>;
      format: { additionalProperties: boolean; required: string[] };
      think: boolean;
      stream: boolean;
    };
    expect(body.options['temperature']).toBe(0);
    expect(body.options['num_ctx']).toBe(NUM_CTX);
    expect(body.options['repeat_penalty']).toBe(1);
    expect(body.options['num_predict']).toBeGreaterThan(0);
    expect(body.format.required).toEqual(SOAP);
    expect(body.format.additionalProperties).toBe(false);
    expect(body.think).toBe(false);
    expect(body.stream).toBe(true);
  });

  /** Sending `think` to a model without the capability is a hard HTTP 400. */
  it('omits `think` for a model that does not support thinking', async () => {
    const { fetchImpl, calls } = stub({
      chats: [{ content: JSON.stringify(GOOD) }],
      capabilities: ['completion'],
    });
    await drain(new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(REQUEST));
    expect(calls[0]?.body).not.toHaveProperty('think');
  });

  it('unwraps a fenced response rather than failing on it', async () => {
    const events = await drain(
      provider({ chats: [{ content: `\`\`\`json\n${JSON.stringify(GOOD)}\n\`\`\`` }] }).generateNote(REQUEST),
    );
    expect(events.at(-1)?.type).toBe('sections');
  });
});

describe('OllamaProvider.generateNote — the retry ladder', () => {
  /** ollama#17871: valid JSON, wrong keys — the grammar was never applied. */
  it('retries once with the validation error and succeeds', async () => {
    const { fetchImpl, calls } = stub({
      chats: [
        { content: JSON.stringify({ thought: 'The user has provided a large text excerpt…' }) },
        { content: JSON.stringify(GOOD) },
      ],
    });
    const events = await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(REQUEST),
    );

    const last = events.at(-1);
    if (last?.type !== 'sections') throw new Error('unreachable');
    expect(last.stats.attempts).toBe(2);
    expect(events.some((event) => event.type === 'status' && event.stage === 'retrying')).toBe(true);

    const retry = calls[1]?.body as {
      messages: { role: string; content: string }[];
      options: { seed: number };
    };
    expect(retry.messages).toHaveLength(4);
    expect(retry.messages[3]?.content).toContain('unexpected [thought]');
    // A retry at the same seed and temperature 0 would reproduce the failure.
    expect(retry.options.seed).toBe(1);
  });

  /**
   * The third rung: `think:false` breaking `format` is a family-scoped bug that
   * keeps reappearing (ollama#15260 fixed for gemma4 only, #17871 open for
   * qwen3.6), and omitting `think` is the documented workaround.
   */
  it('drops `think` on a third attempt when the grammar looks bypassed', async () => {
    const { fetchImpl, calls } = stub({
      chats: [
        { content: 'Here is the note you asked for: Subjective — sleeping better.' },
        { content: 'Still prose, I am afraid.' },
        { content: JSON.stringify(GOOD) },
      ],
    });
    const events = await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(REQUEST),
    );

    const last = events.at(-1);
    if (last?.type !== 'sections') throw new Error('unreachable');
    expect(last.stats.attempts).toBe(3);
    expect(calls[0]?.body).toHaveProperty('think', false);
    expect(calls[1]?.body).toHaveProperty('think', false);
    expect(calls[2]?.body).not.toHaveProperty('think');
  });

  it('gives up with invalid_output when the shape never comes right', async () => {
    const error = await expectAiError(
      provider({ chats: [{ content: 'not json at all' }] }).generateNote(REQUEST),
    );
    expect(error.code).toBe('invalid_output');
    expect(error.message).toContain("wasn't a note");
  });

  /** ollama#15502, the failure most likely to sink this on the target Mac. */
  it('rejects a repetition loop even though it is valid JSON', async () => {
    const looping = { ...GOOD, Plan: `plan ${'own '.repeat(40)}` };
    const error = await expectAiError(
      provider({ chats: [{ content: JSON.stringify(looping) }] }).generateNote(REQUEST),
    );
    expect(error.code).toBe('degenerate_output');
  });

  it('retries a repetition loop on a fresh seed without quoting it back', async () => {
    const { fetchImpl, calls } = stub({
      chats: [
        { content: JSON.stringify({ ...GOOD, Plan: `plan ${'own '.repeat(40)}` }) },
        { content: JSON.stringify(GOOD) },
      ],
    });
    await drain(new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(REQUEST));

    const retry = calls[1]?.body as { messages: unknown[]; options: { seed: number } };
    expect(retry.messages).toHaveLength(2);
    expect(retry.options.seed).toBe(1);
  });
});

describe('OllamaProvider.generateNote — terminal failures', () => {
  it('reports Ollama not running', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    const error = await expectAiError(provider({ chats: [{ error: refused }] }).generateNote(REQUEST));
    expect(error.code).toBe('ollama_unreachable');
  });

  it('reports a model that has not been pulled', async () => {
    const error = await expectAiError(provider({ chats: [], tags: { models: [] } }).generateNote(REQUEST));
    expect(error.code).toBe('model_missing');
  });

  /** ollama#16563: the MLX engine returns HTTP 200 and ignores `format`. */
  it('refuses a model whose weights are not GGUF', async () => {
    const error = await expectAiError(
      provider({
        chats: [],
        tags: { models: [{ name: MODEL, details: { format: 'safetensors' } }] },
      }).generateNote(REQUEST),
    );
    expect(error.code).toBe('non_gguf_model');
  });

  it('refuses an MLX-flavoured tag before it makes a single request', async () => {
    const { fetchImpl, calls } = stub({ chats: [] });
    const error = await expectAiError(
      new OllamaProvider({ resolveModel: () => 'qwen3.8:27b-mlx', fetchImpl }).generateNote(REQUEST),
    );
    expect(error.code).toBe('unsupported_model_tag');
    expect(calls).toHaveLength(0);
  });

  it('reports running out of memory', async () => {
    const error = await expectAiError(
      provider({
        chats: [
          {
            status: 500,
            body: JSON.stringify({
              error: 'model requires more system memory (24.0 GiB) than is available (12.1 GiB)',
            }),
          },
        ],
      }).generateNote(REQUEST),
    );
    expect(error.code).toBe('insufficient_memory');
  });

  /**
   * The silent one. Ollama truncates from the head, so an over-long prompt
   * drops the anti-fabrication rules and keeps the patient material — with a
   * fluent answer and nothing in the response to say so.
   */
  it('detects a prompt that was truncated, from prompt_eval_count', async () => {
    const error = await expectAiError(
      provider({
        chats: [{ content: JSON.stringify(GOOD), promptTokens: NUM_CTX - 2 }],
      }).generateNote(REQUEST),
    );
    expect(error.code).toBe('context_overflow');
  });

  it('refuses an over-long source before sending it', async () => {
    const { fetchImpl, calls } = stub({ chats: [] });
    const error = await expectAiError(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote({
        ...REQUEST,
        typedNotes: 'word '.repeat(20_000),
      }),
    );
    expect(error.code).toBe('input_too_long');
    expect(calls).toHaveLength(0);
  });

  it('reports output cut off mid-note', async () => {
    const error = await expectAiError(
      provider({
        chats: [{ content: '{"Subjective": "Sleeping bet', doneReason: 'length' }],
      }).generateNote(REQUEST),
    );
    expect(error.code).toBe('output_truncated');
  });

  /** ollama#15288 / #15428: everything stranded in the reasoning block. */
  it('reports an empty answer whose text all went to `thinking`', async () => {
    const error = await expectAiError(
      provider({ chats: [{ content: '', thinking: 'Let me consider the sections…' }] }).generateNote(REQUEST),
    );
    expect(error.code).toBe('empty_response');
    expect(error.detail).toContain('message.thinking');
  });
});

describe('OllamaProvider.refineNote', () => {
  it('streams the reply and returns the rewritten sections', async () => {
    const answer = { reply: 'Shortened the Plan section.', updatedSections: GOOD };
    const events = await drain(
      provider({ chats: [{ content: JSON.stringify(answer) }] }).refineNote({
        instructions: '',
        sections: SOAP,
        noteText: 'Subjective: Sleeping better.\n\nPlan: Continue weekly.',
        history: [],
        message: 'Shorten the plan.',
      }),
    );

    const last = events.at(-1);
    if (last?.type !== 'refined') throw new Error('unreachable');
    expect(last.reply).toBe('Shortened the Plan section.');
    expect(last.updatedSections).toEqual(GOOD);

    const streamed = events.filter((event) => event.type === 'token');
    // The reply is the only streamable string, so it is the only text a client
    // shows. The section bodies are decoded as well — the route turns each new
    // section key into its "Rewriting n of m sections" progress line — and an
    // empty body produces no token at all.
    const replyText = streamed
      .filter((event) => event.section === 'reply')
      .map((event) => event.text)
      .join('');
    expect(replyText).toBe('Shortened the Plan section.');
    const sectionKeys = streamed
      .map((event) => event.section)
      .filter((key, index, all) => all.indexOf(key) === index);
    expect(sectionKeys).toEqual(['reply', 'Subjective', 'Assessment', 'Plan']);
  });

  it('accepts an answer that leaves the note alone', async () => {
    const events = await drain(
      provider({
        chats: [{ content: JSON.stringify({ reply: 'That is not in the note.', updatedSections: null }) }],
      }).refineNote({
        instructions: '',
        sections: SOAP,
        noteText: 'Plan: Continue weekly.',
        history: [],
        message: 'Did she mention medication?',
      }),
    );
    const last = events.at(-1);
    if (last?.type !== 'refined') throw new Error('unreachable');
    expect(last.updatedSections).toBeNull();
  });
});

describe('OllamaProvider.discussPatient', () => {
  it('streams the reply and ends discussed, with nothing revised', async () => {
    const events = await drain(
      provider({
        chats: [{ content: JSON.stringify({ reply: 'That is not in the notes.' }) }],
      }).discussPatient({
        patientName: 'John Smith',
        notes: [{ title: 'Progress note', date: '2026-09-18', text: 'Subjective: Sleeping better.' }],
        history: [],
        message: 'Did he mention medication?',
      }),
    );

    const last = events.at(-1);
    if (last?.type !== 'discussed') throw new Error('unreachable');
    expect(last.reply).toBe('That is not in the notes.');

    const streamedKeys = new Set(
      events.filter((event) => event.type === 'token').map((event) => event.section),
    );
    expect([...streamedKeys]).toEqual(['reply']);
  });

  it('rejects a response that is not one reply', async () => {
    await expect(
      drain(
        provider({
          chats: [{ content: JSON.stringify({ reply: 'Fine.', updatedSections: null }) }],
        }).discussPatient({
          patientName: 'John Smith',
          notes: [],
          history: [],
          message: 'Hello?',
        }),
      ),
    ).rejects.toMatchObject({ code: 'invalid_output' });
  });

  it('uses the brainstorm output ceiling', async () => {
    const { fetchImpl, calls } = stub({ chats: [{ content: JSON.stringify({ reply: 'Thinking.' }) }] });
    await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).discussPatient({
        patientName: 'John Smith',
        notes: [],
        history: [],
        message: 'Hello?',
      }),
    );
    expect((calls[0]?.body.options as { num_predict: number }).num_predict).toBe(NUM_PREDICT_BRAINSTORM);
  });
});

describe('OllamaProvider.detectFormat', () => {
  it('returns the detected name and sections', async () => {
    const detected = { name: 'Progress note', sections: SOAP };
    const result = await provider({ chats: [{ content: JSON.stringify(detected) }] }).detectFormat({
      kind: 'template',
      text: 'Subjective:\nObjective:\nAssessment:\nPlan:',
    });
    expect(result).toEqual(detected);
  });

  it('rejects a response that is not a format', async () => {
    await expect(
      provider({ chats: [{ content: JSON.stringify({ name: 'Progress note' }) }] }).detectFormat({
        kind: 'template',
        text: 'Subjective:',
      }),
    ).rejects.toMatchObject({ code: 'invalid_output' });
  });

  it('uses the bounded helper output ceiling', async () => {
    const { fetchImpl, calls } = stub({
      chats: [{ content: JSON.stringify({ name: 'Progress note', sections: SOAP }) }],
    });
    await new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).detectFormat({
      kind: 'template',
      text: 'Subjective:\nObjective:\nAssessment:\nPlan:',
    });
    expect((calls[0]?.body.options as { num_predict: number }).num_predict).toBe(NUM_PREDICT_DETECT);
  });

  it('rejects a truncated helper response instead of parsing partial JSON', async () => {
    await expect(
      provider({
        chats: [{ content: '{"name":"Progress', doneReason: 'length' }],
      }).detectFormat({ kind: 'template', text: 'Subjective:' }),
    ).rejects.toMatchObject({ code: 'output_truncated' });
  });
});

describe('OllamaProvider — the M9 two-stage calls', () => {
  const SUMMARY = { points: ['Sleeping better.'], excerpts: ['getting six hours most nights'] };

  it('uses bounded output ceilings for each helper operation', async () => {
    const { fetchImpl, calls } = stub({
      chats: [
        { content: JSON.stringify(SUMMARY) },
        {
          content: JSON.stringify({
            goals: [{ statement: 'Sleep improves.', objectives: [], interventions: [], evidence: [] }],
          }),
        },
        { content: JSON.stringify({ lines: [{ note: 0, text: 'Sleeping better.' }] }) },
      ],
    });
    const providerUnderTest = new OllamaProvider({ resolveModel: () => MODEL, fetchImpl });

    await providerUnderTest.summariseNote({ noteText: 'Subjective: sleeping better.', sections: SOAP });
    await providerUnderTest.suggestPlanGoals({
      diagnoses: [],
      modality: '',
      frequency: '',
      existingGoals: [],
      notes: [{ index: 0, date: '2026-08-01', excerpts: ['sleeping better'] }],
    });
    await providerUnderTest.composeBrief({
      notes: [{ index: 0, date: '2026-08-01', title: 'Progress note', points: ['Sleeping better.'] }],
    });

    expect((calls[0]?.body.options as { num_predict: number }).num_predict).toBe(NUM_PREDICT_SUMMARY);
    expect((calls[1]?.body.options as { num_predict: number }).num_predict).toBe(NUM_PREDICT_PLAN);
    expect((calls[2]?.body.options as { num_predict: number }).num_predict).toBe(NUM_PREDICT_BRIEF);
  });

  it('summarises one note and reports what the call cost', async () => {
    const result = await provider({ chats: [{ content: JSON.stringify(SUMMARY) }] }).summariseNote({
      noteText: 'Subjective: getting six hours most nights.',
      sections: SOAP,
    });

    expect(result.value).toEqual(SUMMARY);
    // `prompt_eval_count` is the only observability Ollama gives us on
    // truncation, and every M9 call reports it like every other call.
    expect(result.stats.promptTokens).toBe(1200);
    expect(result.stats.attempts).toBe(1);
  });

  it('refuses a summary whose prompt came back flush against the context window', async () => {
    await expect(
      provider({
        chats: [{ content: JSON.stringify(SUMMARY), promptTokens: NUM_CTX }],
      }).summariseNote({ noteText: 'Subjective: anything.', sections: SOAP }),
    ).rejects.toMatchObject({ code: 'context_overflow' });
  });

  it('retries a malformed suggestion and accepts the corrected one', async () => {
    const good = {
      goals: [
        {
          statement: 'Sleep improves.',
          objectives: [],
          interventions: [],
          evidence: [{ note: 0, excerpt: 0 }],
        },
      ],
    };
    const result = await provider({
      chats: [{ content: '{"goals": "all of them"}' }, { content: JSON.stringify(good) }],
    }).suggestPlanGoals({
      diagnoses: [],
      modality: '',
      frequency: '',
      existingGoals: [],
      notes: [{ index: 0, date: '2026-08-01', excerpts: ['sleeping better'] }],
    });

    expect(result.value.goals[0]?.statement).toBe('Sleep improves.');
    expect(result.stats.attempts).toBe(2);
  });

  /**
   * An extra key coming back when `additionalProperties: false` went out means
   * the grammar was never applied — and a diagnosis is the one key that must
   * never survive that.
   */
  it('rejects a suggestion carrying a diagnosis, however plausible', async () => {
    const withDiagnosis = {
      goals: [
        {
          statement: 'Sleep improves.',
          objectives: [],
          interventions: [],
          evidence: [{ note: 0, excerpt: 0 }],
          diagnosis: 'F41.1',
        },
      ],
    };
    await expect(
      provider({ chats: [{ content: JSON.stringify(withDiagnosis) }] }).suggestPlanGoals({
        diagnoses: [],
        modality: '',
        frequency: '',
        existingGoals: [],
        notes: [{ index: 0, date: '2026-08-01', excerpts: ['sleeping better'] }],
      }),
    ).rejects.toMatchObject({ code: 'invalid_output' });
  });

  it('rejects a briefing line that is a repetition loop', async () => {
    const degenerate = { lines: [{ note: 0, text: 'own own own own own own own own own own' }] };
    await expect(
      provider({ chats: [{ content: JSON.stringify(degenerate) }] }).composeBrief({
        notes: [{ index: 0, date: '2026-08-01', title: 'Progress note', points: ['Sleeping better.'] }],
      }),
    ).rejects.toMatchObject({ code: 'degenerate_output' });
  });

  it('refuses to send a note too long to fit the window rather than let it be truncated', async () => {
    await expect(
      provider({ chats: [{ content: JSON.stringify(SUMMARY) }] }).summariseNote({
        noteText: `Subjective: ${'a very long account of the session. '.repeat(2000)}`,
        sections: SOAP,
      }),
    ).rejects.toMatchObject({ code: 'input_too_long' });
  });
});

describe('OllamaProvider.describe', () => {
  it('reports the model and its weight format', async () => {
    await expect(provider({ chats: [] }).describe()).resolves.toEqual({
      reachable: true,
      model: MODEL,
      modelPresent: true,
      weightsFormat: 'gguf',
    });
  });

  it('reports unreachable rather than throwing when Ollama is down', async () => {
    const fetchImpl = (() => {
      throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
    }) as unknown as typeof globalThis.fetch;
    await expect(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).describe(),
    ).resolves.toMatchObject({ reachable: false, modelPresent: false });
  });

  /**
   * A provider built without `resolveModel` — which is the shape every
   * unconfigured construction takes — must land on the promoted default. It
   * used to land on `defaultModelForMachine()`, i.e. on the RAM table, and
   * that is the drift this card closes.
   */
  it('falls back to the promoted default, not the memory picker, with no resolveModel', async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ models: [{ name: PROMOTED_DEFAULT_MODEL }] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })) as unknown as typeof globalThis.fetch;

    await expect(new OllamaProvider({ fetchImpl }).describe()).resolves.toEqual({
      reachable: true,
      model: PROMOTED_DEFAULT_MODEL,
      modelPresent: true,
      weightsFormat: null,
    });
  });
});

describe('OllamaProvider.generateNote — spoken retractions', () => {
  const SPOKEN =
    "John says he's sleeping about four hours a night. Scratch that. It's more like six hours now. Mood is better.";
  const CORRECTIONS = {
    corrections: [
      { withdrawn: 'sleeping about four hours a night', replacement: "It's more like six hours now" },
      // Listed, never taken back: the server must leave it alone.
      { withdrawn: 'Mood is better', replacement: '' },
    ],
  };
  const request = { instructions: '', formatName: 'Progress note', sections: SOAP, transcript: SPOKEN };

  function draftingUserTurn(calls: ChatCall[]): string {
    const body = calls[1]?.body as { messages: { role: string; content: string }[] } | undefined;
    return body?.messages[1]?.content ?? '';
  }

  it('asks the model to quote first, cuts only what the transcript bears out, and drafts from the rest', async () => {
    const { fetchImpl, calls } = stub({
      chats: [{ content: JSON.stringify(CORRECTIONS) }, { content: JSON.stringify(GOOD) }],
    });
    const events = await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(request),
    );

    expect(calls).toHaveLength(2);
    expect(calls[0]?.body).toMatchObject({ stream: false });
    expect((calls[0]?.body.options as { num_predict: number }).num_predict).toBe(NUM_PREDICT_RETRACTIONS);
    expect((calls[0]?.body as { format: { properties: object } }).format.properties).toHaveProperty(
      'corrections',
    );

    const user = draftingUserTurn(calls);
    expect(user).toContain("It's more like six hours now");
    expect(user).toContain('Mood is better');
    expect(user).not.toContain('four hours');
    expect(user).not.toContain('Scratch that');
    // Nothing taken back is left in the source, so the prompt is the plain one.
    expect(user).not.toContain(RETRACTION_REMINDER);

    expect(events.some((event) => event.type === 'status' && event.stage === 'correcting')).toBe(true);
    expect(events.find((event) => event.type === 'retractions')).toMatchObject({
      applied: [
        { withdrawn: 'sleeping about four hours a night', replacement: "It's more like six hours now" },
      ],
      offered: 2,
    });
    expect(events.at(-1)?.type).toBe('sections');
  });

  it('drafts from the transcript as transcribed, reminder beside it, when the quoting call answers nonsense', async () => {
    const { fetchImpl, calls } = stub({
      chats: [{ content: 'not json' }, { content: JSON.stringify(GOOD) }],
    });
    const events = await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(request),
    );

    const user = draftingUserTurn(calls);
    expect(user).toContain('four hours');
    expect(user).toContain(RETRACTION_REMINDER);
    expect(events.find((event) => event.type === 'retractions')).toMatchObject({ applied: [], offered: 0 });
    expect(events.at(-1)?.type).toBe('sections');
  });

  it('rejects a truncated retraction quote response rather than losing correction evidence', async () => {
    const error = await expectAiError(
      provider({ chats: [{ content: '{"corrections":[', doneReason: 'length' }] }).generateNote(request),
    );
    expect(error.code).toBe('output_truncated');
  });

  it('makes no quoting call for a transcript with nothing taken back', async () => {
    const { fetchImpl, calls } = stub({ chats: [{ content: JSON.stringify(GOOD) }] });
    await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote({
        ...request,
        transcript: 'John slept six hours a night this week.',
      }),
    );
    expect(calls).toHaveLength(1);
  });
});

describe('OllamaProvider.generateNote — a lost risk review', () => {
  const INTAKE = ['Presenting problem', 'History', 'Formulation', 'Plan'];
  const TYPED =
    'Low mood for five years. Risk: I asked directly and she denied any thoughts of killing herself and denied any plan. Biweekly to start.';
  const DROPPED: Sections = {
    'Presenting problem': 'She presents with low mood of five years.',
    History: '',
    Formulation: '',
    Plan: 'Biweekly sessions.',
  };
  const QUOTES = {
    quotes: [
      'she denied any thoughts of killing herself',
      // Not in the source: offered, never used.
      'she reported suicidal intent',
    ],
  };
  const request = { instructions: '', formatName: 'Intake note', sections: INTAKE, typedNotes: TYPED };

  it('asks for quotes after a draft with no risk content, and files her own sentences', async () => {
    const { fetchImpl, calls } = stub({
      chats: [{ content: JSON.stringify(DROPPED) }, { content: JSON.stringify(QUOTES) }],
    });
    const events = await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(request),
    );

    expect(calls).toHaveLength(2);
    expect(calls[1]?.body).toMatchObject({ stream: false });
    expect((calls[1]?.body as { format: { properties: object } }).format.properties).toHaveProperty('quotes');
    const sections = (events.at(-1) as { type: 'sections'; sections: Sections }).sections;
    expect(sections['Presenting problem']).toBe(
      'She presents with low mood of five years.\n\nRisk review, as dictated: "Risk: I asked directly and she denied any thoughts of killing herself and denied any plan."',
    );
    expect(JSON.stringify(sections)).not.toContain('suicidal intent');
    expect(sections.Formulation).toBe('');
  });

  it('makes no second call when the draft already carries the review', async () => {
    const carried = { ...DROPPED, History: 'She denied thoughts of killing herself.' };
    const { fetchImpl, calls } = stub({ chats: [{ content: JSON.stringify(carried) }] });
    const events = await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(request),
    );
    expect(calls).toHaveLength(1);
    expect(events.at(-1)).toMatchObject({ type: 'sections', sections: carried });
  });

  it('makes no second call for a source without a risk review', async () => {
    const { fetchImpl, calls } = stub({ chats: [{ content: JSON.stringify(DROPPED) }] });
    await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote({
        ...request,
        typedNotes: 'Low mood for five years. Biweekly to start.',
      }),
    );
    expect(calls).toHaveLength(1);
  });

  it('makes no second call for a Spanish note, whose sentences it would write in English', async () => {
    const { fetchImpl, calls } = stub({ chats: [{ content: JSON.stringify(DROPPED) }] });
    await drain(new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(request, 'es-MX'));
    expect(calls).toHaveLength(1);
  });

  it.each([
    ['nonsense', { content: 'not json' }],
    ['a truncated answer', { content: '{"quotes":[', doneReason: 'length' }],
    ['an HTTP failure', { status: 500, body: 'boom' }],
  ])('keeps the draft as written when the quoting call answers %s', async (_label, reply) => {
    const { fetchImpl } = stub({ chats: [{ content: JSON.stringify(DROPPED) }, reply] });
    const events = await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(request),
    );
    expect(events.at(-1)).toMatchObject({ type: 'sections', sections: DROPPED });
  });
});

describe('OllamaProvider.generateNote — a diagnostic word she never used', () => {
  const typed = 'She washes her hands until they crack, 30 times a day. Weekly from here.';
  const drafted: Sections = {
    Subjective: 'Patient presents with hand-washing compulsions, 30 times a day.',
    Objective: '',
    Assessment: '',
    Plan: 'Weekly sessions.',
  };
  const request = { instructions: '', formatName: 'Progress note', sections: SOAP, typedNotes: typed };

  it('rewrites only that section, and keeps the rewrite when nothing else changed', async () => {
    const { fetchImpl, calls } = stub({
      chats: [
        { content: JSON.stringify(drafted) },
        { content: JSON.stringify({ text: 'Patient presents with hand-washing, 30 times a day.' }) },
      ],
    });
    const events = await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(request),
    );
    expect(calls).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({
      type: 'sections',
      sections: { ...drafted, Subjective: 'Patient presents with hand-washing, 30 times a day.' },
    });
  });

  it.each([
    ['dropped a number', { content: JSON.stringify({ text: 'Patient presents with hand-washing, often.' }) }],
    ['answered nonsense', { content: 'not json' }],
    ['failed', { status: 500, body: 'boom' }],
  ])('keeps the section as drafted when the rewrite %s', async (_label, reply) => {
    const { fetchImpl } = stub({ chats: [{ content: JSON.stringify(drafted) }, reply] });
    const events = await drain(
      new OllamaProvider({ resolveModel: () => MODEL, fetchImpl }).generateNote(request),
    );
    expect(events.at(-1)).toMatchObject({ type: 'sections', sections: drafted });
  });
});

describe('OllamaProvider.preloadDraft', () => {
  it('uses the resolved model and keeps the request rate-limited', async () => {
    let now = 0;
    const { fetchImpl, generateCalls } = stub({ chats: [] });
    const local = new OllamaProvider({
      resolveModel: () => MODEL,
      fetchImpl,
      now: () => now,
      preloadIntervalMs: 100,
    });

    await local.preloadDraft();
    await local.preloadDraft();
    expect(generateCalls).toHaveLength(1);
    expect(generateCalls[0]?.body).toMatchObject({
      model: MODEL,
      prompt: '',
      stream: false,
      keep_alive: '30m',
      options: { num_ctx: NUM_CTX },
    });

    now = 100;
    await local.preloadDraft();
    expect(generateCalls).toHaveLength(2);
  });

  it('swallows a warm-up transport failure', async () => {
    let calls = 0;
    const fetchImpl = (async (input: string | URL): Promise<Response> => {
      if (String(input).endsWith('/api/generate')) calls += 1;
      throw new Error('synthetic Ollama outage');
    }) as typeof globalThis.fetch;
    const local = new OllamaProvider({
      resolveModel: () => MODEL,
      fetchImpl,
      log: () => {},
    });

    await expect(local.preloadDraft()).resolves.toBeUndefined();
    expect(calls).toBe(1);
  });
});
