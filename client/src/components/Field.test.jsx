import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import Field from './Field';

test('la etiqueta nombra el campo y el texto se escribe', () => {
  const onChange = vi.fn();
  render(<Field label="Título" placeholder="Cena, visita…" onChange={onChange} />);
  const input = screen.getByLabelText('Título');
  expect(input.tagName).toBe('INPUT');
  expect(input.className).toBe('input w-full');
  expect(input.getAttribute('aria-invalid')).toBeNull();
  fireEvent.change(input, { target: { value: 'Cena en casa' } });
  expect(onChange).toHaveBeenCalled();
});

test('el error se anuncia con aria-invalid y su texto', () => {
  render(<Field label="Título" error="Ponle un título." />);
  const input = screen.getByLabelText('Título');
  expect(input.getAttribute('aria-invalid')).toBe('true');
  const note = document.getElementById(input.getAttribute('aria-describedby'));
  expect(note.textContent).toBe('Ponle un título.');
  expect(note.className).toContain('text-danger');
});

test('`multiline` es un textarea; `hint` describe sin marcar error', () => {
  render(<Field label="Nota" multiline hint="Se ve en las dos" disabled />);
  const area = screen.getByLabelText('Nota');
  expect(area.tagName).toBe('TEXTAREA');
  expect(area.disabled).toBe(true);
  expect(area.getAttribute('aria-invalid')).toBeNull();
  expect(document.getElementById(area.getAttribute('aria-describedby')).textContent).toBe('Se ve en las dos');
});
