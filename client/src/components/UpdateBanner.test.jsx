import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import UpdateBanner from './UpdateBanner';
import { applyUpdate, checkForUpdate, getRegistration } from '../lib/appUpdate';

vi.mock('../lib/appUpdate', () => ({
  applyUpdate: vi.fn(),
  checkForUpdate: vi.fn(),
  getRegistration: vi.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

let reg;
beforeEach(() => {
  vi.useFakeTimers();
  reg = { waiting: null, installing: null, update: vi.fn(async () => {}), addEventListener: vi.fn(), removeEventListener: vi.fn() };
  getRegistration.mockResolvedValue(reg);
  checkForUpdate.mockResolvedValue(false);
  applyUpdate.mockResolvedValue();
  Object.defineProperty(navigator, 'serviceWorker', { value: { controller: {} }, configurable: true });
});
afterEach(() => {
  vi.useRealTimers();
  delete navigator.serviceWorker;
});

async function mount() {
  const utils = render(<UpdateBanner />);
  await act(flush);
  return utils;
}

test('sin versión nueva no se ve nada', async () => {
  const { container } = await mount();
  expect(container.innerHTML).toBe('');
});

test('con versión nueva avisa, y solo actualiza al pulsar «Actualizar»', async () => {
  checkForUpdate.mockResolvedValue(true);
  await mount();
  expect(screen.queryByText('Nueva versión disponible')).not.toBeNull();
  await act(async () => { vi.advanceTimersByTime(60 * 60 * 1000); await flush(); });
  expect(applyUpdate).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByText('Actualizar')); await flush(); });
  expect(applyUpdate).toHaveBeenCalledTimes(1);
});

test('«Luego» lo oculta sin actualizar', async () => {
  checkForUpdate.mockResolvedValue(true);
  const { container } = await mount();
  fireEvent.click(screen.getByText('Luego'));
  expect(container.innerHTML).toBe('');
  expect(applyUpdate).not.toHaveBeenCalled();
});

test('un SW nuevo esperando también cuenta como versión nueva', async () => {
  reg.waiting = { postMessage: vi.fn() };
  await mount();
  expect(screen.queryByText('Nueva versión disponible')).not.toBeNull();
});

test('al volver a primer plano vuelve a mirar, como mucho cada 5 min, y pide update() al SW', async () => {
  await mount();
  expect(checkForUpdate).toHaveBeenCalledTimes(1);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await flush(); });
  expect(checkForUpdate).toHaveBeenCalledTimes(1);
  await act(async () => { vi.advanceTimersByTime(5 * 60 * 1000); document.dispatchEvent(new Event('visibilitychange')); await flush(); });
  expect(checkForUpdate).toHaveBeenCalledTimes(2);
  expect(reg.update).toHaveBeenCalledTimes(1);
  checkForUpdate.mockResolvedValue(true);
  await act(async () => { window.dispatchEvent(new Event('online')); await flush(); });
  expect(screen.queryByText('Nueva versión disponible')).not.toBeNull();
});
