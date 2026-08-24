import { Navigate, Route, Routes } from 'react-router';

import { About } from './routes/About.js';
import { AddPatient } from './routes/AddPatient.js';
import { Capture } from './routes/Capture.js';
import { OnboardingFormat } from './routes/OnboardingFormat.js';
import { OnboardingPreview } from './routes/OnboardingPreview.js';
import { Settings } from './routes/Settings.js';
import { Setup } from './routes/Setup.js';
import { Workspace } from './routes/Workspace.js';

/**
 * Every screen in the app. There is no login route — the app opens straight
 * into the workspace (PLAN §1); the prototype's `index.html` sign-in screen is
 * deliberately not ported.
 */
export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route path="/" element={<Workspace />} />
      <Route path="/patients/new" element={<AddPatient />} />
      <Route path="/capture/:patientId" element={<Capture />} />
      <Route path="/settings" element={<Settings />} />
      <Route path="/setup" element={<Setup />} />
      <Route path="/about" element={<About />} />
      <Route path="/onboarding/format" element={<OnboardingFormat />} />
      <Route path="/onboarding/preview" element={<OnboardingPreview />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
