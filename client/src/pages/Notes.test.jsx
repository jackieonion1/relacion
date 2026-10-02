import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import Notes from './Notes';
import { listenNotes, markThreadRead } from '../lib/notes';

vi.mock('../lib/notes', () => ({
  addNote: vi.fn(),
  deleteNote: vi.fn(),
  listenNotes: vi.fn(),
  deleteThread: vi.fn(),
  markThreadRead: vi.fn(),
}));

// Thread T1 has two notes, one of them unread for 'ella'; S1 is a single note
const NOTES = [
  { id: 'T1', threadId: 'T1', identity: 'yo', html: '<p>primera del hilo</p>', createdAt: { seconds: 1 }, unreadFor: [] },
  { id: 'R1', threadId: 'T1', identity: 'yo', html: '<p>respuesta del hilo</p>', createdAt: { seconds: 2 }, unreadFor: ['ella'] },
  { id: 'S1', threadId: 'S1', identity: 'yo', title: 'Suelta', html: '<p>nota suelta</p>', createdAt: { seconds: 3 }, unreadFor: ['ella'] },
];

beforeEach(() => {
  localStorage.setItem('pairId', 'SEB1998');
  localStorage.setItem('identity', 'ella');
  listenNotes.mockImplementation((pairId, opts, onChange) => { onChange(NOTES); return () => {}; });
});

async function open(text) {
  render(<Notes />);
  await act(async () => { fireEvent.click(screen.getByText(text)); });
}

const backdrop = () => screen.getByTestId('sheet-scrim');
const button = (name) => screen.getAllByRole('button', { name }).find((b) => b.closest('[role="dialog"]'));

describe('las salidas que marcan leído', () => {
  // «Cerrar» is now the «‹ Notas» back button of the sheet
  test('hilo: Cerrar', async () => {
    await open('respuesta del hilo');
    expect(screen.queryByText('2 notas')).not.toBeNull();
    fireEvent.click(button('Notas'));
    expect(markThreadRead.mock.calls).toEqual([['SEB1998', 'T1', 'ella']]);
    expect(screen.queryByText('2 notas')).toBeNull();
  });

  test('hilo: Responder', async () => {
    await open('respuesta del hilo');
    fireEvent.click(button('Responder'));
    expect(markThreadRead.mock.calls).toEqual([['SEB1998', 'T1', 'ella']]);
    expect(screen.queryByPlaceholderText('Título')).not.toBeNull();
  });

  test('hilo: cerrar tocando fuera', async () => {
    await open('respuesta del hilo');
    fireEvent.click(backdrop());
    expect(markThreadRead.mock.calls).toEqual([['SEB1998', 'T1', 'ella']]);
    expect(screen.queryByText('2 notas')).toBeNull();
  });

  test('nota suelta: Cerrar', async () => {
    await open('nota suelta');
    fireEvent.click(button('Notas'));
    expect(markThreadRead.mock.calls).toEqual([['SEB1998', 'S1', 'ella']]);
  });

  test('nota suelta: Responder', async () => {
    await open('nota suelta');
    fireEvent.click(button('Responder'));
    expect(markThreadRead.mock.calls).toEqual([['SEB1998', 'S1', 'ella']]);
    expect(screen.queryByPlaceholderText('Título')).not.toBeNull();
  });

  test('nota suelta: cerrar tocando fuera', async () => {
    await open('nota suelta');
    fireEvent.click(backdrop());
    expect(markThreadRead.mock.calls).toEqual([['SEB1998', 'S1', 'ella']]);
  });
});

test('abrir una nota no la marca leída hasta salir', async () => {
  await open('nota suelta');
  expect(markThreadRead).not.toHaveBeenCalled();
});

test('salir de Notas con una nota abierta (atrás) la marca leída al desmontar', async () => {
  const { unmount } = render(<Notes />);
  await act(async () => { fireEvent.click(screen.getByText('nota suelta')); });
  unmount();
  expect(markThreadRead.mock.calls).toEqual([['SEB1998', 'S1', 'ella']]);
});

test('una nota nueva cerrada tocando fuera no marca nada', async () => {
  render(<Notes />);
  fireEvent.click(screen.getAllByRole('button', { name: 'Escribir' })[0]);
  fireEvent.click(backdrop());
  expect(markThreadRead).not.toHaveBeenCalled();
});
