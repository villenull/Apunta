import {
  ACCENT_COLOR_SETTING,
  ANIMATIONS_SETTING,
  DEFAULT_FONT_SIZE,
  FONT_SCALE,
  FONT_SIZE_SETTING,
  isFontSize,
  type FontSize,
  type Settings,
} from '@apunta/shared';

import { applyAccentColor } from './accent.js';

/**
 * Text size and animations (owner, 2026-09-21), beside the accent colour.
 *
 * All three are server settings, painted onto the root element at startup
 * the same way the accent always has been. The one part that does not wait
 * for the server is the system's reduced-motion preference: `main.tsx`
 * applies it before the first render, so a Mac set to reduce motion never
 * sees an entrance play while settings load.
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

/** Everything on the Appearance card, from a settings record. */
export function applyAppearance(settings: Settings): void {
  applyAccentColor(settings[ACCENT_COLOR_SETTING]);
  applyFontSize(settings[FONT_SIZE_SETTING]);
  applyAnimations(settings[ANIMATIONS_SETTING]);
}
