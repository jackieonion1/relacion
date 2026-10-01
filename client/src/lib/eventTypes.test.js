import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { EVENT_TYPES, ROLE_LABELS } from './eventTypes';
import EventTypeSwitcher from '../components/EventTypeSwitcher';

test('los tipos de evento conservan su valor guardado y su emoji; conjunto se llama «Los dos»', () => {
  expect(EVENT_TYPES.map((t) => [t.value, t.emoji, t.text])).toEqual([
    ['conjunto', '🩷', 'Los dos'],
    ['novio', '💛', 'Novio'],
    ['novia', '💜', 'Novia'],
  ]);
  expect(ROLE_LABELS).toEqual({ novio: 'Novio', novia: 'Novia' });
});

test('el selector del formulario enseña las etiquetas y devuelve el valor guardado', () => {
  const onChange = vi.fn();
  render(React.createElement(EventTypeSwitcher, { activeType: 'conjunto', onChange }));
  expect(screen.queryByText('Conjunto')).toBeNull();
  fireEvent.click(screen.getByText('Los dos'));
  fireEvent.click(screen.getByText('Novia'));
  expect(onChange.mock.calls).toEqual([['conjunto'], ['novia']]);
});
