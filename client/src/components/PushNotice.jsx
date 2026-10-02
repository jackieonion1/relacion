import React, { useEffect, useState } from 'react';
import { resyncPush, subscribeToPush } from '../lib/push';
import { decideNotice, dismissNotice } from '../lib/pushResync';

const vapid = () => import.meta.env.REACT_APP_VAPID_PUBLIC_KEY || '';

// Al abrir la app resincroniza la suscripción que ya existe (solo lectura del PushManager) y, solo si este
// dispositivo no tiene ninguna y se puede pedir, ofrece «Activar notificaciones». Nunca se suscribe solo:
// pedir permiso y suscribir necesitan un gesto (iOS) y solo ocurren al pulsar el botón.
export default function PushNotice() {
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        // Pareja e identidad elegidas en las puertas; sin ellas resyncPush no hace nada
        const pair = localStorage.getItem('pairId') || '';
        const identity = localStorage.getItem('identity') || '';
        const { status } = await resyncPush(pair, identity);
        if (alive && vapid() && decideNotice(status, localStorage)) setShow(true);
      } catch {}
    })();
    return () => { alive = false; };
  }, []);

  if (!show) return null;

  async function activate() {
    setBusy(true);
    setFailed(false);
    try {
      if (Notification.permission === 'default') await Notification.requestPermission();
      if (Notification.permission === 'denied') { setShow(false); return; }
      if (Notification.permission !== 'granted') { setFailed(true); return; }
      await subscribeToPush(localStorage.getItem('pairId') || '', localStorage.getItem('identity') || '', vapid());
      setShow(false);
    } catch (e) {
      console.warn('activate notifications error', e);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const later = () => { try { dismissNotice(localStorage); } catch {} setShow(false); };

  return (
    <div className="mx-auto w-full max-w-(--breakpoint-md) px-4 pt-3">
      <div role="status" className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 px-4 py-3 text-sm flex items-center gap-3">
        <div className="flex-1">
          {failed ? 'No se pudo activar. Prueba en Ajustes.' : 'Activa las notificaciones para enterarte de lo nuevo'}
        </div>
        <button onClick={activate} disabled={busy} className="btn-primary text-xs disabled:opacity-60">Activar</button>
        <button onClick={later} disabled={busy} className="btn-ghost text-xs">Luego</button>
      </div>
    </div>
  );
}
