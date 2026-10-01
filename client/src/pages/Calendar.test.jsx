import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CalendarPage from './Calendar';
import { listEvents } from '../lib/calendar';

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
