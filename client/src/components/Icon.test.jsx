import React from 'react';
import { render, screen } from '@testing-library/react';
import Icon, { ICONS } from './Icon';

test('decorativo por defecto, con trazo 1,75 y 24 px', () => {
  const { container } = render(<Icon name="cerrar" />);
  const svg = container.querySelector('svg');
  expect(svg.getAttribute('aria-hidden')).toBe('true');
  expect(svg.getAttribute('stroke-width')).toBe('1.75');
  expect(svg.getAttribute('width')).toBe('24');
  expect(svg.getAttribute('fill')).toBe('none');
});

test('con `label` es una imagen con nombre', () => {
  render(<Icon name="recargar" label="Recargar" size={20} />);
  expect(screen.getByRole('img', { name: 'Recargar' }).getAttribute('width')).toBe('20');
});

test('`filled` rellena en vez de trazar', () => {
  const { container } = render(<Icon name="latido" filled />);
  const svg = container.querySelector('svg');
  expect(svg.getAttribute('fill')).toBe('currentColor');
  expect(svg.getAttribute('stroke')).toBe('none');
});

test('un nombre que no existe no pinta nada', () => {
  const { container } = render(<Icon name="nada" />);
  expect(container.innerHTML).toBe('');
});

test('están los iconos que sustituyen a los glifos ↻ ‹ › × ▼', () => {
  for (const n of ['recargar', 'atras', 'siguiente', 'cerrar', 'abajo']) expect(ICONS[n]).toMatch(/^M/);
});
