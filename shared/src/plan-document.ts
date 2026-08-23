import type { Diagnosis, PlanGoal, PlanObjective, TreatmentPlan } from './plan.js';

/**
 * The plan as a printable, pasteable document.
 *
 * It exists because Apunta is not the record: the note is pasted into another
 * records system (owner answer 3), and a plan is *printed or uploaded* rather
 * than typed into one box. So this renders every field a payer audit tool asks
 * for, in a fixed order, with a signature block at the end — the plan travels
 * to the place where signing actually happens (research §4.3, §7 item 9).
 *
 * Plain text with no markdown characters, for the same reason the note is
 * copied that way: the destination is a textarea or a printer, and asterisks
 * would arrive as asterisks.
 *
 * **Proposed goals are not in it.** A proposal is not part of the plan, so it
 * is not part of the document either — exporting one would put a goal nobody
 * set in front of a payer.
 *
 * A field she has not filled in renders as `(not recorded)` rather than
 * disappearing: a gap an auditor can see is worth more than a document that
 * looks complete.
 */

const NOT_RECORDED = '(not recorded)';

export interface PlanDocumentInput {
  readonly plan: TreatmentPlan;
  readonly goals: readonly PlanGoal[];
  /** Every version for this patient, for the revision history. Newest first. */
  readonly versions: readonly TreatmentPlan[];
  readonly patientName: string;
  readonly patientIdentifier: string | null;
}

function value(text: string): string {
  return text.trim() === '' ? NOT_RECORDED : text.trim();
}

function dateOrDash(date: string | null): string {
  return date ?? NOT_RECORDED;
}

function diagnosisLine(diagnosis: Diagnosis): string {
  const system = diagnosis.system === 'icd-10-cm' ? 'ICD-10-CM' : 'DSM-5-TR';
  const parts = [
    diagnosis.code.trim() === '' ? NOT_RECORDED : diagnosis.code.trim(),
    `(${system})`,
    diagnosis.description.trim(),
  ].filter((part) => part !== '');
  return `${parts.join(' ')}${diagnosis.primary ? ' — primary' : ''}`;
}

function objectiveLines(objective: PlanObjective, number: string): string[] {
  const lines = [`    ${number} ${value(objective.statement)}`];
  lines.push(`        Measure: ${value(objective.measure)}`);
  lines.push(`        Baseline: ${value(objective.baseline)}`);
  lines.push(`        Target: ${value(objective.target_value)}`);
  lines.push(`        Target date: ${dateOrDash(objective.target_date)}`);
  return lines;
}

function goalLines(goal: PlanGoal, index: number): string[] {
  const lines: string[] = [];
  lines.push(`${String(index)}. ${value(goal.statement)}  [${goal.status}]`);
  lines.push(`    Target date: ${dateOrDash(goal.target_date)}`);

  lines.push('    Objectives:');
  if (goal.objectives.length === 0) lines.push(`      ${NOT_RECORDED}`);
  goal.objectives.forEach((objective, position) => {
    lines.push(...objectiveLines(objective, `${String(index)}.${String(position + 1)}`));
  });

  lines.push('    Interventions:');
  if (goal.interventions.length === 0) lines.push(`      ${NOT_RECORDED}`);
  for (const intervention of goal.interventions) lines.push(`      - ${intervention.trim()}`);

  if (goal.evidence.length > 0) {
    lines.push('    Drafted from:');
    for (const evidence of goal.evidence) {
      const where = evidence.section === null ? '' : `, ${evidence.section}`;
      lines.push(`      ${evidence.note_date.slice(0, 10)}${where}: "${evidence.excerpt.trim()}"`);
    }
  }
  return lines;
}

/**
 * The version list, oldest first, so the history reads forward — and only as
 * far as the version being rendered.
 *
 * A superseded version's document is a snapshot of what was in force on a
 * service date, so it must not change when a later review happens: an export
 * taken today and one taken next year have to be the same bytes. Listing
 * revisions that had not happened yet would break that, and would also have
 * the document describe a plan that was not the plan.
 */
function historyLines(versions: readonly TreatmentPlan[], upTo: number): string[] {
  return [...versions]
    .filter((version) => version.version <= upTo)
    .sort((a, b) => a.version - b.version)
    .map((version) => {
      const from = version.effective_from ?? version.created_at.slice(0, 10);
      const to = version.effective_to ?? (version.status === 'superseded' ? NOT_RECORDED : 'present');
      return `  Version ${String(version.version)} — ${version.status} — ${from} to ${to}`;
    });
}

export function planDocumentText(input: PlanDocumentInput): string {
  const { plan, goals, versions } = input;
  // A proposal is not part of the plan, so it is not part of this document.
  const included = goals.filter((goal) => goal.status !== 'proposed');

  const lines: string[] = [];
  lines.push('TREATMENT PLAN');
  lines.push('');
  lines.push(
    `Patient: ${input.patientName}${
      input.patientIdentifier === null || input.patientIdentifier.trim() === ''
        ? ''
        : ` (${input.patientIdentifier.trim()})`
    }`,
  );
  lines.push(`Version: ${String(plan.version)} (${plan.status})`);
  lines.push(`Effective: ${dateOrDash(plan.effective_from)} to ${plan.effective_to ?? 'present'}`);
  lines.push(`Created: ${plan.created_at.slice(0, 10)}`);
  lines.push('');

  lines.push('Diagnoses:');
  if (plan.diagnoses.length === 0) lines.push(`  ${NOT_RECORDED}`);
  for (const diagnosis of plan.diagnoses) lines.push(`  ${diagnosisLine(diagnosis)}`);
  lines.push('');

  lines.push('Presenting problem:');
  lines.push(`  ${value(plan.presenting_problem)}`);
  lines.push('');
  lines.push('Strengths:');
  lines.push(`  ${value(plan.strengths)}`);
  lines.push('');
  lines.push(`Service modality: ${value(plan.modality)}`);
  lines.push(`Service frequency: ${value(plan.frequency)}`);
  lines.push('');

  lines.push('Goals and objectives:');
  if (included.length === 0) lines.push(`  ${NOT_RECORDED}`);
  included.forEach((goal, index) => {
    lines.push(...goalLines(goal, index + 1));
    lines.push('');
  });
  if (included.length === 0) lines.push('');

  lines.push('Discharge criteria:');
  lines.push(`  ${value(plan.discharge_criteria)}`);
  lines.push('');
  lines.push(`Review interval: every ${String(plan.review_interval_days)} days`);
  lines.push(`Next review due: ${dateOrDash(plan.review_due)}`);
  lines.push('');

  lines.push('Revision history:');
  lines.push(...historyLines(versions, plan.version));
  lines.push('');

  lines.push('Attestation:');
  lines.push(`  ${plan.attested_at === null ? 'Not yet attested' : value(plan.attestation_text)}`);
  lines.push(`  Attested: ${plan.attested_at === null ? NOT_RECORDED : plan.attested_at.slice(0, 10)}`);
  lines.push(`  Clinician: ${value(plan.clinician_name)}`);
  lines.push(`  Credential: ${value(plan.clinician_credential)}`);
  lines.push(`  Licence: ${value(plan.clinician_licence)}`);
  lines.push(`  NPI: ${value(plan.clinician_npi)}`);
  lines.push('');
  lines.push(`Client participation: ${participationLine(plan)}`);
  lines.push('');
  lines.push('Signatures:');
  lines.push('  Clinician: ____________________________   Date: ______________');
  lines.push('  Client:    ____________________________   Date: ______________');
  lines.push('');

  return lines.join('\n');
}

const PARTICIPATION_LABEL: Record<TreatmentPlan['client_participation'], string> = {
  not_recorded: NOT_RECORDED,
  reviewed_with_client: 'Reviewed with client',
  declined: 'Client declined to sign',
  signed_elsewhere: 'Signed copy held in the records system',
};

function participationLine(plan: TreatmentPlan): string {
  const parts = [PARTICIPATION_LABEL[plan.client_participation]];
  if (plan.client_participation_on !== null) parts.push(`on ${plan.client_participation_on}`);
  if (plan.client_participation_note.trim() !== '') parts.push(`— ${plan.client_participation_note.trim()}`);
  return parts.join(' ');
}
