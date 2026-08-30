import { useEffect, useState } from 'react';

/**
 * TEMPORARY EVALUATION RIG (2026-08-30): flips between the five candidate
 * motion languages in `styles/motion-themes.css` so the owner-proxy can feel
 * each one on live data. The choice persists in localStorage under
 * `apunta-motion`. Once a language is picked it folds into `motion.css` and
 * this component is deleted — it must not ship to the practice owner's Mac.
 */
const LANGUAGES = ['default', 'ia', 'notion', 'linear', 'superhuman', 'craft'] as const;
type Language = (typeof LANGUAGES)[number];

const STORAGE_KEY = 'apunta-motion';

/** jsdom has no localStorage, and a hardened browser may refuse it. */
function safeStorage(): Storage | null {
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

function stored(): Language {
  const value = safeStorage()?.getItem(STORAGE_KEY);
  return (LANGUAGES as readonly string[]).includes(value ?? '') ? (value as Language) : 'default';
}

export function MotionSwitcher(): React.JSX.Element {
  const [language, setLanguage] = useState<Language>(stored);

  useEffect(() => {
    const root = document.documentElement;
    if (language === 'default') {
      root.removeAttribute('data-motion');
      safeStorage()?.removeItem(STORAGE_KEY);
    } else {
      root.setAttribute('data-motion', language);
      safeStorage()?.setItem(STORAGE_KEY, language);
    }
  }, [language]);

  return (
    <div className="motion-switcher" data-testid="motion-switcher" aria-label="Motion language (evaluation)">
      {LANGUAGES.map((candidate) => (
        <button
          key={candidate}
          type="button"
          aria-pressed={candidate === language}
          onClick={() => {
            setLanguage(candidate);
          }}
        >
          {candidate === 'default' ? 'now' : candidate}
        </button>
      ))}
    </div>
  );
}
