import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import type { Locator } from '@playwright/test';

import { t } from '@apunta/shared';

import { expect, test } from '../support/fixtures';

/**
 * The spell check in Español, against the bundled Mexican Spanish dictionary:
 * the mark under a typo, the menu on a click, the correction, and the caret at
 * the edge of the word — on **five** surfaces.
 *
 * This spec exists because D6 stops collecting `spelling.spec.ts` in the
 * `es-MX` project: under D3 the dictionary follows the active UI language, so
 * that spec's English-dictionary assertions are not applicable there. What is
 * reproduced here, on the surfaces the English spec covered, is `spellcheck`,
 * applying a correction from the menu, the caret/menu edge-click, and
 * `checkScreen` on the spelling menu. What is **new** is the typed-notes box
 * (`summary-input`) and the patient rename field (`rename-field-<id>`): no
 * English spec ever drove either, so this is added coverage and not a
 * replacement. `AddPatient`'s name input at `/patients/new` is driven as well,
 * because `spelling.spec.ts:84-94` drove it and that coverage had to move.
 *
 * Every person named here is invented and read from the Spanish corpora's own
 * registry (`e2e/fixtures/eval-es/NAMES.md`), so HS-8 is satisfied by
 * construction rather than by argument.
 */

interface Created {
  id: string;
}

/** The three invented words of the card's own tables, and nothing else in the sentence. */
const MISSPELLINGS = ['brócolido', 'zambumbia', 'telaraosa'] as const;

/** A transposition of `ternura`; the exact suggestions depend on the shipped affix file. */
const MISSPELLING = 'nertua';

/** Accented, `ñ`, and a leading accent: none of them may become noise. */
const CORRECT = 'sesión atención psicología niño última café José Ramírez';

/** Every field gets the same three invented words, so each surface's marks are exact. */
const FIELD_TEXT = `${MISSPELLINGS.join(' ')} con el niño, ${CORRECT}`;

const NOTE_TEXT = `Subjetivo: La sesión brócolido con atención.\n\nPlan: Revisar zambumbia, última vez con el niño, José Ramírez, café y telaraosa.`;

/**
 * The invented Spanish display name, read from the registry rather than typed
 * here, so this spec cannot name somebody the corpora do not contain.
 */
const SPANISH_DISPLAY_NAME = ((): string => {
  const registry = readFileSync(
    resolve(import.meta.dirname, '..', 'fixtures', 'eval-es', 'NAMES.md'),
    'utf8',
  );
  const row = registry
    .split('\n')
    .find((line) => /^\| [^|]+ \| `[^`]+` \| (?:tuning|heldout) \| `[^`]+` \|$/u.test(line));
  const name = /^\| ([^|]+?) \|/u.exec(row ?? '')?.[1]?.trim() ?? '';
  if (name === '') throw new Error('the Spanish display name could not be read from NAMES.md');
  return name;
})();

/** The marks inside one field's own wrap, never another surface's. */
function marksOf(field: Locator): Locator {
  return field.locator('xpath=ancestor::div[contains(@class,"spell-wrap")][1]').locator('.misspelt');
}

/** The spelling menu in this field's own wrap. */
function menuOf(field: Locator): Locator {
  return field.locator('xpath=ancestor::div[contains(@class,"spell-wrap")][1]').getByTestId('spelling-menu');
}

/** The spelling menu's own accessible name for `word`, in this project's language. */
function menuLabel(word: string): string {
  return t('spelling.menuLabel', { word }, 'es-MX');
}

/** The exact marks, `spellcheck` off, and the accented words unmarked. */
async function expectExactMarks(field: Locator, text: string): Promise<void> {
  await expect(field).toBeVisible();
  await field.fill(text);
  await expect(marksOf(field)).toHaveText([...MISSPELLINGS]);
  await expect(field).toHaveAttribute('spellcheck', 'false');
  for (const word of CORRECT.split(' ')) {
    await expect(marksOf(field).filter({ hasText: word })).toHaveCount(0);
  }
}

/**
 * The caret/menu edge-click D6 condition 2 names: the caret put inside the
 * marked word at the offset `spelling.spec.ts:52-57` uses, then a click that
 * reaches the editor. A real click rather than a dispatched one, because the
 * dispatched form does not reach the handler on a single-line input at all.
 *
 * The click is repeated while the menu is not about this word. The menu opens
 * for whatever mark list the editor held when the click landed, and the check
 * is debounced and, on a note, round-trips through a save — so one click can
 * land before the list is the one this row is about. The menu's own
 * `aria-label` names the word it is for, which is what makes a menu left over
 * from an earlier value a failure rather than a pass.
 */
async function openMenuFor(field: Locator, word: string): Promise<Locator> {
  const menu = menuOf(field);
  await expect(marksOf(field)).toHaveText([word]);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await field.evaluate((element: HTMLInputElement | HTMLTextAreaElement, at: number) => {
      element.focus();
      element.setSelectionRange(at, at);
    }, 1);
    await field.click();
    if ((await menu.count()) > 0 && (await menu.getAttribute('aria-label')) === menuLabel(word)) {
      await expect(menu).toBeVisible();
      return menu;
    }
  }
  await expect(menu).toHaveAttribute('aria-label', menuLabel(word));
  return menu;
}

/**
 * A non-empty suggestion list, and a correction applied from it.
 *
 * `afterApply` is how a surface that does not keep the value asserts the
 * correction instead: the patient rename field commits on blur, so the value it
 * was corrected to is the patient's new name rather than a field still on
 * screen.
 */
async function expectCorrectionFromMenu(
  field: Locator,
  afterApply: (chosen: string) => Promise<void>,
): Promise<string> {
  await field.fill(MISSPELLING);
  const menu = await openMenuFor(field, MISSPELLING);
  // Non-empty is the assertion: which strings `nspell` returns depends on the
  // shipped affix file, so no particular suggestion is named. Attached, not
  // visible: the chat panel scrolls, and where the menu lands inside it is not
  // what this row is about.
  const suggestions = menu.locator('.spelling-menu-suggestion');
  await expect(suggestions.first()).toBeAttached();
  expect(await suggestions.count()).toBeGreaterThan(0);
  const first = suggestions.first();
  const chosen = (await first.textContent()) ?? '';
  expect(chosen).not.toBe('');
  await first.click();
  await afterApply(chosen);
  return chosen;
}

test.describe('el corrector en Español', () => {
  test('marks the note body, corrects it, and shows no English', async ({ page, request, checkScreen }) => {
    const patient = (await (
      await request.post('/api/patients', { data: { name: SPANISH_DISPLAY_NAME } })
    ).json()) as Created;
    const format = (await (
      await request.post('/api/formats', {
        data: { name: 'Nota de progreso (es-MX)', sections: ['Subjetivo', 'Plan'] },
      })
    ).json()) as Created;
    const note = (await (
      await request.post('/api/notes', {
        data: { patient_id: patient.id, format_id: format.id, content: NOTE_TEXT },
      })
    ).json()) as Created;
    await page.goto(`/?patient=${patient.id}&note=${note.id}`);

    const body = page.getByTestId('note-body');
    await expect(marksOf(body)).toHaveText([...MISSPELLINGS]);
    await expect(body).toHaveAttribute('spellcheck', 'false');
    await checkScreen(page, 'una nota con marcas de ortografía');

    await expectExactMarks(body, FIELD_TEXT);
    await expectCorrectionFromMenu(body, async (chosen) => {
      await expect(body).toHaveValue(chosen);
      await expect(marksOf(body)).toHaveCount(0);
      // The menu is a Spanish screen too, and it is checked through the
      // unchanged guard rather than a Spanish-specific one.
      await checkScreen(page, 'el menú de ortografía');
    });
  });

  test('marks the typed-notes box, which no English spec ever drove', async ({ page, request }) => {
    const patient = (await (
      await request.post('/api/patients', { data: { name: SPANISH_DISPLAY_NAME } })
    ).json()) as Created;

    await page.goto(`/capture/${patient.id}`);
    const typed = page.getByTestId('summary-input');
    await expect(typed).toBeVisible();

    await expectExactMarks(typed, FIELD_TEXT);
    await expectCorrectionFromMenu(typed, async (chosen) => {
      await expect(typed).toHaveValue(chosen);
    });
  });

  test('marks the refine composer', async ({ page, request }) => {
    const patient = (await (
      await request.post('/api/patients', { data: { name: SPANISH_DISPLAY_NAME } })
    ).json()) as Created;
    const format = (await (
      await request.post('/api/formats', {
        data: { name: 'Nota de progreso (es-MX)', sections: ['Subjetivo', 'Plan'] },
      })
    ).json()) as Created;
    const note = (await (
      await request.post('/api/notes', {
        data: { patient_id: patient.id, format_id: format.id, content: NOTE_TEXT },
      })
    ).json()) as Created;
    await page.goto(`/?patient=${patient.id}&note=${note.id}`);

    await page.getByTestId('chat-fab').click();
    const chat = page.getByTestId('chat-input');
    await expect(chat).toBeVisible();

    await expectExactMarks(chat, FIELD_TEXT);
    await expectCorrectionFromMenu(chat, async (chosen) => {
      await expect(chat).toHaveValue(chosen);
    });
  });

  test('marks the patient rename field, which no English spec ever drove', async ({ page, request }) => {
    const patient = (await (
      await request.post('/api/patients', { data: { name: SPANISH_DISPLAY_NAME } })
    ).json()) as Created;
    await page.goto(`/?patient=${patient.id}`);

    // `Tools for {name}` is an English `aria-label` template in `PatientMenu.tsx`
    // in every language (see the S2.6 return), which is why the row menu is
    // opened by its test id rather than by any label of ours.
    await page.getByTestId(`patient-menu-${patient.id}`).click();
    await page.getByTestId(`rename-${patient.id}`).click();
    const rename = page.getByTestId(`rename-field-${patient.id}`).locator('input');
    await expect(rename).toBeVisible();

    await expectExactMarks(rename, FIELD_TEXT);
    await expectCorrectionFromMenu(rename, async (chosen) => {
      // This field is the one surface that does not keep the corrected value
      // on screen: it commits on blur or Enter and is replaced by the patient's
      // row, so the correction is asserted where it lands — as the name.
      await rename.press('Enter');
      await expect(page.getByTestId(`patient-row-${patient.id}`)).toContainText(chosen);
    });
  });

  test('marks the add-patient name input at /patients/new', async ({ page, tr }) => {
    await page.goto('/patients/new');
    const name = page.getByLabel(tr('common.name'));
    await expect(name).toBeVisible();

    await expectExactMarks(name, FIELD_TEXT);
    await expectCorrectionFromMenu(name, async (chosen) => {
      await expect(name).toHaveValue(chosen);
    });
  });
});
