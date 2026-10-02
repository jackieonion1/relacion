import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { followViewport, revealOnKeyboard } from '../lib/sheetViewport';
import { STOP_BAR_ROOM, useStopBar } from '../lib/stopBar';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [contenteditable="true"], [tabindex]:not([tabindex="-1"])';

// Open sheets, newest last: Escape closes only the top one
const stack = [];

// Bottom sheet (Componentes.dc.html, "Hojas"): always at the bottom, within thumb reach. Closes tapping the scrim
// or with Escape. Focus goes to the sheet, Tab stays inside, and it returns to whatever opened it.
// Same API as the old Modal (isOpen/onClose/children); the heading inside names the dialog unless `label` is given
export default function Sheet({ isOpen, onClose, label, children }) {
  const wrap = useRef(null);
  const panel = useRef(null);
  const raining = useStopBar();
  const close = useRef(onClose);
  close.current = onClose;
  const headingId = useId();

  useEffect(() => {
    if (!isOpen) return undefined;
    const opener = document.activeElement;
    const token = {};
    stack.push(token);
    const el = panel.current;
    if (!label) {
      const heading = el?.querySelector('h1, h2, h3');
      if (heading) {
        if (!heading.id) heading.id = headingId;
        el.setAttribute('aria-labelledby', heading.id);
      }
    }
    // The sheet itself, not its first field: on iPhone focusing an input from here opens the keyboard over the sheet
    el?.focus({ preventScroll: true });

    function onKey(e) {
      if (stack[stack.length - 1] !== token) return;
      if (e.key === 'Escape') { e.stopPropagation(); close.current?.(); return; }
      if (e.key !== 'Tab' || !el) return;
      const items = Array.from(el.querySelectorAll(FOCUSABLE));
      if (!items.length) { e.preventDefault(); return; }
      const first = items[0], last = items[items.length - 1];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === el)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      stack.splice(stack.indexOf(token), 1);
      if (opener && opener.isConnected && typeof opener.focus === 'function') opener.focus({ preventScroll: true });
    };
  }, [isOpen, label, headingId]);

  // Above the on-screen keyboard: follows the visible area and brings the focused field (or the cursor line) into it
  useEffect(() => {
    if (!isOpen) return undefined;
    const stopFollowing = followViewport(wrap.current, panel.current);
    const stopRevealing = revealOnKeyboard(panel.current);
    return () => { stopFollowing(); stopRevealing(); };
  }, [isOpen]);

  if (!isOpen) return null;

  return createPortal(
    <div ref={wrap} className="fixed inset-0 z-9999 flex flex-col justify-end">
      <div className="velo absolute inset-0 bg-scrim" onClick={onClose} aria-hidden="true" data-testid="sheet-scrim" />
      <div
        ref={panel}
        role="dialog"
        // «Parar la fiesta» floats outside the sheet: with it up the sheet is not modal for a screen reader, which
        // could not reach the button otherwise, and it leaves room under its content so the button covers nothing
        aria-modal={raining ? 'false' : 'true'}
        aria-label={label}
        tabIndex={-1}
        className="hoja relative w-full max-w-lg mx-auto max-h-[92dvh] overflow-y-auto overscroll-contain bg-card text-ink rounded-t-hoja border border-b-0 border-line shadow-hoja outline-hidden"
        style={{ paddingBottom: raining ? `calc(env(safe-area-inset-bottom, 0px) + ${STOP_BAR_ROOM}px)` : 'env(safe-area-inset-bottom, 0px)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-center pt-2" aria-hidden="true">
          <span className="w-9 h-[5px] rounded-full bg-line" />
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}
