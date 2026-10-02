import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Button from './Button';

test('por defecto es el primario rosa, talla 44 y type="button"', () => {
  render(<Button>Guardar</Button>);
  const b = screen.getByRole('button', { name: 'Guardar' });
  expect(b.className).toBe('btn btn-pri');
  expect(b.getAttribute('type')).toBe('button');
});

test('variantes y tallas', () => {
  render(
    <>
      <Button variant="sec" size="m">Reintentar</Button>
      <Button variant="txt" accent size="l">Ver calendario</Button>
      <Button variant="dan" size="xl" type="submit">Borrar foto</Button>
      <Button variant="inv" icon="subir">Subir</Button>
    </>
  );
  expect(screen.getByText('Reintentar').className).toBe('btn btn-sec btn-m');
  expect(screen.getByText('Ver calendario').className).toBe('btn btn-txt btn-l btn-acc');
  expect(screen.getByText('Borrar foto').className).toBe('btn btn-dan btn-xl');
  expect(screen.getByText('Borrar foto').getAttribute('type')).toBe('submit');
  expect(screen.getByText('Subir').className).toBe('btn btn-inv btn-ic');
});

test('solo icono: 44 × 44 con su nombre accesible', () => {
  render(<Button icon="ajustes" label="Ajustes" />);
  const b = screen.getByRole('button', { name: 'Ajustes' });
  expect(b.className).toBe('btn btn-icono');
  expect(b.querySelector('svg').getAttribute('width')).toBe('24');
});

test('ocupado: deshabilitado con aria-busy y el texto de espera; no responde', () => {
  const onClick = vi.fn();
  render(<Button busy busyText="Guardando…" onClick={onClick}>Guardar</Button>);
  const b = screen.getByRole('button', { name: 'Guardando…' });
  expect(b.disabled).toBe(true);
  expect(b.getAttribute('aria-busy')).toBe('true');
  fireEvent.click(b);
  expect(onClick).not.toHaveBeenCalled();
});
