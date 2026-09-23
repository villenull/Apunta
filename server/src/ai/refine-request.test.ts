import type { Sections } from '@apunta/shared';
import { describe, expect, it } from 'vitest';

import {
  ALREADY_THERE_NOTICE,
  UNCHANGED_NOTICE,
  assessRefine,
  checkRequests,
  enforceRefineScope,
  isQuestion,
  parseRefineRequest,
} from './refine-request.js';

const OWNER = [
  'Location',
  'Client presentation',
  'Risk review',
  'Discussion',
  'Intervention',
  'Out of session actions',
  'Note for next session',
];

/** The note the owner's 2026-09-23 pass refined, in her own format, synthetic. */
const NOTE: Sections = {
  Location: 'In person.',
  'Client presentation': 'Reports sleep has been better this week, about six hours a night.',
  'Risk review': 'None.',
  Discussion:
    'She wanted to talk about her sister’s wedding next month and seeing her ex there, which took most of the hour. We also talked about work; her manager has been giving her more responsibility. She asked about my weekend and we chatted for a minute, not clinically relevant.',
  Intervention: 'Cognitive restructuring around the worry about the ex.',
  'Out of session actions': 'Write down her worries each evening.',
  'Note for next session': 'Panic attacks decreased from three a week in August to one this week.',
};

/** A revision that changes only what the request named. */
function withSection(name: string, body: string): Sections {
  return { ...NOTE, [name]: body };
}

describe('parseRefineRequest', () => {
  it('reads the section a request names, and knows a whole-note request has no scope', () => {
    expect(parseRefineRequest('Make the discussion shorter', OWNER).targets).toEqual(['Discussion']);
    expect(parseRefineRequest('Remove the risk review', OWNER).targets).toEqual(['Risk review']);
    // "risk" alone is the section, not the word "risk" in a sentence.
    expect(parseRefineRequest('Clear the risk section', OWNER).targets).toEqual(['Risk review']);
    expect(parseRefineRequest('Shorten the whole note', OWNER).targets).toEqual([]);
    expect(parseRefineRequest('Make it shorter', OWNER).targets).toEqual([]);
    // Another format's sections are read by name too.
    expect(parseRefineRequest('Expand the assessment section', ['Subjective', 'Assessment']).targets).toEqual(
      ['Assessment'],
    );
  });

  it('reads the kind of change, and never asks for an addition a removal request did not', () => {
    expect(parseRefineRequest('Make the discussion shorter', OWNER)).toMatchObject({
      shortening: true,
      addition: false,
      removal: false,
    });
    expect(parseRefineRequest('Remove the risk review', OWNER)).toMatchObject({
      removal: true,
      addition: false,
      shortening: false,
    });
    const addition = parseRefineRequest("Add that she's on sertraline 20 mg", OWNER);
    expect(addition).toMatchObject({ addition: true, removal: false, shortening: false });
    // The medication is what must land — by the fact lock's own formulary, so a
    // brand name counts as the same fact. Its dose rides with it: one request,
    // not two.
    expect(addition.requiredAdditions.map((item) => item.token)).toEqual(['med:sertraline']);

    // A number she supplies that is not a dose is its own requirement.
    const slept = parseRefineRequest('Add that she slept 9 hours last night', OWNER);
    expect(slept.requiredAdditions.map((item) => item.token)).toContain('9');

    // "Remove the sertraline note, and add the date" is a removal: the lock and
    // the scope check stand down together, and nothing is required to land.
    const mixed = parseRefineRequest('Remove the June comparison and add nothing', OWNER);
    expect(mixed.removal).toBe(true);
    expect(mixed.requiredAdditions).toEqual([]);
  });

  it('takes a quoted passage as the words she wants, and a question as a question', () => {
    const quoted = parseRefineRequest('Add "grounding exercises before bed" to the plan', OWNER);
    expect(quoted.requiredAdditions.map((item) => item.label)).toEqual(['grounding exercises before bed']);
    expect(isQuestion('Can you shorten the plan?')).toBe(true);
    expect(isQuestion('Make the plan shorter')).toBe(false);
  });
});

describe('enforceRefineScope', () => {
  it('holds back a section her request did not name', () => {
    // The 2026-09-23 failure: "make the discussion shorter" rewrote Location.
    const updated = { ...NOTE, Location: 'Video.' };
    const result = enforceRefineScope(
      NOTE,
      updated,
      parseRefineRequest('Make the discussion shorter', OWNER),
    );
    expect(result.sections.Location).toBe('In person.');
    expect(result.held).toEqual([
      {
        section: 'Location',
        reason: 'Apunta left Location as it was: your message asked about Discussion only.',
      },
    ]);
  });

  it('leaves the other sections alone when the request named none', () => {
    const updated = withSection('Discussion', 'Shorter: the wedding and her ex, mostly.');
    const result = enforceRefineScope(NOTE, updated, parseRefineRequest('Make it shorter', OWNER));
    expect(result.sections).toEqual(updated);
    expect(result.held).toEqual([]);
  });

  it('holds an addition-only request to adding: it may not take anything out', () => {
    // The second 2026-09-23 failure: "add that she's on sertraline 20 mg"
    // removed a Discussion sentence instead, and reported the addition.
    const updated = {
      ...NOTE,
      Discussion:
        'She wanted to talk about her sister’s wedding next month and seeing her ex there, which took most of the hour. We also talked about work; her manager has been giving her more responsibility.',
    };
    const result = enforceRefineScope(
      NOTE,
      updated,
      parseRefineRequest("Add that she's on sertraline 20 mg", OWNER),
    );
    expect(result.sections.Discussion).toBe(NOTE['Discussion']);
    expect(result.held).toHaveLength(1);
    expect(result.held[0]?.reason).toContain('you asked only to add');
    // The pointer is the stretch the revision would have dropped, as it reads.
    expect(result.held[0]?.reason).toContain('"asked about my weekend and"');
  });

  it('does not apply that rule when she also asked for a removal or a shortening', () => {
    const updated = { ...NOTE, Discussion: 'We talked about work.' };
    for (const message of ['Remove the weekend aside from the discussion', 'Shorten the discussion']) {
      const result = enforceRefineScope(NOTE, updated, parseRefineRequest(message, OWNER));
      expect(result.sections).toEqual(updated);
      expect(result.held).toEqual([]);
    }
  });

  it('lets a move reach the section the text left, and only that far', () => {
    const message = 'Move the eye contact note to Client presentation';
    // The section the text left may lose exactly what the named section gained.
    const allowed = enforceRefineScope(
      {
        ...NOTE,
        'Client presentation': 'Reports sleep has been better this week. She made eye contact throughout.',
      },
      {
        ...NOTE,
        'Client presentation': 'Reports sleep has been better this week.',
        Discussion: NOTE['Discussion'] ?? '',
      },
      parseRefineRequest(message, OWNER),
    );
    expect(allowed.held).toEqual([]);

    // A section that gained something is not a move: it is a rewrite.
    const gained = enforceRefineScope(
      NOTE,
      { ...NOTE, Location: 'Video.' },
      parseRefineRequest(message, OWNER),
    );
    expect(gained.sections.Location).toBe('In person.');
    expect(gained.held.map((hold) => hold.section)).toEqual(['Location']);
  });
});

describe('checkRequests', () => {
  it('only counts a shortening when the section actually got shorter', () => {
    const intent = parseRefineRequest('Make the discussion shorter', OWNER);
    const longer = checkRequests(
      intent,
      NOTE,
      withSection('Discussion', `${NOTE['Discussion'] ?? ''} And more.`),
    );
    expect(longer).toEqual([
      {
        kind: 'shortening',
        section: 'Discussion',
        label: null,
        satisfied: false,
        reason: 'Apunta could not shorten the Discussion section: the revision came back no shorter.',
      },
    ]);
    const shorter = checkRequests(intent, NOTE, withSection('Discussion', 'The wedding, her ex, and work.'));
    expect(shorter[0]?.satisfied).toBe(true);
  });

  it('reads a whole-note shortening off the note as a whole', () => {
    const intent = parseRefineRequest('Make it shorter', OWNER);
    const checks = checkRequests(intent, NOTE, withSection('Discussion', 'Short.'));
    expect(checks).toHaveLength(1);
    expect(checks[0]?.satisfied).toBe(true);
  });

  it('counts a removal only when the section her request named lost its content', () => {
    const intent = parseRefineRequest('Remove the risk review', OWNER);
    expect(checkRequests(intent, NOTE, withSection('Risk review', ''))[0]?.satisfied).toBe(true);
    expect(checkRequests(intent, NOTE, NOTE)[0]?.satisfied).toBe(false);
  });

  it('counts an addition by the fact she asked for, brand and generic as one', () => {
    const intent = parseRefineRequest('Add that she is on Zoloft 50 mg', OWNER);
    const tokens = intent.requiredAdditions.map((item) => item.token);
    expect(tokens).toContain('med:sertraline');
    // One request, not two: the dose belongs to the medication she named.
    expect(intent.requiredAdditions).toHaveLength(1);

    const landed = checkRequests(intent, NOTE, withSection('Client presentation', 'On sertraline 50 mg.'));
    expect(landed.every((check) => check.satisfied)).toBe(true);

    const missing = checkRequests(intent, NOTE, withSection('Discussion', 'Unchanged elsewhere.'));
    expect(missing.map((check) => check.reason)).toContain(
      'Apunta could not add "Zoloft": the revision came back without it.',
    );
  });
});

describe('assessRefine', () => {
  const base = { held: [], lockedSections: [], notices: [], previous: NOTE };

  it('is applied only when what she asked for is in the note', () => {
    const updated = withSection('Discussion', 'The wedding, her ex, and work.');
    const verdict = assessRefine({
      ...base,
      intent: parseRefineRequest('Make the discussion shorter', OWNER),
      updated,
      changed: true,
    });
    expect(verdict.outcome).toBe('applied');
    expect(verdict.reason).toBeNull();
    expect(verdict.reply).toBe('I shortened the Discussion section.');
  });

  it('is withheld when the note changed but not in the way she asked', () => {
    // Her request was a shortening; the revision rewrote a section instead.
    const updated = withSection('Discussion', `${NOTE['Discussion'] ?? ''} One more sentence here.`);
    const verdict = assessRefine({
      ...base,
      intent: parseRefineRequest('Make the discussion shorter', OWNER),
      updated,
      changed: true,
    });
    expect(verdict.outcome).toBe('withheld');
    expect(verdict.reason).toContain('could not shorten the Discussion section');
  });

  it('is partial when the change landed and a lock held part of it back', () => {
    const updated = withSection('Discussion', 'The wedding and her ex.');
    const verdict = assessRefine({
      ...base,
      intent: parseRefineRequest('Make the discussion shorter', OWNER),
      updated,
      changed: true,
      lockedSections: ['Location'],
      notices: ['Apunta blocked part of this revision.'],
    });
    expect(verdict.outcome).toBe('partial');
    expect(verdict.reason).toBe('Apunta blocked part of this revision.');
    expect(verdict.reply).toBe(
      'I shortened the Discussion section.\n\nApunta blocked part of this revision.',
    );
  });

  it('is withheld when a lock held everything back, and the notice is the reply', () => {
    const verdict = assessRefine({
      ...base,
      intent: parseRefineRequest('Make the discussion shorter', OWNER),
      updated: NOTE,
      changed: false,
      lockedSections: ['Discussion'],
      notices: ['Apunta held back part of this revision. Discussion was kept as it was.'],
    });
    expect(verdict.outcome).toBe('withheld');
    // The notice is the explanation; the server does not add a second refusal.
    expect(verdict.reason).toBe('Apunta held back part of this revision. Discussion was kept as it was.');
    expect(verdict.reply).toBe('Apunta held back part of this revision. Discussion was kept as it was.');
  });

  it('is unchanged when nothing happened, and says so in the server’s own words', () => {
    const verdict = assessRefine({
      ...base,
      intent: parseRefineRequest('Tidy this up a little', OWNER),
      updated: NOTE,
      changed: false,
    });
    expect(verdict.outcome).toBe('unchanged');
    expect(verdict.reason).toBe('The requested edit produced no changes.');
    expect(verdict.reply).toBe(UNCHANGED_NOTICE);
  });

  it('says the note already said it, rather than reporting a silent no-op', () => {
    const intent = parseRefineRequest("Add that she's on sertraline 20 mg", OWNER);
    const already: Sections = { ...NOTE, 'Client presentation': 'On sertraline 20 mg daily.' };
    const verdict = assessRefine({ ...base, previous: already, intent, updated: already, changed: false });
    expect(verdict.outcome).toBe('unchanged');
    expect(verdict.reason).toBe('The note already said what you asked for.');
    expect(verdict.reply).toBe(ALREADY_THERE_NOTICE);
  });

  it('never claims a change the diff does not have, and names what really moved', () => {
    // The third 2026-09-23 failure: "remove the risk review" also cleared the
    // Note for next session, and the reply claimed a medication was removed.
    const intent = parseRefineRequest('Remove the risk review', OWNER);
    const proposed: Sections = { ...NOTE, 'Risk review': '', 'Note for next session': '' };
    const scoped = enforceRefineScope(NOTE, proposed, intent);
    const verdict = assessRefine({
      ...base,
      intent,
      updated: scoped.sections,
      held: scoped.held,
      changed: true,
    });

    // She got exactly what she asked for, and one unrequested change was
    // held back — which is `partial`, with the reason saying which section.
    expect(verdict.outcome).toBe('partial');
    expect(verdict.reason).toBe(
      'Apunta left Note for next session as it was: your message asked about Risk review only.',
    );
    expect(verdict.reply).toContain('I cleared the Risk review section.');
    // The section her request did not name is still in the note, and the reply
    // says nothing about removing anything else.
    expect(scoped.sections['Note for next session']).toBe(NOTE['Note for next session']);
    expect(verdict.reply).not.toContain('panic');
    expect(verdict.reply).not.toContain('sertraline');
  });

  it('is applied when the only change is the one she asked for', () => {
    const intent = parseRefineRequest('Remove the risk review', OWNER);
    const scoped = enforceRefineScope(NOTE, { ...NOTE, 'Risk review': '' }, intent);
    const verdict = assessRefine({
      ...base,
      intent,
      updated: scoped.sections,
      held: scoped.held,
      changed: true,
    });
    expect(scoped.held).toEqual([]);
    expect(verdict.outcome).toBe('applied');
    expect(verdict.reason).toBeNull();
    expect(verdict.reply).toBe('I cleared the Risk review section.');
  });

  it('reports an unrequested section it had to put back, in the reply and the reason', () => {
    const intent = parseRefineRequest('Remove the risk review', OWNER);
    const proposed: Sections = { ...NOTE, 'Risk review': '', Location: 'Video.' };
    const scoped = enforceRefineScope(NOTE, proposed, intent);
    const verdict = assessRefine({
      ...base,
      intent,
      updated: scoped.sections,
      held: scoped.held,
      changed: true,
    });
    expect(verdict.outcome).toBe('partial');
    expect(verdict.reply).toContain('I cleared the Risk review section.');
    expect(verdict.reply).toContain(
      'Apunta left Location as it was: your message asked about Risk review only.',
    );
  });
});
