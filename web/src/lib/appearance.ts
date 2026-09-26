import {
  ACCENT_COLOR_SETTING,
  ANIMATIONS_SETTING,
  DEFAULT_FONT_SIZE,
  DEFAULT_THEME,
  FONT_SCALE,
  FONT_SIZE_SETTING,
  isFontSize,
  isTheme,
  THEME_SETTING,
  type FontSize,
  type ResolvedTheme,
  type Settings,
  type Theme,
} from '@apunta/shared';

import { applyAccentColor } from './accent.js';

/**
 * Text size, animations and theme (owner, 2026-09-21; theme 2026-09-25; the
 * System choice 2026-09-26), beside the accent colour.
 *
 * All four are server settings, painted onto the root element at startup
 * the same way the accent always has been. The parts that do not wait for
 * the server are the system's reduced-motion preference, the dark
 * default and the theme this browser last painted: `main.tsx` applies them
 * before the first render, so neither a fresh install nor a `system` user
 * sees a flash of the wrong theme while settings load.
 */

/** The class `motion.css` keys "animations off" on. */
export const NO_MOTION_CLASS = 'no-motion';

export function fontSizeOrDefault(value: unknown): FontSize {
  return isFontSize(value) ? value : DEFAULT_FONT_SIZE;
}

/** Scale every font size in the stylesheets together. */
export function applyFontSize(value: unknown): void {
  const root = document.documentElement;
  const size = fontSizeOrDefault(value);
  if (size === DEFAULT_FONT_SIZE) root.style.removeProperty('--font-scale');
  else root.style.setProperty('--font-scale', String(FONT_SCALE[size]));
}

/** Does the operating system ask for reduced motion? */
export function systemPrefersReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

/** Her choice when she has made one; otherwise the system's. */
export function animationsEnabled(value: unknown): boolean {
  return typeof value === 'boolean' ? value : !systemPrefersReducedMotion();
}

export function applyAnimations(value: unknown): void {
  document.documentElement.classList.toggle(NO_MOTION_CLASS, !animationsEnabled(value));
}

export function themeOrDefault(value: unknown): Theme {
  return isTheme(value) ? value : DEFAULT_THEME;
}

/** Dark is the default: unset paints `data-theme="dark"` on the root. */
export function applyTheme(value: unknown): void {
  const root = document.documentElement;
  const theme = themeOrDefault(value);
  const resolved = resolveTheme(theme, systemPrefersDark());
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = resolved === 'dark' ? '#16150f' : '#f6f4ef';
  writeBootTheme(resolved);
  if (theme === 'system') watchSystemTheme();
  else stopWatchingSystemTheme();
}

/**
 * What a stored choice paints, given what the operating system is asking for.
 * Pure, so the one rule that matters — `system` follows the OS, and only
 * `system` does — is testable without a browser.
 */
export function resolveTheme(theme: Theme, prefersDark: boolean): ResolvedTheme {
  return theme === 'system' ? (prefersDark ? 'dark' : 'light') : theme;
}

/** Does the operating system ask for a dark interface? False when it cannot say. */
export function systemPrefersDark(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/*
 * While the choice is `system` the app has to keep listening: a machine that
 * switches to dark at dusk has to switch Apunta with it, without a reload.
 * One subscription at a time, torn down the moment she picks a theme of her
 * own, and every call optional because `matchMedia` is missing in jsdom.
 */
let systemQuery: MediaQueryList | null = null;
let systemListener: (() => void) | null = null;

function watchSystemTheme(): void {
  if (systemQuery !== null || typeof window.matchMedia !== 'function') return;
  const query = window.matchMedia('(prefers-color-scheme: dark)');
  const listener = (): void => {
    applyTheme('system');
  };
  query.addEventListener('change', listener);
  systemQuery = query;
  systemListener = listener;
}

function stopWatchingSystemTheme(): void {
  if (systemQuery !== null && systemListener !== null) {
    systemQuery.removeEventListener('change', systemListener);
  }
  systemQuery = null;
  systemListener = null;
}

/**
 * The theme this browser last painted, so the frame before the settings arrive
 * is already the right one. Without it a `system` user gets a flash of dark on
 * a light desktop, because `index.html` can only guess (it hard-codes dark).
 * preview-only bargain, same as the sidebar's pin order: a local cache of
 * something the server also knows, and losing it costs one frame.
 */
const BOOT_THEME_KEY = 'apunta-boot-theme-v1';

function writeBootTheme(resolved: ResolvedTheme): void {
  try {
    window.localStorage.setItem(BOOT_THEME_KEY, resolved);
  } catch {
    // A store that refuses writes only costs the pre-settings frame.
  }
}

/** The cached theme for the first paint, or undefined when there is none. */
export function readBootTheme(): ResolvedTheme | undefined {
  try {
    const raw = window.localStorage.getItem(BOOT_THEME_KEY);
    return raw === 'light' || raw === 'dark' ? raw : undefined;
  } catch {
    return undefined;
  }
}

/** Everything on the Appearance card, from a settings record. */
export function applyAppearance(settings: Settings): void {
  applyAccentColor(settings[ACCENT_COLOR_SETTING]);
  applyFontSize(settings[FONT_SIZE_SETTING]);
  applyAnimations(settings[ANIMATIONS_SETTING]);
  applyTheme(settings[THEME_SETTING]);
}
