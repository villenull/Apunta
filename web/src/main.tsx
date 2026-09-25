import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { App } from './App.js';
import { applyAnimations, applyTheme } from './lib/appearance.js';
import './styles/tokens.css';
import './styles/app.css';
import './styles/motion.css';
import './styles/choreography.css';

// The system's reduced-motion preference and the dark default apply before
// the first frame; her own choices, if she has made them, arrive with the
// settings.
applyAnimations(undefined);
applyTheme(undefined);

const container = document.getElementById('root');
if (!container) throw new Error('#root is missing from index.html');

createRoot(container).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter([{ path: '*', element: <App /> }])} />
  </StrictMode>,
);
