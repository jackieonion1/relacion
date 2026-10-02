import React from 'react';
import { render, screen, act, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import CalendarPage from './Calendar';
import { listEvents } from '../lib/calendar';
import { registrarActividad, borrarActividad } from '../lib/actividad';
import { RAIN } from '../lib/rain';

vi.mock('../lib/actividad', async (orig) => ({ ...(await orig()), registrarActividad: vi.fn(), borrarActividad: vi.fn() }));

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
  expect(screen.queryByText(/^Próximos/)).toBeNull();
});

test('el deep-link ?y&m&d abre el mes y la hoja de ese día', async () => {
  await mount('/calendar?y=2026&m=10&d=24');
  expect(screen.queryByText('Noviembre 2026')).not.toBeNull();
  expect(screen.getByRole('dialog', { name: 'Martes 24 de noviembre' })).not.toBeNull();
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
  expect(screen.queryByRole('dialog')).toBeNull();
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
  expect(screen.queryByRole('dialog', { name: 'Miércoles 23 de septiembre' })).not.toBeNull();
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

// A saved event (Firestore shape: start/end with toDate), far enough ahead to be upcoming
const ts = (d) => ({ toDate: () => d });
const cena = { id: 'ev1', title: 'Cena en casa', location: 'Casa', eventType: 'novia', seeEachOther: false, start: ts(new Date(2099, 4, 10, 21, 0)) };

async function openFromList(title) {
  fireEvent.click(screen.getByRole('button', { name: 'Lista' }));
  fireEvent.click(screen.getByRole('button', { name: new RegExp(title) }));
}

test('una fila de la lista abre la hoja del evento; «Ver en el calendario» lleva al mes y al día', async () => {
  listEvents.mockResolvedValue([cena]);
  await mount();
  await openFromList('Cena en casa');
  const sheet = screen.getByRole('dialog', { name: 'Cena en casa' });
  expect(sheet.textContent).toContain('Domingo, 10 de mayo de 2099 · 21:00');
  expect(sheet.textContent).toContain('💜Novia');
  expect(screen.queryByRole('button', { name: /Editar/ })).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: /Ver en el calendario/ }));
  expect(screen.queryByText('Mayo 2099')).not.toBeNull();
  expect(screen.queryByRole('dialog', { name: 'Domingo 10 de mayo' })).not.toBeNull();
});

test('un evento especial no ofrece editar ni borrar', async () => {
  await mount();
  await openFromList('¡Cumpleaños de Sebas!');
  expect(screen.queryByText('Lo pone la app cada año. No se puede editar ni borrar.')).not.toBeNull();
  expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Borrar evento' })).toBeNull();
});

test('«Añadir a este día» abre el formulario con la fecha puesta y volver deja la hoja del día', async () => {
  await mount('/calendar?y=2026&m=8&d=23');
  fireEvent.click(screen.getByRole('button', { name: /Añadir a este día/ }));
  expect(screen.getByRole('dialog', { name: 'Nuevo evento' })).not.toBeNull();
  expect(screen.getByLabelText('Fecha').value).toBe('2026-09-23');
  expect(screen.getByLabelText(/^Hasta/).value).toBe('2026-09-23');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog', { name: 'Miércoles 23 de septiembre' })).not.toBeNull();
});

test('editar desde la hoja del evento guarda con updateEvent y los mismos campos', async () => {
  const { updateEvent, eventToFormValues } = await import('../lib/calendar');
  listEvents.mockResolvedValue([cena]);
  eventToFormValues.mockReturnValue({ title: 'Cena en casa', location: 'Casa', date: '2099-05-10', time: '21:00', endDate: '', eventType: 'novia', seeEachOther: false });
  updateEvent.mockResolvedValue({ committed: Promise.resolve() });
  await mount();
  await openFromList('Cena en casa');
  fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
  expect(screen.getByRole('dialog', { name: 'Editar evento' })).not.toBeNull();
  fireEvent.click(screen.getByLabelText(/^¿Nos vemos\?/));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar' })); await flush(); });
  expect(updateEvent).toHaveBeenCalledWith('SEB1998', 'ev1', {
    title: 'Cena en casa', date: '2099-05-10', time: '21:00', endDate: '', location: 'Casa', eventType: 'conjunto', seeEachOther: true,
  });
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('borrar pide confirmación y llama a deleteEvent', async () => {
  const { deleteEvent } = await import('../lib/calendar');
  listEvents.mockResolvedValue([cena]);
  deleteEvent.mockResolvedValue();
  await mount();
  await openFromList('Cena en casa');
  fireEvent.click(screen.getByRole('button', { name: 'Borrar evento' }));
  expect(screen.getByRole('dialog', { name: '¿Borrar «Cena en casa»?' })).not.toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Borrar evento' })); await flush(); });
  expect(deleteEvent).toHaveBeenCalledWith('SEB1998', 'ev1');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('borrar un evento borra sus avisos; si no se pudo borrar, no', async () => {
  const { deleteEvent } = await import('../lib/calendar');
  listEvents.mockResolvedValue([cena]);
  deleteEvent.mockRejectedValueOnce(new Error('denied')).mockResolvedValue();
  await mount();
  await openFromList('Cena en casa');
  fireEvent.click(screen.getByRole('button', { name: 'Borrar evento' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Borrar evento' })); await flush(); });
  expect(borrarActividad).not.toHaveBeenCalled();
  await openFromList('Cena en casa');
  fireEvent.click(screen.getByRole('button', { name: 'Borrar evento' }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Borrar evento' })); await flush(); });
  expect(borrarActividad).toHaveBeenCalledWith('SEB1998', ['evento', 'eventoEditado', 'nosVemos'], { clave: 'ev1' });
});

test('un evento nuevo se cuenta con su id cuando el servidor lo da', async () => {
  const { addEvent } = await import('../lib/calendar');
  addEvent.mockResolvedValue({ committed: Promise.resolve({ id: 'NEW1' }) });
  await mount('/calendar?y=2026&m=8&d=23');
  fireEvent.click(screen.getByRole('button', { name: /Añadir a este día/ }));
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Cena' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar' })); await flush(); });
  expect(registrarActividad).toHaveBeenCalledTimes(1);
  expect(registrarActividad).toHaveBeenCalledWith('SEB1998', expect.any(String), 'evento', { ref: { eventId: 'NEW1', dia: '2026-09-23' }, clave: 'NEW1', texto: 'Cena' });
});

test('un evento editado se cuenta con el id del evento', async () => {
  const { updateEvent, eventToFormValues } = await import('../lib/calendar');
  listEvents.mockResolvedValue([cena]);
  eventToFormValues.mockReturnValue({ title: 'Cena en casa', location: 'Casa', date: '2099-05-10', time: '21:00', endDate: '', eventType: 'novia', seeEachOther: false });
  updateEvent.mockResolvedValue({ committed: Promise.resolve() });
  await mount();
  await openFromList('Cena en casa');
  fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar' })); await flush(); });
  expect(registrarActividad).toHaveBeenLastCalledWith('SEB1998', expect.any(String), 'eventoEditado', { ref: { eventId: 'ev1', dia: '2099-05-10' }, clave: 'ev1', texto: 'Cena en casa' });
});

test('O3: «Borrar evento» y «Cancelar» dentro del formulario deja todos los campos como estaban', async () => {
  const { updateEvent, eventToFormValues } = await import('../lib/calendar');
  listEvents.mockResolvedValue([cena]);
  eventToFormValues.mockReturnValue({ title: 'Cena en casa', location: 'Casa', date: '2099-05-10', time: '21:00', endDate: '', eventType: 'novia', seeEachOther: false });
  updateEvent.mockResolvedValue({ committed: Promise.resolve() });
  await mount();
  await openFromList('Cena en casa');
  fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Comida' } });
  fireEvent.change(screen.getByLabelText(/^Lugar/), { target: { value: 'Parque' } });
  fireEvent.click(screen.getByLabelText(/^¿Nos vemos\?/));
  fireEvent.click(screen.getAllByRole('button', { name: 'Borrar evento' })[0]);
  const confirm = screen.getByRole('dialog', { name: '¿Borrar «Cena en casa»?' });
  fireEvent.click(within(confirm).getByRole('button', { name: 'Cancelar' }));
  expect(screen.queryByRole('dialog', { name: '¿Borrar «Cena en casa»?' })).toBeNull();
  expect(screen.getByLabelText('Título').value).toBe('Comida');
  expect(screen.getByLabelText(/^Lugar/).value).toBe('Parque');
  expect(screen.getByLabelText(/^¿Nos vemos\?/).checked).toBe(true);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Guardar' })); await flush(); });
  expect(updateEvent).toHaveBeenCalledWith('SEB1998', 'ev1', expect.objectContaining({ title: 'Comida', location: 'Parque', seeEachOther: true }));
});

test('el deep-link con ?ev abre la hoja de ese evento y volver deja la hoja de su día', async () => {
  listEvents.mockResolvedValue([cena]);
  await mount('/calendar?y=2099&m=4&d=10&ev=ev1');
  const sheet = screen.getByRole('dialog', { name: 'Cena en casa' });
  expect(sheet.textContent).toMatch('Casa');
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog', { name: /10 de mayo/ })).not.toBeNull();
});

test('un ?ev que ya no existe deja abierta la hoja del día', async () => {
  await mount('/calendar?y=2099&m=4&d=10&ev=borrado');
  expect(screen.queryByRole('dialog', { name: /10 de mayo/ })).not.toBeNull();
});

test('O1: la hoja del evento abierta desde un día con lluvia deja sitio a «Parar la fiesta»', async () => {
  const { eventToFormValues } = await import('../lib/calendar');
  eventToFormValues.mockReturnValue({ title: 'Cena en casa', location: 'Casa', date: '2026-11-24', time: '21:00', endDate: '', eventType: 'novia', seeEachOther: false });
  listEvents.mockResolvedValue([{ ...cena, start: ts(new Date(2026, 10, 24, 21, 0)) }]);
  await mount('/calendar?y=2026&m=10&d=24');
  fireEvent.click(screen.getByRole('button', { name: /Cena en casa/ }));
  expect(screen.getByRole('button', { name: 'Parar la fiesta' })).toBeTruthy();
  expect(screen.getByRole('dialog', { name: 'Cena en casa' }).style.paddingBottom).toContain('88px');
  fireEvent.click(screen.getByRole('button', { name: /Editar/ }));
  expect(screen.getByRole('dialog', { name: 'Editar evento' }).style.paddingBottom).toContain('88px');
});
