import React from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ isOpen, onClose, children, bare = false }) {
  if (!isOpen) return null;

  const modalContent = (
    <div 
      style={{ 
        position: 'fixed',
        top: bare ? 0 : '-10px', // In bare, use exact viewport
        left: bare ? 0 : '-10px',
        right: bare ? 0 : '-10px',
        bottom: bare ? 0 : '-10px',
        width: bare ? '100dvw' : 'calc(100vw + 20px)',
        height: bare ? '100dvh' : 'calc(100vh + 20px)',
        minHeight: bare ? '100vh' : 'calc(100vh + 20px)', // fallback for browsers without dvh
        maxHeight: bare ? '100dvh' : 'calc(100vh + 20px)',
        margin: 0,
        padding: bare ? 0 : '26px 26px 26px 26px', // Remove padding for bare mode
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        boxSizing: 'border-box',
        overflow: 'hidden',
        WebkitTransform: 'translate3d(0,0,0)', // Force hardware acceleration
        transform: 'translate3d(0,0,0)'
      }}
      onClick={onClose}
    >
      {bare ? (
        <div
          style={{ position: 'relative', width: '100%', height: '100%' }}
        >
          {children}
        </div>
      ) : (
        <div 
          className="bg-white rounded-xl shadow-lg w-full max-w-md animate-slide-up-fast"
          onClick={(e) => e.stopPropagation()}
        >
          {children}
        </div>
      )}
    </div>
  );

  return createPortal(modalContent, document.body);
}
