import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { AppProviders } from '@/app/AppProviders';
import { AppRouter } from '@/app/AppRouter';
import { AuthGate } from '@/features/auth/AuthGate';

import './index.css';
// Side-effect import: initialises the default i18next instance that
// `useTranslation` reads. It must run before the first component renders.
import '@/i18n/config';

const container = document.getElementById('root');

if (container === null) {
  throw new Error('Missing #root element in index.html');
}

/**
 * The order is the argument: server state and theme wrap everything;
 * `AuthGate` sits between them and the router because the router's guards need
 * an answer about the session that only exists once `GET /auth/me` has replied,
 * and `AppRouter` is what carries that answer into the route context.
 */
createRoot(container).render(
  <StrictMode>
    <AppProviders>
      <AuthGate>
        <AppRouter />
      </AuthGate>
    </AppProviders>
  </StrictMode>,
);
