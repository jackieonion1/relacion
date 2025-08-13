import React from 'react';
import { createPortal } from 'react-dom';

export default function Modal({ isOpen, onClose, children }) {
  if (!isOpen) return null;

  const modalContent = (
    <div 
      style={{ 
        position: 'fixed',
        top: '-10px', // Extend beyond viewport top
        left: '-10px', // Extend beyond viewport left
        right: '-10px', // Extend beyond viewport right
        bottom: '-10px', // Extend beyond viewport bottom
        width: 'calc(100vw + 20px)',
        height: 'calc(100vh + 20px)',
        minHeight: 'calc(100vh + 20px)',
        maxHeight: 'calc(100vh + 20px)',
        margin: 0,
        padding: '26px 26px 26px 26px', // Compensate for extended area
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
      <div 
        className="bg-white rounded-xl shadow-lg w-full max-w-md animate-slide-up-fast"
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
