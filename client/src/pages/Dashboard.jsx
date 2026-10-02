import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { listenEvents } from '../lib/calendar';
import Button from '../components/Button';
import Countdown from '../components/Countdown';
import Icon from '../components/Icon';
import RandomPhoto from '../components/RandomPhoto';
import { db } from '../lib/firebase';
import { ANNIVERSARY, timeBetween } from '../lib/together';
import { nextSpecialEvents } from '../lib/specialDays';
import { fetchCityWeather, weatherEmoji, weatherType } from '../lib/weather';
import { ROLE_LABELS } from '../lib/eventTypes';
import {
  BOTH_LABEL, cityTimeText, dayMonthText, eventMark, longDateText, monthTile, shortDateText, skyWords, todayText, togetherWords, whenText,
} from '../lib/inicio';
import './Dashboard.css';

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
  // Cities found for each one (unknown: the locations could not be read). «Sin ubicación» only when there is
  // truly none; offline or with a city and no weather it says so instead
  const [weatherCities, setWeatherCities] = useState({ novio: '', novia: '', unknown: false });
  // Local time of each city (C8): the minute hand moves without asking the network again
  const [clock, setClock] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setClock(new Date()), 30 * 1000);
    return () => clearInterval(t);
  }, []);

  // Latido (C1): local only, it sends nothing. Each tap beats again; the first one lights the heart
  const [beat, setBeat] = useState(0);
  const liked = beat > 0;

  // Anniversary date (November 24, 2024, local time): ANNIVERSARY in lib/together

  const timeTogether = useMemo(() => timeBetween(ANNIVERSARY), []);

  useEffect(() => {
    let cancelled = false;
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
    return conjuntoEvents.length > 0 ? conjuntoEvents[0] : null;
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
    const container = `bg-linear-to-br/srgb ${key}`;
    const dark = phase === 'night';
    return { container, dark, type };
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
            // Falls back to localStorage; without a city there, it is unknown rather than missing
            cities.unknown = true;
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

        // Geocode and fetch weather for each city (offline fetch rejects: that one stays without weather)
        const [wNovio, wNovia] = await Promise.all([
          fetchCityWeather(cities.novio).catch(() => null),
          fetchCityWeather(cities.novia).catch(() => null),
        ]);

        if (!cancelled) {
          setWeatherCities(cities);
          setWeatherNovio(wNovio);
          setWeatherNovia(wNovia);
        }
      } finally {
        if (!cancelled) setWeatherLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // One sky per person: 🫒 is him (novio), 🍪 is her (novia)
  function renderWeatherCard(who, label, w, city) {
    const head = (
      <p className="etiqueta cielo-2 tracking-[0.06em] truncate">{who} {label}</p>
    );
    if (!w) {
      const loadingNow = weatherLoading;
      return (
        <div className="min-w-0 rounded-tarjeta bg-card border border-line px-3.5 pt-3 pb-3.5 flex flex-col gap-0.5">
          <div className="flex items-center justify-between gap-1.5">
            <p className="etiqueta tracking-[0.06em] truncate">{who} {label}</p>
            <span aria-hidden="true" className="text-[18px] leading-none">{loadingNow ? '⏳' : '🌈'}</span>
          </div>
          {loadingNow ? (
            <>
              <span className="hueco block w-16 h-6 rounded-lg my-1" aria-hidden="true" />
              <span className="hueco block w-24 h-3.5 rounded-md" aria-hidden="true" />
              <span className="sr-only">Cargando el tiempo</span>
            </>
          ) : city || weatherCities.unknown || navigator.onLine === false ? (
            <>
              <p className="text-[14px] font-semibold text-ink">{navigator.onLine === false ? 'Sin conexión' : 'Sin datos del tiempo'}</p>
              <p className="text-[12px] text-ink-2 truncate">{city || 'Se verá al volver la conexión'}</p>
            </>
          ) : (
            <>
              <p className="text-[14px] font-semibold text-ink">Sin ubicación</p>
              <p className="text-[12px] text-ink-2">Actualiza en Mapa</p>
            </>
          )}
        </div>
      );
    }
    const theme = getWeatherTheme(w);
    const words = skyWords(theme.type);
    const localTime = cityTimeText(w.timezone, clock);
    return (
      <div className={`cielo min-w-0 rounded-tarjeta px-3.5 pt-3 pb-3.5 flex flex-col gap-0.5 ${theme.dark ? 'de-noche' : ''}`}>
        <div aria-hidden="true" className={`cielo-fondo ${theme.container} animate-gradient-subtle`} />
        <div className="flex items-center justify-between gap-1.5">
          {head}
          {/* Moon at night and the weather emoji, both (F4) */}
          <span className="text-[18px] leading-none flex items-center gap-1 shrink-0">
            {w.phase === 'night' && <span>{w.moon || '🌙'}</span>}
            <span>{weatherEmoji(w.code ?? -1)}</span>
          </span>
        </div>
        <p className="num text-[24px] font-semibold tracking-[-0.01em]">{w.temp != null ? `${w.temp}°` : '—°'}</p>
        {words && <p className="text-[14px] font-semibold">{words}</p>}
        <p className="num text-[12px] cielo-2">Sensación {w.feels != null ? `${w.feels}°` : '—°'} · 💧 {w.humidity != null ? `${w.humidity} %` : '— %'}</p>
        <p className="num text-[12px] cielo-2">🌬️ {w.wind != null ? `${w.wind} km/h` : '— km/h'}</p>
        <p className="text-[13px] font-semibold truncate">{w.city || '—'}{localTime && <span className="num"> · {localTime}</span>}</p>
      </div>
    );
  }

  const words = timeTogether ? togetherWords(timeTogether) : [];
  const meetDate = nextMeetEvent?.start?.toDate?.();
  const nextDate = nextEvent?.start?.toDate?.();

  return (
    <div className="max-w-(--breakpoint-md) mx-auto w-full pb-2">
      <p className="etiqueta px-5 pt-1">{todayText()}</p>

      {timeTogether ? (
        <section aria-label="Tiempo juntos" className="flex items-end gap-2 pl-5 pr-3 pt-2.5 pb-5">
          <div className="flex-1 min-w-0 flex flex-col gap-1.5">
            <p className="text-[15px] text-ink-2">Llevamos juntos</p>
            <h1 className="serif text-[42px] leading-[1.04] font-normal tracking-[-0.015em] flex flex-wrap gap-x-2.5">
              {words.map((w, i) => (
                <span key={i} className={i === words.length - 1 ? `italic text-accent-ink brillo ${liked ? 'on' : ''}` : ''}>{w}</span>
              ))}
            </h1>
          </div>
          <button
            type="button"
            className={`latido w-12 h-12 rounded-full flex items-center justify-center flex-none ${beat === 0 ? '' : beat % 2 ? 'beat-a' : 'beat-b'}`}
            aria-label="Latido"
            aria-pressed={liked}
            onClick={() => setBeat((b) => b + 1)}
          >
            <span className="ring" aria-hidden="true" />
            {[0, 60, 120, 180, 240, 300].map((a) => (
              <span key={a} className="spark" aria-hidden="true" style={{ '--a': `${a}deg` }} />
            ))}
            <span className="hb"><Icon name="latido" size={28} filled={liked} /></span>
          </button>
        </section>
      ) : (
        <section aria-label="Tiempo juntos" className="mx-4 mt-2.5 mb-5 p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-2.5">
          <h1 className="serif text-[30px] leading-[1.1] font-normal">Configura tu aniversario en Ajustes</h1>
          <Link to="/settings" className="btn btn-sec">Ir a Ajustes</Link>
        </section>
      )}

      <div className="px-4">
        <RandomPhoto />
      </div>

      {nextMeetEvent && meetDate && (
        <section aria-label="Próximo encuentro" className="encuentro card relative mx-4 mt-3 rounded-hero py-4 pr-4 pl-[18px] flex items-center gap-4">
          {/* The whole card opens that event: its day in the calendar and, on top, its sheet (?ev) */}
          <button
            type="button"
            aria-label={`Abrir «${nextMeetEvent.title}» en el calendario`}
            onClick={() => navigate(`/calendar?y=${meetDate.getFullYear()}&m=${meetDate.getMonth()}&d=${meetDate.getDate()}${nextMeetEvent.id ? `&ev=${encodeURIComponent(nextMeetEvent.id)}` : ''}`)}
            className="encuentro-abrir absolute inset-0 rounded-hero"
          />
          <div className="flex-1 min-w-0 flex flex-col gap-0.5">
            <p className="etiqueta">Nos vemos</p>
            <p className="serif text-[30px] leading-[1.1] text-ink">{whenText(meetDate)}</p>
            <p className="text-[15px] font-semibold text-ink">{nextMeetEvent.title}</p>
            <p className="num text-[14px] text-ink-2">{longDateText(meetDate)}</p>
            <Countdown toDate={meetDate} className="pt-1" />
          </div>
          <div aria-hidden="true" className="w-[60px] flex-none rounded-control overflow-hidden border border-line bg-paper flex flex-col items-center">
            <span className="w-full text-center bg-lacre text-on-lacre text-[11px] font-bold tracking-[0.1em] py-[3px]">{monthTile(meetDate)}</span>
            <span className="serif text-[30px] leading-[1.25] text-ink">{meetDate.getDate()}</span>
          </div>
        </section>
      )}

      {!hideConjunto && (loading && !nextEvent ? (
        <div aria-hidden="true" className="mx-4 mt-3 h-[76px] rounded-tarjeta bg-card border border-line p-4 flex flex-col gap-2.5">
          <span className="hueco block w-28 h-3 rounded-md" />
          <span className="hueco block w-48 h-4 rounded-md" />
        </div>
      ) : nextEvent && nextDate ? (
        <section aria-label="Próximo evento de los dos" className="mx-4 mt-3 min-h-[60px] rounded-tarjeta bg-lacre-soft py-2.5 pl-2.5 pr-4 flex items-center gap-3">
          <span aria-hidden="true" className="w-10 h-10 rounded-full bg-card flex items-center justify-center text-[20px] flex-none">{eventMark(nextEvent).emoji}</span>
          <span className="flex-1 min-w-0 flex flex-col">
            <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">Próximo evento · {BOTH_LABEL}</span>
            <span className="text-[15px] font-semibold text-ink">{nextEvent.title}</span>
            <span className="text-[13px] text-ink-2">{shortDateText(nextDate)} · {whenText(nextDate)}</span>
            <Countdown toDate={nextDate} />
          </span>
        </section>
      ) : (
        <section aria-label="Próximo evento de los dos" className="mx-4 mt-3 rounded-tarjeta border-[1.5px] border-dashed border-line py-3 px-4 flex flex-col gap-0.5">
          <span className="text-[12px] font-semibold uppercase tracking-[0.08em] text-ink-2">Próximo evento · {BOTH_LABEL}</span>
          <span className="text-[15px] text-ink-2">No hay eventos próximos</span>
        </section>
      ))}

      {eventsError && (
        <section role="alert" className="mx-4 mt-3 py-3 pr-3 pl-[18px] rounded-hero bg-sunk flex items-center gap-3">
          <Icon name="info" className="text-ink-2" />
          <p className="flex-1 text-[15px] text-ink">No se pudieron cargar los eventos.</p>
          <Button variant="sec" onClick={() => { setEventsError(false); setEventsKey((k) => k + 1); }}>Reintentar</Button>
        </section>
      )}

      <section aria-label="Clima ahora" className="mx-4 mt-3 grid grid-cols-2 gap-3">
        {renderWeatherCard('🫒', ROLE_LABELS.novio, weatherNovio, weatherCities.novio)}
        {renderWeatherCard('🍪', ROLE_LABELS.novia, weatherNovia, weatherCities.novia)}
      </section>

      <section aria-label="Próximos eventos" className="mx-4 mt-6">
        <div className="flex items-center justify-between pl-1">
          <h2 className="etiqueta">Próximos</h2>
          <Link to="/calendar" className="btn btn-txt btn-acc">Ver calendario</Link>
        </div>
        <div className="rounded-tarjeta bg-card border border-line overflow-hidden flex flex-col">
          {loading ? (
            <div aria-label="Cargando eventos" className="flex flex-col gap-[18px] px-4 py-[18px]">
              <span className="hueco block h-3.5 rounded-md" />
              <span className="hueco block h-3.5 w-4/5 rounded-md" />
              <span className="hueco block h-3.5 w-3/5 rounded-md" />
            </div>
          ) : events.length > 0 ? (
            events.slice(0, 5).map((ev, i) => {
              const d = ev.start?.toDate?.();
              const mark = eventMark(ev);
              const handleClick = () => {
                if (!d) return;
                const y = d.getFullYear();
                const m = d.getMonth(); // 0-indexed
                const day = d.getDate();
                navigate(`/calendar?y=${y}&m=${m}&d=${day}`);
              };
              return (
                <button
                  key={ev.id}
                  type="button"
                  onClick={handleClick}
                  className={`fila-evento w-full flex items-center gap-3.5 min-h-14 px-4 py-2 text-left ${i ? 'border-t border-line' : ''}`}
                >
                  <span className="num w-[62px] flex-none text-[13px] text-ink-2">{d ? dayMonthText(d) : ''}</span>
                  <span className="flex-1 min-w-0 text-[16px] font-medium text-ink truncate">{ev.title}</span>
                  <span aria-hidden="true" className="text-[14px] leading-none">{mark.emoji}</span>
                  <span className="sr-only">{mark.label}</span>
                </button>
              );
            })
          ) : (
            <p className="px-4 py-3.5 text-[15px] text-ink-2">No hay próximos eventos. ¡Crea el primero!</p>
          )}
        </div>
      </section>
    </div>
  );
}
