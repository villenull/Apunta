/**
 * C-LANG@1 rule 5: what a section name *means*, separately from what it is
 * called.
 *
 * A guard that tests `section === 'Risk review'` only works in one language, in
 * one format, and breaks the first time she renames a header. The role is the
 * stable thing: a guard asks for the `risk` role and gets it whether the format
 * is the owner's English progress note or its Spanish counterpart.
 *
 * Two rules this file keeps, both of which cost something to get wrong:
 *
 * - **The map is keyed by name alone** — no format, no section index — and is
 *   matched case- and accent-insensitively, because `Plan`, `PLAN` and
 *   `Plan` are the same section. Nothing is ever rewritten: a stored string
 *   stays exactly as she typed it and the role is derived on every read.
 * - **Nothing here invents a role.** The fourteen ids are the ones the
 *   contract names and the ones S1.1's three tables produce. A name they do
 *   not cover is `custom`, and inventing a fifteenth id to make a name fit
 *   would be a clinical decision taken by accident.
 *
 * The names below are S1.1's (`docs/research/es-mx-clinical-documentation.md`
 * §5.1, §5.2, §5.3). English `Plan` is the fourth section of both the SOAP and
 * the intake fingerprint (`server/src/ai/default-instructions.ts`, and
 * `server/src/seed.ts`), so it is registered **once** against the single role
 * `plan`. In Spanish the two are different strings anyway — `Plan` for SOAP,
 * `Plan terapéutico` for intake — and both are `plan`. A consumer that has to
 * tell SOAP's `Plan` from intake's needs the *format*, not the role; S5.1 is
 * the card that passes it in.
 */

/** The fourteen roles the contract names, in the order the tables give them. */
export const SECTION_ROLE_IDS = [
  // Her seven progress-note sections (§5.1).
  'location',
  'presentation',
  'risk',
  'discussion',
  'intervention',
  'actions',
  'next_session',
  // SOAP (§5.2).
  'subjective',
  'objective',
  'assessment',
  'plan',
  // Intake (§5.3). Its fourth section is `plan` again, not a new role.
  'presenting_problem',
  'history',
  'formulation',
] as const;

export type SectionRole = (typeof SECTION_ROLE_IDS)[number];

/** What a name the fourteen do not cover gets. A role, not a failure. */
export const CUSTOM_SECTION_ROLE = 'custom';

export type SectionRoleId = SectionRole | typeof CUSTOM_SECTION_ROLE;

/**
 * NFD, combining marks stripped, lowercased, outer space trimmed.
 *
 * Spanish section names are written with accents (`Revisión de riesgo`,
 * `Intervención`) and whichever of them a format carries should resolve to the
 * same role as its unaccented twin, so the marks go before the comparison.
 * `Á` and `A` are the same letter; the accent is a spelling choice.
 */
export function normaliseSectionName(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
}

/** Every name S1.1's three tables contribute, paired with the role it means. */
const REGISTERED: readonly (readonly [names: string, role: SectionRole])[] = [
  // §5.1 — her seven progress-note sections.
  ['Location', 'location'],
  ['Lugar', 'location'],
  ['Client presentation', 'presentation'],
  ['Presentación del cliente', 'presentation'],
  ['Risk review', 'risk'],
  ['Revisión de riesgo', 'risk'],
  ['Discussion', 'discussion'],
  ['Temas tratados', 'discussion'],
  ['Intervention', 'intervention'],
  ['Intervención', 'intervention'],
  ['Out of session actions', 'actions'],
  ['Tareas entre sesiones', 'actions'],
  ['Note for next session', 'next_session'],
  ['Nota para la próxima sesión', 'next_session'],
  // §5.2 — SOAP. `Plan` is spelled the same in both languages, so the English
  // row above and this one share a single key; it is listed once.
  ['Subjective', 'subjective'],
  ['Subjetivo', 'subjective'],
  ['Objective', 'objective'],
  ['Objetivo', 'objective'],
  ['Assessment', 'assessment'],
  ['Análisis', 'assessment'],
  ['Plan', 'plan'],
  // §5.3 — intake. Its `Plan` is `Plan terapéutico`, a different string that
  // means the same role.
  ['Presenting problem', 'presenting_problem'],
  ['Motivo de consulta', 'presenting_problem'],
  ['History', 'history'],
  ['Antecedentes', 'history'],
  ['Formulation', 'formulation'],
  ['Formulación', 'formulation'],
  ['Plan terapéutico', 'plan'],
];

/**
 * Normalised name → role. Frozen, because it is a fact about the vocabulary and
 * not a cache: nothing may add a role to it at runtime, and a stored string is
 * never rewritten through it.
 */
export const SECTION_ROLES: Readonly<Record<string, SectionRoleId>> = Object.freeze(
  Object.fromEntries(REGISTERED.map(([name, role]) => [normaliseSectionName(name), role])),
);

/**
 * The role a section name carries, or `custom` for a name the fourteen do not
 * cover. Never throws and never guesses: an unrecognised name is a real
 * possibility — she writes her own formats — and the honest answer for it is
 * the one role that means "a section, whose meaning nobody has claimed".
 */
export function sectionRole(name: string): SectionRoleId {
  return SECTION_ROLES[normaliseSectionName(name)] ?? CUSTOM_SECTION_ROLE;
}
