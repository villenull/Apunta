import { DEFAULT_ACCENT_COLOR, isAccentColor } from '@apunta/shared';

/**
 * Paint the chosen accent onto the document, or clear it back to the
 * stylesheet's own value.
 *
 * The whole palette follows from this one property: `tokens.css` mixes
 * `--accent-hover` and `--accent-tint` out of `--accent`. A stored value that
 * is not a plain hex colour is ignored rather than written, so a corrupt or
 * hand-edited settings row cannot put arbitrary text into a style attribute.
 */
export function applyAccentColor(value: unknown): void {
  const root = document.documentElement;
  if (isAccentColor(value)) root.style.setProperty('--accent', value);
  else root.style.removeProperty('--accent');
}

/** The colour input needs a concrete value even when nothing is stored. */
export function accentColorOrDefault(value: unknown): string {
  return isAccentColor(value) ? value : DEFAULT_ACCENT_COLOR;
}
