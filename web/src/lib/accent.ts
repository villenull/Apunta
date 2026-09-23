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
  const blackContrast = contrast(luminance, 0);
  root.style.setProperty('--accent', value);
  root.style.setProperty('--on-accent', whiteContrast >= blackContrast ? '#ffffff' : '#111111');
  root.style.setProperty('--accent-ink', accentInk(value));
}

/** The colour input needs a concrete value even when nothing is stored. */
export function accentColorOrDefault(value: unknown): string {
  return isAccentColor(value) ? value : DEFAULT_ACCENT_COLOR;
}
