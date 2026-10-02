import React from 'react';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router';
import Dashboard from './Dashboard';
import { listenEvents } from '../lib/calendar';
import { fetchCityWeather } from '../lib/weather';

vi.mock('../lib/calendar', () => ({ listenEvents: vi.fn() }));
vi.mock('../lib/firebase', () => ({ db: null }));
vi.mock('../components/RandomPhoto', () => ({ default: () => null }));
vi.mock('../lib/weather', async (orig) => ({ ...(await orig()), fetchCityWeather: vi.fn() }));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const ts = (d) => ({ toDate: () => d });

function Where() {
  const loc = useLocation();
  return <p data-testid="where">{loc.pathname}{loc.search}</p>;
}

let list;
beforeEach(() => {
  localStorage.setItem('pairId', 'SEB1998');
  const soon = new Date(Date.now() + 2 * 3600000); // before any automatic special day

  list = [{ id: 'e1', title: 'Cena juntos', start: ts(soon), eventType: 'conjunto' }];
  listenEvents.mockImplementation((pair, opts, onList) => { onList(list); return () => {}; });
  fetchCityWeather.mockImplementation(async (city) => (city ? {
    city, temp: 18, feels: 17, humidity: 64, wind: 12, code: 0, phase: 'night', moon: '🌖',
  } : null));
  localStorage.setItem('pair_SEB1998_novio_location', JSON.stringify({ city: 'Ciudad A' }));
  localStorage.removeItem('pair_SEB1998_novia_location');
});

async function mount() {
  const utils = render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/calendar" element={<Where />} />
      </Routes>
    </MemoryRouter>
  );
  await act(flush);
  return utils;
}

test('«Próximo evento conjunto» ya dice «Los dos» y su cuenta atrás va en vivo', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'Date'] });
  try {
    await mount();
    expect(screen.queryByText(/conjunto/i)).toBeNull();
    const strip = screen.getByRole('region', { name: 'Próximo evento de los dos' });
    expect(strip.textContent).toMatch('Próximo evento · Los dos');
    expect(strip.textContent).toMatch('Cena juntos');
    const timer = strip.querySelector('[role="timer"]');
    const before = timer.textContent;
    await act(async () => { vi.advanceTimersByTime(1000); });
    await act(async () => { vi.advanceTimersByTime(1000); });
    expect(timer.textContent).not.toBe(before);
  } finally {
    vi.useRealTimers();
  }
});

test('«nos vemos» lleva su propia cuenta atrás y esconde la franja si es el mismo evento', async () => {
  list[0].seeEachOther = true;
  await mount();
  const meet = screen.getByRole('region', { name: 'Próximo encuentro' });
  expect(meet.textContent).toMatch('Cena juntos');
  expect(meet.querySelector('[role="timer"]')).not.toBeNull();
  expect(screen.queryByRole('region', { name: 'Próximo evento de los dos' })).toBeNull();
});

test('tocar «Nos vemos» abre ese evento en el calendario (?y&m&d&ev)', async () => {
  list[0].seeEachOther = true;
  const d = list[0].start.toDate();
  await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Abrir «Cena juntos» en el calendario' }));
  expect(screen.getByTestId('where').textContent).toBe(`/calendar?y=${d.getFullYear()}&m=${d.getMonth()}&d=${d.getDate()}&ev=e1`);
});

test('el clima pinta la luna y el emoji a la vez y el cielo de la tabla 7 × 4', async () => {
  const { container } = await mount();
  const sky = container.querySelector('.cielo');
  expect(sky.textContent).toMatch('🌖');
  expect(sky.textContent).toMatch('☀️');
  expect(sky.className).toMatch('de-noche');
  expect(sky.querySelector('.cielo-fondo').className).toMatch('from-indigo-800 to-violet-700');
  expect(sky.textContent).toMatch('🌬️ 12 km/h');
  expect(sky.textContent).toMatch('Ciudad A');
  // la otra ciudad sin ubicación
  expect(screen.getByText('Sin ubicación')).not.toBeNull();
});

test('la hora local de la ciudad sale junto a su nombre y se oculta sin zona horaria (C8)', async () => {
  fetchCityWeather.mockImplementation(async (city) => (city ? {
    city, temp: 18, feels: 17, humidity: 64, wind: 12, code: 0, phase: 'day', timezone: 'Asia/Tokyo',
  } : null));
  const hora = new Intl.DateTimeFormat('es-ES', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date());
  const { container, unmount } = await mount();
  expect(container.querySelector('.cielo').textContent).toMatch(`Ciudad A · ${hora}`);
  unmount();
  fetchCityWeather.mockImplementation(async (city) => (city ? {
    city, temp: 18, feels: 17, humidity: 64, wind: 12, code: 0, phase: 'day', timezone: null,
  } : null));
  const sin = await mount();
  expect(sin.container.querySelector('.cielo').textContent).toMatch(/Ciudad A$/);
});

test('el latido es local: se enciende al tocar y no llama a nada', async () => {
  await mount();
  const heart = screen.getByRole('button', { name: 'Latido' });
  expect(heart.getAttribute('aria-pressed')).toBe('false');
  fireEvent.click(heart);
  expect(heart.getAttribute('aria-pressed')).toBe('true');
  expect(heart.className).toMatch('beat-a');
  fireEvent.click(heart);
  expect(heart.className).toMatch('beat-b');
});

test('una fila de Próximos abre el calendario en su día (?y&m&d)', async () => {
  const d = list[0].start.toDate();
  await mount();
  fireEvent.click(screen.getByRole('button', { name: /Cena juntos/ }));
  expect(screen.getByTestId('where').textContent).toBe(`/calendar?y=${d.getFullYear()}&m=${d.getMonth()}&d=${d.getDate()}`);
});

test('si fallan los eventos se ven los especiales y Reintentar vuelve a suscribirse', async () => {
  listenEvents.mockImplementation((pair, opts, onList, onError) => { onError(new Error('x')); return () => {}; });
  const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
  await mount();
  expect(screen.getByRole('alert').textContent).toMatch('No se pudieron cargar los eventos.');
  expect(screen.getByRole('region', { name: 'Próximos eventos' }).textContent).toMatch(/Cumpleaños|versario/);
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  await act(flush);
  expect(listenEvents).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});
