import React, { useEffect, useState } from 'react';
import { resyncPush, subscribeToPush } from '../lib/push';
import { decideNotice, dismissNotice } from '../lib/pushResync';
import Aviso, { useAvisoTurn } from './Aviso';

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

  // The slot only decides when it paints: the resync above runs on mount whatever the turn (plan §4)
  const myTurn = useAvisoTurn('push', show);
  if (!myTurn) return null;

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
    <Aviso title={failed ? 'No se pudo activar. Prueba en Ajustes.' : 'Activa las notificaciones para enterarte de lo nuevo'}>
      <button onClick={activate} disabled={busy} className="btn btn-inv">Activar</button>
      <button onClick={later} disabled={busy} className="btn aviso-txt">Luego</button>
    </Aviso>
  );
}
