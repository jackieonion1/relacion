import React, { useEffect, useState } from 'react';
import Modal from './Modal';
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

  return (
    <div className="card">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm text-gray-600">Reparar app</div>
          <p className="text-xs text-gray-500 mt-1">Si algo no carga o se ve raro. No borra tus datos ni las notificaciones.</p>
          {!online && <p className="text-xs text-rose-600 mt-1">Necesita conexión.</p>}
          {failed && <p className="text-xs text-rose-600 mt-1">Sin conexión: no se ha tocado nada. Prueba cuando tengas red.</p>}
        </div>
        <button onClick={() => setConfirm(true)} disabled={!online} className="btn-ghost disabled:opacity-60">Reparar</button>
      </div>
      <Modal isOpen={confirm} onClose={() => { if (!working) setConfirm(false); }}>
        <div className="p-6 text-center">
          <h3 className="text-lg font-semibold mb-2">Reparar la app</h3>
          <p className="text-gray-600 mb-6">
            Se borrará la copia guardada de la app y se volverá a cargar. El código de pareja, tu identidad, las fotos pendientes y las notificaciones se quedan como están.
          </p>
          <div className="flex gap-3 justify-center">
            <button onClick={() => setConfirm(false)} disabled={working} className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors">
              Cancelar
            </button>
            <button onClick={onRepair} disabled={working} className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-500 transition-colors disabled:opacity-60">
              {working ? 'Reparando…' : 'Reparar'}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
