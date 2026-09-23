import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router';

import { SettingsProvider, useSettingsContext } from './components/SettingsProvider.js';
import { SpellingProvider } from './components/SpellingProvider.js';

import { applyAppearance } from './lib/appearance.js';

import { AddPatient } from './routes/AddPatient.js';
import { Capture } from './routes/Capture.js';
import { Workspace } from './routes/Workspace.js';

// Non-workspace screens are runtime-loaded so the landing view stays eager.

const About = lazy(async () => ({ default: (await import('./routes/About.js')).About }));
const Licenses = lazy(async () => ({ default: (await import('./routes/Licenses.js')).Licenses }));
const OnboardingFormat = lazy(async () => ({
  default: (await import('./routes/OnboardingFormat.js')).OnboardingFormat,
}));
const OnboardingPreview = lazy(async () => ({
  default: (await import('./routes/OnboardingPreview.js')).OnboardingPreview,
}));
const Import = lazy(async () => ({ default: (await import('./routes/Import.js')).Import }));
const HalaxyImport = lazy(async () => ({
  default: (await import('./routes/HalaxyImport.js')).HalaxyImport,
}));
const Settings = lazy(async () => ({ default: (await import('./routes/Settings.js')).Settings }));
const Setup = lazy(async () => ({ default: (await import('./routes/Setup.js')).Setup }));

/**
 * Every screen in the app. There is no login route — the app opens straight
 * into the workspace (PLAN §1); the prototype's `index.html` sign-in screen is
 * deliberately not ported.
 */
export function App(): React.JSX.Element {
  return (
    <SettingsProvider>
      <SpellingProvider>
        <AppRoutes />
      </SpellingProvider>
    </SettingsProvider>
  );
}

function AppRoutes(): React.JSX.Element {
  const location = useLocation();
  const { state } = useSettingsContext();

  /*
   * The practice's appearance — accent, text size, animations — painted once
   * at startup. A failure here is deliberately silent: the app is entirely
   * usable in its default colours.
   */
  useEffect(() => {
    if (state.status === 'ready') applyAppearance(state.data);
  }, [state]);

  return (
    /*
     * Key only the route transition wrapper, not either long-lived provider.
     * Query-string changes (patient and note selection) remain unanimated.
     */
    <div key={location.pathname} className="route-transition">
      <Suspense fallback={<p className="state-note">Loading…</p>}>
        <Routes>
          <Route path="/" element={<Workspace />} />
          <Route path="/patients/new" element={<AddPatient />} />
          <Route path="/capture/:patientId" element={<Capture />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/import" element={<Import />} />
          <Route path="/import/halaxy" element={<HalaxyImport />} />
          <Route path="/setup" element={<Setup />} />
          <Route path="/about" element={<About />} />
          <Route path="/licenses" element={<Licenses />} />
          <Route path="/onboarding/format" element={<OnboardingFormat />} />
          <Route path="/onboarding/preview" element={<OnboardingPreview />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </div>
  );
}
