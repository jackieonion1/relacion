import React, { useEffect, useState } from 'react';
import Icon from './Icon';
import Aviso, { useAvisoTurn } from './Aviso';

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

  // «Ya mostrado» cuenta desde que se ve, no desde que lo pide: si espera turno detrás de otro aviso no se pierde
  const myTurn = useAvisoTurn('install', visible);
  useEffect(() => {
    if (myTurn) localStorage.setItem('installPromptShown', '1');
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

  return mode === 'ios' ? (
    <Aviso
      title="¿Quieres añadir esta app a tu pantalla de inicio?"
      text={<>En iPhone: pulsa <span className="font-semibold">Compartir</span> y luego <span className="font-semibold">“Añadir a pantalla de inicio”</span>.</>}
    >
      <button aria-label="Cerrar" onClick={dismiss} className="aviso-cerrar"><Icon name="cerrar" size={20} /></button>
    </Aviso>
  ) : (
    <Aviso title="¿Quieres añadir esta app a tu pantalla de inicio?">
      <button onClick={installAndroid} className="btn btn-inv">Instalar</button>
      <button onClick={dismiss} className="btn aviso-txt">Ahora no</button>
    </Aviso>
  );
}
