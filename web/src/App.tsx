import { useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';

import { SpellingProvider } from './components/SpellingProvider.js';

import { getSettings } from './api/index.js';
import { applyAppearance } from './lib/appearance.js';

import { About } from './routes/About.js';
import { AddPatient } from './routes/AddPatient.js';
import { Capture } from './routes/Capture.js';
import { Licenses } from './routes/Licenses.js';
import { OnboardingFormat } from './routes/OnboardingFormat.js';
import { OnboardingPreview } from './routes/OnboardingPreview.js';
import { Import } from './routes/Import.js';
import { Settings } from './routes/Settings.js';
import { Setup } from './routes/Setup.js';
import { Workspace } from './routes/Workspace.js';

/**
 * Every screen in the app. There is no login route — the app opens straight
 * into the workspace (PLAN §1); the prototype's `index.html` sign-in screen is
 * deliberately not ported.
 */
export function App(): React.JSX.Element {
  const location = useLocation();

  /*
   * The practice's appearance — accent, text size, animations — painted
   * once at startup. A failure here is
   * deliberately silent: the app is entirely usable in its default colours,
   * and every screen that actually needs settings reports its own failure.
   */
  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        applyAppearance(await getSettings(controller.signal));
      } catch {
        // Default colours it is.
      }
    })();
    return () => {
      controller.abort();
    };
  }, []);

  return (
    /*
     * Keyed by pathname so every screen change remounts the wrapper and
     * replays `.route-transition` (styles/motion.css): a quick fade and a 3px
     * rise, part of the sanctioned motion pass (owner-proxy feedback,
     * 2026-08-28 — the prototype's instant cuts read as the app not
     * responding). Pathname only, not the full location: picking a patient or
     * a note changes the query string, and re-fading the whole workspace on
     * every list click would be exactly the theatre this app avoids.
     */
    <div key={location.pathname} className="route-transition">
      <SpellingProvider>
        <Routes>
          <Route path="/" element={<Workspace />} />
          <Route path="/patients/new" element={<AddPatient />} />
          <Route path="/capture/:patientId" element={<Capture />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/import" element={<Import />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/about" element={<About />} />
          <Route path="/licenses" element={<Licenses />} />
          <Route path="/onboarding/format" element={<OnboardingFormat />} />
          <Route path="/onboarding/preview" element={<OnboardingPreview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SpellingProvider>
    </div>
  );
}
