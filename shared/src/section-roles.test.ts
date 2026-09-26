import { describe, expect, it } from 'vitest';

import {
  CUSTOM_SECTION_ROLE,
  SECTION_ROLE_IDS,
  SECTION_ROLES,
  normaliseSectionName,
  sectionRole,
  type SectionRoleId,
} from './section-roles.js';

/**
 * C-LANG@1 rule 5 against S1.1's three tables, written out here rather than
 * imported, so the assertion is against the research and not against the code
 * that claims to implement it. If a name moves in the research, this file is
 * the thing that fails and the question worth asking.
 *
 * S1.1, `docs/research/es-mx-clinical-documentation.md`: §5.1 her seven
 * progress-note sections (lines 154-164), §5.2 SOAP (166-173), §5.3 intake
 * (175-182).
 */
const PROGRESS_SECTIONS: readonly (readonly [english: string, spanish: string])[] = [
  ['Location', 'Lugar'],
  ['Client presentation', 'Presentación del cliente'],
  ['Risk review', 'Revisión de riesgo'],
  ['Discussion', 'Temas tratados'],
  ['Intervention', 'Intervención'],
  ['Out of session actions', 'Tareas entre sesiones'],
  ['Note for next session', 'Nota para la próxima sesión'],
];

const SOAP_SECTIONS: readonly (readonly [english: string, spanish: string])[] = [
  ['Subjective', 'Subjetivo'],
  ['Objective', 'Objetivo'],
  ['Assessment', 'Análisis'],
  ['Plan', 'Plan'],
];

const INTAKE_SECTIONS: readonly (readonly [english: string, spanish: string])[] = [
  ['Presenting problem', 'Motivo de consulta'],
  ['History', 'Antecedentes'],
  ['Formulation', 'Formulación'],
  ['Plan', 'Plan terapéutico'],
];

const TABLES: readonly (readonly [heading: string, rows: readonly (readonly [string, string])[]])[] = [
  ['§5.1 her seven progress-note sections (:154-164)', PROGRESS_SECTIONS],
  ['§5.2 SOAP (:166-173)', SOAP_SECTIONS],
  ['§5.3 intake (:175-182)', INTAKE_SECTIONS],
];

const ALL_ROWS = TABLES.flatMap(([heading, rows]) => rows.map((row) => [heading, row] as const));
const ENGLISH_NAMES = ALL_ROWS.map(([, [english]]) => english);
const SPANISH_NAMES = ALL_ROWS.map(([, [, spanish]]) => spanish);

describe('S1.1 §5.1 — her seven progress-note sections', () => {
  it.each(PROGRESS_SECTIONS)('maps %s and %s to one role', (english, spanish) => {
    const role = sectionRole(english);
    expect(role).not.toBe(CUSTOM_SECTION_ROLE);
    expect(sectionRole(spanish)).toBe(role);
  });
});

describe('S1.1 §5.2 — SOAP', () => {
  it.each(SOAP_SECTIONS)('maps %s and %s to one role', (english, spanish) => {
    const role = sectionRole(english);
    expect(role).not.toBe(CUSTOM_SECTION_ROLE);
    expect(sectionRole(spanish)).toBe(role);
  });
});

describe('S1.1 §5.3 — intake', () => {
  it.each(INTAKE_SECTIONS)('maps %s and %s to one role', (english, spanish) => {
    const role = sectionRole(english);
    expect(role).not.toBe(CUSTOM_SECTION_ROLE);
    expect(sectionRole(spanish)).toBe(role);
  });
});

describe('the role vocabulary', () => {
  it('(b) is exactly the fourteen the contract names, plus custom, and every one is used', () => {
    const reachable = new Set<SectionRoleId>([
      ...ENGLISH_NAMES.map((name) => sectionRole(name)),
      ...SPANISH_NAMES.map((name) => sectionRole(name)),
    ]);

    // Fourteen ids, and `custom` — no fifteenth invented to make a name fit.
    expect(SECTION_ROLE_IDS).toHaveLength(14);
    expect(new Set(SECTION_ROLE_IDS).size).toBe(14);
    // Every id is reachable from the tables, and the tables reach nothing else.
    expect([...reachable].sort()).toEqual([...SECTION_ROLE_IDS].sort());

    // 14 distinct English strings over the 14 ids: `Plan` is one string in two
    // rows (:173 and :182), so the 15 rows carry 14 names.
    expect(ENGLISH_NAMES).toHaveLength(15);
    expect(new Set(ENGLISH_NAMES).size).toBe(14);
    expect(new Set(ENGLISH_NAMES.map((name) => sectionRole(name)))).toEqual(new Set(SECTION_ROLE_IDS));

    // 15 distinct Spanish strings over those same 14 ids: `Plan` and
    // `Plan terapéutico` are different strings that mean the same role.
    expect(SPANISH_NAMES).toHaveLength(15);
    expect(new Set(SPANISH_NAMES).size).toBe(15);
    expect(new Set(SPANISH_NAMES.map((name) => sectionRole(name)))).toEqual(new Set(SECTION_ROLE_IDS));
  });

  it('(c) gives the two Spanish plan names and the English one the same role', () => {
    // One role, registered once. Nothing here is `soap_plan` or `intake_plan`:
    // a consumer that has to tell them apart needs the format, which is S5.1's
    // to pass in.
    expect(sectionRole('Plan')).toBe('plan');
    expect(sectionRole('Plan terapéutico')).toBe('plan');
    expect(sectionRole('Plan')).toBe(sectionRole('Plan terapéutico'));
  });
});

describe('matching', () => {
  it('(d) is case- and accent-insensitive', () => {
    expect(sectionRole('plan')).toBe('plan');
    expect(sectionRole('PLAN')).toBe('plan');
    expect(sectionRole('Plan')).toBe('plan');
    // The table's Spanish name, shouted and all.
    expect(sectionRole('REVISIÓN DE RIESGO')).toBe('risk');
    expect(sectionRole('Revisión de riesgo')).toBe(sectionRole('Risk review'));
    expect(normaliseSectionName('  Revisión de Riesgo  ')).toBe('revision de riesgo');
  });

  it('(e) calls a name it does not know custom, rather than guessing', () => {
    expect(sectionRole('Session goals')).toBe(CUSTOM_SECTION_ROLE);
    expect(sectionRole('')).toBe(CUSTOM_SECTION_ROLE);
    expect(sectionRole('risk reviews')).toBe(CUSTOM_SECTION_ROLE);
  });

  it('(f) never rewrites the stored string it was given', () => {
    const stored = 'Plan terapéutico';
    const copy = stored;
    expect(sectionRole(stored)).toBe('plan');
    expect(stored).toBe(copy);
    // And the map itself is read-only, so no code path can add a role to it.
    expect(Object.isFrozen(SECTION_ROLES)).toBe(true);
    expect(() => {
      (SECTION_ROLES as Record<string, SectionRoleId>)['session goals'] = 'custom';
    }).toThrow(TypeError);
  });
});
