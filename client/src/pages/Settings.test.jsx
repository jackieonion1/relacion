import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Settings from './Settings';
import { getPushSubscription, getPushDiag, subscribeToPush } from '../lib/push';
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
  render(<Settings />);
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

test('Bloqueadas', async () => {
  await mount({ perm: 'denied' });
  expect(screen.queryByText('Bloqueadas')).not.toBeNull();
  expect(botones()).toContain('Activar');
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
