/**
 * Clinical assertions that a refine operation must not invent.
 *
 * A plain list of regular expressions is tempting, but it makes grounding
 * unnecessarily brittle: "denies SI" and "denied suicidal ideation" are the
 * same assertion in a note, while their text does not match the same regexp.
 * Each assertion therefore has a stable token as well as a display regexp.
 * The token is used for grounding and the match is used only in the notice.
 */
export interface ClinicalAssertion {
  /** Stable semantic identity used when comparing note, source, and revision. */
  readonly token: string;
  /** High-precision clinical collocation; never a bare word such as "risk". */
  readonly re: RegExp;
}

/** Mental-status-examination observations, not safe defaults. */
export const MSE_ASSERTIONS: readonly ClinicalAssertion[] = [
  { token: 'mse:orientation', re: /\balert and (?:fully )?oriented\b/i },
  { token: 'mse:orientation', re: /\boriented\s*(?:x|times)\s*[1-4]\b/i },
  { token: 'mse:orientation', re: /\boriented to person,? place,? time(?:,? and)? situation\b/i },
  { token: 'mse:mood-affect', re: /\b(?:mood|affect)\s+(?:was\s+|is\s+)?congruent\b/i },
  {
    token: 'mse:mood-affect',
    re: /\bcongruent with (?:his |her |their )?(?:reported |stated )?(?:mood|affect|speech)\b/i,
  },
  {
    token: 'mse:mood-affect',
    re: /\b(?:mood|affect)\s+(?:was\s+|is\s+)?(?:euthymic|dysphoric|anxious|irritable|stable|appropriate)\b/i,
  },
  {
    token: 'mse:affect-range',
    re: /\b(?:full range|full and reactive|restricted|constricted|blunted|flat) affect\b/i,
  },
  { token: 'mse:limits', re: /\b(?:within|w\/in) normal limits\b/i },
  {
    token: 'mse:distress',
    re: /\b(?:no (?:acute|apparent) distress|no signs of distress|in no distress)\b/i,
  },
  {
    token: 'mse:behavior',
    re: /\b(?:behavior|behaviour)\s+(?:was\s+|is\s+|were\s+)?(?:cooperative|pleasant|calm|appropriate)\b/i,
  },
  {
    token: 'mse:behavior',
    re: /\b(?:cooperative|pleasant|calm) and (?:cooperative|pleasant|calm|engaged)\b/i,
  },
  { token: 'mse:eye-contact', re: /\b(?:maintained|good|poor|limited)\s+eye contact\b/i },
  { token: 'mse:appearance', re: /\bwell[- ]groomed\b/i },
  { token: 'mse:appearance', re: /\b(?:appropriately|casually|neatly) (?:dressed|groomed)\b/i },
  { token: 'mse:grooming', re: /\b(?:good|adequate|fair) (?:hygiene|grooming)\b/i },
  {
    token: 'mse:psychomotor',
    re: /\bpsychomotor\s+(?:activity|agitation|retardation|slowing|restlessness)\b/i,
  },
  {
    token: 'mse:speech',
    re: /\b(?:speech|verbal output)\s+(?:was\s+|is\s+|were\s+)?(?:normal|unremarkable|coherent|clear|pressured|rapid|slow)\b/i,
  },
  {
    token: 'mse:speech',
    re: /\bspeech (?:rate|volume|tone) (?:was|is|were)\s+(?:normal|appropriate|within normal limits)\b/i,
  },
  {
    token: 'mse:thought-process',
    re: /\b(?:thought process|thought processes?)\s+(?:was\s+|is\s+|were\s+)?(?:normal|unremarkable|coherent|linear|logical|organized|organised|goal[- ]directed)\b/i,
  },
  {
    token: 'mse:thought-process',
    re: /\b(?:linear|logical|organized|organised)(?: and)? goal[- ]directed\b/i,
  },
  {
    token: 'mse:thought-process',
    re: /\bgoal[- ]directed(?: and)? (?:linear|logical|organized|organised)\b/i,
  },
  {
    token: 'mse:thought-content',
    re: /\bthought content\s+(?:was\s+|is\s+|were\s+)?(?:normal|unremarkable|appropriate)\b/i,
  },
  {
    token: 'mse:psychosis-absent',
    re: /\bno (?:overt |apparent )?(?:delusions?|hallucinations?|perceptual (?:disturbances?|abnormalities?)|psychosis|paranoia|thought disorder)\b/i,
  },
  {
    token: 'mse:psychosis-absent',
    re: /\bno evidence of (?:psychosis|hallucinations?|delusions?|paranoia)\b/i,
  },
  {
    token: 'mse:psychosis-absent',
    re: /\b(?:[Dd]en(?:y|ies|ied)|[Nn]o) (?:AVH|auditory or visual hallucinations?)\b/,
  },
  {
    token: 'mse:cognition',
    re: /\b(?:memory|attention|concentration|cognition|orientation)\s+(?:was\s+|is\s+|were\s+)?(?:grossly\s+)?intact\b/i,
  },
  {
    token: 'mse:cognition',
    re: /\b(?:memory|attention|concentration|cognition)\s+(?:was\s+|is\s+|were\s+)?(?:normal|within normal limits)\b/i,
  },
  {
    token: 'mse:insight-judgment',
    re: /\b(?:insight|judgment|judgement)\s+(?:and\s+)?(?:judgment|judgement|insight)\s+(?:was\s+|is\s+|were\s+)?(?:good|fair|intact|limited|adequate)\b/i,
  },
  {
    token: 'mse:insight-judgment',
    re: /\b(?:insight and judgment|judgment and insight|insight and judgement|judgement and insight)\b/i,
  },
];

/**
 * Risk assertions, including both negative findings and positive risk
 * findings. Shorthand patterns deliberately require uppercase SI/HI; the
 * ordinary words "si" and "hi" must remain ordinary prose.
 */
export interface RiskPattern {
  /** Risk dimension used by the shortening guard. */
  readonly token: string;
  readonly re: RegExp;
}

export const RISK_PATTERNS: readonly RiskPattern[] = [
  {
    token: 'risk:si',
    re: /\b(?:deny|denies|denied|no|without)\s+(?:any\s+|current\s+)?suicidal(?:\s+(?:ideation|thoughts?|intent|plan))?\b/i,
  },
  { token: 'risk:si', re: /\b(?:[Dd]eny|[Dd]enies|[Dd]enied|[Nn]o|[Ww]ithout)\s+(?:any\s+|current\s+)?SI\b/ },
  {
    token: 'risk:si',
    re: /\b(?:no|den(?:y|ies|ied)|without)\s+(?:any\s+|current\s+)?suicidal\s+(?:or\s+homicidal\s+)?(?:ideation|thoughts?|intent|plan)\b/i,
  },
  {
    token: 'risk:si',
    re: /\b(?:suicidal ideation|suicidal thoughts?)\s+(?:was\s+)?(?:denied|absent|negative)\b/i,
  },
  { token: 'risk:si', re: /\bSI\s+(?:was\s+)?(?:denied|absent|negative)\b/ },
  {
    token: 'risk:si',
    re: /\b(?:not suicidal|no evidence of (?:suicidal ideation|SI)|suicidality\s+(?:was\s+)?denied)\b/i,
  },
  {
    token: 'risk:sh',
    re: /\b(?:den(?:y|ies|ied)|reports?|endorses?|no|without)\s+(?:any\s+|current\s+)?(?:self[- ]harm|self[- ]injurious behaviou?r|thoughts? of hurting (?:themself|himself|herself|oneself|self))\b/i,
  },
  {
    token: 'risk:sh',
    re: /\b(?:self[- ]harm|self[- ]injurious behaviou?r)\s+(?:was\s+)?(?:denied|absent|negative)\b/i,
  },
  {
    token: 'risk:hi',
    re: /\b(?:deny|denies|denied|no|without)\s+(?:any\s+|current\s+)?homicidal(?:\s+(?:ideation|thoughts?|intent|plan))?\b/i,
  },
  { token: 'risk:hi', re: /\b(?:[Dd]eny|[Dd]enies|[Dd]enied|[Nn]o|[Ww]ithout)\s+(?:any\s+|current\s+)?HI\b/ },
  {
    token: 'risk:hi',
    re: /\b(?:homicidal ideation|homicidal thoughts?)\s+(?:was\s+)?(?:denied|absent|negative)\b/i,
  },
  { token: 'risk:hi', re: /\bHI\s+(?:was\s+)?(?:denied|absent|negative)\b/ },
  { token: 'risk:hi', re: /\b(?:not homicidal|no evidence of (?:homicidal ideation|HI))\b/i },
  { token: 'risk:safety', re: /\bno (?:current )?(?:safety concerns?|acute risk|risk indicators?)\b/i },
  {
    token: 'risk:safety',
    re: /\b(?:safety concerns?|acute risk|risk indicators?)\s+(?:were\s+)?(?:denied|absent|negative)\b/i,
  },
  { token: 'risk:safety', re: /\bcontract(?:s|ed|ing)? for safety\b/i },
  { token: 'risk:safety', re: /\bsafety plan(?:ning)? (?:was\s+|is\s+)?(?:in place|reviewed)\b/i },
  { token: 'risk:si', re: /\b[Nn]o SI\b/ },
  { token: 'risk:hi', re: /\b[Nn]o HI\b/ },
];

/** Positive risk findings are blocked when newly invented, but are not used
 * as aliases for an existing negative finding during shortening. */
export const POSITIVE_RISK_PATTERNS: readonly RiskPattern[] = [
  {
    token: 'risk-positive:si',
    re: /\b(?:reports?|endorses?|admits?|has|with)\s+(?:current\s+)?(?:suicidal ideation|suicidal thoughts?|suicidal intent|suicidal plan)\b/i,
  },
  { token: 'risk-positive:si', re: /\b(?:passive|active) suicidal (?:ideation|thoughts?)\b/i },
  {
    token: 'risk-positive:sh',
    re: /\b(?:reports?|endorses?|admits?|has|with)\s+(?:current\s+)?(?:self[- ]harm|self[- ]injurious behaviou?r|thoughts? of hurting (?:themself|himself|herself|oneself|self))\b/i,
  },
  {
    token: 'risk-positive:hi',
    re: /\b(?:reports?|endorses?|admits?|has|with)\s+(?:current\s+)?(?:homicidal ideation|homicidal thoughts?|homicidal intent|homicidal plan)\b/i,
  },
  { token: 'risk-positive:safety', re: /\b(?:active|significant|imminent|acute) (?:safety )?risk\b/i },
];

/** Risk ratings and care-disposition recommendations that read as determinations. */
export const DISPOSITION_ASSERTIONS: readonly ClinicalAssertion[] = [
  { token: 'risk:rating:low', re: /\blow (?:acute )?risk\b/i },
  { token: 'risk:rating:moderate', re: /\bmoderate (?:acute )?risk\b/i },
  { token: 'risk:rating:high', re: /\bhigh (?:acute )?risk\b/i },
  { token: 'risk:rating:elevated', re: /\belevated (?:acute )?risk\b/i },
  { token: 'risk:rating:imminent', re: /\bimminent (?:acute )?risk\b/i },
  {
    token: 'risk:rating:low',
    re: /\brisk (?:level )?(?:is|was|remains|assessed as|deemed) low\b/i,
  },
  {
    token: 'risk:rating:moderate',
    re: /\brisk (?:level )?(?:is|was|remains|assessed as|deemed) moderate\b/i,
  },
  {
    token: 'risk:rating:high',
    re: /\brisk (?:level )?(?:is|was|remains|assessed as|deemed) high\b/i,
  },
  {
    token: 'risk:rating:elevated',
    re: /\brisk (?:level )?(?:is|was|remains|assessed as|deemed) elevated\b/i,
  },
  { token: 'recommendation:higher-level', re: /\bhigher level of care\b/i },
  {
    token: 'recommendation:higher-level',
    re: /\b(?:recommend(?:s|ed|ing)?|refer(?:red|s|ring)?|consider(?:s|ed|ing)?) (?:for |to )?(?:seek(?:ing)? |pursue(?:ing)? )?(?:a )?higher level of care\b/i,
  },
  {
    token: 'recommendation:inpatient',
    re: /\b(?:recommend(?:s|ed|ing)?|refer(?:red|s|ring)?|consider(?:s|ed|ing)?) (?:for |to )?(?:seek(?:ing)? |pursue(?:ing)? )?(?:an? )?inpatient\b/i,
  },
  {
    token: 'recommendation:residential',
    re: /\b(?:recommend(?:s|ed|ing)?|refer(?:red|s|ring)?|consider(?:s|ed|ing)?) (?:for |to )?(?:seek(?:ing)? |pursue(?:ing)? )?(?:a )?residential treatment\b/i,
  },
  {
    token: 'recommendation:hospitalization',
    re: /\b(?:recommend(?:s|ed|ing)?|refer(?:red|s|ring)?|consider(?:s|ed|ing)?) (?:for |to )?(?:seek(?:ing)? |pursue(?:ing)? )?(?:a )?hospitali[sz]ation\b/i,
  },
  {
    token: 'recommendation:psychiatric-care',
    re: /\b(?:recommend(?:s|ed|ing)?|refer(?:red|s|ring)?|consider(?:s|ed|ing)?) (?:for |to )?(?:seek(?:ing)? |pursue(?:ing)? )?(?:a )?(?:psychiatric (?:evaluation|assessment|hospitalization|hospitalisation)|emergency evaluation|crisis evaluation)\b/i,
  },
  {
    token: 'recommendation:medication',
    re: /\b(?:recommend(?:s|ed|ing)?|advis(?:e|ed|es|ing)|encourag(?:e|ed|es|ing)|consider(?:s|ed|ing)?) (?:the patient to )?(?:start|stop|change|increase|decrease|adjust|continue)\s+(?:the )?(?:medication|dose|medications)\b/i,
  },
  {
    token: 'recommendation:therapy',
    re: /\b(?:would benefit from|recommend(?:s|ed|ing)?|encourag(?:e|ed|es|ing)?)\s+(?:continued |additional |individual |group |supportive |trauma[- ]focused |cognitive[- ]behavioral )?(?:therapy|treatment|counseling|counselling)\b/i,
  },
  {
    token: 'recommendation:follow-up',
    re: /\b(?:recommend(?:s|ed|ing)?|advis(?:e|d|es|ing)|encourag(?:e|d|es|ing)?)\s+(?:the patient to )?(?:follow[- ]up|return|schedule|consult)\b/i,
  },
  {
    token: 'recommendation:benefit',
    re: /\bwould benefit from (?:a |additional )?(?:higher level of care|evaluation|assessment|referral|medication consultation)\b/i,
  },
  { token: 'risk:future-oriented', re: /\bfuture[- ]oriented\b/i },
];

/** The full display list retained for callers that only need regular expressions. */
export const STOCK_CLINICAL_ASSERTIONS: readonly RegExp[] = [
  ...MSE_ASSERTIONS.map((assertion) => assertion.re),
  ...RISK_PATTERNS.map((pattern) => pattern.re),
  ...POSITIVE_RISK_PATTERNS.map((pattern) => pattern.re),
  ...DISPOSITION_ASSERTIONS.map((assertion) => assertion.re),
];

/** All assertions with stable tokens, used by the refine guard's diff. */
export const CLINICAL_ASSERTIONS: readonly ClinicalAssertion[] = [
  ...MSE_ASSERTIONS,
  ...RISK_PATTERNS,
  ...POSITIVE_RISK_PATTERNS,
  ...DISPOSITION_ASSERTIONS,
];

/** Finds assertions; token identity, rather than wording, is what grounds it. */
export function clinicalAssertionTokens(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const assertion of CLINICAL_ASSERTIONS) {
    const match = text.match(assertion.re);
    if (match && !found.has(assertion.token)) found.set(assertion.token, match[0]);
  }
  return found;
}

/**
 * The risk negations present in a text. Kept separate from the complete
 * assertion scan: a positive risk finding and a negative finding must not be
 * interchangeable when protecting an existing note under shortening.
 */
export function riskTokens(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const pattern of RISK_PATTERNS) {
    const match = text.match(pattern.re);
    if (match && !found.has(pattern.token)) found.set(pattern.token, match[0]);
  }
  return found;
}

/** Positive risk findings, kept under shortening as a separate fact identity. */
export function positiveRiskTokens(text: string): Map<string, string> {
  const found = new Map<string, string>();
  for (const pattern of POSITIVE_RISK_PATTERNS) {
    const match = text.match(pattern.re);
    if (match && !found.has(`positive:${pattern.token}`)) found.set(`positive:${pattern.token}`, match[0]);
  }
  return found;
}
