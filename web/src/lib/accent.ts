import { DEFAULT_ACCENT_COLOR, isAccentColor } from '@apunta/shared';

function channel(value: number): number {
  const normalized = value / 255;
  return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance for a six-digit sRGB hex value. */
export function accentLuminance(value: string): number {
  const red = Number.parseInt(value.slice(1, 3), 16);
  const green = Number.parseInt(value.slice(3, 5), 16);
  const blue = Number.parseInt(value.slice(5, 7), 16);
  return 0.2126 * channel(red) + 0.7152 * channel(green) + 0.0722 * channel(blue);
}

function contrast(first: number, second: number): number {
  const light = Math.max(first, second);
  const dark = Math.min(first, second);
  return (light + 0.05) / (dark + 0.05);
}

/**
 * Return a dark ink colour for an accent used on white text/backgrounds.
 * Darkening is deterministic and stops as soon as WCAG AA is met.
 */
export function accentInk(value: string): string {
  const luminance = accentLuminance(value);
  if (contrast(luminance, 1) >= 4.5) return value;
  let red = Number.parseInt(value.slice(1, 3), 16);
  let green = Number.parseInt(value.slice(3, 5), 16);
  let blue = Number.parseInt(value.slice(5, 7), 16);
  for (let step = 0; step < 100; step += 1) {
    red = Math.max(0, Math.floor(red * 0.9));
    green = Math.max(0, Math.floor(green * 0.9));
    blue = Math.max(0, Math.floor(blue * 0.9));
    const candidate = `#${red.toString(16).padStart(2, '0')}${green.toString(16).padStart(2, '0')}${blue
      .toString(16)
      .padStart(2, '0')}`;
    if (contrast(accentLuminance(candidate), 1) >= 4.5) return candidate;
  }
  return '#1a1a1a';
}

/**
 * How far white may fall before the label on the accent stops being white.
 *
 * The same 3:1 the picker warns under (`settings.accentLowContrast`), and for
 * the same reason: 3:1 is where a glyph stops being a shape and starts being a
 * smudge. Above it the label is white, which is what the owner's teal and every
 * other accent of hers wants; below it there is no white to have, and the
 * near-black is the only readable thing left.
 */
const MIN_WHITE_ON_ACCENT = 3;

/**
 * Paint the chosen accent and its readable foreground/ink variants.
 */
export function applyAccentColor(value: unknown): void {
  const root = document.documentElement;
  if (!isAccentColor(value)) {
    root.style.removeProperty('--accent');
    root.style.removeProperty('--on-accent');
    root.style.removeProperty('--accent-ink');
    return;
  }
  const luminance = accentLuminance(value);
  const whiteContrast = contrast(luminance, 1);
  root.style.setProperty('--accent', value);
  // White unless it is unreadable, rather than whichever of the two happens to
  // score higher. Those disagree often enough to be visible: the Apunta teal
  // scores 3.32:1 in white and 5.68:1 in near-black, so picking the winner
  // painted a dark label on a mid-tone button, and the dark one looked like the
  // odd setting rather than the rule (owner, 2026-09-27, reversing the choice
  // made earlier the same day). An accent light enough to need the fallback —
  // `#ffff00` scores 1.07:1 in white — still gets it.
  root.style.setProperty('--on-accent', whiteContrast >= MIN_WHITE_ON_ACCENT ? '#ffffff' : '#111111');
  root.style.setProperty('--accent-ink', accentInk(value));
}

/** The colour input needs a concrete value even when nothing is stored. */
export function accentColorOrDefault(value: unknown): string {
  return isAccentColor(value) ? value : DEFAULT_ACCENT_COLOR;
}
