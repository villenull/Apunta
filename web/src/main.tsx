import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { App } from './App.js';
import { applyAnimations, applyTheme, readBootTheme } from './lib/appearance.js';
import { installAutoHideScrollbars } from './lib/scrollbars.js';
import './styles/tokens.css';
import './styles/app.css';
import './styles/motion.css';
import './styles/choreography.css';

// The system's reduced-motion preference and the dark default apply before
// the first frame; her own choices, if she has made them, arrive with the
// settings. A theme this browser has already painted is applied ahead of the
// default, so a `system` user on a light desktop never sees dark first.
applyAnimations(undefined);
applyTheme(readBootTheme());
installAutoHideScrollbars();

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter([{ path: '*', element: <App /> }])} />
  </StrictMode>,
);
