import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../App.js';
import { installFakeApi, makeFormat, type FakeApi } from '../test/fakeApi.js';
import { createMemoryRouter, RouterProvider } from 'react-router';

/**
 * The language chooser (owner, 2026-09-27, after Claude's): a window over the
 * workspace, each language in its own name with the English name underneath, and
 * a tick on the one in force.
 *
 * Two things here are not a matter of taste and are pinned accordingly. The
 * window **lists only the languages this build offers** — Spanish is a property
 * of the build and must never reach a release, so a build without it shows one
 * option rather than a disabled one, and that is asserted both ways. And the
 * English line is **dropped when it would repeat the endonym**, because
 * "English (United States)" printed twice reads as a rendering fault rather than
 * as a translation.
 */

afterEach(cleanup);

const progressNote = makeFormat('Progress note', ['Subjective', 'Plan']);

/** The whole app, so the chooser is reached the way she reaches it. */
function renderApp(settings: Record<string, unknown> = {}): FakeApi {
  const api = installFakeApi({ formats: [progressNote], settings });
  const router = createMemoryRouter([{ path: '*', element: <App /> }], { initialEntries: ['/'] });
  render(<RouterProvider router={router} />);
  return api;
}

describe('the language chooser', () => {
  it('is not there until "More" asks for it', async () => {
    renderApp();

    await screen.findByTestId('mission-control');
    expect(screen.queryByTestId('language-dialog')).toBeNull();

    fireEvent.click(screen.getByTestId('mission-control'));
    fireEvent.click(screen.getByTestId('mission-language'));

    expect(await screen.findByTestId('language-dialog')).toBeDefined();
  });

  it('names each language in its own name, with the English name underneath', async () => {
    renderApp({ spanish_available: true });
    fireEvent.click(await screen.findByTestId('mission-control'));
    fireEvent.click(screen.getByTestId('mission-language'));

    const dialog = await screen.findByTestId('language-dialog');
    const english = within(dialog).getByTestId('language-option-en');
    const spanish = within(dialog).getByTestId('language-option-es-MX');

    // The endonym is the answer, and the language says so to a screen reader.
    expect(english.getAttribute('lang')).toBe('en');
    expect(spanish.getAttribute('lang')).toBe('es-MX');
    expect(english.textContent).toBe('English (United States)English (United States)');
    // Spanish reads "Español (México)" and is found by its English name.
    expect(spanish.textContent).toBe('Español (México)Spanish (Mexico)');
  });

  it('gives every cell both lines, English included, so every cell is the same height', async () => {
    renderApp({ spanish_available: true });
    fireEvent.click(await screen.findByTestId('mission-control'));
    fireEvent.click(screen.getByTestId('mission-language'));

    const dialog = await screen.findByTestId('language-dialog');
    // As Claude's does (owner, 2026-09-27): the repeat is printed rather than
    // dropped, because dropping it made the English cell a line shorter.
    expect(within(dialog).getByTestId('language-option-en').textContent).toBe(
      'English (United States)English (United States)',
    );
    for (const option of within(dialog).getAllByRole('radio')) {
      expect(option.querySelectorAll('.language-option-endonym, .language-option-english')).toHaveLength(2);
    }
    // And the check sits on the language in force, not on the first one.
    expect(within(dialog).getByTestId('language-option-en').getAttribute('aria-checked')).toBe('true');
  });

  it('shows one language on a build that does not offer Spanish', async () => {
    // The gate that must never be widened: Spanish is a build property, and
    // putting it in a release is a hard stop.
    renderApp({ spanish_available: false });
    fireEvent.click(await screen.findByTestId('mission-control'));
    fireEvent.click(screen.getByTestId('mission-language'));

    const dialog = await screen.findByTestId('language-dialog');
    expect(within(dialog).getByTestId('language-option-en')).toBeDefined();
    expect(within(dialog).queryByTestId('language-option-es-MX')).toBeNull();
  });

  it('switches the whole app to Spanish, and the chooser says so in Spanish', async () => {
    const api = renderApp({ spanish_available: true });
    fireEvent.click(await screen.findByTestId('mission-control'));
    fireEvent.click(screen.getByTestId('mission-language'));
    const dialog = await screen.findByTestId('language-dialog');

    fireEvent.click(within(dialog).getByTestId('language-option-es-MX'));

    await waitFor(() => {
      expect(api.state.settings['language']).toBe('es-MX');
    });
    await waitFor(() => {
      expect(screen.getByTestId('language-dialog').textContent).toContain('Elige tu idioma');
    });
    // And the tick followed her there.
    expect(screen.getByTestId('language-option-es-MX').getAttribute('aria-checked')).toBe('true');
  });

  it('closes on the × and on Escape, leaving the app where it was', async () => {
    renderApp({ spanish_available: true });
    fireEvent.click(await screen.findByTestId('mission-control'));
    fireEvent.click(screen.getByTestId('mission-language'));
    expect(await screen.findByTestId('language-dialog')).toBeDefined();

    fireEvent.click(screen.getByTestId('language-close'));
    await waitFor(() => {
      expect(screen.queryByTestId('language-dialog')).toBeNull();
    });

    fireEvent.click(screen.getByTestId('mission-control'));
    fireEvent.click(screen.getByTestId('mission-language'));
    expect(await screen.findByTestId('language-dialog')).toBeDefined();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByTestId('language-dialog')).toBeNull();
    });
  });
});
