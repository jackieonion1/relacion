import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Sheet from './Sheet';
import Modal from './Modal';
import HeartRainAnimation from './HeartRainAnimation';

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

test('O1/O5: con la lluvia en marcha la hoja deja sitio a «Parar la fiesta» y no esconde el botón', () => {
  const lluvia = render(<HeartRainAnimation isActive />);
  render(<Sheet isOpen onClose={() => {}}><h3>Hoja</h3></Sheet>);
  const dialog = screen.getByRole('dialog', { name: 'Hoja' });
  expect(dialog.getAttribute('aria-modal')).toBe('false');
  expect(dialog.style.paddingBottom).toContain('88px');
  expect(screen.getByRole('button', { name: 'Parar la fiesta' })).toBeTruthy();
  lluvia.unmount();
  expect(dialog.getAttribute('aria-modal')).toBe('true');
});

describe('O2: teclado', () => {
  let vv;
  const dialog = () => screen.getByRole('dialog');
  const wrap = () => screen.getByTestId('sheet-scrim').parentElement;
  const rect = (top, bottom) => ({ top, bottom, left: 0, right: 100, width: 100, height: bottom - top });

  beforeEach(() => {
    vi.useFakeTimers();
    vv = Object.assign(new EventTarget(), { height: 400, offsetTop: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { value: vv, configurable: true });
    window.innerHeight = 800;
  });
  afterEach(() => {
    vi.useRealTimers();
    delete window.visualViewport;
  });

  test('la hoja sigue la altura del visual viewport; al desplazarse solo se mueve, sin cambiar de alto', () => {
    render(<Sheet isOpen onClose={() => {}}><h3>Hoja</h3></Sheet>);
    expect(wrap().style.height).toBe('400px');
    expect(wrap().style.top).toBe('0px');
    expect(dialog().style.maxHeight).toBe('368px');
    vv.offsetTop = 30;
    act(() => { vv.dispatchEvent(new Event('scroll')); });
    expect(wrap().style.top).toBe('30px');
    expect(wrap().style.height).toBe('400px');
    expect(dialog().style.maxHeight).toBe('368px');
    vv.height = 300;
    act(() => { vv.dispatchEvent(new Event('resize')); });
    expect(wrap().style.height).toBe('300px');
    expect(dialog().style.maxHeight).toBe('276px');
  });

  test('sin teclado no toca nada, y al cerrar lo deja como estaba', () => {
    vv.height = 800;
    const { unmount } = render(<Sheet isOpen onClose={() => {}}><h3>Hoja</h3></Sheet>);
    expect(wrap().style.height).toBe('');
    expect(dialog().style.maxHeight).toBe('');
    vv.height = 400;
    act(() => { vv.dispatchEvent(new Event('resize')); });
    expect(wrap().style.height).toBe('400px');
    const w = wrap();
    unmount();
    expect(w.isConnected).toBe(false);
  });

  test('al enfocar un campo tapado por el teclado, la hoja se desplaza lo justo para verlo', () => {
    render(<Sheet isOpen onClose={() => {}}><input aria-label="Lugar" /></Sheet>);
    Object.defineProperty(dialog(), 'scrollTop', { value: 0, writable: true });
    dialog().getBoundingClientRect = () => rect(0, 400);
    const campo = screen.getByLabelText('Lugar');
    campo.getBoundingClientRect = () => rect(430, 480);
    campo.focus();
    expect(dialog().scrollTop).toBe(0);
    act(() => { vi.advanceTimersByTime(320); });
    expect(dialog().scrollTop).toBe(480 - (400 - 12));
  });

  test('en un editor lleva a la vista la línea del cursor, no el editor entero', () => {
    render(<Sheet isOpen onClose={() => {}}><div aria-label="Texto" tabIndex={0} /></Sheet>);
    Object.defineProperty(dialog(), 'scrollTop', { value: 0, writable: true });
    dialog().getBoundingClientRect = () => rect(0, 400);
    const editor = screen.getByLabelText('Texto');
    Object.defineProperty(editor, 'isContentEditable', { value: true });
    editor.getBoundingClientRect = () => rect(100, 1500);
    const linea = rect(500, 520);
    const rango = { startContainer: editor, cloneRange() { return this; }, collapse() {}, getClientRects: () => [linea] };
    vi.spyOn(window, 'getSelection').mockReturnValue({ rangeCount: 1, getRangeAt: () => rango });
    editor.focus();
    act(() => { vv.dispatchEvent(new Event('resize')); });
    expect(dialog().scrollTop).toBe(520 - (400 - 12));
  });

  test('al desplazarse la pantalla no vuelve a buscar el campo', () => {
    render(<Sheet isOpen onClose={() => {}}><input aria-label="Lugar" /></Sheet>);
    Object.defineProperty(dialog(), 'scrollTop', { value: 0, writable: true });
    dialog().getBoundingClientRect = () => rect(0, 400);
    const campo = screen.getByLabelText('Lugar');
    campo.getBoundingClientRect = () => rect(430, 480);
    campo.focus();
    act(() => { vi.advanceTimersByTime(320); });
    dialog().scrollTop = 0;
    vv.offsetTop = 20;
    act(() => { vv.dispatchEvent(new Event('scroll')); });
    expect(dialog().scrollTop).toBe(0);
  });
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
