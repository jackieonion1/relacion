import React from 'react';
import { render, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import Gallery from './Gallery';
import { listPhotosPage, listPendingPhotos, getPendingIds, retryPendingPhotos } from '../lib/photos';

vi.mock('../lib/photos', () => ({
  listPhotosPage: vi.fn(),
  listPendingPhotos: vi.fn(),
  getPendingIds: vi.fn(),
  retryPendingPhotos: vi.fn(),
  confirmQueued: vi.fn(),
  uploadPhoto: vi.fn(),
  getOriginal: vi.fn(),
  getOriginalUrl: vi.fn(),
  deletePhoto: vi.fn(),
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
  URL.revokeObjectURL = vi.fn();
});

async function mount() {
  const utils = render(<MemoryRouter><Gallery /></MemoryRouter>);
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
