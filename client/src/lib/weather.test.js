import { dayPhase, fetchCityWeather, geocodeCity, moonPhaseEmoji, weatherEmoji, weatherType, withTimeout } from './weather';

const json = (body, ok = true) => Promise.resolve({ ok, json: () => Promise.resolve(body) });

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('withTimeout', () => {
  test('da el valor si llega a tiempo y null si falla o se pasa', async () => {
    expect(await withTimeout(Promise.resolve(7))).toBe(7);
    expect(await withTimeout(Promise.reject(new Error('x')))).toBeNull();
    vi.useFakeTimers();
    const late = withTimeout(new Promise(() => {}), 6000);
    vi.advanceTimersByTime(6000);
    expect(await late).toBeNull();
  });
});

describe('geocodeCity', () => {
  test('usa Open-Meteo y guarda el resultado para la próxima vez', async () => {
    const fetch = vi.fn(() => json({ results: [{ latitude: 40.4, longitude: -3.7 }] }));
    vi.stubGlobal('fetch', fetch);
    expect(await geocodeCity('  Ciudad Uno ')).toEqual({ lat: 40.4, lon: -3.7 });
    expect(fetch.mock.calls[0][0]).toContain('geocoding-api.open-meteo.com/v1/search?name=ciudad%20uno&');
    expect(await geocodeCity('ciudad uno')).toEqual({ lat: 40.4, lon: -3.7 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  test('si Open-Meteo no la encuentra prueba maps.co', async () => {
    const fetch = vi.fn((url) => (url.includes('open-meteo') ? json({ results: [] }) : json([{ lat: '41.38', lon: '2.17' }])));
    vi.stubGlobal('fetch', fetch);
    expect(await geocodeCity('Ciudad Dos')).toEqual({ lat: 41.38, lon: 2.17 });
    expect(fetch.mock.calls[1][0]).toContain('geocode.maps.co/search?q=ciudad%20dos&');
  });

  test('sin nombre o sin resultado da null y no lo guarda', async () => {
    const fetch = vi.fn(() => json({}, false));
    vi.stubGlobal('fetch', fetch);
    expect(await geocodeCity('  ')).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
    expect(await geocodeCity('Ciudad Tres')).toBeNull();
    expect(await geocodeCity('Ciudad Tres')).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(4);
  });
});

describe('weatherEmoji y weatherType', () => {
  test('cada código WMO tiene su emoji y su tipo de cielo', () => {
    const codes = [0, 1, 3, 45, 61, 71, 95, 999];
    expect(codes.map(weatherEmoji)).toEqual(['☀️', '🌤️', '☁️', '🌫️', '🌧️', '❄️', '⛈️', '🌡️']);
    expect(codes.map(weatherType)).toEqual(['soleado', 'parcial', 'nublado', 'niebla', 'lluvia', 'nieve', 'tormenta', 'parcial']);
  });

  // La tabla entera de Open-Meteo, más 97 (tormenta fuerte), que antes salía «parcial»
  test.each([
    [[0], 'soleado', '☀️'],
    [[1, 2], 'parcial', '🌤️'],
    [[3], 'nublado', '☁️'],
    [[45, 48], 'niebla', '🌫️'],
    [[51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82], 'lluvia', '🌧️'],
    [[71, 73, 75, 77, 85, 86], 'nieve', '❄️'],
    [[95, 96, 97, 98, 99], 'tormenta', '⛈️'],
  ])('%j son %s', (codes, type, emoji) => {
    expect(codes.map(weatherType)).toEqual(codes.map(() => type));
    expect(codes.map(weatherEmoji)).toEqual(codes.map(() => emoji));
  });
});

describe('moonPhaseEmoji', () => {
  test('luna nueva y llena en fechas conocidas', () => {
    expect(moonPhaseEmoji('2000-01-06T18:14:00Z')).toBe('🌑');
    expect(moonPhaseEmoji('2000-01-21T12:00:00Z')).toBe('🌕');
  });
});

describe('dayPhase', () => {
  const sunrise = new Date('2026-10-02T07:00:00Z');
  const sunset = new Date('2026-10-02T19:00:00Z');
  const at = (hhmm) => new Date(`2026-10-02T${hhmm}:00Z`);

  test('alba y atardecer son 45 minutos a cada lado; fuera de eso, día o noche', () => {
    expect(dayPhase(at('06:14'), sunrise, sunset)).toBe('night');
    expect(dayPhase(at('06:15'), sunrise, sunset)).toBe('dawn');
    expect(dayPhase(at('07:44'), sunrise, sunset)).toBe('dawn');
    expect(dayPhase(at('07:45'), sunrise, sunset)).toBe('day');
    expect(dayPhase(at('18:15'), sunrise, sunset)).toBe('dusk');
    expect(dayPhase(at('19:44'), sunrise, sunset)).toBe('dusk');
    expect(dayPhase(at('19:45'), sunrise, sunset)).toBe('night');
  });

  test('sin salida o puesta de sol es de día', () => {
    expect(dayPhase(at('03:00'), null, sunset)).toBe('day');
  });
});

describe('fetchCityWeather', () => {
  test('redondea los datos y pone la luna solo de noche', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => (url.includes('geocoding')
      ? json({ results: [{ latitude: 1, longitude: 2 }] })
      : json({
        current: { time: '2026-10-02T22:00', temperature_2m: 14.6, apparent_temperature: 13.2, relative_humidity_2m: 80.4, wind_speed_10m: 9.5, weather_code: 0 },
        daily: { sunrise: ['2026-10-02T07:00'], sunset: ['2026-10-02T19:00'] },
      }))));
    const w = await fetchCityWeather('Ciudad Cuatro');
    expect(w).toMatchObject({ city: 'Ciudad Cuatro', temp: 15, feels: 13, humidity: 80, wind: 10, code: 0, phase: 'night' });
    expect(w.moon).toBe(moonPhaseEmoji(new Date('2026-10-02T22:00')));
  });

  test('lleva la zona horaria de la ciudad, o null si la respuesta no la trae', async () => {
    const forecast = (extra) => vi.fn((url) => (url.includes('geocoding')
      ? json({ results: [{ latitude: 1, longitude: 2 }] })
      : json({ current: { time: '2026-10-02T12:00', weather_code: 0 }, ...extra })));
    vi.stubGlobal('fetch', forecast({ timezone: 'Europe/Madrid' }));
    expect((await fetchCityWeather('Ciudad Seis')).timezone).toBe('Europe/Madrid');
    vi.stubGlobal('fetch', forecast({}));
    expect((await fetchCityWeather('Ciudad Seis')).timezone).toBeNull();
  });

  test('sin ciudad, sin coordenadas o con la previsión caída da null', async () => {
    vi.stubGlobal('fetch', vi.fn((url) => (url.includes('geocoding') ? json({ results: [{ latitude: 1, longitude: 2 }] }) : json({}, false))));
    expect(await fetchCityWeather('')).toBeNull();
    expect(await fetchCityWeather('Ciudad Cinco')).toBeNull();
  });
});
