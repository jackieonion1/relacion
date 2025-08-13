import React, { useEffect, useState } from 'react';

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
      localStorage.setItem('installPromptShown', '1');
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
      localStorage.setItem('installPromptShown', '1');
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

  if (!visible) return null;

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

  return (
    <div className="mx-auto w-full max-w-screen-md px-4 pt-3">
      {mode === 'ios' ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 px-4 py-3 text-sm flex items-start gap-3">
          <div>
            ¿Quieres añadir esta app a tu pantalla de inicio?
            <div className="mt-1 text-rose-700">
              En iPhone: pulsa <span className="font-semibold">Compartir</span> y luego <span className="font-semibold">“Añadir a pantalla de inicio”</span>.
            </div>
          </div>
          <button
            aria-label="Cerrar"
            onClick={dismiss}
            className="ml-auto text-rose-600"
          >✕</button>
        </div>
      ) : (
        <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 px-4 py-3 text-sm flex items-center gap-3">
          <div className="flex-1">
            ¿Quieres añadir esta app a tu pantalla de inicio?
          </div>
          <button onClick={installAndroid} className="btn-primary text-xs">Instalar</button>
          <button onClick={dismiss} className="btn-ghost text-xs">Ahora no</button>
        </div>
      )}
    </div>
  );
}
