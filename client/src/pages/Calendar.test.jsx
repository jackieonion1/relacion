import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CalendarPage from './Calendar';
import { listEvents } from '../lib/calendar';
import { RAIN } from '../lib/rain';

vi.mock('../lib/calendar', () => ({
  listEvents: vi.fn(),
  addEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn(),
  eventToFormValues: vi.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

beforeEach(() => {
  localStorage.setItem('pairId', 'SEB1998');
  listEvents.mockResolvedValue([]);
});

async function mount(url = '/calendar') {
  const utils = render(<MemoryRouter initialEntries={[url]}><CalendarPage /></MemoryRouter>);
  await act(flush);
  return utils;
}

test('abre siempre en la vista de mes, no en la lista', async () => {
  const now = new Date();
  await mount();
  expect(screen.queryByText(`${monthNames[now.getMonth()]} ${now.getFullYear()}`)).not.toBeNull();
  expect(screen.queryByText('Próximos eventos')).toBeNull();
});

test('el deep-link ?y&m&d abre el mes y la hoja de ese día', async () => {
  await mount('/calendar?y=2026&m=10&d=24');
  expect(screen.queryByText('Noviembre 2026')).not.toBeNull();
  expect(screen.queryByText('Eventos del 24 de noviembre de 2026')).not.toBeNull();
  expect(screen.queryByText('¡¡2 años!!')).not.toBeNull();
  expect(screen.queryByText('¡Feliz aniversario!')).not.toBeNull();
});

test('la hoja de un cumpleaños lleva su mensaje y no repite el evento automático', async () => {
  await mount('/calendar?y=2027&m=3&d=21');
  expect(screen.queryByText('¡¡Lucy cumple 24 años!!')).not.toBeNull();
  expect(screen.queryByText('¡Feliz cumpleaños!')).not.toBeNull();
  expect(screen.queryByText('¡Cumpleaños de Lucy! 24 años')).toBeNull();
});

test('un deep-link fuera de rango no abre ningún día', async () => {
  await mount('/calendar?y=2026&m=12&d=1');
  expect(screen.queryByText(/^Eventos del /)).toBeNull();
});

const rain = () => Array.from(document.querySelectorAll('[data-testid="heart-rain"] > div'));

test.each([
  ['un 24 cualquiera', '/calendar?y=2026&m=8&d=24', 'heart-fall', 'rain'],
  ['el aniversario', '/calendar?y=2026&m=10&d=24', 'heart-fireworks', 'fireworks'],
  ['un cumpleaños', '/calendar?y=2027&m=3&d=21', 'heart-fall', 'birthday'],
])('abrir %s hace caer su lluvia', async (_, url, className, type) => {
  await mount(url);
  expect(rain().length).toBeGreaterThan(0);
  for (const p of rain()) {
    expect(p.className).toContain(className);
    expect(RAIN[type].emoji).toContain(p.textContent);
  }
});

test('un día normal no tiene lluvia', async () => {
  await mount('/calendar?y=2026&m=8&d=23');
  expect(screen.queryByText('Eventos del 23 de septiembre de 2026')).not.toBeNull();
  expect(rain()).toHaveLength(0);
  expect(screen.queryByRole('button', { name: 'Parar la fiesta' })).toBeNull();
});

test('«Parar la fiesta» para la lluvia y deja la hoja; cerrar la hoja también la para', async () => {
  await mount('/calendar?y=2027&m=3&d=21');
  fireEvent.click(screen.getByRole('button', { name: 'Parar la fiesta' }));
  expect(rain()).toHaveLength(0);
  expect(screen.queryByText('¡¡Lucy cumple 24 años!!')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(screen.queryByText('¡¡Lucy cumple 24 años!!')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Parar la fiesta' })).toBeNull();
});

test('cerrar la hoja sin parar también quita la lluvia', async () => {
  await mount('/calendar?y=2026&m=10&d=24');
  fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
  expect(rain()).toHaveLength(0);
});
