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
  type Settings,
  type Theme,
} from '@apunta/shared';

import { applyAccentColor } from './accent.js';

/**
 * Text size, animations and theme (owner, 2026-09-21; theme 2026-09-25),
 * beside the accent colour.
 *
 * All four are server settings, painted onto the root element at startup
 * the same way the accent always has been. The parts that do not wait for
 * the server are the system's reduced-motion preference and the dark
 * default: `main.tsx` applies both before the first render, so a fresh
 * install never flashes light while settings load.
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
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
  const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
  if (meta) meta.content = theme === 'dark' ? '#16150f' : '#f6f4ef';
}

/** Everything on the Appearance card, from a settings record. */
export function applyAppearance(settings: Settings): void {
  applyAccentColor(settings[ACCENT_COLOR_SETTING]);
  applyFontSize(settings[FONT_SIZE_SETTING]);
  applyAnimations(settings[ANIMATIONS_SETTING]);
  applyTheme(settings[THEME_SETTING]);
}
