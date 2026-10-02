import { useEffect, useState } from 'react';

// How much of the layout viewport the on-screen keyboard covers. iOS does not shrink the layout viewport for
// the keyboard, so a bottom sheet stays under it; only visualViewport knows how much is hidden
export function keyboardInset(win = window) {
  const vv = win.visualViewport;
  if (!vv) return 0;
  return Math.max(0, Math.round(win.innerHeight - vv.height - vv.offsetTop));
}

// The inset while `active`, live with the keyboard. A sheet pads its bottom with it so its fields can scroll
// above the keyboard (adversario R1: the title of «Responder» could stay under it on iPhone)
export function useKeyboardInset(active = true) {
  const [inset, setInset] = useState(0);
  useEffect(() => {
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!active || !vv) return undefined;
    const update = () => setInset(keyboardInset());
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setInset(0);
    };
  }, [active]);
  return active ? inset : 0;
}

// Brings the focused field into view once the keyboard has finished opening
export function revealFocused(el, delay = 320) {
  setTimeout(() => {
    if (el && el.isConnected && document.activeElement === el) el.scrollIntoView?.({ block: 'nearest' });
  }, delay);
}
