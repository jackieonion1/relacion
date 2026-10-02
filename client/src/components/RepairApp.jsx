import React, { useEffect, useState } from 'react';
import Sheet from './Sheet';
import Button from './Button';
import Icon from './Icon';
import { repairApp } from '../lib/appUpdate';

// Palanca que ella puede pulsar sola si la app se ve rara: borra la copia de la app que guarda el SW y
// recarga. Los datos (código de pareja, identidad, fotos pendientes) y las notificaciones no se tocan
export default function RepairApp() {
  const [confirm, setConfirm] = useState(false);
  const [working, setWorking] = useState(false);
  const [failed, setFailed] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine !== false);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  async function onRepair() {
    setWorking(true);
    setFailed(false);
    try {
      await repairApp();
    } catch {
      setFailed(true);
      setWorking(false);
      setConfirm(false);
    }
  }

  // A row of the «La app» card in Ajustes (Ajustes-final, Ajustes-reparar); the confirmation is a bottom sheet
  return (
    <>
      <button
        type="button" onClick={() => setConfirm(true)} disabled={!online}
        className="w-full min-h-14 px-4 flex items-center gap-3 text-left active:bg-sunk disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-lacre focus-visible:-outline-offset-2"
      >
        <span className="flex-1 min-w-0 flex flex-col py-2">
          <span className="text-base">Reparar app</span>
          <span className="text-[13px] text-ink-2">Si algo no carga o se ve raro. No borra tus datos ni las notificaciones.</span>
        </span>
        <Icon name="reparar" size={20} className="text-ink-2" />
      </button>
      {!online && <p className="px-4 pb-3 text-[13px] text-danger">Necesita conexión.</p>}
      {failed && <p role="alert" className="px-4 pb-3 text-[13px] text-danger">Sin conexión: no se ha tocado nada. Prueba cuando tengas red.</p>}
      <Sheet isOpen={confirm} onClose={() => { if (!working) setConfirm(false); }}>
        <div className="flex flex-col gap-1.5 px-5 pt-2 pb-[34px]">
          <h2 className="serif text-[26px] leading-[1.15] font-normal">¿Reparar la app?</h2>
          <p className="pb-3.5 text-[15px] text-ink-2">
            Se borrará la copia guardada de la app y se volverá a cargar. El código de pareja, tu identidad, las fotos pendientes y las notificaciones se quedan como están.
          </p>
          <Button size="l" onClick={onRepair} busy={working} busyText="Reparando…">Reparar</Button>
          <Button variant="txt" size="l" onClick={() => setConfirm(false)} disabled={working}>Cancelar</Button>
        </div>
      </Sheet>
    </>
  );
}
