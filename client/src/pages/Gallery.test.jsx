import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Gallery from './Gallery';
import { listPhotosPage, listPendingPhotos, getPendingIds, retryPendingPhotos } from '../lib/photos';

jest.mock('../lib/photos', () => ({
  listPhotosPage: jest.fn(),
  listPendingPhotos: jest.fn(),
  getPendingIds: jest.fn(),
  retryPendingPhotos: jest.fn(),
  confirmQueued: jest.fn(),
  uploadPhoto: jest.fn(),
  getOriginal: jest.fn(),
  getOriginalUrl: jest.fn(),
  deletePhoto: jest.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const items = (n) => Array.from({ length: n }, (_, i) => ({ id: `D${i}`, thumbUrl: '', createdAt: 100 - i }));

let onThumb;
beforeEach(() => {
  localStorage.setItem('pairId', 'SEB1998');
  onThumb = null;
  listPhotosPage.mockImplementation(async (pairId, opts) => {
    onThumb = opts.onThumb;
    return { items: items(3), cursor: null, hasMore: false, thumbsDone: Promise.resolve() };
  });
  listPendingPhotos.mockResolvedValue([]);
  getPendingIds.mockReturnValue([]);
  retryPendingPhotos.mockResolvedValue({ sent: 0, failed: 0, lost: 0, offline: false, queued: [] });
  URL.revokeObjectURL = jest.fn();
});

async function mount() {
  // Los flags v7 solo silencian los avisos de deprecación de react-router en la salida de los tests
  const utils = render(<MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}><Gallery /></MemoryRouter>);
  await act(flush);
  return utils;
}

test('la cuadrícula sale con huecos y cada miniatura rellena el suyo al llegar, en orden', async () => {
  const { container } = await mount();
  const cells = () => [...container.querySelectorAll('.grid > button')];
  expect(cells()).toHaveLength(3);
  expect(container.querySelectorAll('.grid img')).toHaveLength(0);
  await act(async () => { onThumb('D1', 'blob:d1'); await flush(); });
  expect(cells()[1].querySelector('img').getAttribute('src')).toBe('blob:d1');
  expect(cells()[0].querySelector('img')).toBeNull();
});

test('una miniatura que llega tras salir de la galería se revoca al momento', async () => {
  const { unmount } = await mount();
  const late = onThumb;
  unmount();
  late('D2', 'blob:late');
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:late');
});

test('la que llega antes de que la página esté en la cuadrícula no se pierde', async () => {
  listPhotosPage.mockImplementation(async (pairId, opts) => {
    opts.onThumb('D0', 'blob:early'); // resuelta antes de que load() pinte la lista
    return { items: items(2), cursor: null, hasMore: false, thumbsDone: Promise.resolve() };
  });
  const { container } = await mount();
  expect(container.querySelector('.grid > button img').getAttribute('src')).toBe('blob:early');
});
