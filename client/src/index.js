import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './lib/firebase';

const root = createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>
);

// Register/Unregister Service Worker
if (process.env.NODE_ENV === 'production' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    const swUrl = (process.env.PUBLIC_URL && process.env.PUBLIC_URL !== '/')
      ? `${process.env.PUBLIC_URL.replace(/\/$/, '')}/sw.js`
      : '/sw.js';
    navigator.serviceWorker
      .register(swUrl)
      .catch((err) => console.warn('SW registration failed:', err));
  });
} else if ('serviceWorker' in navigator) {
  // In development, ensure no stale SW controls the page
  navigator.serviceWorker.getRegistrations().then((regs) => {
    for (const r of regs) r.unregister().catch(() => {});
  });
}
