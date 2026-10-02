import React from 'react';
import { readFileSync } from 'fs';
import path from 'path';
import { render, screen, fireEvent, act } from '@testing-library/react';
import CieloAnimado from './CieloAnimado';
import TarjetaTiempo from './TarjetaTiempo';

const q = (c, sel) => c.querySelectorAll(sel).length;

function reducedMotion(matches) {
  window.matchMedia = vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() }));
}

afterEach(() => {
  delete window.matchMedia;
  vi.useRealTimers();
});

describe('CieloAnimado, una escena por tipo de tiempo', () => {
  test.each([
    [0, 'soleado', { '.esc-sol': 1, '.esc-nube': 0, '.esc-gota': 0 }],
    [2, 'parcial', { '.esc-sol': 1, '.esc-nube': 2 }],
    [3, 'nublado', { '.esc-sol': 0, '.esc-nube': 3 }],
    [45, 'niebla', { '.esc-banda': 2, '.esc-escarcha': 0 }],
    [48, 'niebla', { '.esc-banda': 2, '.esc-escarcha': 1 }],
    [53, 'lluvia', { '.esc-gota': 12, '.esc-copo': 0 }],
    [66, 'lluvia', { '.esc-gota': 12, '.esc-escarcha': 1 }],
    [65, 'lluvia', { '.esc-gota': 24, '.esc-lluvia.rachas': 0 }],
    [81, 'lluvia', { '.esc-gota': 16, '.esc-lluvia.rachas': 1 }],
    [73, 'nieve', { '.esc-copo': 14, '.esc-gota': 0 }],
    [77, 'nieve', { '.esc-copo': 12, '.esc-nieve.esc-granos': 1 }],
    [95, 'tormenta', { '.esc-gota': 20, '.esc-destello': 1, '.esc-rayo': 1, '.esc-granizo': 0 }],
    [99, 'tormenta', { '.esc-destello': 1, '.esc-granizo': 6 }],
  ])('el código %i pinta %s', (code, type, counts) => {
    const { container } = render(<CieloAnimado code={code} phase="day" />);
    const root = container.firstChild;
    expect(root.getAttribute('data-escena')).toBe(type);
    expect(root.getAttribute('aria-hidden')).toBe('true');
    for (const [sel, n] of Object.entries(counts)) expect(q(container, sel), `${code} ${sel}`).toBe(n);
  });

  test('de día lleva sol y de noche estrellas, sin sol, y solo con el cielo abierto', () => {
    const day = render(<CieloAnimado code={0} phase="day" />).container;
    expect(q(day, '.esc-sol')).toBe(1);
    expect(q(day, '.esc-estrella')).toBe(0);
    expect(day.firstChild.className).not.toMatch('es-noche');

    const night = render(<CieloAnimado code={0} phase="night" />).container;
    expect(q(night, '.esc-sol')).toBe(0);
    expect(q(night, '.esc-estrella')).toBe(9);
    expect(night.firstChild.className).toMatch('es-noche');

    const rainNight = render(<CieloAnimado code={61} phase="night" />).container;
    expect(q(rainNight, '.esc-estrella') + q(rainNight, '.esc-sol')).toBe(0);
    expect(q(rainNight, '.esc-gota')).toBe(10);
  });

  test('el amanecer y el atardecer suman un resplandor cálido', () => {
    for (const phase of ['dawn', 'dusk']) expect(q(render(<CieloAnimado code={0} phase={phase} />).container, '.esc-resplandor')).toBe(1);
    for (const phase of ['day', 'night']) expect(q(render(<CieloAnimado code={0} phase={phase} />).container, '.esc-resplandor')).toBe(0);
  });

  test('la lluvia se inclina con el viento', () => {
    const tilt = (wind) => render(<CieloAnimado code={61} wind={wind} />).container.querySelector('.esc-lluvia').style.transform;
    expect(tilt(0)).toBe('rotate(0deg)');
    expect(tilt(15)).toBe('rotate(-5deg)');
    expect(tilt(90)).toBe('rotate(-20deg)');
    expect(tilt(null)).toBe('rotate(0deg)');
  });

  test('con la misma ciudad las partículas no se mueven al volver a pintar', () => {
    const { container, rerender } = render(<CieloAnimado code={63} seed="Ciudad A" wind={10} />);
    const before = container.innerHTML;
    rerender(<CieloAnimado code={63} seed="Ciudad A" wind={10} />);
    expect(container.innerHTML).toBe(before);
    rerender(<CieloAnimado code={63} seed="Ciudad B" wind={10} />);
    expect(container.innerHTML).not.toBe(before);
  });

  test('la ráfaga suma gotas, copos, estrella fugaz o un rayo, y al acabar se van', () => {
    const rain = render(<CieloAnimado code={63} />);
    expect(q(rain.container, '.esc-gota')).toBe(16);
    rain.rerender(<CieloAnimado code={63} rafaga />);
    expect(q(rain.container, '.esc-gota')).toBe(32);
    expect(rain.container.firstChild.className).toMatch('rafaga');
    rain.rerender(<CieloAnimado code={63} />);
    expect(q(rain.container, '.esc-gota')).toBe(16);

    const snow = render(<CieloAnimado code={71} rafaga />).container;
    expect(q(snow, '.esc-copo')).toBe(16);

    const stars = render(<CieloAnimado code={0} phase="night" rafaga />).container;
    expect(q(stars, '.esc-fugaz')).toBe(1);

    const storm = render(<CieloAnimado code={95} rafaga />).container;
    expect(q(storm, '.esc-destello.esc-ya')).toBe(1);
    expect(q(storm, '.esc-rayo.esc-ya')).toBe(1);
  });

  test('fuera de pantalla las animaciones se pausan', () => {
    let notify;
    vi.stubGlobal('IntersectionObserver', class {
      constructor(cb) { notify = cb; }
      observe() {}
      disconnect() {}
    });
    try {
      const { container } = render(<CieloAnimado code={61} />);
      expect(container.firstChild.hasAttribute('data-pausa')).toBe(false);
      act(() => notify([{ isIntersecting: false }]));
      expect(container.firstChild.hasAttribute('data-pausa')).toBe(true);
      act(() => notify([{ isIntersecting: true }]));
      expect(container.firstChild.hasAttribute('data-pausa')).toBe(false);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

// jsdom does not apply the CSS: the reduced-motion block is read from the source, as HeartRain.test does
describe('movimiento reducido (CSS)', () => {
  const css = readFileSync(path.join(__dirname, 'CieloAnimado.css'), 'utf8');
  const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));

  test('para todas las animaciones de la escena y quita el destello, el rayo y la fugaz', () => {
    expect(block).toMatch(/\.cielo-anim \*[^{]*\{ animation: none !important; \}/);
    expect(block).toMatch(/\.esc-destello, \.esc-rayo, \.esc-fugaz \{ display: none; \}/);
  });

  test('deja un fotograma quieto: gotas, copos y granizo donde dice su y, solo los 3 primeros', () => {
    expect(block).toMatch(/\.esc-gota, \.esc-copo, \.esc-granizo \{ top: var\(--y\); transform: none; \}/);
    expect(block).toMatch(/\.esc-gota:nth-child\(n\+4\)[^{]*\{ display: none; \}/);
  });
});

describe('TarjetaTiempo, el toque', () => {
  const theme = { container: 'bg-linear-to-br/srgb from-slate-300 to-emerald-100', dark: false };
  const w = { city: 'Ciudad A', temp: 14, feels: 13, humidity: 80, wind: 12, code: 63, phase: 'day', tomorrow: { code: 0, max: 21, min: 9 } };
  const card = (props = {}) => (
    <TarjetaTiempo who="🍪" label="Novia" w={{ ...w, ...props }} theme={theme} words="lluvia" localTime="12:30" />
  );

  test('es un botón con el tiempo dicho en palabras y la previsión de mañana por abrir', () => {
    render(card());
    const btn = screen.getByRole('button', { name: 'El tiempo de Novia en Ciudad A: lluvia, 14 grados. Ver mañana' });
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.querySelector('.cielo-anim')).not.toBeNull();
    expect(btn.querySelector('.cielo-fondo')).not.toBeNull();
    expect(btn.textContent).not.toMatch('Mañana');
  });

  test('al tocar sale la ráfaga dos segundos y se abre mañana; otro toque lo cierra', () => {
    vi.useFakeTimers();
    render(card());
    const btn = screen.getByRole('button');
    const sky = () => btn.querySelector('.cielo-anim');
    fireEvent.click(btn);
    expect(sky().className).toMatch('rafaga');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    expect(btn.textContent).toMatch('Mañana · ☀️ 21°/9°');
    expect(btn.getAttribute('aria-label')).toMatch('Mañana despejado, máxima 21 grados, mínima 9. Ocultar mañana');
    act(() => { vi.advanceTimersByTime(1900); });
    expect(sky().className).toMatch('rafaga');
    act(() => { vi.advanceTimersByTime(200); });
    expect(sky().className).not.toMatch('rafaga');
    expect(btn.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(btn);
    expect(btn.getAttribute('aria-expanded')).toBe('false');
    expect(btn.textContent).not.toMatch('Mañana');
  });

  test('un segundo toque en plena ráfaga la alarga en vez de cortarla', () => {
    vi.useFakeTimers();
    render(card());
    const btn = screen.getByRole('button');
    fireEvent.click(btn);
    act(() => { vi.advanceTimersByTime(1500); });
    fireEvent.click(btn);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(btn.querySelector('.cielo-anim').className).toMatch('rafaga');
    act(() => { vi.advanceTimersByTime(600); });
    expect(btn.querySelector('.cielo-anim').className).not.toMatch('rafaga');
  });

  test('con Enter y con espacio también, y sin mañana no anuncia que se abre', () => {
    render(card({ tomorrow: null }));
    const btn = screen.getByRole('button', { name: 'El tiempo de Novia en Ciudad A: lluvia, 14 grados' });
    expect(btn.hasAttribute('aria-expanded')).toBe(false);
    fireEvent.keyDown(btn, { key: 'Enter' });
    expect(btn.querySelector('.cielo-anim').className).toMatch('rafaga');
    expect(fireEvent.keyDown(btn, { key: ' ' })).toBe(false); // handled: the page does not scroll
    expect(fireEvent.keyDown(btn, { key: 'a' })).toBe(true);
    expect(btn.textContent).not.toMatch('Mañana');
  });

  test('vibra 30 ms donde se puede', () => {
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    try {
      render(card());
      fireEvent.click(screen.getByRole('button'));
      expect(vibrate).toHaveBeenCalledWith(30);
    } finally {
      delete navigator.vibrate;
    }
  });

  test('con movimiento reducido el toque solo abre mañana: ni ráfaga ni vibración', () => {
    reducedMotion(true);
    const vibrate = vi.fn();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    try {
      render(card());
      const btn = screen.getByRole('button');
      fireEvent.click(btn);
      expect(btn.querySelector('.cielo-anim').className).not.toMatch('rafaga');
      expect(btn.getAttribute('aria-expanded')).toBe('true');
      expect(vibrate).not.toHaveBeenCalled();
    } finally {
      delete navigator.vibrate;
    }
  });
});
