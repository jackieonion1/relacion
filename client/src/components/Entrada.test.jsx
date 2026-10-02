import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { PairGate, IdentityGate } from './Entrada';
import { createMembership } from '../lib/membership';

// firebase.js would start the real project (.env): each test gets its own membership instead
const fire = vi.hoisted(() => ({ membership: null }));
vi.mock('../lib/firebase', () => ({ get membership() { return fire.membership; } }));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const fail = (code) => Object.assign(new Error(code), { code: `functions/${code}` });

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
  fire.membership = createMembership();
});

test('el código se valida en vivo y solo entra uno de 4 a 12 letras o números', () => {
  render(<PairGate><p>dentro</p></PairGate>);
  const input = screen.getByRole('textbox', { name: 'Código de pareja' });
  const continuar = screen.getByRole('button', { name: 'Continuar' });
  expect(continuar.disabled).toBe(true);
  fireEvent.change(input, { target: { value: 'ab1' } });
  expect(input.value).toBe('AB1');
  expect(screen.queryByText('Entre 4 y 12 letras o números.')).not.toBeNull();
  expect(input.getAttribute('aria-invalid')).toBe('true');
  fireEvent.click(continuar);
  expect(screen.queryByText('dentro')).toBeNull();
  fireEvent.change(input, { target: { value: 'seb1998' } });
  expect(continuar.disabled).toBe(false);
  fireEvent.click(continuar);
  expect(screen.queryByText('dentro')).not.toBeNull();
  expect(localStorage.getItem('pairId')).toBe('SEB1998');
});

test('?pair= entra sin pedir nada, se guarda y se borra de la URL', () => {
  window.history.replaceState({}, '', '/?pair=seb1998&x=1');
  render(<PairGate><p>dentro</p></PairGate>);
  expect(screen.queryByText('dentro')).not.toBeNull();
  expect(localStorage.getItem('pairId')).toBe('SEB1998');
  expect(window.location.search).toBe('?x=1');
});

test('elegir identidad es un toque y guarda yo / ella', () => {
  const { unmount } = render(<IdentityGate><p>dentro</p></IdentityGate>);
  fireEvent.click(screen.getByRole('button', { name: 'Novia' }));
  expect(localStorage.getItem('identity')).toBe('ella');
  expect(screen.queryByText('dentro')).not.toBeNull();
  unmount();
  localStorage.clear();
  render(<IdentityGate><p>dentro</p></IdentityGate>);
  fireEvent.click(screen.getByRole('button', { name: 'Novio' }));
  expect(localStorage.getItem('identity')).toBe('yo');
});

test('pareja abierta: un código nuevo entra al momento, como antes, y joinPair va por detrás', async () => {
  const join = vi.fn(() => new Promise(() => {}));
  fire.membership = createMembership({ join, getUid: async () => 'uid-1', store: localStorage });
  render(<PairGate><p>dentro</p></PairGate>);
  fireEvent.change(screen.getByRole('textbox', { name: 'Código de pareja' }), { target: { value: 'seb1998' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  expect(screen.queryByText('dentro')).not.toBeNull();
  await act(flush);
  expect(join).toHaveBeenCalledWith({ pairId: 'SEB1998' });
  expect(screen.queryByText('dentro')).not.toBeNull();
});

test('pareja cerrada: pide la invitación; con una mala avisa y con una buena entra', async () => {
  const join = vi.fn(async ({ invite }) => {
    if (!invite) throw fail('failed-precondition');
    if (invite !== 'ABCDEFGH') throw fail('permission-denied');
    return { ok: true };
  });
  fire.membership = createMembership({ join, getUid: async () => 'uid-1', store: localStorage });
  render(<PairGate><p>dentro</p></PairGate>);
  fireEvent.change(screen.getByRole('textbox', { name: 'Código de pareja' }), { target: { value: 'seb1998' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continuar' }));
  await act(flush);
  expect(screen.queryByText('dentro')).toBeNull();
  const input = screen.getByRole('textbox', { name: 'Código de invitación' });
  const entrar = screen.getByRole('button', { name: 'Entrar' });
  expect(entrar.disabled).toBe(true);
  fireEvent.change(input, { target: { value: 'zzzz-zzzz' } });
  await act(async () => { fireEvent.click(entrar); await flush(); });
  expect(screen.queryByText('Ese código no vale o ha caducado. Pide otro.')).not.toBeNull();
  fireEvent.change(input, { target: { value: 'abcd-efgh' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Entrar' })); await flush(); });
  expect(join).toHaveBeenLastCalledWith({ pairId: 'SEB1998', invite: 'ABCDEFGH' });
  expect(screen.queryByText('dentro')).not.toBeNull();
  expect(localStorage.getItem('member')).toBe('SEB1998:uid-1');
});

test('desde la invitación se puede volver a escribir otro código de pareja', async () => {
  fire.membership = createMembership({ join: async () => { throw fail('failed-precondition'); }, getUid: async () => 'uid-1', store: localStorage });
  render(<PairGate><p>dentro</p></PairGate>);
  fireEvent.change(screen.getByRole('textbox', { name: 'Código de pareja' }), { target: { value: 'seb1998' } });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Continuar' })); await flush(); });
  fireEvent.click(screen.getByRole('button', { name: 'Usar otro código de pareja' }));
  expect(screen.getByRole('textbox', { name: 'Código de pareja' }).value).toBe('');
  expect(localStorage.getItem('pairId')).toBe(null);
});

test('un móvil con el código guardado entra sin esperar a joinPair', async () => {
  localStorage.setItem('pairId', 'SEB1998');
  fire.membership = createMembership({ join: () => new Promise(() => {}), getUid: async () => 'uid-1', store: localStorage });
  render(<PairGate><p>dentro</p></PairGate>);
  await act(flush);
  expect(screen.queryByText('dentro')).not.toBeNull();
  expect(fire.membership.get().status).toBe('joining');
});
