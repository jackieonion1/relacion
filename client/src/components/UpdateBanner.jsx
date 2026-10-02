import React, { useEffect, useState } from 'react';
import { applyUpdate, checkForUpdate, getRegistration } from '../lib/appUpdate';

const THROTTLE_MS = 5 * 60 * 1000;
const INTERVAL_MS = 30 * 60 * 1000;

// «Nueva versión disponible»: solo avisa; recarga únicamente al pulsar «Actualizar»
export default function UpdateBanner() {
  const [available, setAvailable] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    let alive = true;
    let lastCheck = 0;
    let reg = null;
    const found = () => { if (alive) setAvailable(true); };

    async function check({ throttle = false, updateSw = false } = {}) {
      if (throttle && Date.now() - lastCheck < THROTTLE_MS) return;
      lastCheck = Date.now();
      if (await checkForUpdate()) found();
      // Que el SW también mire si hay un sw.js nuevo (iOS no deja correr temporizadores en segundo plano)
      if (updateSw && reg) reg.update().catch(() => {});
    }

    // Un SW nuevo instalado mientras otro controla la página también es una versión nueva
    const watchInstalling = () => {
      const w = reg && reg.installing;
      if (!w) return;
      w.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) found();
      });
    };
    getRegistration().then((r) => {
      if (!alive || !r) return;
      reg = r;
      if (r.waiting && navigator.serviceWorker.controller) found();
      watchInstalling(); // ya instalándose al montar: updatefound no volverá a saltar
      r.addEventListener('updatefound', watchInstalling);
    });

    const onVisible = () => { if (document.visibilityState === 'visible') check({ throttle: true, updateSw: true }); };
    const onOnline = () => check({ updateSw: true });
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') check({ updateSw: true });
    }, INTERVAL_MS);
    check();

    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
      if (reg) reg.removeEventListener('updatefound', watchInstalling);
    };
  }, []);

  if (!available || dismissed) return null;

  const update = async () => {
    setUpdating(true);
    try { await applyUpdate(); } catch { setUpdating(false); }
  };

  return (
    <div className="mx-auto w-full max-w-(--breakpoint-md) px-4 pt-3">
      <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 px-4 py-3 text-sm flex items-center gap-3">
        <div className="flex-1">Nueva versión disponible</div>
        <button onClick={update} disabled={updating} className="btn-primary text-xs disabled:opacity-60">
          {updating ? 'Actualizando…' : 'Actualizar'}
        </button>
        <button onClick={() => setDismissed(true)} disabled={updating} className="btn-ghost text-xs">Luego</button>
      </div>
    </div>
  );
}
