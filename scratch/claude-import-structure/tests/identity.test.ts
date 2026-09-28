import { describe, expect, it } from 'vitest';

import { validate } from '../src/validate.js';
import { corpus, gold, identityFor, sessionFor } from './helpers.js';

/**
 * Identity: two people are two people.
 *
 * The criterion is blunt — zero cross-patient merges in the labelled set — and
 * it is the one place where a structuring step can do real harm that no later
 * review would catch, because a merged record looks exactly like a correct one.
 * So the tests attack the three ways a merge happens: a shared first name, a
 * relative named inside a note, and one identity quietly absorbing two people's
 * sittings.
 */

const capture = corpus();

function edit(change: (proposal: ReturnType<typeof gold>) => void) {
  const proposal = gold();
  change(proposal);
  return validate(capture, proposal);
}

describe('two patients who share a first name', () => {
  it('keeps them apart when the proposal shows why', () => {
    const report = edit(() => {});
    const lopez = report.identities.find((entry) => entry.identity_key === 'maria_lopez');
    const fernanda = report.identities.find((entry) => entry.identity_key === 'maria_fernanda');
    expect(lopez?.eligible).toBe(true);
    expect(fernanda?.eligible).toBe(true);
    expect(lopez?.new_notes).toBe(4);
    expect(fernanda?.new_notes).toBe(1);
    expect(report.errors).toEqual([]);
  });

  it('refuses to accept one person called María without evidence they differ', () => {
    const report = edit((proposal) => {
      const fernanda = identityFor(proposal, 'maria_fernanda');
      fernanda.disambiguation = null;
    });
    const codes = report.errors.map((error) => error.code);
    expect(codes).toContain('ambiguous_identity');
    expect(report.decisions.map((decision) => decision.code)).toContain('identity_needs_decision');
  });

  it('refuses a second María that is not named apart at all', () => {
    const report = edit((proposal) => {
      const fernanda = identityFor(proposal, 'maria_fernanda');
      fernanda.display_name = 'María';
      fernanda.aliases = [];
      fernanda.disambiguation = null;
    });
    expect(report.errors.map((error) => error.code)).toContain('ambiguous_identity');
  });

  it('accepts a declared ambiguity as a decision rather than a merge', () => {
    const report = edit((proposal) => {
      const fernanda = identityFor(proposal, 'maria_fernanda');
      fernanda.disambiguation = { kind: 'needs_decision', evidence: [] };
    });
    expect(report.decisions.map((decision) => decision.detail)).toContain('maria_fernanda');
    // Still not silently merged: the identity exists, and its sessions stay its own.
    const fernanda = report.identities.find((entry) => entry.identity_key === 'maria_fernanda');
    expect(fernanda?.session_count).toBe(1);
    expect(fernanda?.new_notes).toBe(1);
  });

  it('refuses an identity key that is used twice', () => {
    const report = edit((proposal) => {
      const fernanda = identityFor(proposal, 'maria_fernanda');
      fernanda.identity_key = 'maria_lopez';
    });
    expect(report.errors.map((error) => error.code)).toContain('identity_key_duplicate');
  });

  it('refuses a same_name_as that points at nobody', () => {
    const report = edit((proposal) => {
      identityFor(proposal, 'maria_lopez').same_name_as = ['maria_imaginaria'];
    });
    expect(report.errors.map((error) => error.code)).toContain('identity_key_unknown');
  });
});

describe('a relative is not a patient', () => {
  it('keeps the relative out of the import while leaving the mention in the note', () => {
    const report = edit(() => {});
    const rosa = report.identities.find((entry) => entry.identity_key === 'rosa_hernandez');
    expect(rosa?.role).toBe('relative_mention');
    expect(rosa?.eligible).toBe(false);
    expect(rosa?.session_count).toBe(0);
    // The mention itself is untouched: it is Ana's session, in Ana's note.
    const anaNote = report.notes.find((note) => note.spans[0]?.message_id === 'a1-05');
    expect(anaNote?.text).toContain('su hermana Rosa');
    expect(anaNote?.identity_key).toBe('ana_ruiz');
  });

  it('refuses a proposal that promotes her, because her only mention is inside a note', () => {
    const report = edit((proposal) => {
      const rosa = identityFor(proposal, 'rosa_hernandez');
      rosa.role = 'patient';
      const session = sessionFor(proposal, 'a1-05');
      session.identity_key = 'rosa_hernandez';
    });
    expect(report.errors.map((error) => error.code)).toContain('relative_promoted');
  });

  it('refuses a patient with no evidence span at all', () => {
    const report = edit((proposal) => {
      identityFor(proposal, 'diego_ramos').evidence = [];
    });
    expect(report.errors.map((error) => error.code)).toContain('identity_evidence_insufficient');
  });
});

describe('one identity cannot absorb two people', () => {
  it('refuses when a patient’s evidence sits in a sitting filed under somebody else', () => {
    const report = edit((proposal) => {
      // The merge: Solís's sitting is filed under López, while Solís keeps her
      // identity and her evidence, which is now somebody else's sitting.
      sessionFor(proposal, 'm2-03').identity_key = 'maria_lopez';
    });
    expect(report.errors.map((error) => error.code)).toContain('identity_evidence_outside_own_sessions');
  });

  it('refuses a patient with cited source text and no sitting of her own', () => {
    const report = edit((proposal) => {
      proposal.sessions = proposal.sessions.filter((session) => session.identity_key !== 'maria_fernanda');
    });
    expect(report.errors.map((error) => error.code)).toContain('identity_session_missing');
  });

  it('refuses a session whose patient key does not exist', () => {
    const report = edit((proposal) => {
      sessionFor(proposal, 'a1-01').identity_key = 'nadie';
    });
    expect(report.errors.map((error) => error.code)).toContain('identity_key_unknown');
  });
});

describe('conversations that are not about a patient', () => {
  it('are accounted for, with no patient and no note', () => {
    const report = edit(() => {});
    for (const key of ['arrendamiento', 'masa_madre']) {
      const found = report.identities.find((entry) => entry.identity_key === key);
      expect(found?.role).toBe('not_a_patient');
      expect(found?.eligible).toBe(false);
      expect(found?.session_count).toBe(1);
      expect(found?.new_notes).toBe(0);
    }
    expect(report.notes.some((note) => note.identity_key === 'arrendamiento')).toBe(false);
    expect(report.untouched_conversations).toEqual([]);
  });

  it('a conversation the proposal ignores is reported, not assumed irrelevant', () => {
    const report = edit((proposal) => {
      proposal.sessions = proposal.sessions.filter((session) => session.conversation_id !== 'conv-sourdough');
      proposal.identities = proposal.identities.filter((identity) => identity.identity_key !== 'masa_madre');
    });
    expect(report.untouched_conversations).toEqual([{ conversation_id: 'conv-sourdough', messages: 2 }]);
  });
});
