/**
 * The rubric's marker lists, transcribed from `e2e/fixtures/eval/rubric.md`.
 *
 * They are copied verbatim rather than paraphrased: the rubric is the contract
 * and a "tidied up" regex here would silently change what the eval measures.
 * A test asserts each one against the examples the rubric gives.
 *
 * All of these are compiled fresh per use. A `g`-flagged regex carries
 * `lastIndex` between calls, and a shared instance would skip every second
 * match — which on this corpus would read as a model that stopped fabricating.
 */

/** F6 core — gating. Multiword and conclusion-forming; high precision. */
export function f6Core(): RegExp {
  return /\b(?:consistent with|suggestive of|indicative of|in keeping with|appears to be|secondary to|attributable to|precipitated by|exacerbated by|maintained by|driven by|in the context of|points? (?:to|toward|towards)|progress(?:ing)? toward|respond(?:s|ing|ed)? (?:well )?to|response to treatment|suggests?|suggesting|indicates?|indicating|consistent picture|presentation is consistent|working (?:diagnosis|formulation)|differential)\b/gi;
}

/** F6 extended — AUTO-FLAG. Lower precision; reported, never gating. */
export function f6Extended(): RegExp {
  return /\b(?:likely|unlikely|reflects?|reflecting|underlying|due to|related to|associated with|contributing (?:to|factor)|would benefit from|warrants?|stems from|rooted in|as evidenced by|appear(?:s|ed) to be|seems? to be|which (?:may|might) (?:explain|reflect)|in response to)\b/gi;
}

/** H1a — the whole body is a placeholder. */
export function h1Placeholder(): RegExp {
  return /^\s*(?:not (?:discussed|addressed|applicable|covered|reported|recorded)|none(?: recorded| documented| noted| reported| given)?|n\/?a|nil|nothing (?:recorded|reported|noted|to report)|no (?:information|material|content|data)|[-–—.·*]+)\s*[.]?\s*$/i;
}

/** H1b — the body narrates the absence, or the clinician's deferral. */
export function h1Narrated(): RegExp {
  return /not addressed in this dictation|not (?:discussed|addressed|covered) (?:this|during (?:this|the)) (?:session|dictation)|no (?:objective )?(?:observations?|assessment|formulation|plan|material) (?:were |was )?(?:recorded|documented|noted|offered|provided|given)|the (?:clinician|therapist) (?:did not|has not|declined to|chose not)|(?:assessment|formulation) (?:is |was )?(?:deferred|pending|withheld|to follow)|to be (?:completed|determined|provided) (?:at|in) (?:a |the )?(?:later|next|future)|remains? to be (?:completed|determined)/i;
}

/** T3 — dictation artefacts carried through into the note. */
export function t3Artefacts(): RegExp {
  return /\b(um|uh|erm)\b|scratch that|\byou know\b|^sorry,|\banyway\b/im;
}

/** T4 — meta-commentary: the model talking about its own job. */
export function t4Meta(): RegExp {
  return /based on the transcript|the (therapist|clinician) (said|stated|dictated)|as an AI|^here is|i (have|will) (drafted|written)/im;
}

/** T1 — a markdown list marker or heading at the start of a line. */
export function t1Markdown(): RegExp {
  return /^\s*(?:[-*+]\s|#{1,6}\s|\d+[.)]\s)|\*\*/m;
}

/**
 * Whitespace collapse, applied to both the note and the source before any
 * match (rubric §7).
 *
 * The fixtures are hard-wrapped at 76 columns, so eight quoted spans and three
 * `mustCapture` facts in this corpus straddle a newline and match only once
 * this has run. Skipping it does not produce a few false negatives; it
 * produces a scorer that quietly reports the model dropped material it
 * faithfully carried.
 */
export function collapse(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Case- and whitespace-insensitive, which is what every comparison here wants. */
export function normalise(text: string): string {
  return collapse(text).toLowerCase();
}

/** Compile a sidecar pattern. `m` only where the pattern anchors, per §7. */
export function compile(source: string): RegExp {
  const anchored = source.includes('^') || source.includes('$');
  return new RegExp(source, anchored ? 'im' : 'i');
}
