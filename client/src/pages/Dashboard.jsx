import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listenEvents } from '../lib/calendar';
import Countdown from '../components/Countdown';
import RandomPhoto from '../components/RandomPhoto';
import { db } from '../lib/firebase';

export default function Dashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

  // Weather state
  const [weatherNovio, setWeatherNovio] = useState(null);
  const [weatherNovia, setWeatherNovia] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  // Hardcoded anniversary date: November 24, 2024
  const anniv = '2024-11-24';

  // Generate automatic special events (only next occurrence of each type)
  const generateSpecialEvents = () => {
    const specialEvents = [];
    const now = new Date();
    const anniversaryDate = new Date(2024, 10, 24); // November 24, 2024
    
    // Find next monthiversary/anniversary (24th of next month)
    let nextMonthiversary = null;
    for (let i = 0; i < 24; i++) { // Look ahead 24 months
      const testDate = new Date(now.getFullYear(), now.getMonth() + i, 24);
      if (testDate > now && testDate >= anniversaryDate) {
        const isRealAnniversary = testDate.getMonth() === 10; // November
        
        // Calculate months since anniversary
        const yearsDiff = testDate.getFullYear() - anniversaryDate.getFullYear();
        const monthsDiff = testDate.getMonth() - anniversaryDate.getMonth();
        const totalMonths = yearsDiff * 12 + monthsDiff;
        
        if (totalMonths > 0) {
          let title = '';
          if (totalMonths >= 12) {
            const years = Math.floor(totalMonths / 12);
            const remainingMonths = totalMonths % 12;
            if (remainingMonths === 0) {
              title = `${years} ${years === 1 ? 'año' : 'años'} juntos`;
            } else {
              title = `${years} ${years === 1 ? 'año' : 'años'} y ${remainingMonths} ${remainingMonths === 1 ? 'mes' : 'meses'} juntos`;
            }
          } else {
            title = `${totalMonths} ${totalMonths === 1 ? 'mes' : 'meses'} juntos`;
          }
          
          if (isRealAnniversary) {
            title = `¡Aniversario! ${title}`;
          } else {
            title = `¡Mesiversario! ${title}`;
          }
          
          nextMonthiversary = {
            id: `anniversary-${testDate.getFullYear()}-${testDate.getMonth()}`,
            title,
            start: { toDate: () => testDate },
            location: '',
            eventType: 'conjunto',
            isSpecialEvent: true,
            specialType: isRealAnniversary ? 'anniversary' : 'monthiversary'
          };
          break;
        }
      }
    }
    
    if (nextMonthiversary) {
      specialEvents.push(nextMonthiversary);
    }
    
    // Find next Lucy's birthday (April 21)
    let nextLucyBirthday = null;
    for (let year = now.getFullYear(); year <= now.getFullYear() + 1; year++) {
      const lucyBirthday = new Date(year, 3, 21); // April 21
      if (lucyBirthday > now) {
        const lucyAge = year - 2003;
        if (lucyAge > 0) {
          nextLucyBirthday = {
            id: `lucy-birthday-${year}`,
            title: `¡Cumpleaños de Lucy! ${lucyAge} años`,
            start: { toDate: () => lucyBirthday },
            location: '',
            eventType: 'lucy-birthday',
            isSpecialEvent: true,
            specialType: 'birthday'
          };
          break;
        }
      }
    }
    
    if (nextLucyBirthday) {
      specialEvents.push(nextLucyBirthday);
    }
    
    // Find next Sebas's birthday (November 4)
    let nextSebasBirthday = null;
    for (let year = now.getFullYear(); year <= now.getFullYear() + 1; year++) {
      const sebasBirthday = new Date(year, 10, 4); // November 4
      if (sebasBirthday > now) {
        const sebasAge = year - 1998;
        if (sebasAge > 0) {
          nextSebasBirthday = {
            id: `sebas-birthday-${year}`,
            title: `¡Cumpleaños de Sebas! ${sebasAge} años`,
            start: { toDate: () => sebasBirthday },
            location: '',
            eventType: 'sebas-birthday',
            isSpecialEvent: true,
            specialType: 'birthday'
          };
          break;
        }
      }
    }
    
    if (nextSebasBirthday) {
      specialEvents.push(nextSebasBirthday);
    }
    
    return specialEvents;
  };

  const timeTogether = useMemo(() => {
    const start = new Date(anniv);
    const now = new Date();

    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();

    if (days < 0) {
      months--;
      const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      days += lastMonth.getDate();
    }

    if (months < 0) {
      years--;
      months += 12;
    }

    return { years, months, days };
  }, [anniv]);

  useEffect(() => {
    let cancelled = false;
    let unsub = () => {};
    console.log('🔄 Dashboard: Subscribing to events');
    setLoading(true);
    (async () => {
      try {
        const pairId = localStorage.getItem('pairId');
        if (!pairId) {
          const specials = generateSpecialEvents();
          if (!cancelled) {
            specials.sort((a, b) => {
              const dateA = a.start?.toDate ? a.start.toDate() : new Date(0);
              const dateB = b.start?.toDate ? b.start.toDate() : new Date(0);
              return dateA - dateB;
            });
            setEvents(specials);
            setLoading(false);
          }
          return;
        }
        unsub = await listenEvents(pairId, { futureOnly: true, max: 100 }, (list) => {
          const specialEvents = generateSpecialEvents();
          const allEvents = [...list, ...specialEvents];
          allEvents.sort((a, b) => {
            const dateA = a.start?.toDate ? a.start.toDate() : new Date(0);
            const dateB = b.start?.toDate ? b.start.toDate() : new Date(0);
            return dateA - dateB;
          });
          if (!cancelled) {
            console.log('✅ Dashboard: Events updated', allEvents.length, 'events');
            setEvents(allEvents);
            setLoading(false);
          }
        });
      } catch (error) {
        console.error('Dashboard subscribe error:', error);
        const specials = generateSpecialEvents();
        specials.sort((a, b) => {
          const dateA = a.start?.toDate ? a.start.toDate() : new Date(0);
          const dateB = b.start?.toDate ? b.start.toDate() : new Date(0);
          return dateA - dateB;
        });
        if (!cancelled) {
          setEvents(specials);
          setLoading(false);
        }
      }
    })();
    return () => { cancelled = true; try { unsub(); } catch {} };
  }, []);

  // QA controls removed; live data only

  const nextEvent = useMemo(() => {
    // Only show next "conjunto" event for countdown
    const conjuntoEvents = events.filter(event => event.eventType === 'conjunto');
    const result = conjuntoEvents.length > 0 ? conjuntoEvents[0] : null;
    console.log('🎯 Dashboard: nextEvent changed', result ? result.title : 'null');
    return result;
  }, [events]);

  const nextMeetEvent = useMemo(() => {
    // Next event explicitly marked as "¿Nos vemos?"
    const meets = events.filter(ev => ev.seeEachOther === true);
    return meets.length > 0 ? meets[0] : null;
  }, [events]);

  const hideConjunto = useMemo(() => {
    if (!nextEvent || !nextMeetEvent) return false;
    if (nextEvent.id && nextMeetEvent.id) return nextEvent.id === nextMeetEvent.id;
    const a = nextEvent.start?.toDate?.();
    const b = nextMeetEvent.start?.toDate?.();
    return !!(a && b && a.getTime() === b.getTime());
  }, [nextEvent, nextMeetEvent]);

  // --- Weather helpers ---
  const geocodeCache = useMemo(() => new Map(), []);
  function withTimeout(promise, ms = 6000) {
    return new Promise((resolve) => {
      let settled = false;
      const t = setTimeout(() => { if (!settled) resolve(null); }, ms);
      promise.then((v) => { settled = true; clearTimeout(t); resolve(v); })
             .catch(() => { settled = true; clearTimeout(t); resolve(null); });
    });
  }
  async function geocodeCity(name) {
    const key = (name || '').trim().toLowerCase();
    if (!key) return null;
    if (geocodeCache.has(key)) return geocodeCache.get(key);
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

  function weatherEmoji(code) {
    if (code === 0) return '☀️';
    if ([1, 2].includes(code)) return '🌤️';
    if (code === 3) return '☁️';
    if ([45, 48].includes(code)) return '🌫️';
    if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return '🌧️';
    if ([71,73,75,77,85,86].includes(code)) return '❄️';
    if ([95,96,99].includes(code)) return '⛈️';
    return '🌡️';
  }

  // Approximate moon phase (0=new, 0.5=full). Returns matching emoji.
  function moonPhaseEmoji(date) {
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

  // Decide themed background colors (pastel gradients) based on condition and phase
  function getWeatherTheme(w) {
    const code = w?.code ?? -1;
    const phase = w?.phase || 'day'; // dawn | day | dusk | night

    // Map WMO code to high-level condition
    const type = (() => {
      if (code === 0) return 'soleado';
      if ([1, 2].includes(code)) return 'parcial';
      if ([3].includes(code)) return 'nublado';
      if ([45, 48].includes(code)) return 'niebla';
      if ([71,73,75,77,85,86].includes(code)) return 'nieve';
      if ([95,96,99].includes(code)) return 'tormenta';
      if ([51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code)) return 'lluvia';
      return 'parcial';
    })();

    // Pastel gradients per user's scheme
    const palettes = {
      soleado: {
        dawn:  'from-rose-200 to-amber-100',        // Rosa melocotón → Amarillo pastel
        day:   'from-sky-200 to-amber-100',         // Azul cielo → Amarillo suave
        dusk:  'from-orange-200 to-violet-200',     // Naranja coral → Lavanda claro
        night: 'from-indigo-800 to-violet-700',     // Azul marino pastel → Lila tenue
      },
      parcial: {
        dawn:  'from-amber-100 to-stone-200',       // Amarillo pálido → Gris cálido
        day:   'from-sky-200 to-slate-200',         // Azul cielo claro → Gris azulado
        dusk:  'from-rose-200 to-purple-100',       // Rosa pastel → Gris lavanda
        night: 'from-slate-800 to-violet-700',      // Azul oscuro → Gris lila
      },
      nublado: {
        dawn:  'from-slate-200 to-rose-100',        // Gris azulado → Rosa muy suave
        day:   'from-gray-200 to-sky-100',          // Gris claro → Azul pastel desaturado
        dusk:  'from-purple-200 to-orange-200',     // Gris lila → Naranja suave
        night: 'from-slate-800 to-gray-700',        // Azul oscuro desaturado → Gris
      },
      lluvia: {
        dawn:  'from-teal-200 to-slate-200',        // Verde agua pastel → Gris azulado
        day:   'from-slate-300 to-emerald-100',     // Azul grisáceo → Verde menta apagado
        dusk:  'from-slate-300 to-violet-200',      // Azul grisáceo → Lila pálido
        night: 'from-cyan-900 to-slate-400',        // Azul petróleo → Azul gris pastel
      },
      tormenta: {
        dawn:  'from-purple-300 to-sky-300',        // Gris púrpura → Azul eléctrico pastel
        day:   'from-slate-300 to-purple-300',      // Gris azulado → Morado pastel
        dusk:  'from-orange-200 to-violet-700',     // Naranja apagado → Gris oscuro lila
        night: 'from-indigo-900 to-purple-800',     // Azul marino → Púrpura oscuro
      },
      nieve: {
        dawn:  'from-sky-100 to-rose-100',          // Azul hielo → Rosa muy pálido
        day:   'from-white to-sky-100',             // Blanco → Azul hielo pastel
        dusk:  'from-violet-200 to-sky-100',        // Lila suave → Azul claro
        night: 'from-blue-900 to-slate-600',        // Azul glaciar → Gris azulado
      },
      niebla: {
        dawn:  'from-zinc-100 to-rose-100',         // Gris blanquecino → Rosa suave
        day:   'from-gray-200 to-emerald-100',      // Gris claro → Verde menta pálido
        dusk:  'from-purple-200 to-amber-200',      // Gris lila → Amarillo apagado
        night: 'from-slate-600 to-violet-200',      // Gris azulado → Lila tenue
      },
    };

    const key = palettes[type] ? palettes[type][phase] : 'from-slate-100 to-gray-100';
    const container = `bg-gradient-to-br ${key}`;
    const dark = phase === 'night';
    return { container, dark };
  }

  // Fetch weather once on dashboard load
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setWeatherLoading(true);
        const pairId = localStorage.getItem('pairId') || '';

        // Attempt Firestore read for locations
        let cities = { novio: '', novia: '' };
        if (pairId && db) {
          try {
            const f = await import('firebase/firestore');
            const col = f.collection(db, 'pairs', pairId, 'locations');
            const snap = await f.getDocs(col);
            snap.forEach((doc) => {
              if (doc.id === 'novio') cities.novio = (doc.data()?.city || '').trim();
              if (doc.id === 'novia') cities.novia = (doc.data()?.city || '').trim();
            });
          } catch (e) {
            // ignore, will fallback to localStorage
          }
        }

        // Fallback to local cache if needed
        const storageKey = (role) => `pair_${pairId || 'default'}_${role}_location`;
        try {
          if (!cities.novio) {
            const raw = localStorage.getItem(storageKey('novio'));
            const parsed = raw ? JSON.parse(raw) : {};
            cities.novio = (parsed.city || '').trim();
          }
        } catch {}
        try {
          if (!cities.novia) {
            const raw = localStorage.getItem(storageKey('novia'));
            const parsed = raw ? JSON.parse(raw) : {};
            cities.novia = (parsed.city || '').trim();
          }
        } catch {}

        // Geocode and fetch weather for each city
        async function fetchCityWeather(city) {
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

          // Determine day phase
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
            phase,
            moon: phase === 'night' ? moonPhaseEmoji(now) : null,
          };
        }

        const [wNovio, wNovia] = await Promise.all([
          fetchCityWeather(cities.novio),
          fetchCityWeather(cities.novia),
        ]);

        if (!cancelled) {
          setWeatherNovio(wNovio);
          setWeatherNovia(wNovia);
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  function renderWeatherCard(label, w) {
    const loadingState = (
      <div className="relative rounded-lg bg-gradient-to-br from-slate-50 to-gray-100 p-3 overflow-hidden">
        <div className="flex items-center justify-between mb-1">
          <div className="text-xs text-gray-500">{label}</div>
          <div className="text-xl">⏳</div>
        </div>
        <div className="h-6 w-16 bg-gray-200 rounded animate-pulse mb-1" />
        <div className="h-3 w-24 bg-gray-200 rounded animate-pulse" />
      </div>
    );
    if (weatherLoading && !w) return loadingState;
    if (!w) {
      return (
        <div className="relative rounded-lg bg-gradient-to-br from-slate-50 to-gray-100 p-3 overflow-hidden">
          <div className="flex items-center justify-between mb-1">
            <div className="text-xs text-gray-500">{label}</div>
            <div className="text-xl">🌈</div>
          </div>
          <div className="text-sm text-gray-600">Sin ubicación</div>
          <div className="text-[11px] text-gray-500">Actualiza en Mapa</div>
        </div>
      );
    }
    const w2 = w;
    const theme = getWeatherTheme(w2);
    const muted = theme.dark ? 'text-gray-300' : 'text-gray-600';
    const title = theme.dark ? 'text-white' : 'text-gray-800';
    return (
      <div className={`relative rounded-lg p-3 overflow-hidden ${theme.container} animate-gradient-subtle`}>
        <div className="relative flex items-center justify-between mb-1">
          <div className={`text-xs ${muted}`}>{label}</div>
          <div className="text-xl flex items-center gap-1">
            {w2.phase === 'night' && <span>{w2.moon || '🌙'}</span>}
            <span>{weatherEmoji(w2.code ?? -1)}</span>
          </div>
        </div>
        <div className={`relative text-xl font-semibold ${title}`}>{w2.temp != null ? `${w2.temp}°` : '—°'}</div>
        <div className={`relative text-[11px] ${muted} flex flex-col gap-0.5`}>
          <div>Sensación {w2.feels != null ? `${w2.feels}°` : '—°'}</div>
          <div>💧 {w2.humidity != null ? `${w2.humidity}%` : '—%'}</div>
          <div>🌬️ {w2.wind != null ? `${w2.wind} km/h` : '— km/h'}</div>
        </div>
        <div className={`relative text-xs truncate font-semibold ${title}`}>{w2.city || '—'}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-rose-600">Inicio</h2>
      {timeTogether ? (
        <div className="card">
          <div className="text-sm text-gray-600 mb-2">Llevamos juntos</div>
          <div className="flex justify-around gap-2 p-3 bg-rose-50/50 rounded-lg">
            {[ 
              { value: timeTogether.years, label: 'Año', plural: 'Años' },
              { value: timeTogether.months, label: 'Mes', plural: 'Meses' },
              { value: timeTogether.days, label: 'Día', plural: 'Días' } 
            ].map(({ value, label, plural }) => (
              (timeTogether.years > 0 || label !== 'Año') && // Show years only if > 0
              (timeTogether.months > 0 || label !== 'Mes' || timeTogether.years > 0) && // Show months if > 0 or if years are shown
              <div key={label} className="text-center">
                <div className="text-2xl md:text-3xl font-bold text-rose-600">{String(value).padStart(2, '0')}</div>
                <div className="text-xs text-gray-500">{value === 1 ? label : plural}</div>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="card">
          <div className="text-sm text-gray-600">Configura tu aniversario en Ajustes</div>
          <Link to="/settings" className="inline-block mt-2 btn-primary">Ir a Ajustes</Link>
        </div>
      )}

      {nextMeetEvent && (
        <div className="card">
          <div className="text-sm text-gray-600 mb-2">Próxima vez que nos vemos</div>
          <div className="text-lg font-semibold text-gray-900 mb-2">{nextMeetEvent.title}</div>
          <Countdown toDate={nextMeetEvent.start.toDate()} />
        </div>
      )}

      {!hideConjunto && (
      <div className="card">
        <div className="text-sm text-gray-600 mb-2">Próximo evento conjunto</div>
        {nextEvent ? (
          <>
            <div className="text-lg font-semibold text-gray-900 mb-2">{nextEvent.title}</div>
            <Countdown toDate={nextEvent.start.toDate()} />
          </>
        ) : (
          <>
            <div className="text-lg font-semibold text-gray-900 mb-2">
              {loading ? (
                <div className="animate-pulse bg-gray-200 h-6 rounded w-48"></div>
              ) : (
                "No hay eventos próximos"
              )}
            </div>
            <div className="flex justify-around gap-2 p-3 bg-rose-50/50 rounded-lg">
              {loading ? (
                <>
                  <div className="text-center">
                    <div className="animate-pulse bg-gray-200 h-8 w-8 rounded mb-1"></div>
                    <div className="animate-pulse bg-gray-200 h-3 w-8 rounded"></div>
                  </div>
                  <div className="text-center">
                    <div className="animate-pulse bg-gray-200 h-8 w-8 rounded mb-1"></div>
                    <div className="animate-pulse bg-gray-200 h-3 w-8 rounded"></div>
                  </div>
                  <div className="text-center">
                    <div className="animate-pulse bg-gray-200 h-8 w-8 rounded mb-1"></div>
                    <div className="animate-pulse bg-gray-200 h-3 w-8 rounded"></div>
                  </div>
                  <div className="text-center">
                    <div className="animate-pulse bg-gray-200 h-8 w-8 rounded mb-1"></div>
                    <div className="animate-pulse bg-gray-200 h-3 w-8 rounded"></div>
                  </div>
                </>
              ) : (
                <div className="text-center text-gray-500">
                  <span>Sin eventos programados</span>
                </div>
              )}
            </div>
          </>
        )}
      </div>
      )}

      {/* Weather cards: two side-by-side minimal cards */}
      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <div className="text-sm text-gray-600">Clima ahora</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          {renderWeatherCard('Novio', weatherNovio)}
          {renderWeatherCard('Novia', weatherNovia)}
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm text-gray-600">Próximos eventos</h3>
          <Link to="/calendar" className="btn-link text-sm">Ver calendario</Link>
        </div>
        <div className="min-h-[140px]">
          {loading ? (
            <div className="space-y-2">
              <div className="text-sm flex items-center gap-2">
                <div className="animate-pulse bg-gray-200 h-4 rounded flex-1"></div>
                <div className="animate-pulse bg-gray-200 w-2 h-2 rounded-full"></div>
              </div>
              <div className="animate-pulse bg-gray-200 h-3 rounded w-20"></div>
              <div className="text-sm flex items-center gap-2 mt-2">
                <div className="animate-pulse bg-gray-200 h-4 rounded flex-1"></div>
                <div className="animate-pulse bg-gray-200 w-2 h-2 rounded-full"></div>
              </div>
              <div className="animate-pulse bg-gray-200 h-3 rounded w-24"></div>
              <div className="text-sm flex items-center gap-2 mt-2">
                <div className="animate-pulse bg-gray-200 h-4 rounded flex-1"></div>
                <div className="animate-pulse bg-gray-200 w-2 h-2 rounded-full"></div>
              </div>
              <div className="animate-pulse bg-gray-200 h-3 rounded w-16"></div>
            </div>
          ) : events.length > 0 ? (
            <ul className="space-y-2">
              {events.slice(0, 5).map(ev => {
                const d = ev.start?.toDate?.();
                const when = d ? d.toLocaleDateString('es-ES', { month: 'long', day: 'numeric' }) : '';
                
                // Get event type color
                let eventTypeColor = 'bg-rose-500'; // Default: conjunto (pink)
                if (ev.eventType === 'novio') {
                  eventTypeColor = 'bg-yellow-500';
                } else if (ev.eventType === 'novia') {
                  eventTypeColor = 'bg-purple-500';
                } else if (ev.eventType === 'sebas-birthday') {
                  eventTypeColor = 'bg-yellow-500'; // Sebas birthday: yellow
                } else if (ev.eventType === 'lucy-birthday') {
                  eventTypeColor = 'bg-purple-400'; // Lucy birthday: lilac
                } else if (ev.eventType === 'conjunto' && ev.isSpecialEvent) {
                  eventTypeColor = 'bg-rose-500'; // Anniversary/monthiversary: pink
                }
                
                const handleClick = () => {
                  if (!d) return;
                  const y = d.getFullYear();
                  const m = d.getMonth(); // 0-indexed
                  const day = d.getDate();
                  navigate(`/calendar?y=${y}&m=${m}&d=${day}`);
                };

                return (
                  <li
                    key={ev.id}
                    className="text-sm flex items-center gap-2 cursor-pointer hover:bg-gray-50 rounded px-2 -mx-2"
                    onClick={handleClick}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-800 truncate">{ev.title}</span>
                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${eventTypeColor}`}></div>
                      </div>
                      <span className="text-xs text-gray-500">{when}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-gray-500">No hay próximos eventos. ¡Crea el primero!</p>
          )}
        </div>
      </div>

      <RandomPhoto />

    </div>
  );
}
