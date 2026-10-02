import React from 'react';
import { render, act, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import RandomPhoto from './RandomPhoto';
import { getDailyPhotoId, getOriginal, getOriginalUrl, madridDayKey } from '../lib/photos';
import { photoUploader } from '../lib/inicio';

vi.mock('../lib/photos', () => ({
  getDailyPhotoId: vi.fn(),
  getOriginal: vi.fn(),
  getOriginalUrl: vi.fn(),
  madridDayKey: vi.fn(),
}));
vi.mock('../lib/inicio', async (orig) => ({ ...(await orig()), photoUploader: vi.fn() }));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

let day;
beforeEach(() => {
  vi.useFakeTimers();
  localStorage.setItem('pairId', 'SEB1998');
  day = '2026-09-30';
  madridDayKey.mockImplementation(() => day);
  getDailyPhotoId.mockResolvedValue('P1');
  getOriginal.mockResolvedValue(new Blob(['x'.repeat(64)], { type: 'image/jpeg' }));
  getOriginalUrl.mockResolvedValue('https://x/orig.jpg');
  photoUploader.mockResolvedValue(null);
  URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => { vi.useRealTimers(); });

async function mount() {
  const utils = render(<MemoryRouter><RandomPhoto /></MemoryRouter>);
  await act(flush);
  return utils;
}

test('el mismo día, el reloj de 60 s no vuelve a cargar ni remonta la imagen', async () => {
  const { container } = await mount();
  const img = container.querySelector('img');
  expect(img).not.toBeNull();
  await act(async () => { vi.advanceTimersByTime(5 * 60 * 1000); await flush(); });
  expect(getDailyPhotoId).toHaveBeenCalledTimes(1);
  expect(getOriginal).toHaveBeenCalledTimes(1);
  expect(container.querySelector('img')).toBe(img);
});

test('al cambiar el día de Madrid recarga y revoca el blob anterior después de pintar el nuevo', async () => {
  const { container } = await mount();
  getDailyPhotoId.mockResolvedValue('P2');
  day = '2026-10-01';
  await act(async () => { vi.advanceTimersByTime(60 * 1000); await flush(); });
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
  await act(async () => { vi.advanceTimersByTime(60 * 1000); await flush(); });
  expect(container.querySelector('img')).not.toBeNull();
  // y lo reintenta en el siguiente tick
  await act(async () => { vi.advanceTimersByTime(60 * 1000); await flush(); });
  expect(getDailyPhotoId).toHaveBeenCalledTimes(3);
});

test('el pie dice quién subió la foto y cuándo (C11)', async () => {
  photoUploader.mockResolvedValue({ identity: 'ella', createdAt: new Date(2025, 2, 12).getTime() });
  const { container } = await mount();
  expect(photoUploader).toHaveBeenCalledWith('SEB1998', 'P1');
  expect(container.querySelector('figcaption').textContent).toMatch(/La subió 🍪 · 12 mar 2025/);
});

test('sin red y sin foto sale «Reintentar» (no el hueco) y el botón vuelve a pedirla', async () => {
  const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
  getDailyPhotoId.mockResolvedValue('');
  try {
    await mount();
    expect(screen.getByRole('alert').textContent).toMatch(/No se pudo cargar la foto/);
    expect(document.querySelector('.hueco')).toBeNull();
    getDailyPhotoId.mockResolvedValue('P1');
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Reintentar' })); await flush(); });
    expect(getDailyPhotoId).toHaveBeenCalledTimes(2);
    expect(document.querySelector('img')).not.toBeNull();
  } finally {
    onLine.mockRestore();
  }
});

test('sin identity (foto antigua) no hay pie de autor', async () => {
  photoUploader.mockResolvedValue({ identity: '', createdAt: null });
  const { container } = await mount();
  expect(container.querySelector('figcaption').textContent).not.toMatch(/La subió/);
  expect(container.querySelector('img')).not.toBeNull();
});
