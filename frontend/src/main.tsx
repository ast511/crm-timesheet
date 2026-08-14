import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from '@/app/AppProviders';
import { router } from '@/app/router';

import './index.css';
// Side-effect import: initialises the default i18next instance that
// `useTranslation` reads. It must run before the first component renders.
import '@/i18n/config';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Missing #root element in index.html');
}

createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <RouterProvider router={router} />
    </AppProviders>
  </StrictMode>,
);
