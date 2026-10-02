import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import AsiEra, { FOTOS } from './AsiEra';
import App from '../App';

// App mounts these everywhere; here they only get in the way of the route
vi.mock('./Music', () => ({ default: () => null }));
vi.mock('../components/UpdateBanner', () => ({ default: () => null }));
vi.mock('../components/InstallPrompt', () => ({ default: () => null }));
vi.mock('../components/PushNotice', () => ({ default: () => null }));

beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('pairId', 'SEB1998');
  localStorage.setItem('identity', 'ella');
});

test('la ruta /asi-era existe y carga la pantalla (perezosa)', async () => {
  render(<MemoryRouter initialEntries={['/asi-era']}><App /></MemoryRouter>);
  expect(await screen.findByRole('heading', { level: 1, name: 'Así era' })).not.toBeNull();
});

test('todas las imágenes llevan alt, una por pantalla de la app antigua', () => {
  render(<MemoryRouter><AsiEra /></MemoryRouter>);
  const imgs = screen.getAllByRole('img');
  expect(imgs.length).toBeGreaterThanOrEqual(FOTOS.length);
  for (const img of imgs) {
    const name = img.getAttribute('alt') ?? img.getAttribute('aria-label');
    expect(name, img.outerHTML.slice(0, 80)).toBeTruthy();
  }
  expect(document.querySelectorAll('img:not([alt]), img[alt=""]')).toHaveLength(0);
});

test('el álbum empieza en la primera foto y vuelve a Ajustes', () => {
  render(<MemoryRouter><AsiEra /></MemoryRouter>);
  expect(screen.getByRole('button', { name: 'Foto anterior' }).disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Foto siguiente' }).disabled).toBe(false);
  expect(screen.getByRole('link', { name: 'Volver a Ajustes' }).getAttribute('href')).toBe('/settings');
  fireEvent.scroll(screen.getByRole('region', { name: /Fotos de la app antigua/ }));
});
