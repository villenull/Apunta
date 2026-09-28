import { z } from 'zod';

import { PROPOSAL_FORMAT, PROPOSAL_VERSION } from './keys.js';

/**
 * The import proposal, version 1.
 *
 * This is the contract between a captured set of Claude conversations and
 * Apunta, when something other than the deterministic reader (`server/src/import/claude.ts`)
 * does the structuring. The design rule is one sentence: **a note is a set of
 * references, not a body.** Every note in a proposal is a list of spans — a
 * message id plus either a quoted string or a character range — and the note
 * text is whatever those spans say, recomputed from the capture. The declared
 * `text` is required anyway, so a mismatch is *detected* rather than quietly
 * corrected, but the importer must write the recomputed text and never the
 * declared one.
 *
 * Consequences worth stating, because they are the whole point:
 *
 * - Paraphrase, summarisation, "cleaning up" a note and inventing a clinical
 *   sentence are all the same failure and all are rejected: the text is not
 *   what the source says.
 * - An invented or misattributed source id is rejected before any of that, so
 *   a note can never cite a message that does not exist, belongs to another
 *   conversation, or sits on a branch the therapist abandoned.
 * - A session date is a claim with evidence, not a field. `stated` needs quoted
 *   source text that says so; `inferred` and `unknown` go to the therapist as
 *   decisions and are never auto-eligible.
 * - Eligibility is computed by the validator from session dates against a
 *   rolling window, and never from a chat timestamp.
 *
 * Version 1 is what the spike tests. Changing any meaning here means
 * `version: 2` and a validator that reads both; the id in `prompt` is recorded
 * in every proposal so a bad batch can always be traced to the instructions
 * that produced it.
 */

export const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD.');

const SpanFields = { message_id: z.string().min(1) };

/** A span by quoted text: readable, and exactly as precise as a unique match. */
export const QuoteSpanSchema = z.strictObject({
  ...SpanFields,
  quote: z.string().min(1),
});

/** A span by character range into the message's original text. */
export const RangeSpanSchema = z.strictObject({
  ...SpanFields,
  start: z.number().int().nonnegative(),
  end: z.number().int().nonnegative(),
});

export const SpanSchema = z.union([QuoteSpanSchema, RangeSpanSchema]);
export type Span = z.infer<typeof SpanSchema>;
export type QuoteSpan = z.infer<typeof QuoteSpanSchema>;
export type RangeSpan = z.infer<typeof RangeSpanSchema>;

export const isQuoteSpan = (span: Span): span is QuoteSpan => 'quote' in span;

export const IdentityRoleSchema = z.enum([
  /** A patient in her own right. */
  'patient',
  /** Named inside another patient's notes — a relative, a colleague. Never a patient without a decision. */
  'relative_mention',
  /** A real conversation that is not about a patient (a recipe, a lease). */
  'not_a_patient',
  /** Not decided by the structuring step; a question for the therapist. */
  'unassigned',
]);
export type IdentityRole = z.infer<typeof IdentityRoleSchema>;

export const IdentitySchema = z.strictObject({
  /** Stable within a proposal; two people never share one. */
  identity_key: z.string().min(1),
  display_name: z.string().min(1),
  aliases: z.array(z.string()),
  role: IdentityRoleSchema,
  /** Where the name came from, so the import can tell her typed it from a guess. */
  name_basis: z.enum(['therapist_list', 'stated_in_source', 'conversation_title']),
  /**
   * Spans establishing this person in their own right. Required for a patient;
   * the validator refuses a patient whose only mentions sit inside another
   * patient's note text — which is what a relative looks like.
   */
  evidence: z.array(SpanSchema),
  /** Another identity this one is deliberately kept apart from, same name. */
  same_name_as: z.array(z.string()),
  disambiguation: z
    .strictObject({
      kind: z.enum(['distinct_person', 'needs_decision']),
      evidence: z.array(SpanSchema),
    })
    .nullable(),
});
export type Identity = z.infer<typeof IdentitySchema>;

export const SessionDateBasisSchema = z.enum([
  /** Quoted source text states the day. The only basis that can qualify a patient. */
  'stated',
  /** A reading of the conversation, not a statement. Needs a decision. */
  'inferred',
  /** The conversation never says. Needs a decision. */
  'unknown',
]);
export type SessionDateBasis = z.infer<typeof SessionDateBasisSchema>;

export const NoteSchema = z.strictObject({
  /** 1 for the first version of a session's note. */
  revision: z.number().int().positive(),
  /** The note key this one replaces, or null for the first. */
  supersedes: z.string().nullable(),
  /**
   * The revision this one replaces. The symbolic form exists so a proposal can
   * be hand-written and read; the validator resolves it against the keys it
   * derives itself, so it is checked exactly like a literal key.
   */
  supersedes_revision: z.number().int().positive().nullable().default(null),
  spans: z.array(SpanSchema).min(1),
  /** How the spans are joined. Anything not exactly a quote is rejected. */
  joiner: z.string().default('\n\n'),
  /**
   * The text the proposal claims the spans say. Checked against the recomputed
   * text and never written; present so that a mismatch is visible.
   */
  text: z.string(),
  title_hint: z.string().nullable().default(null),
});
export type ProposalNote = z.infer<typeof NoteSchema>;

export const SessionSchema = z.strictObject({
  conversation_id: z.string().min(1),
  /**
   * The patient this sitting belongs to. A claim, and checked: the identity
   * must exist, be a patient, and have evidence in *this* conversation, so a
   * session cannot be filed under whoever shares the name.
   */
  identity_key: z.string().min(1),
  /** The messages making up this sitting, in thread order. Defines the session key. */
  message_ids: z.array(z.string().min(1)).min(1),
  /** `YYYY-MM-DD` when the day is known, null otherwise. Never a chat timestamp. */
  session_date: DaySchema.nullable(),
  session_date_basis: SessionDateBasisSchema,
  /** Spans that state the day, required when the basis is `stated`. */
  date_evidence: z.array(SpanSchema),
  notes: z.array(NoteSchema),
  /** Optional; recomputed and compared when present. */
  session_key: z.string().optional(),
});
export type ProposalSession = z.infer<typeof SessionSchema>;

export const DecisionSchema = z.strictObject({
  kind: z.enum(['identity', 'date', 'coverage', 'revision']),
  /** The thing the decision is about: an identity key or a session key. */
  subject: z.string().min(1),
  question: z.string().min(1),
  options: z.array(z.string()),
  /** Set when the therapist has already answered, in a later file. */
  answer: z.string().nullable().default(null),
});
export type Decision = z.infer<typeof DecisionSchema>;

export const ProposalContextSchema = z.strictObject({
  reference_date: DaySchema,
  /** IANA zone the practice runs in. Nothing here reads the machine's zone. */
  timezone: z.string().min(1),
  eligibility_months: z.number().int().positive().default(3),
});
export type ProposalContext = z.infer<typeof ProposalContextSchema>;

export const ProposalSchema = z.strictObject({
  proposal_format: z.literal(PROPOSAL_FORMAT),
  version: z.literal(PROPOSAL_VERSION),
  /** The preparation prompt that produced this, by id and digest. */
  prompt: z.strictObject({ id: z.string().min(1), version: z.string().min(1), sha256: z.string().min(1) }),
  produced_by: z.strictObject({
    kind: z.enum(['claude', 'human', 'unknown']),
    label: z.string(),
    model: z.string().nullable(),
    /** `none` until an authorised synthetic-account trial exists. */
    account: z.enum(['none', 'synthetic', 'unverified']).default('none'),
  }),
  context: ProposalContextSchema,
  /** Optional partial import: which identities this proposal is asking for. */
  scope: z
    .strictObject({ include_identities: z.array(z.string()) })
    .nullable()
    .default(null),
  identities: z.array(IdentitySchema),
  sessions: z.array(SessionSchema),
  decisions: z.array(DecisionSchema).default([]),
});
export type Proposal = z.infer<typeof ProposalSchema>;

export class ProposalFormatError extends Error {
  constructor(readonly issue: string) {
    super(`Proposal is not ${PROPOSAL_FORMAT} v${String(PROPOSAL_VERSION)}: ${issue}`);
    this.name = 'ProposalFormatError';
  }
}

export function parseProposal(json: unknown): Proposal {
  const parsed = ProposalSchema.safeParse(json);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ProposalFormatError(`${first?.path.join('.') ?? '?'} ${first?.message ?? 'is not valid'}`);
  }
  return parsed.data;
}
