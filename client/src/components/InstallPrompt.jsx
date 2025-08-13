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

  useEffect(() => {
    const dismissed = localStorage.getItem('installPromptDismissed') === '1';
    if (!dismissed && isIOS() && !isStandalone()) setVisible(true);
  }, []);

  if (!visible) return null;

  return (
    <div className="mx-auto w-full max-w-screen-md px-4 pt-3">
      <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-900 px-4 py-3 text-sm flex items-start gap-3">
        <div>Para instalar en iPhone: pulsa <span className="font-semibold">Compartir</span> y luego <span className="font-semibold">“Añadir a pantalla de inicio”</span>.</div>
        <button
          aria-label="Cerrar"
          onClick={() => { localStorage.setItem('installPromptDismissed', '1'); setVisible(false); }}
          className="ml-auto text-rose-600"
        >✕</button>
      </div>
    </div>
  );
}
