import { z } from 'zod';

/**
 * The capture: what a direct import starts from.
 *
 * Lane 1 (`scratch/claude-import-extraction/`) owns extraction and owns the
 * shape it actually produces. This file states the **minimum** contract lane 2
 * needs, so the structuring step can be tested at all, and it is deliberately
 * not a claim about what the exporter emits. The two shapes have to be
 * reconciled before anything ships; until then this is a stated assumption, and
 * the results doc says so.
 *
 * Three things are load-bearing here, and each maps to a way a real capture
 * goes wrong:
 *
 * 1. **Message ids and original text, verbatim.** Every later claim in a
 *    proposal is checked against `text` by offset. If the capture paraphrases,
 *    edits, or re-wraps a message, "verbatim" is unverifiable and the whole
 *    fidelity chain becomes decoration.
 * 2. **Parent links, so branches survive.** Editing or regenerating a reply
 *    forks the conversation. A capture that flattens the fork would splice an
 *    abandoned draft into a clinical record.
 * 3. **A completeness block.** A capture that stopped at page 3 of 9 must not
 *    be able to say "here is your patient's history"; the difference between
 *    "she has four sessions" and "we found four sessions" is the whole claim.
 */

export const CAPTURE_FORMAT = 'apunta.claude.capture';
export const CAPTURE_VERSION = 1;

export const CaptureRoleSchema = z.enum(['human', 'assistant']);
export type CaptureRole = z.infer<typeof CaptureRoleSchema>;

export const CaptureMessageSchema = z.strictObject({
  message_id: z.string().min(1),
  role: CaptureRoleSchema,
  /** UTC ISO-8601 — when the message was sent. Never a session date. */
  sent_at: z.string().nullable(),
  /** The original text, byte for byte. Not trimmed, not re-wrapped, not edited. */
  text: z.string(),
  /** `parent_message_id` of the message this one revises, when the source records one. */
  parent_message_id: z.string().nullable(),
  /** Attached files. Counted, never imported — but a silent drop is a defect. */
  attachments: z.number().int().nonnegative(),
});
export type CaptureMessage = z.infer<typeof CaptureMessageSchema>;

export const CaptureConversationSchema = z.strictObject({
  conversation_id: z.string().min(1),
  title: z.string(),
  chat_created_at: z.string().nullable(),
  /** The chat's own last-activity time. The trap this whole lane is about. */
  chat_updated_at: z.string().nullable(),
  messages: z.array(CaptureMessageSchema),
});
export type CaptureConversation = z.infer<typeof CaptureConversationSchema>;

export const CaptureCompletenessSchema = z.strictObject({
  /** False when any page, conversation or message was declared and not read. */
  complete: z.boolean(),
  /** Pages the inventory declared. */
  pages_declared: z.number().int().nonnegative(),
  /** Pages actually read. */
  pages_read: z.number().int().nonnegative(),
  conversations_declared: z.number().int().nonnegative(),
  messages_declared: z.number().int().nonnegative(),
  /** Counts only. Never a title, never text, never a URL. */
  failures: z.array(
    z.strictObject({
      stage: z.enum(['inventory', 'conversation', 'message', 'schema']),
      code: z.string().min(1),
      count: z.number().int().nonnegative(),
    }),
  ),
});
export type CaptureCompleteness = z.infer<typeof CaptureCompletenessSchema>;

export const CaptureBundleSchema = z.strictObject({
  capture_format: z.literal(CAPTURE_FORMAT),
  version: z.literal(CAPTURE_VERSION),
  captured_at: z.string(),
  conversations: z.array(CaptureConversationSchema),
  completeness: CaptureCompletenessSchema,
});
export type CaptureBundle = z.infer<typeof CaptureBundleSchema>;

/** Read a capture, refusing anything that is not exactly this version. */
export function parseCapture(json: unknown): CaptureBundle {
  const parsed = CaptureBundleSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new Error(
      `Capture is not ${CAPTURE_FORMAT} v${String(CAPTURE_VERSION)}: ` +
        `${first?.path.join('.') ?? '?'} ${first?.message ?? 'unknown'}`,
    );
  }
  return parsed.data;
}

// --- Lookups ------------------------------------------------------------------

export interface MessageLocation {
  readonly conversation: CaptureConversation;
  readonly message: CaptureMessage;
  /** Position in `conversation.messages`, which is the order the thread was captured in. */
  readonly index: number;
}

export class CaptureIndex {
  private readonly byId = new Map<string, MessageLocation>();
  readonly conversations: ReadonlyMap<string, CaptureConversation>;

  constructor(readonly bundle: CaptureBundle) {
    const conversations = new Map<string, CaptureConversation>();
    for (const conversation of bundle.conversations) {
      conversations.set(conversation.conversation_id, conversation);
      conversation.messages.forEach((message, index) => {
        // A duplicated id would make every later reference ambiguous, so it is
        // refused here rather than silently resolved to the last one.
        const existing = this.byId.get(message.message_id);
        if (existing !== undefined) {
          throw new Error(`Duplicate message id in capture: ${message.message_id}`);
        }
        this.byId.set(message.message_id, { conversation, message, index });
      });
    }
    this.conversations = conversations;
  }

  locate(messageId: string): MessageLocation | null {
    return this.byId.get(messageId) ?? null;
  }

  /**
   * The branch the therapist was last looking at, when the capture recorded
   * parent links: walk back from the latest message by time (the later array
   * position breaking a tie) and keep only that chain. Where no message names a
   * parent that is also present, array order is all there is and is used as is.
   *
   * Same rule as `liveThread` in `server/src/import/claude.ts`, re-derived here
   * rather than imported: this lane must not couple its research build to
   * production source, and the two are compared by test.
   */
  liveThreadIds(conversationId: string): readonly string[] {
    const conversation = this.conversations.get(conversationId);
    if (conversation === null || conversation === undefined) return [];
    const present = new Set(conversation.messages.map((message) => message.message_id));
    const linked = conversation.messages.some(
      (message) =>
        message.parent_message_id !== null &&
        message.parent_message_id !== message.message_id &&
        present.has(message.parent_message_id),
    );
    if (!linked) return conversation.messages.map((message) => message.message_id);

    let tip: CaptureMessage | undefined;
    for (const message of conversation.messages) {
      if (tip === undefined || (message.sent_at ?? '') >= (tip.sent_at ?? '')) tip = message;
    }
    if (tip === undefined) return [];
    const chain: string[] = [];
    const seen = new Set<string>();
    let at: CaptureMessage | undefined = tip;
    while (at !== undefined && !seen.has(at.message_id)) {
      seen.add(at.message_id);
      chain.push(at.message_id);
      at = at.parent_message_id === null ? undefined : this.byId.get(at.parent_message_id)?.message;
    }
    return chain.reverse();
  }

  /** Why a message id cannot be cited, or null when it can. */
  citationFault(messageId: string, conversationId: string): string | null {
    const location = this.byId.get(messageId);
    if (location === undefined) return 'unknown_source_id';
    if (location.conversation.conversation_id !== conversationId) return 'cross_conversation_source';
    if (!this.liveThreadIds(conversationId).includes(messageId)) return 'off_thread_source';
    return null;
  }
}
