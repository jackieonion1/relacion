import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import RepairApp from './RepairApp';
import { repairApp } from '../lib/appUpdate';

vi.mock('../lib/appUpdate', () => ({ repairApp: vi.fn() }));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const reparar = () => screen.getAllByText('Reparar');

beforeEach(() => {
  repairApp.mockReset();
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
});

test('pide confirmación antes de reparar', async () => {
  repairApp.mockResolvedValue();
  render(<RepairApp />);
  fireEvent.click(reparar()[0]);
  expect(repairApp).not.toHaveBeenCalled();
  expect(screen.queryByText('Reparar la app')).not.toBeNull();
  await act(async () => { fireEvent.click(reparar()[1]); await flush(); });
  expect(repairApp).toHaveBeenCalledTimes(1);
});

test('cancelar no toca nada', () => {
  render(<RepairApp />);
  fireEvent.click(reparar()[0]);
  fireEvent.click(screen.getByText('Cancelar'));
  expect(repairApp).not.toHaveBeenCalled();
  expect(screen.queryByText('Reparar la app')).toBeNull();
});

test('si falla (sin red) lo dice y cierra la confirmación', async () => {
  repairApp.mockRejectedValue(new Error('offline'));
  render(<RepairApp />);
  fireEvent.click(reparar()[0]);
  await act(async () => { fireEvent.click(reparar()[1]); await flush(); });
  expect(screen.queryByText(/no se ha tocado nada/)).not.toBeNull();
  expect(screen.queryByText('Reparar la app')).toBeNull();
});

test('sin conexión el botón está desactivado', () => {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  render(<RepairApp />);
  expect(reparar()[0].disabled).toBe(true);
  expect(screen.queryByText('Necesita conexión.')).not.toBeNull();
});
