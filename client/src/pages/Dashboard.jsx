import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { listenEvents } from '../lib/calendar';
import Countdown from '../components/Countdown';
import RandomPhoto from '../components/RandomPhoto';
import { db } from '../lib/firebase';
import { ANNIVERSARY, timeBetween } from '../lib/together';
import { nextSpecialEvents } from '../lib/specialDays';
import { fetchCityWeather, weatherEmoji, weatherType } from '../lib/weather';

export default function Dashboard() {
  const navigate = useNavigate();
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [eventsError, setEventsError] = useState(false);
  const [eventsKey, setEventsKey] = useState(0); // bump to subscribe again after an error

  // Weather state
  const [weatherNovio, setWeatherNovio] = useState(null);
  const [weatherNovia, setWeatherNovia] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(true);

  // Anniversary date (November 24, 2024, local time): ANNIVERSARY in lib/together

  const timeTogether = useMemo(() => timeBetween(ANNIVERSARY), []);

  useEffect(() => {
    let cancelled = false;
    console.log('🔄 Dashboard: Subscribing to events');
    setLoading(true);
    const byStart = (a, b) => {
      const dateA = a.start?.toDate ? a.start.toDate() : new Date(0);
      const dateB = b.start?.toDate ? b.start.toDate() : new Date(0);
      return dateA - dateB;
    };
    const showSpecialsOnly = () => {
      if (cancelled) return;
      setEvents(nextSpecialEvents().sort(byStart));
      setLoading(false);
    };
    const pairId = localStorage.getItem('pairId');
    if (!pairId) {
      showSpecialsOnly();
      return () => { cancelled = true; };
    }
    // Sync unsubscribe; without a session yet it reports an error but still subscribes when the session arrives
    const unsub = listenEvents(pairId, { futureOnly: true, max: 100 }, (list) => {
      const allEvents = [...list, ...nextSpecialEvents()].sort(byStart);
      if (!cancelled) {
        console.log('✅ Dashboard: Events updated', allEvents.length, 'events');
        setEvents(allEvents);
        setEventsError(false);
        setLoading(false);
      }
    }, (error) => {
      console.error('Dashboard subscribe error:', error);
      showSpecialsOnly();
      if (!cancelled) setEventsError(true);
    });
    return () => { cancelled = true; try { unsub(); } catch {} };
  }, [eventsKey]);

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

  // Decide themed background colors (pastel gradients) based on condition and phase
  function getWeatherTheme(w) {
    const code = w?.code ?? -1;
    const phase = w?.phase || 'day'; // dawn | day | dusk | night

    // Map WMO code to high-level condition
    const type = weatherType(code);

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
          {eventsError ? (
            <button type="button" onClick={() => { setEventsError(false); setEventsKey((k) => k + 1); }} className="btn-link text-sm text-rose-600">
              No se pudo cargar. Reintentar
            </button>
          ) : (
            <Link to="/calendar" className="btn-link text-sm">Ver calendario</Link>
          )}
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
