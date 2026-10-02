import React from 'react';
import { render, screen } from '@testing-library/react';
import Card from './Card';
import Chip from './Chip';

test('Card lleva .card y respeta el elemento y las clases que le pasan', () => {
  render(<ul><Card as="li" className="mt-2" data-x="1">Lista para el viaje</Card></ul>);
  const li = screen.getByText('Lista para el viaje');
  expect(li.tagName).toBe('LI');
  expect(li.className).toBe('card mt-2');
  expect(li.dataset.x).toBe('1');
});

test('Chip: acento por defecto, neutro y tinta', () => {
  render(
    <>
      <Chip>nos vemos</Chip>
      <Chip tone="neutro">🩷 Los dos</Chip>
      <Chip tone="tinta" className="absolute">Sin subir</Chip>
    </>
  );
  expect(screen.getByText('nos vemos').className).toBe('chip');
  expect(screen.getByText('🩷 Los dos').className).toBe('chip chip-neutro');
  expect(screen.getByText('Sin subir').className).toBe('chip chip-tinta absolute');
});
