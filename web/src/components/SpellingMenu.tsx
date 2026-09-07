import { useEffect, useRef } from 'react';

/**
 * The little menu under a misspelt word: the suggestions, then "Ignore" for
 * this tab and "Add to dictionary" for good. Closed by a choice, Escape, or a
 * click anywhere else. Positioned by the caller, inside the editor's wrap.
 */
export function SpellingMenu({
  word,
  suggestions,
  left,
  top,
  onPick,
  onIgnore,
  onAdd,
  onClose,
}: {
  readonly word: string;
  readonly suggestions: readonly string[];
  readonly left: number;
  readonly top: number;
  readonly onPick: (replacement: string) => void;
  readonly onIgnore: () => void;
  readonly onAdd: () => void;
  readonly onClose: () => void;
}): React.JSX.Element {
  const menu = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: MouseEvent): void => {
      if (menu.current && !menu.current.contains(event.target as Node)) onClose();
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onPointerDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={menu}
      className="spelling-menu"
      role="menu"
      aria-label={`Spelling of ${word}`}
      data-testid="spelling-menu"
      style={{ left, top }}
    >
      {suggestions.length === 0 ? (
        <p className="spelling-menu-none">No suggestions</p>
      ) : (
        suggestions.map((suggestion) => (
          <button
            key={suggestion}
            type="button"
            role="menuitem"
            className="spelling-menu-item spelling-menu-suggestion"
            onClick={() => {
              onPick(suggestion);
            }}
          >
            {suggestion}
          </button>
        ))
      )}
      <div className="spelling-menu-rule" role="separator" />
      <button type="button" role="menuitem" className="spelling-menu-item" onClick={onIgnore}>
        Ignore
      </button>
      <button type="button" role="menuitem" className="spelling-menu-item" onClick={onAdd}>
        Add to dictionary
      </button>
    </div>
  );
}
