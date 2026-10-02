import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import Button from './Button';
import Sheet from './Sheet';
import { useAvisoTurn } from './Aviso';

const DELAY_MS = 2400;

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

export default function InstallPrompt() {
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState(''); // 'ios' | 'android'
  const [deferredPrompt, setDeferredPrompt] = useState(null);

  useEffect(() => {
    const dismissed = localStorage.getItem('installPromptDismissed') === '1';
    const shown = localStorage.getItem('installPromptShown') === '1';

    // iOS: show once on first visit if not installed
    if (!dismissed && !shown && isIOS() && !isStandalone()) {
      setMode('ios');
      setVisible(true);
    }

    // Android: listen for the install prompt
    const onBeforeInstallPrompt = (e) => {
      // Only handle if we haven't shown/dismissed and not installed
      const dismissedNow = localStorage.getItem('installPromptDismissed') === '1';
      const shownNow = localStorage.getItem('installPromptShown') === '1';
      if (isStandalone() || dismissedNow || shownNow) return;
      e.preventDefault();
      setDeferredPrompt(e);
      setMode('android');
      setVisible(true);
    };

    const onInstalled = () => {
      // Mark as done; hide any banners
      localStorage.setItem('installPromptDismissed', '1');
      setVisible(false);
      setDeferredPrompt(null);
    };

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // C19: the sheet waits 2.4 s after the app opens, so it never lands on top of the first look at Inicio
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setReady(true), DELAY_MS);
    return () => clearTimeout(t);
  }, []);

  // «Ya mostrado» cuenta desde que se ve, no desde que lo pide: si espera turno detrás de otro aviso no se pierde.
  // Y si el turno pasa a otro (Actualizar) con la hoja aún sin cerrar, tampoco: vuelve a su turno, aunque la app recargue
  const myTurn = useAvisoTurn('install', visible && ready);
  useEffect(() => {
    if (!myTurn) return undefined;
    localStorage.setItem('installPromptShown', '1');
    return () => {
      if (localStorage.getItem('installPromptDismissed') !== '1') localStorage.removeItem('installPromptShown');
    };
  }, [myTurn]);

  if (!myTurn) return null;

  const dismiss = () => {
    localStorage.setItem('installPromptDismissed', '1');
    setVisible(false);
    setDeferredPrompt(null);
  };

  const installAndroid = async () => {
    try {
      if (!deferredPrompt) return dismiss();
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      // Regardless of outcome, don't nag again
      localStorage.setItem('installPromptDismissed', '1');
      setDeferredPrompt(null);
      setVisible(false);
      // outcome === 'accepted' | 'dismissed'
    } catch {
      dismiss();
    }
  };

  // Instalar / Instalar-ios of the canvas. It still takes the notices' slot, so it never shares the screen with one.
  // Closing it any way (scrim, Escape, Entendido, Ahora no) counts as dismissed, like the old ✕
  return (
    <Sheet isOpen onClose={dismiss} label="Instalar la app">
      <div className="flex flex-col gap-3.5 px-5 pt-3 pb-[34px]">
        <div className="flex items-center gap-4">
          <span aria-hidden="true" className="w-16 h-16 rounded-2xl bg-paper border border-line flex items-center justify-center text-lacre flex-none">
            <Icon name="latido" size={34} filled />
          </span>
          <span className="flex-1 min-w-0 flex flex-col gap-0.5">
            <span className="serif text-2xl leading-[1.15]">Tenedla en la pantalla de inicio</span>
            <span className="text-sm text-ink-2">A pantalla completa y con avisos.</span>
          </span>
        </div>
        {mode === 'ios' ? (
          <>
            <ol className="flex flex-col gap-2.5">
              <li className="flex items-center gap-3 min-h-[52px] px-3.5 rounded-2xl bg-paper text-[15px]">
                <span className="num font-bold text-accent-ink">1</span>
                <span>Toca <strong className="inline-flex items-center gap-1 align-bottom">Compartir <Icon name="subir" size={18} /></strong> en Safari</span>
              </li>
              <li className="flex items-center gap-3 min-h-[52px] px-3.5 rounded-2xl bg-paper text-[15px]">
                <span className="num font-bold text-accent-ink">2</span>
                <span>Elige <strong>«Añadir a pantalla de inicio»</strong></span>
              </li>
            </ol>
            <Button size="l" onClick={dismiss}>Entendido</Button>
          </>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Button variant="sec" size="l" onClick={dismiss}>Ahora no</Button>
            <Button size="l" onClick={installAndroid}>Instalar</Button>
          </div>
        )}
      </div>
    </Sheet>
  );
}
