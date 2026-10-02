import React, { useState } from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import Aviso, { AvisoSlot, Avisos, useAvisoTurn } from './Aviso';
import NavBar from './NavBar';
import MarcaSuperior from './MarcaSuperior';

function Notice({ id, title, initial = true }) {
  const [wants, setWants] = useState(initial);
  if (!useAvisoTurn(id, wants)) return null;
  return <Aviso title={title}><button onClick={() => setWants(false)}>Cerrar {id}</button></Aviso>;
}

test('el hueco de avisos pinta uno solo, por prioridad Actualizar > Instalar > Notificaciones', () => {
  render(
    <AvisoSlot>
      <Notice id="push" title="Notificaciones" />
      <Notice id="install" title="Instalar" />
      <Notice id="update" title="Versión" />
    </AvisoSlot>
  );
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.queryByText('Versión')).not.toBeNull();
  fireEvent.click(screen.getByText('Cerrar update'));
  expect(screen.getAllByRole('status')).toHaveLength(1);
  expect(screen.queryByText('Instalar')).not.toBeNull();
  fireEvent.click(screen.getByText('Cerrar install'));
  expect(screen.queryByText('Notificaciones')).not.toBeNull();
  fireEvent.click(screen.getByText('Cerrar push'));
  expect(screen.queryAllByRole('status')).toHaveLength(0);
});

test('un aviso sin hueco se pinta solo, como antes', () => {
  render(<Notice id="push" title="Notificaciones" />);
  expect(screen.queryByText('Notificaciones')).not.toBeNull();
});

function Where() {
  return <span data-testid="ruta">{useLocation().pathname}</span>;
}

function mountNav(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <NavBar />
      <Routes><Route path="*" element={<Where />} /></Routes>
    </MemoryRouter>
  );
}

test('la barra tiene 4 pestañas y «Más»; la activa lleva aria-current', () => {
  mountNav('/gallery');
  const nav = screen.getByRole('navigation', { name: 'Principal' });
  expect(nav.textContent).toBe('InicioGaleríaCalendarioNotasMás');
  expect(screen.getByRole('link', { name: 'Galería' }).getAttribute('aria-current')).toBe('page');
  expect(screen.getByRole('button', { name: 'Más' }).className).not.toMatch(/is-on/);
});

test('«Más» abre la hoja 2×2 y navega sin cambiar las URL', () => {
  mountNav('/');
  fireEvent.click(screen.getByRole('button', { name: 'Más' }));
  const sheet = screen.getByRole('dialog');
  expect(['Mapa', 'Música', 'Ruleta', 'Moneda'].every((l) => sheet.textContent.includes(l))).toBe(true);
  fireEvent.click(screen.getByText('Moneda'));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByTestId('ruta').textContent).toBe('/coin');
});

test('«Más» se marca en las 4 rutas que agrupa', () => {
  for (const path of ['/map', '/music', '/roulette', '/coin']) {
    const { unmount } = mountNav(path);
    expect(screen.getByRole('button', { name: 'Más' }).className).toMatch(/is-on/);
    unmount();
  }
});

test('Avisos publica en --aviso-room lo que ocupa el aviso visible y lo quita al desmontar', () => {
  const real = global.ResizeObserver;
  let notify;
  global.ResizeObserver = class { constructor(cb) { notify = cb; } observe() {} disconnect() {} };
  let height = 0;
  const offset = vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height);
  try {
    const { unmount } = render(<Avisos><span>x</span></Avisos>);
    const room = () => document.documentElement.style.getPropertyValue('--aviso-room');
    expect(room()).toBe('0px');
    height = 52;
    act(() => { notify(); });
    expect(room()).toBe('64px');
    unmount();
    expect(room()).toBe('');
  } finally {
    offset.mockRestore();
    global.ResizeObserver = real;
  }
});

test('MarcaSuperior: 🍪🫒, ⚙ a Ajustes y la píldora «Sin conexión» solo sin red', () => {
  const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
  render(<MemoryRouter><MarcaSuperior /></MemoryRouter>);
  expect(screen.getByRole('img', { name: 'Nosotros' }).textContent).toBe('🍪🫒');
  expect(screen.getByRole('link', { name: 'Ajustes' }).getAttribute('href')).toBe('/settings');
  expect(screen.queryByText(/Sin conexión/)).toBeNull();
  online.mockReturnValue(false);
  act(() => { window.dispatchEvent(new Event('offline')); });
  expect(screen.queryByText('Sin conexión · ves lo guardado')).not.toBeNull();
  online.mockReturnValue(true);
  act(() => { window.dispatchEvent(new Event('online')); });
  expect(screen.queryByText(/Sin conexión/)).toBeNull();
  online.mockRestore();
});
