import { describe, expect, it } from 'vitest';

import { REPAIR_NOTICE_OPENING, repairNotice } from './repair-notice.js';
import { NO_REPAIRS } from './types.js';

describe('repairNotice', () => {
  it('names one change in one sentence', () => {
    expect(repairNotice({ ...NO_REPAIRS, riskReview: 'History' })).toBe(
      `${REPAIR_NOTICE_OPENING}: it added the risk review you dictated to History, in your own words, because the draft had left it out.`,
    );
  });

  it('lists several, joining the last with "and", and Spanish with "y"', () => {
    const repairs = {
      riskReview: 'History',
      notGathered: ['No medical conditions.'],
      reworded: [{ section: 'Formulation', words: ['compulsions', 'OCD'] }],
    };
    const english = repairNotice(repairs);
    expect(english).toContain('History, in your own words, because the draft had left it out; it reworded');
    expect(english).toContain('“compulsions”, “OCD”');
    expect(english).toContain('; and it replaced “No medical conditions.”');
    expect(repairNotice(repairs, 'es-MX')).toContain('; y reemplazó «No medical conditions.»');
  });
});
