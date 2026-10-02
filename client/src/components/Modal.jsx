import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import Sheet from './Sheet';

// Every dialog is now a Carta bottom sheet. `bare` (Gallery viewer, Music player sheet) stays exactly as it was
// until R6b/R8b redo them
export default function Modal({ isOpen, onClose, children, bare = false, backdropClosing = false }) {
  if (!bare) return <Sheet isOpen={isOpen} onClose={onClose}>{children}</Sheet>;
  return <BareModal isOpen={isOpen} onClose={onClose} backdropClosing={backdropClosing}>{children}</BareModal>;
}

function BareModal({ isOpen, onClose, children, backdropClosing }) {
  const [backdropVisible, setBackdropVisible] = useState(false);
  useEffect(() => {
    if (isOpen) {
      const t = requestAnimationFrame(() => setBackdropVisible(true));
      return () => cancelAnimationFrame(t);
    } else {
      setBackdropVisible(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const modalContent = (
    <div
      style={{
        position: 'fixed',
        top: 0, // exact viewport
        left: 0,
        right: 0,
        bottom: 0,
        width: '100dvw',
        height: '100dvh',
        minHeight: '100vh', // fallback for browsers without dvh
        maxHeight: '100dvh',
        margin: 0,
        padding: 0,
        backgroundColor: backdropClosing ? 'rgba(0, 0, 0, 0)' : (backdropVisible ? 'rgba(0, 0, 0, 0.6)' : 'rgba(0, 0, 0, 0)'),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        boxSizing: 'border-box',
        overflow: 'hidden',
        WebkitTransform: 'translate3d(0,0,0)', // Force hardware acceleration
        transform: 'translate3d(0,0,0)',
        transition: 'background-color 260ms ease-out'
      }}
      onClick={onClose}
    >
      <div
        style={{ position: 'relative', width: '100%', height: '100%' }}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
