/**
 * Section-list helpers for format onboarding.
 *
 * The prototype's manual path offers one textarea ("e.g. Subjective,
 * Objective, Assessment, Plan"), so commas and newlines both separate. The
 * server rejects duplicate names case-insensitively (SectionsSchema); catching
 * that here turns a 400 into an inline message.
 */
export function parseSections(input: string): string[] {
  return input
    .split(/[\n,]/)
    .map((section) => section.trim())
    .filter((section) => section.length > 0);
}

/** The first name that repeats one already in the list, or null. */
export function duplicateSection(sections: string[]): string | null {
  const seen = new Set<string>();
  for (const section of sections) {
    const key = section.toLowerCase();
    if (seen.has(key)) return section;
    seen.add(key);
  }
  return null;
}
