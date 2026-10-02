import React, { lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import App from './App';
import './index.css';
import './lib/firebase';
import { guardShell } from './lib/shellGuard';
import { applyTheme, watchSystemTheme } from './lib/theme';

applyTheme(); // index.html already painted it; this also covers the theme-color
watchSystemTheme();

// Component sample page, development only and outside the pair/identity gates; the build drops it
const Muestra = import.meta.env.DEV && window.location.pathname === '/dev/componentes'
  ? lazy(() => import('./pages/Muestra'))
  : null;

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    {Muestra ? (
      <Suspense fallback={null}><Muestra /></Suspense>
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </React.StrictMode>
);

// Register/Unregister Service Worker
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  guardShell(); // no se espera: nunca rechaza ni bloquea el arranque
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.warn('SW registration failed:', err));
  });
} else if ('serviceWorker' in navigator) {
  // In development, ensure no stale SW controls the page
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) r.unregister().catch(() => {});
  });
}
