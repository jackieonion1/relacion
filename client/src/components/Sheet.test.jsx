import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Sheet from './Sheet';
import Modal from './Modal';

function Opener({ label }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Abrir</button>
      <Sheet isOpen={open} onClose={() => setOpen(false)} label={label}>
        <h3>Borrar evento</h3>
        <button>Cancelar</button>
        <button>Borrar</button>
      </Sheet>
    </>
  );
}

test('cerrada no pinta nada', () => {
  render(<Sheet isOpen={false} onClose={() => {}}><p>hola</p></Sheet>);
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('es un diálogo modal con el nombre de su título y el foco dentro', () => {
  render(<Opener />);
  fireEvent.click(screen.getByText('Abrir'));
  const dialog = screen.getByRole('dialog', { name: 'Borrar evento' });
  expect(dialog.getAttribute('aria-modal')).toBe('true');
  expect(document.activeElement).toBe(dialog);
});

test('`label` le da nombre si no hay título', () => {
  render(<Opener label="Opciones" />);
  fireEvent.click(screen.getByText('Abrir'));
  expect(screen.getByRole('dialog', { name: 'Opciones' })).toBeTruthy();
});

test('Escape cierra y el foco vuelve a quien la abrió', () => {
  render(<Opener />);
  const abrir = screen.getByText('Abrir');
  abrir.focus();
  fireEvent.click(abrir);
  act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(abrir);
});

test('tocar fuera cierra; tocar dentro no', () => {
  const onClose = vi.fn();
  render(<Sheet isOpen onClose={onClose}><button>Dentro</button></Sheet>);
  fireEvent.click(screen.getByText('Dentro'));
  expect(onClose).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId('sheet-scrim'));
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('Tab no sale de la hoja', () => {
  render(<Opener />);
  fireEvent.click(screen.getByText('Abrir'));
  const borrar = screen.getByText('Borrar');
  borrar.focus();
  fireEvent.keyDown(document, { key: 'Tab' });
  expect(document.activeElement).toBe(screen.getByText('Cancelar'));
  fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
  expect(document.activeElement).toBe(borrar);
});

test('con dos hojas abiertas, Escape cierra solo la de arriba', () => {
  const abajo = vi.fn();
  const arriba = vi.fn();
  render(
    <>
      <Sheet isOpen onClose={abajo}><p>uno</p></Sheet>
      <Sheet isOpen onClose={arriba}><p>dos</p></Sheet>
    </>
  );
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(arriba).toHaveBeenCalledTimes(1);
  expect(abajo).not.toHaveBeenCalled();
});

test('Modal sin `bare` es una hoja; con `bare` sigue siendo el lienzo a pantalla completa de antes', () => {
  const { unmount } = render(<Modal isOpen onClose={() => {}}><h3>Hoja</h3></Modal>);
  expect(screen.getByRole('dialog', { name: 'Hoja' })).toBeTruthy();
  unmount();
  render(<Modal isOpen onClose={() => {}} bare><p>visor</p></Modal>);
  expect(screen.queryByRole('dialog')).toBeNull();
  const shell = screen.getByText('visor').parentElement.parentElement;
  expect(shell.style.position).toBe('fixed');
  expect(shell.style.height).toBe('100dvh');
});
