import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { addEvent, updateEvent, listEvents, deleteEvent, eventToFormValues } from '../lib/calendar';
import Sheet from '../components/Sheet';
import Button from '../components/Button';
import Field from '../components/Field';
import Icon from '../components/Icon';
import EventTypeSwitcher from '../components/EventTypeSwitcher';
import ViewSwitcher from '../components/ViewSwitcher';
import MonthlyCalendarView from '../components/MonthlyCalendarView';
import CollapsibleSection from '../components/CollapsibleSection';
import { DayList, PastList, UpcomingList } from '../components/EventList';
import HeartRainAnimation from '../components/HeartRainAnimation';
import { eventTypeOf } from '../lib/eventTypes';
import { dayTitle, specialInfo, whenText } from '../lib/eventText';
import { birthdayOn, celebration, isMonthiversaryDay, nextSpecialEvents, partyAnimation } from '../lib/specialDays';

// Colours of the message on top of a celebration day, by birthday name or celebration kind
const PARTY_STYLES = {
  Lucy: { bg: 'bg-sello-ella', ink: 'text-sello-ella-ink' },
  Sebas: { bg: 'bg-sello-el', ink: 'text-sello-el-ink' },
  anniversary: { bg: 'bg-sello-ella', ink: 'text-sello-ella-ink' },
  monthiversary: { bg: 'bg-lacre-soft', ink: 'text-accent-ink' },
};

const pad2 = (n) => String(n).padStart(2, '0');

// Firestore events plus the automatic ones, in date order
const byStart = (a, b) => a.start.toDate() - b.start.toDate();

export default function CalendarPage() {
  const location = useLocation();
  const [view, setView] = useState('Calendario'); // 'Lista' | 'Calendario'; always opens on the month
  // The open sheet: 'day' | 'event' | 'form' | 'delete'. Closing an event, form or delete sheet goes back to
  // the day when it was opened from there (dayOpen), so the day's rain keeps falling until the day is closed
  const [sheet, setSheet] = useState(null);
  const [dayOpen, setDayOpen] = useState(false);
  const [shownEvent, setShownEvent] = useState(null); // the event in the event sheet
  const [editingEvent, setEditingEvent] = useState(null); // null = new event
  const [deleteTarget, setDeleteTarget] = useState(null); // { id, title, from: sheet to go back to on cancel }
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const identity = useMemo(() => localStorage.getItem('identity') || 'yo', []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [endError, setEndError] = useState('');
  const [notice, setNotice] = useState(''); // write or delete rejected after its sheet was closed
  // New event form state (controlled for iOS/web consistency)
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [touchedEndDate, setTouchedEndDate] = useState(false);
  const isIOS = useMemo(() => {
    if (typeof navigator === 'undefined') return false;
    return /iPad|iPhone|iPod/.test(navigator.userAgent) || (
      /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 2
    );
  }, []);
  // iOS collapses an empty date/time input: fixed height and no native look
  const dateClass = `h-[52px]${isIOS ? ' appearance-none' : ''}`;
  const [selectedEventType, setSelectedEventType] = useState('conjunto');
  const [selectedDay, setSelectedDay] = useState(null);
  const [showHeartRain, setShowHeartRain] = useState(false);
  const [heartAnimationType, setHeartAnimationType] = useState('rain');
  const [targetDate, setTargetDate] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listEvents(pairId, { futureOnly: false, max: 300 });
        // Generate special events (only next occurrence of each type)
        const allEvents = [...list, ...nextSpecialEvents()];
        allEvents.sort(byStart);
        if (!cancelled) { setItems(allEvents); setLoadError(false); }
      } catch (e) {
        if (!cancelled) {
          // Even if Firestore fails, show special events
          setItems(nextSpecialEvents().sort(byStart));
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [pairId, refreshKey]);

  // Handle deep-link: /calendar?y=YYYY&m=MM_0indexed&d=DD
  useEffect(() => {
    const params = new URLSearchParams(location.search || '');
    const y = Number(params.get('y'));
    const m = Number(params.get('m'));
    const d = Number(params.get('d'));
    if (!Number.isNaN(y) && !Number.isNaN(m) && !Number.isNaN(d) && y > 1900 && m >= 0 && m <= 11 && d >= 1 && d <= 31) {
      setView('Calendario');
      openDay(d, m, y);
      setTargetDate(new Date(y, m, d));
    }
  }, [location.search]);

  const { upcomingEvents, pastEvents } = useMemo(() => {
    const now = new Date();
    const upcoming = [];
    const past = [];
    const sortedItems = [...items].sort((a,b) => {
      const dateA = a.start?.toDate ? a.start.toDate() : new Date(0);
      const dateB = b.start?.toDate ? b.start.toDate() : new Date(0);
      return dateA - dateB;
    });

    for (const event of sortedItems) {
      if ((event.start?.toDate() || 0) >= now) {
        upcoming.push(event);
      } else {
        past.push(event);
      }
    }
    return { upcomingEvents: upcoming, pastEvents: past.reverse() };
  }, [items]);

  // Leave the current event/form/delete sheet: back to the day if it came from there
  function back() {
    setSheet(dayOpen ? 'day' : null);
  }

  function openForm(ev, date = '') {
    setEditingEvent(ev);
    if (ev) {
      const v = eventToFormValues(ev);
      setStartDate(v.date);
      setStartTime(v.time);
      setEndDate(v.endDate);
      // Keep the end date following the start only when it was the same day; otherwise leave it as saved
      setTouchedEndDate(v.endDate !== v.date);
      setSelectedEventType(v.eventType);
    } else {
      setStartDate(date); setStartTime(''); setEndDate(date); setTouchedEndDate(false);
      setSelectedEventType('conjunto');
    }
    setError('');
    setEndError('');
    setSheet('form');
  }

  function openNewEvent() {
    openForm(null);
  }

  // C16: the form with the open day already set as start (and end, which follows it)
  function addToDay() {
    if (!selectedDay) return;
    const { day, month, year } = selectedDay;
    openForm(null, `${year}-${pad2(month + 1)}-${pad2(day)}`);
  }

  function openEditEvent(ev) {
    if (ev.isSpecialEvent) return;
    openForm(ev);
  }

  function openEvent(ev) {
    setShownEvent(ev);
    setSheet('event');
  }

  async function onSave(e) {
    e.preventDefault();
    // currentTarget is null after the first await
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const data = Object.fromEntries(form);
    const { title, location, date, time, endDate } = data;
    if (!title || !date) return;
    // An end before the start would be dropped silently (the event becomes single-day)
    if (endDate && endDate < date) {
      setEndError('La fecha de fin no puede ser anterior al inicio.');
      return;
    }
    setSaving(true);
    setError('');
    setEndError('');
    setNotice('');

    const seeEachOther = form.has('seeEachOther');
    const finalEventType = seeEachOther ? 'conjunto' : selectedEventType;
    const editingId = editingEvent?.id;
    try {
      // Only waits for the write to be queued, not for the server ack (offline it never arrives)
      const fields = { title, date, time, endDate, location, eventType: finalEventType, seeEachOther };
      const { committed } = editingId
        ? await updateEvent(pairId, editingId, fields)
        : await addEvent(pairId, fields, identity);
      formEl.reset();
      setSelectedEventType('conjunto'); // Reset to default
      setEditingEvent(null);
      back();
      setRefreshKey(k => k + 1); // Force a reliable refetch
      // If the server ends up rejecting it, say so and drop the local ghost
      committed.catch(() => {
        setNotice(`No se pudo guardar el evento "${title}".`);
        setRefreshKey(k => k + 1);
      });
    } catch (err) {
      setError('No se pudo guardar el evento.');
    } finally {
      setSaving(false);
    }
  }

  const askDelete = (ev) => {
    // Don't allow deletion of special automatic events
    if (ev.isSpecialEvent || ev.id.includes('anniversary-') || ev.id.includes('birthday-')) {
      setNotice('Los eventos especiales (cumpleaños, aniversarios) no se pueden borrar.');
      return;
    }
    setDeleteTarget({ id: ev.id, title: ev.title || 'este evento', from: sheet });
    setSheet('delete');
  };

  const editValues = editingEvent ? eventToFormValues(editingEvent) : null;

  // F15: what tapping a list row did before the event sheet existed, now its «Ver en el calendario»
  const showInCalendar = (ev) => {
    const dt = ev.start?.toDate?.();
    if (!dt) return;
    setView('Calendario');
    setTargetDate(dt);
    openDay(dt.getDate(), dt.getMonth(), dt.getFullYear());
  };

  const confirmDelete = async () => {
    const { id } = deleteTarget;
    try {
      await deleteEvent(pairId, id);
      setRefreshKey(k => k + 1);
    } catch (e) {
      setNotice('No se pudo borrar el evento.');
    }
    setDeleteTarget(null);
    back();
  };

  const cancelDelete = () => {
    setSheet(deleteTarget?.from === 'form' || deleteTarget?.from === 'event' ? deleteTarget.from : (dayOpen ? 'day' : null));
    setDeleteTarget(null);
  };

  // Open a given day and trigger special animations when appropriate
  function openDay(day, month, year) {
    setSelectedDay({ day, month, year });
    setDayOpen(true);
    setSheet('day');

    // Any 24th rains (fireworks on the anniversary), birthdays get theirs
    const animation = partyAnimation(day, month);
    if (animation) {
      setHeartAnimationType(animation);
      setShowHeartRain(true);
    } else {
      // Ensure animation is not left running for non-special days
      setShowHeartRain(false);
    }
  }

  const onDayClick = (day, month, year) => {
    openDay(day, month, year);
  };

  const closeDay = () => {
    setDayOpen(false);
    setSheet(null);
    setShowHeartRain(false); // Stop animation when the day sheet closes
  };

  // The selected day's message and events (the automatic event of a celebration is not repeated under it)
  const dayContent = useMemo(() => {
    if (!selectedDay) return null;
    const birthday = birthdayOn(selectedDay.day, selectedDay.month);
    const isAnniversaryDay = isMonthiversaryDay(selectedDay.day);
    const party = celebration(selectedDay.day, selectedDay.month, selectedDay.year);
    const selectedDate = new Date(selectedDay.year, selectedDay.month, selectedDay.day);

    const events = items.filter(event => {
      const eventDate = event.start?.toDate();
      if (!eventDate) return false;

      // Check if event occurs on selected day or spans through it
      let isOnSelectedDay = false;
      if (event.end) {
        const endDate = event.end.toDate();
        // Compare by day boundaries so the first day is included even if start has a time > 00:00
        const startDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
        const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
        isOnSelectedDay = selectedDate >= startDay && selectedDate <= endDay;
      } else {
        isOnSelectedDay = eventDate.getDate() === selectedDay.day && eventDate.getMonth() === selectedDay.month && eventDate.getFullYear() === selectedDay.year;
      }

      // If this day has a special message (anniversary, birthday), filter out the corresponding special event
      if (isOnSelectedDay && event.isSpecialEvent) {
        if ((isAnniversaryDay && (event.specialType === 'anniversary' || event.specialType === 'monthiversary')) ||
            (birthday && event.specialType === 'birthday' && event.eventType === birthday.eventType)) {
          return false;
        }
      }
      return isOnSelectedDay;
    });
    return { party, events };
  }, [items, selectedDay]);

  const party = dayContent?.party;
  const partyStyle = party && PARTY_STYLES[party.kind === 'birthday' ? party.name : party.kind];
  const shownType = shownEvent && eventTypeOf(shownEvent.eventType);
  const shownSpecial = specialInfo(shownEvent);

  return (
    <div className="flex flex-col gap-4 pb-20">
      <header className="flex items-end justify-between gap-3 pt-1.5 pl-1">
        <h1 className="serif text-4xl leading-[1.05] font-normal tracking-[-0.01em]">Calendario</h1>
        <Button icon="nuevo" onClick={openNewEvent} aria-label="Nuevo evento">Nuevo</Button>
      </header>

      {notice && (
        <div role="status" className="card flex items-center justify-between gap-3 py-2 pr-2 text-[15px] text-ink">
          <span>{notice}</span>
          <Button icon="cerrar" label="Cerrar aviso" onClick={() => setNotice('')} />
        </div>
      )}
      {loadError && !loading && (
        <section role="alert" className="flex items-center justify-between gap-3 py-3 pl-4 pr-3 rounded-hero bg-sunk">
          <p className="text-[15px] text-ink">No se pudieron cargar los eventos.</p>
          <Button variant="sec" onClick={() => setRefreshKey(k => k + 1)}>Reintentar</Button>
        </section>
      )}

      <ViewSwitcher
        views={['Lista', 'Calendario']}
        labels={{ Calendario: 'Mes' }}
        activeView={view}
        onChange={setView}
      />

      {view === 'Lista' && (
        <div className="flex flex-col gap-3">
          {loading ? (
            <div aria-label="Cargando eventos" className="card flex flex-col gap-5">
              <span className="block h-10 rounded-mini bg-sunk animate-pulse" />
              <span className="block h-10 w-[85%] rounded-mini bg-sunk animate-pulse" />
              <span className="block h-10 w-[70%] rounded-mini bg-sunk animate-pulse" />
            </div>
          ) : (
            <>
              <CollapsibleSection title={`Próximos · ${upcomingEvents.length}`} defaultOpen>
                <UpcomingList events={upcomingEvents} onOpen={openEvent} />
              </CollapsibleSection>
              <CollapsibleSection title={`Pasados · ${pastEvents.length}`}>
                <PastList events={pastEvents} onOpen={openEvent} />
              </CollapsibleSection>
            </>
          )}
        </div>
      )}

      {view === 'Calendario' && (
        <div className="-mx-1">
          <MonthlyCalendarView events={items} onDayClick={onDayClick} targetDate={targetDate} selected={dayOpen ? selectedDay : null} />
        </div>
      )}

      <Sheet isOpen={sheet === 'day'} onClose={closeDay}>
        <div className="px-4 pb-[34px]">
          <div className="flex items-center justify-between pl-1 pb-2">
            <h2 className="serif text-[26px] font-normal">
              {selectedDay && dayTitle(selectedDay.day, selectedDay.month, selectedDay.year)}
            </h2>
            <Button icon="cerrar" label="Cerrar" onClick={closeDay} className="text-ink-2" />
          </div>
          {dayContent && (
            <div className="flex flex-col gap-2">
              {party && (
                <div role="status" className={`flex flex-col items-center gap-1 pt-[18px] pb-5 px-4 rounded-tarjeta text-center ${partyStyle.bg}`}>
                  <span aria-hidden="true" className="text-3xl leading-[1.15]">{party.emoji}</span>
                  <p className={`serif text-[26px] leading-[1.15] ${partyStyle.ink}`}>{party.title}</p>
                  <p className={`text-[15px] font-semibold ${partyStyle.ink}`}>{party.subtitle}</p>
                </div>
              )}
              {dayContent.events.length > 0 ? (
                <DayList events={dayContent.events} day={selectedDay} onOpen={openEvent} />
              ) : (
                !party && <p className="px-1 py-3 text-[15px] text-ink-2">Nada este día todavía.</p>
              )}
              <Button variant="txt" size="m" accent icon="nuevo" onClick={addToDay} className="border border-dashed border-line">
                Añadir a este día
              </Button>
              {/* Room for «Parar la fiesta», which floats over the bottom of the sheet while it rains */}
              {showHeartRain && <div aria-hidden="true" className="h-[88px]" />}
            </div>
          )}
        </div>
      </Sheet>

      <Sheet isOpen={sheet === 'event' && !!shownEvent} onClose={back}>
        {shownEvent && (
          <div className="px-5 pb-[34px]">
            <div className="flex items-center justify-between">
              <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-2">
                <span aria-hidden="true" className="text-sm leading-none">{shownSpecial ? shownSpecial.sello : shownType.emoji}</span>
                {shownSpecial ? shownSpecial.label : shownType.text}
              </span>
              <Button icon="cerrar" label="Cerrar" onClick={back} className="-mr-2.5 text-ink-2" />
            </div>
            <h2 className="serif text-[30px] leading-[1.1] font-normal pt-0.5 pb-4">{shownEvent.title}</h2>
            <div className="flex flex-col gap-3 pb-5 text-base text-ink">
              <p className="flex items-center gap-3 text-ink"><Icon name="calendario" size={20} className="text-ink-2" />{whenText(shownEvent)}</p>
              {shownEvent.location && (
                <p className="flex items-center gap-3 text-ink"><Icon name="lugar" size={20} className="text-ink-2" />{shownEvent.location}</p>
              )}
              {shownEvent.seeEachOther && (
                <p className="flex items-center gap-3 font-semibold text-accent-ink"><Icon name="nosVemos" size={20} />Nos vemos</p>
              )}
            </div>
            <div className="flex flex-col gap-1.5">
              {shownSpecial && (
                <p className="py-3.5 px-4 mb-1.5 rounded-[18px] bg-sunk text-sm text-ink-2">{shownSpecial.note}</p>
              )}
              {!shownSpecial && (
                <Button size="l" icon="editar" onClick={() => openEditEvent(shownEvent)}>Editar</Button>
              )}
              {!dayOpen && (
                <Button variant="sec" size="l" icon="calendario" onClick={() => showInCalendar(shownEvent)}>Ver en el calendario</Button>
              )}
              {!shownSpecial && (
                <Button variant="txt" size="l" onClick={() => askDelete(shownEvent)} className="text-danger">Borrar evento</Button>
              )}
            </div>
          </div>
        )}
      </Sheet>

      <Sheet isOpen={sheet === 'form'} onClose={back}>
        <form key={editingEvent?.id || 'new'} onSubmit={onSave} className="flex flex-col gap-3.5 px-5 pt-2 pb-[34px]">
          <div className="flex items-center justify-between">
            <Button variant="txt" onClick={back} className="px-1 text-base text-ink-2">Cancelar</Button>
            <h2 className="text-base font-semibold">{editingEvent ? 'Editar evento' : 'Nuevo evento'}</h2>
            <Button type="submit" busy={saving} busyText="Guardando…">Guardar</Button>
          </div>
          <Field name="title" label="Título" placeholder="Cena, visita, examen…" defaultValue={editValues?.title} required className="text-[17px]" />
          <div className="grid grid-cols-2 gap-2.5">
            <Field
              name="date"
              type="date"
              label="Fecha"
              className={dateClass}
              value={startDate}
              onChange={(e) => { const v = e.target.value; setStartDate(v); if (!touchedEndDate) setEndDate(v); }}
              required
            />
            <Field
              name="time"
              type="time"
              label="Hora"
              className={dateClass}
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <Field
            name="endDate"
            type="date"
            label={<>Hasta <span className="normal-case tracking-normal font-medium">(opcional, si dura varios días)</span></>}
            className={dateClass}
            value={endDate}
            onChange={(e) => { setTouchedEndDate(true); setEndDate(e.target.value); setEndError(''); }}
            error={endError || undefined}
            hint={touchedEndDate ? 'Si la pones antes del inicio, te avisa.' : 'Sigue a la fecha de inicio hasta que la cambies.'}
          />
          <Field
            name="location"
            label={<>Lugar <span className="normal-case tracking-normal font-medium">(opcional)</span></>}
            defaultValue={editValues?.location}
          />
          <div className="flex flex-col gap-1.5">
            <span className="etiqueta" aria-hidden="true">De quién es</span>
            <EventTypeSwitcher activeType={selectedEventType} onChange={setSelectedEventType} />
          </div>
          <div className="flex items-center justify-between gap-3 min-h-[60px] px-4 py-2 rounded-[18px] bg-lacre-soft">
            <label htmlFor="ev-vemos" className="flex-1 min-w-0 flex flex-col">
              <span className="text-base font-semibold text-accent-ink">¿Nos vemos?</span>
              <span className="text-[13px] text-ink-2">Sale en Inicio con la cuenta atrás y pasa a ser de los dos.</span>
            </label>
            <span className="relative inline-flex w-[52px] h-8 shrink-0">
              <input
                id="ev-vemos"
                type="checkbox"
                name="seeEachOther"
                defaultChecked={!!editValues?.seeEachOther}
                className="peer absolute inset-0 z-10 m-0 opacity-0 cursor-pointer"
              />
              <span aria-hidden="true" className="absolute inset-0 rounded-full bg-line transition-colors peer-checked:bg-lacre peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-lacre" />
              <span aria-hidden="true" className="absolute top-[3px] left-[3px] size-[26px] rounded-full bg-card shadow-carta transition-transform peer-checked:translate-x-5" />
            </span>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          {editingEvent && (
            <Button variant="txt" size="l" onClick={() => askDelete(editingEvent)} className="text-danger">Borrar evento</Button>
          )}
        </form>
      </Sheet>

      <Sheet isOpen={sheet === 'delete' && !!deleteTarget} onClose={cancelDelete}>
        {deleteTarget && (
          <div className="flex flex-col gap-1.5 px-5 pt-2 pb-[34px]">
            <h2 className="serif text-[26px] leading-[1.15] font-normal">¿Borrar «{deleteTarget.title}»?</h2>
            <p className="pb-3.5 text-[15px] text-ink-2">Desaparece del calendario de los dos. No se puede deshacer.</p>
            <Button variant="dan" size="l" onClick={confirmDelete}>Borrar evento</Button>
            <Button variant="txt" size="l" onClick={cancelDelete}>Cancelar</Button>
          </div>
        )}
      </Sheet>

      <HeartRainAnimation
        isActive={showHeartRain}
        type={heartAnimationType}
        onStop={() => setShowHeartRain(false)}
      />
    </div>
  );
}
