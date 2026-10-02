// Geocoding and current weather from Open-Meteo, shared by Inicio and Mapa

// Resolves to the value, or to null if it rejects or takes longer than ms
export function withTimeout(promise, ms = 6000) {
  return new Promise((resolve) => {
    let settled = false;
    const t = setTimeout(() => { if (!settled) resolve(null); }, ms);
    promise.then((v) => { settled = true; clearTimeout(t); resolve(v); })
           .catch(() => { settled = true; clearTimeout(t); resolve(null); });
  });
}

// Successful lookups only, for the whole session: a failed one is tried again next time
const geocodeCache = new Map();

// { lat, lon } of a city name, or null
export async function geocodeCity(name) {
  const key = (name || '').trim().toLowerCase();
  if (!key) return null;
  if (geocodeCache.has(key)) return geocodeCache.get(key);
  // Primary: Open-Meteo
  const url1 = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(key)}&count=1&language=es&format=json`;
  const p1 = (async () => {
    const res = await fetch(url1, { mode: 'cors' });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.results?.[0];
    if (!r) return null;
    return { lat: r.latitude, lon: r.longitude };
  })();
  let out = await withTimeout(p1, 6000);
  // Fallback: maps.co (Nominatim proxy) if primary fails/times out
  if (!out) {
    const url2 = `https://geocode.maps.co/search?q=${encodeURIComponent(key)}&format=json&limit=1`;
    const p2 = (async () => {
      const res = await fetch(url2, { mode: 'cors' });
      if (!res.ok) return null;
      const data = await res.json();
      const r = Array.isArray(data) ? data[0] : null;
      if (!r) return null;
      const lat = parseFloat(r.lat); const lon = parseFloat(r.lon);
      if (Number.isFinite(lat) && Number.isFinite(lon)) return { lat, lon };
      return null;
    })();
    out = await withTimeout(p2, 6000);
  }
  if (out) geocodeCache.set(key, out);
  return out;
}

export function weatherEmoji(code) {
  if (code === 0) return '☀️';
  if ([1, 2].includes(code)) return '🌤️';
  if (code === 3) return '☁️';
  if ([45, 48].includes(code)) return '🌫️';
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
  if ([71,73,75,77,85,86].includes(code)) return '❄️';
  if ([95,96,97,98,99].includes(code)) return '⛈️';
  return '🌡️';
}

// Approximate moon phase (0=new, 0.5=full). Returns matching emoji.
export function moonPhaseEmoji(date) {
  try {
    const d = new Date(date);
    // Simple phase approximation
    const synodicMonth = 29.53058867;
    const knownNewMoon = new Date('2000-01-06T18:14:00Z').getTime();
    const daysSince = (d.getTime() - knownNewMoon) / (1000 * 60 * 60 * 24);
    const phase = ((daysSince % synodicMonth) + synodicMonth) % synodicMonth;
    const frac = phase / synodicMonth; // 0..1
    if (frac < 0.0625) return '🌑';            // New
    if (frac < 0.1875) return '🌒';            // Waxing crescent
    if (frac < 0.3125) return '🌓';            // First quarter
    if (frac < 0.4375) return '🌔';            // Waxing gibbous
    if (frac < 0.5625) return '🌕';            // Full
    if (frac < 0.6875) return '🌖';            // Waning gibbous
    if (frac < 0.8125) return '🌗';            // Last quarter
    if (frac < 0.9375) return '🌘';            // Waning crescent
    return '🌑';
  } catch { return '🌙'; }
}

// WMO code to the high-level condition the sky colours are keyed by
export function weatherType(code) {
  if (code === 0) return 'soleado';
  if ([1, 2].includes(code)) return 'parcial';
  if ([3].includes(code)) return 'nublado';
  if ([45, 48].includes(code)) return 'niebla';
  if ([71,73,75,77,85,86].includes(code)) return 'nieve';
  // 95-99: every WMO thunderstorm (Open-Meteo documents 95, 96 and 99; 97 is a heavy one, 98 with dust)
  if ([95,96,97,98,99].includes(code)) return 'tormenta';
  if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'lluvia';
  return 'parcial';
}

// dawn | day | dusk | night: dawn and dusk are 45 minutes either side of sunrise and sunset
export function dayPhase(now, sunrise, sunset) {
  let phase = 'day';
  if (sunrise && sunset) {
    const marginMs = 45 * 60 * 1000; // 45 minutes window for dawn/dusk
    if (now < new Date(sunrise.getTime() - marginMs) || now >= new Date(sunset.getTime() + marginMs)) {
      phase = 'night';
    } else if (now >= new Date(sunrise.getTime() - marginMs) && now < new Date(sunrise.getTime() + marginMs)) {
      phase = 'dawn';
    } else if (now >= new Date(sunset.getTime() - marginMs) && now < new Date(sunset.getTime() + marginMs)) {
      phase = 'dusk';
    } else {
      phase = 'day';
    }
  }
  return phase;
}

// Current weather of a city, or null if it has no name, is not found or the forecast fails
export async function fetchCityWeather(city) {
  if (!city) return null;
  const g = await geocodeCity(city);
  if (!g) return null;
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${g.lat}&longitude=${g.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,weather_code&daily=sunrise,sunset&forecast_days=1&wind_speed_unit=kmh&timezone=auto`;
  const res = await fetch(url, { mode: 'cors' });
  if (!res.ok) return null;
  const data = await res.json();
  const c = data?.current || {};
  const sunriseIso = data?.daily?.sunrise?.[0] || null;
  const sunsetIso = data?.daily?.sunset?.[0] || null;
  const nowIso = c?.time || null;
  const sunrise = sunriseIso ? new Date(sunriseIso) : null;
  const sunset = sunsetIso ? new Date(sunsetIso) : null;
  const now = nowIso ? new Date(nowIso) : new Date();

  const phase = dayPhase(now, sunrise, sunset);

  return {
    city,
    temp: typeof c.temperature_2m === 'number' ? Math.round(c.temperature_2m) : null,
    feels: typeof c.apparent_temperature === 'number' ? Math.round(c.apparent_temperature) : null,
    humidity: typeof c.relative_humidity_2m === 'number' ? Math.round(c.relative_humidity_2m) : null,
    wind: typeof c.wind_speed_10m === 'number' ? Math.round(c.wind_speed_10m) : null,
    code: typeof c.weather_code === 'number' ? c.weather_code : null,
    sunrise: sunriseIso,
    sunset: sunsetIso,
    now: nowIso,
    timezone: data?.timezone || null, // IANA name from timezone=auto, for the city's local time (C8)
    phase,
    moon: phase === 'night' ? moonPhaseEmoji(now) : null,
  };
}
