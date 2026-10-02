import React from 'react';
import { render, screen, fireEvent, act, within } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';
import Settings from './Settings';
import { getPushSubscription, getPushDiag, subscribeToPush, unsubscribeFromPush } from '../lib/push';
import { checkForUpdate, getRegistration, applyUpdate } from '../lib/appUpdate';

vi.mock('../lib/push', () => ({
  getPushSubscription: vi.fn(), getPushDiag: vi.fn(), subscribeToPush: vi.fn(), unsubscribeFromPush: vi.fn(),
}));
vi.mock('../lib/appUpdate', () => ({
  checkForUpdate: vi.fn(), getRegistration: vi.fn(), applyUpdate: vi.fn(), repairApp: vi.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

// The five real states: [Notification.permission or none, subscribed] → text and buttons
async function mount({ perm, sub = null, diag = '' } = {}) {
  if (perm) window.Notification = { permission: perm, requestPermission: vi.fn() };
  else delete window.Notification;
  getPushSubscription.mockResolvedValue(sub);
  getPushDiag.mockReturnValue(diag);
  render(<MemoryRouter><Settings /></MemoryRouter>);
  await act(flush);
}
const botones = () => screen.getAllByRole('button').map((b) => b.textContent);

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('pairId', 'SEB1998');
  localStorage.setItem('identity', 'yo');
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});
afterAll(() => { delete window.Notification; });

test('No soportadas: Activar desactivado', async () => {
  await mount();
  expect(screen.queryByText('No soportadas')).not.toBeNull();
  expect(screen.queryByText('Requiere instalar la PWA y HTTPS.')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Activar' }).disabled).toBe(true);
});

test('No activadas: Activar', async () => {
  await mount({ perm: 'default' });
  expect(screen.queryByText('No activadas')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Activar' }).disabled).toBe(false);
});

test('Bloqueadas: sin Activar, con cómo desbloquearlas en el móvil', async () => {
  await mount({ perm: 'denied' });
  expect(screen.queryByText('Bloqueadas')).not.toBeNull();
  expect(botones()).not.toContain('Activar');
  expect(screen.queryByText(/Desbloquéalas en los ajustes del móvil/)).not.toBeNull();
});

test('mientras no se sabe si hay suscripción: Comprobando…, sin Suscribirme', async () => {
  window.Notification = { permission: 'granted', requestPermission: vi.fn() };
  let resolve;
  getPushSubscription.mockReturnValue(new Promise((r) => { resolve = r; }));
  getPushDiag.mockReturnValue('');
  render(<MemoryRouter><Settings /></MemoryRouter>);
  await act(flush);
  expect(screen.queryByText('Comprobando…')).not.toBeNull();
  expect(screen.queryByText('Permiso concedido, sin suscripción')).toBeNull();
  expect(botones()).not.toContain('Suscribirme');
  expect(botones()).not.toContain('Activar');
  await act(async () => { resolve({}); await flush(); });
  expect(screen.queryByText('Suscrito')).not.toBeNull();
  expect(botones()).toContain('Desactivar');
});

test('si el SW no responde en 4 s: «No se pudo comprobar», sin botones; si responde tarde, el estado real', async () => {
  vi.useFakeTimers();
  try {
    window.Notification = { permission: 'granted', requestPermission: vi.fn() };
    let resolve;
    getPushSubscription.mockReturnValue(new Promise((r) => { resolve = r; }));
    getPushDiag.mockReturnValue('');
    render(<MemoryRouter><Settings /></MemoryRouter>);
    await act(flush);
    await act(async () => { vi.advanceTimersByTime(3900); });
    expect(screen.queryByText('Comprobando…')).not.toBeNull();
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(screen.queryByText('Comprobando…')).toBeNull();
    expect(screen.queryByText('No se pudo comprobar')).not.toBeNull();
    expect(botones()).not.toContain('Suscribirme');
    expect(botones()).not.toContain('Probar');
    await act(async () => { resolve(null); await flush(); });
    expect(screen.queryByText('Permiso concedido, sin suscripción')).not.toBeNull();
    expect(botones()).toContain('Suscribirme');
  } finally {
    vi.useRealTimers();
  }
});

test('Permiso concedido, sin suscripción: Suscribirme; un fallo se dice en la pantalla, sin alert', async () => {
  await mount({ perm: 'granted' });
  expect(screen.queryByText('Permiso concedido, sin suscripción')).not.toBeNull();
  expect(botones()).not.toContain('Probar');
  subscribeToPush.mockRejectedValue(new Error('boom'));
  vi.stubEnv('REACT_APP_VAPID_PUBLIC_KEY', 'x');
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Suscribirme' })); await flush(); });
  vi.unstubAllEnvs();
  expect(subscribeToPush).toHaveBeenCalledWith('SEB1998', 'yo', 'x');
  expect(screen.getByRole('alert').textContent).toBe('No se pudo activar: boom');
});

test('Suscrito: Probar y Desactivar, con la línea de sincronización', async () => {
  localStorage.setItem('pushResync', JSON.stringify({ at: Date.UTC(2026, 9, 1, 12) }));
  await mount({ perm: 'granted', sub: {} });
  expect(screen.queryByText('Suscrito')).not.toBeNull();
  expect(screen.queryByText(/^Última sincronización con el servidor: /)).not.toBeNull();
  expect(botones()).toEqual(expect.arrayContaining(['Probar', 'Desactivar']));
  expect(botones()).not.toContain('Suscribirme');
});

test('Desactivar pide confirmación en una hoja y solo entonces desuscribe', async () => {
  await mount({ perm: 'granted', sub: {} });
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
  expect(screen.queryByText('¿Desactivar las notificaciones?')).not.toBeNull();
  expect(unsubscribeFromPush).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByText('¿Desactivar las notificaciones?')).toBeNull();
  expect(unsubscribeFromPush).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Desactivar' }));
  unsubscribeFromPush.mockResolvedValue();
  const hoja = screen.getByRole('dialog');
  await act(async () => { fireEvent.click(within(hoja).getByRole('button', { name: 'Desactivar' })); await flush(); });
  expect(unsubscribeFromPush).toHaveBeenCalledWith('SEB1998', 'yo');
  expect(screen.queryByText('Permiso concedido, sin suscripción')).not.toBeNull();
});

test('el diagnóstico plegable solo aparece si hay diagnóstico', async () => {
  await mount({ perm: 'granted' });
  expect(screen.queryByText('Detalles')).toBeNull();
});

test('el diagnóstico sale plegado bajo Avisos', async () => {
  await mount({ perm: 'granted', diag: 'subscribe: fallo X' });
  const details = screen.getByText('Detalles').closest('details');
  expect(details.open).toBe(false);
  expect(details.textContent).toContain('subscribe: fallo X');
});

test('enlace de pareja con el origen real y cambio de código con confirmación', async () => {
  await mount({ perm: 'default' });
  expect(screen.queryByText(`${window.location.origin}/?pair=SEB1998`)).not.toBeNull();
  const input = screen.getByLabelText('Código de pareja');
  fireEvent.change(input, { target: { value: 'ab1' } });
  expect(screen.queryByText('Entre 4 y 12 letras o números.')).not.toBeNull();
  expect(screen.getByRole('button', { name: 'Guardar' }).disabled).toBe(true);
  fireEvent.change(input, { target: { value: 'nuevo1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  expect(screen.queryByText('¿Cambiar el código de pareja?')).not.toBeNull();
  expect(localStorage.getItem('pairId')).toBe('SEB1998');
});

test('cambiar de identidad guarda yo / ella', async () => {
  await mount({ perm: 'default' });
  expect(screen.getByRole('button', { name: 'Novio' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Novia' }));
  expect(localStorage.getItem('identity')).toBe('ella');
  expect(screen.getByRole('button', { name: 'Novia' }).getAttribute('aria-pressed')).toBe('true');
});

test('Apariencia: Claro por defecto; elegir Oscuro o Sistema lo guarda en tema', async () => {
  await mount({ perm: 'default' });
  expect(screen.getByRole('button', { name: 'Claro' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Oscuro' }));
  expect(localStorage.getItem('tema')).toBe('oscuro');
  expect(document.documentElement.dataset.tema).toBe('oscuro');
  expect(screen.getByRole('button', { name: 'Oscuro' }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: 'Sistema' }));
  expect(localStorage.getItem('tema')).toBe('sistema');
  expect(document.documentElement.dataset.tema).toBeUndefined(); // jsdom has no dark system
  delete document.documentElement.dataset.tema;
});

test('Buscar actualizaciones: «ya tienes la última» o «Actualizar»', async () => {
  await mount({ perm: 'default' });
  checkForUpdate.mockResolvedValue(false);
  getRegistration.mockResolvedValue(null);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Buscar actualizaciones' })); await flush(); });
  expect(screen.queryByText('Ya tienes la última versión.')).not.toBeNull();
  checkForUpdate.mockResolvedValue(true);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Buscar actualizaciones' })); await flush(); });
  expect(screen.queryByText('Hay una versión nueva.')).not.toBeNull();
  applyUpdate.mockResolvedValue();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Actualizar' })); await flush(); });
  expect(applyUpdate).toHaveBeenCalledTimes(1);
});

test('«Así era» en La app lleva a /asi-era', async () => {
  getPushSubscription.mockResolvedValue(null);
  getPushDiag.mockReturnValue('');
  render(
    <MemoryRouter initialEntries={['/settings']}>
      <Routes>
        <Route path="/settings" element={<Settings />} />
        <Route path="/asi-era" element={<p>pantalla así era</p>} />
      </Routes>
    </MemoryRouter>
  );
  await act(flush);
  fireEvent.click(screen.getByRole('link', { name: /Así era/ }));
  expect(screen.queryByText('pantalla así era')).not.toBeNull();
});
