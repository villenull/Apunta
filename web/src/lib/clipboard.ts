/**
 * Copying a note to the clipboard is the whole point of publishing — the note
 * goes into whatever record system the practice actually uses. A browser that
 * refuses the permission must not break the flow, so failures are swallowed
 * exactly as `prototype/patients.html` does.
 */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // No clipboard permission: the note is still on screen to copy by hand.
  }
}
