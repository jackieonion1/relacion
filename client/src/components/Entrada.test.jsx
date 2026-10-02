import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { PairGate, IdentityGate } from './Entrada';

beforeEach(() => {
  localStorage.clear();
  window.history.replaceState({}, '', '/');
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
