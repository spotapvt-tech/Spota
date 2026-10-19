import React from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
// Self-hosted fonts: bundled with the app so type renders offline (trailheads,
// Capacitor builds) and without a Google Fonts round-trip.
import '@fontsource-variable/sora/wght.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource-variable/space-grotesk/wght.css';
import './index.css';
import { initSentry } from './lib/monitoring';

// No-op until VITE_SENTRY_DSN is set (see .env.example) — safe to leave in
// place for every environment.
initSentry();

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </React.StrictMode>,
);
