import { describe, expect, it } from 'vitest';

/**
 * P0.2 evidence that each nominal zone run really runs in that zone. This
 * test pins nothing: it prints the ambient zone and asserts the runtime
 * honours `TZ` when the runner sets it.
 */
describe('effective time zone', () => {
  it('matches the TZ the run was started with', () => {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    process.stdout.write(`effective time zone: ${timeZone} (TZ=${process.env.TZ ?? '<unset>'})\n`);
    expect(timeZone).toBe(process.env.TZ ?? timeZone);
  });
});
