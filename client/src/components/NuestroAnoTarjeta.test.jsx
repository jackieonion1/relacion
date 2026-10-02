import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import NuestroAnoTarjeta from './NuestroAnoTarjeta';

const en = (iso, url = '/') => {
  vi.setSystemTime(new Date(iso));
  return render(<MemoryRouter initialEntries={[url]}><NuestroAnoTarjeta /></MemoryRouter>);
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});

test('fuera de la ventana del aniversario no pinta nada', () => {
  const { container } = en('2026-10-02T10:00:00Z');
  expect(container.firstChild).toBeNull();
});

test('en la ventana es un enlace a las historias, y «volver» regresa a Inicio', () => {
  en('2026-11-24T10:00:00Z');
  const enlace = screen.getByRole('link', { name: 'Abrir nuestro segundo año' });
  expect(enlace.getAttribute('href')).toBe('/recuerdos/nuestro-ano');
  expect(screen.getByText('Nuestro segundo año, en postales')).not.toBeNull();
});

test('la ventana abre el 17-nov y cierra tras el 8-dic', () => {
  expect(en('2026-11-16T22:00:00Z').container.firstChild).toBeNull();
  expect(en('2026-11-17T08:00:00Z').container.firstChild).not.toBeNull();
  expect(en('2026-12-09T08:00:00Z').container.firstChild).toBeNull();
});

test('con ?ensayo=1 sale fuera de fecha y lleva el ensayo a la pantalla', () => {
  en('2026-10-02T10:00:00Z', '/?ensayo=1');
  expect(screen.getByRole('link', { name: 'Abrir nuestro segundo año' }).getAttribute('href')).toBe('/recuerdos/nuestro-ano?ensayo=1');
  expect(screen.getByText('Nuestro año · ensayo')).not.toBeNull();
});
