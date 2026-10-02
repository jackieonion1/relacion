import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import InstallPrompt from './InstallPrompt';

const UA = navigator.userAgent;
function setUA(ua) { Object.defineProperty(navigator, 'userAgent', { value: ua, configurable: true }); }

beforeEach(() => {
  vi.useFakeTimers();
  localStorage.clear();
  window.matchMedia = window.matchMedia || (() => ({ matches: false }));
});
afterEach(() => {
  vi.useRealTimers();
  setUA(UA);
});

test('iPhone: la hoja con los dos pasos sale a los 2,4 s y solo una vez', () => {
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
  render(<InstallPrompt />);
  act(() => { vi.advanceTimersByTime(2300); });
  expect(screen.queryByRole('dialog')).toBeNull();
  act(() => { vi.advanceTimersByTime(100); });
  expect(screen.getByRole('dialog', { name: 'Instalar la app' })).not.toBeNull();
  expect(screen.queryByText('«Añadir a pantalla de inicio»')).not.toBeNull();
  expect(localStorage.getItem('installPromptShown')).toBe('1');
  fireEvent.click(screen.getByRole('button', { name: 'Entendido' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(localStorage.getItem('installPromptDismissed')).toBe('1');
});

test('Android: Instalar lanza el aviso del sistema y no vuelve a insistir', async () => {
  setUA('Mozilla/5.0 (Linux; Android 16; Pixel 10 Pro)');
  render(<InstallPrompt />);
  const e = new Event('beforeinstallprompt');
  e.prompt = vi.fn();
  e.userChoice = Promise.resolve({ outcome: 'accepted' });
  act(() => { window.dispatchEvent(e); vi.advanceTimersByTime(2400); });
  expect(screen.queryByRole('button', { name: 'Ahora no' })).not.toBeNull();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Instalar' })); });
  expect(e.prompt).toHaveBeenCalledTimes(1);
  expect(localStorage.getItem('installPromptDismissed')).toBe('1');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('ya mostrada antes: no sale', () => {
  setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)');
  localStorage.setItem('installPromptShown', '1');
  render(<InstallPrompt />);
  act(() => { vi.advanceTimersByTime(5000); });
  expect(screen.queryByRole('dialog')).toBeNull();
});
