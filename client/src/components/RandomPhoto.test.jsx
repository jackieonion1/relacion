import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import RandomPhoto from './RandomPhoto';
import { getDailyPhotoId, getOriginal, getOriginalUrl, madridDayKey } from '../lib/photos';

jest.mock('../lib/photos', () => ({
  getDailyPhotoId: jest.fn(),
  getOriginal: jest.fn(),
  getOriginalUrl: jest.fn(),
  madridDayKey: jest.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

let day;
beforeEach(() => {
  jest.useFakeTimers();
  localStorage.setItem('pairId', 'SEB1998');
  day = '2026-09-30';
  madridDayKey.mockImplementation(() => day);
  getDailyPhotoId.mockResolvedValue('P1');
  getOriginal.mockResolvedValue(new Blob(['x'.repeat(64)], { type: 'image/jpeg' }));
  getOriginalUrl.mockResolvedValue('https://x/orig.jpg');
  URL.createObjectURL = jest.fn(() => `blob:${Math.random()}`);
  URL.revokeObjectURL = jest.fn();
});
afterEach(() => { jest.useRealTimers(); });

async function mount() {
  // Los flags v7 solo silencian los avisos de deprecación de react-router en la salida de los tests
  const utils = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><RandomPhoto /></MemoryRouter>);
  await act(flush);
  return utils;
}

test('el mismo día, el reloj de 60 s no vuelve a cargar ni remonta la imagen', async () => {
  const { container } = await mount();
  const img = container.querySelector('img');
  expect(img).not.toBeNull();
  await act(async () => { jest.advanceTimersByTime(5 * 60 * 1000); await flush(); });
  expect(getDailyPhotoId).toHaveBeenCalledTimes(1);
  expect(getOriginal).toHaveBeenCalledTimes(1);
  expect(container.querySelector('img')).toBe(img);
});

test('al cambiar el día de Madrid recarga y revoca el blob anterior después de pintar el nuevo', async () => {
  const { container } = await mount();
  getDailyPhotoId.mockResolvedValue('P2');
  day = '2026-10-01';
  await act(async () => { jest.advanceTimersByTime(60 * 1000); await flush(); });
  expect(getDailyPhotoId).toHaveBeenCalledTimes(2);
  expect(getOriginal).toHaveBeenLastCalledWith('SEB1998', 'P2');
  expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  expect(container.querySelector('a[href="/gallery?photo=P2"]')).not.toBeNull();
});

test('al volver a primer plano tras medianoche también comprueba el día', async () => {
  await mount();
  day = '2026-10-01';
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); await flush(); });
  expect(getDailyPhotoId).toHaveBeenCalledTimes(2);
});

test('si falla la red al cambiar de día se queda la foto que había', async () => {
  const { container } = await mount();
  getDailyPhotoId.mockResolvedValue('');
  day = '2026-10-01';
  await act(async () => { jest.advanceTimersByTime(60 * 1000); await flush(); });
  expect(container.querySelector('img')).not.toBeNull();
  // y lo reintenta en el siguiente tick
  await act(async () => { jest.advanceTimersByTime(60 * 1000); await flush(); });
  expect(getDailyPhotoId).toHaveBeenCalledTimes(3);
});
