import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router';
import { createPortal } from 'react-dom';
import { addEvent, updateEvent, listEvents, deleteEvent, eventToFormValues } from '../lib/calendar';
import Modal from '../components/Modal';
import EventTypeSwitcher from '../components/EventTypeSwitcher';
import ViewSwitcher from '../components/ViewSwitcher';
import MonthlyCalendarView from '../components/MonthlyCalendarView';
import CollapsibleSection from '../components/CollapsibleSection';
import HeartRainAnimation from '../components/HeartRainAnimation';

const EventList = ({ events, onDelete, onEdit, onItemClick }) => {
  if (events.length === 0) {
    return <div className="text-gray-500 text-sm px-4 py-2">No hay eventos aquí.</div>;
  }
  return (
    <ul className="divide-y divide-rose-100">
      {events.map((ev) => {
        const startDate = ev.start?.toDate?.() || null;
        const endDate = ev.end?.toDate?.() || null;
        
        let when = '';
        if (startDate) {
          const startStr = startDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
          if (endDate && endDate.toDateString() !== startDate.toDateString()) {
            // Multi-day event: show date range (remove end time)
            const endStr = endDate.toLocaleString([], { dateStyle: 'medium' });
            when = `${startStr} - ${endStr}`;
          } else {
            // Single day event
            when = startStr;
          }
        }
        
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
        
        return (
          <li
            key={ev.id}
            className="py-3 flex items-center gap-3 cursor-pointer hover:bg-gray-50 rounded px-2 -mx-2"
            onClick={() => onItemClick && onItemClick(ev)}
          >
            <div className="flex-1 min-w-0">
              <div className="font-medium text-gray-900 truncate flex items-center gap-2">
                <span className="truncate">{ev.title}</span>
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${eventTypeColor}`}></div>
              </div>
              <div className="text-sm text-gray-500 truncate">{when}</div>
              {ev.location ? (
                <div className="text-sm text-gray-500 font-medium truncate">{ev.location}</div>
              ) : null}
            </div>
            {!ev.isSpecialEvent && (
              <div className="flex items-center gap-3">
                {onEdit && (
                  <button
                    onClick={(e) => { e.stopPropagation(); onEdit(ev); }}
                    className="btn-link text-sm"
                  >
                    Editar
                  </button>
                )}
                <button
                  onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }}
                  className="btn-link text-sm"
                >
                  Borrar
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default function CalendarPage() {
  const location = useLocation();
  const [view, setView] = useState('Calendario'); // 'Lista' | 'Calendario'; always opens on the month
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState(null); // null = new event
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const identity = useMemo(() => localStorage.getItem('identity') || 'yo', []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saveError, setSaveError] = useState(''); // write rejected after the modal was closed
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
  const inputClass = `input w-full${isIOS ? ' appearance-none bg-white text-gray-900 h-11' : ''}`;
  const [selectedEventType, setSelectedEventType] = useState('conjunto');
  const [selectedDay, setSelectedDay] = useState(null);
  const [dayEventsPopup, setDayEventsPopup] = useState(false);
  const [showHeartRain, setShowHeartRain] = useState(false);
  const [heartAnimationType, setHeartAnimationType] = useState('rain');
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    isOpen: false,
    eventId: '',
    eventTitle: ''
  });
  const [targetDate, setTargetDate] = useState(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const list = await listEvents(pairId, { futureOnly: false, max: 300 });
        
        // Generate special events (only next occurrence of each type)
        const specialEvents = generateSpecialEvents();
        
        // Merge Firestore events with special events
        const allEvents = [...list, ...specialEvents];
        
        // Sort all events chronologically by start date
        allEvents.sort((a, b) => {
          const dateA = a.start.toDate();
          const dateB = b.start.toDate();
          return dateA - dateB;
        });
        
        if (!cancelled) setItems(allEvents);
      } catch (e) {
        if (!cancelled) {
          // Even if Firestore fails, show special events
          const specialEvents = generateSpecialEvents();
          
          // Sort events chronologically
          specialEvents.sort((a, b) => {
            const dateA = a.start.toDate();
            const dateB = b.start.toDate();
            return dateA - dateB;
          });
          
          setItems(specialEvents);
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

  function openNewEvent() {
    setEditingEvent(null);
    setStartDate(''); setStartTime(''); setEndDate(''); setTouchedEndDate(false);
    setSelectedEventType('conjunto');
    setError('');
    setIsModalOpen(true);
  }

  function openEditEvent(ev) {
    if (ev.isSpecialEvent) return;
    const v = eventToFormValues(ev);
    setEditingEvent(ev);
    setStartDate(v.date);
    setStartTime(v.time);
    setEndDate(v.endDate);
    // Keep the end date following the start only when it was the same day; otherwise leave it as saved
    setTouchedEndDate(v.endDate !== v.date);
    setSelectedEventType(v.eventType);
    setError('');
    setIsModalOpen(true);
  }

  function closeModal() {
    setIsModalOpen(false);
    setEditingEvent(null);
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
      setError('La fecha de fin no puede ser anterior al inicio.');
      return;
    }
    setSaving(true);
    setError('');
    setSaveError('');

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
      closeModal();
      setRefreshKey(k => k + 1); // Force a reliable refetch
      // If the server ends up rejecting it, say so and drop the local ghost
      committed.catch(() => {
        setSaveError(`No se pudo guardar el evento "${title}".`);
        setRefreshKey(k => k + 1);
      });
    } catch (err) {
      setError('No se pudo guardar el evento.');
    } finally {
      setSaving(false);
    }
  }

  const onDelete = async (id) => {
    // Don't allow deletion of special automatic events
    if (id.includes('anniversary-') || id.includes('birthday-')) {
      alert('Los eventos especiales (cumpleaños, aniversarios) no se pueden borrar.');
      return;
    }
    
    // Find the event to get its title
    const event = items.find(item => item.id === id);
    const eventTitle = event ? event.title : 'este evento';
    
    // Show custom confirmation modal
    setDeleteConfirmation({
      isOpen: true,
      eventId: id,
      eventTitle: eventTitle
    });
  };

  const editValues = editingEvent ? eventToFormValues(editingEvent) : null;

  const handleListItemClick = (ev) => {
    const dt = ev.start?.toDate?.();
    if (!dt) return;
    setView('Calendario');
    setTargetDate(dt);
    openDay(dt.getDate(), dt.getMonth(), dt.getFullYear());
  };

  const confirmDelete = async () => {
    const { eventId } = deleteConfirmation;
    try {
      await deleteEvent(pairId, eventId);
      setRefreshKey(k => k + 1);
      setDeleteConfirmation({
        isOpen: false,
        eventId: '',
        eventTitle: ''
      });
    } catch (e) {
      alert('Error al borrar');
      setDeleteConfirmation({
        isOpen: false,
        eventId: '',
        eventTitle: ''
      });
    }
  };

  const cancelDelete = () => {
    setDeleteConfirmation({
      isOpen: false,
      eventId: '',
      eventTitle: ''
    });
  };

  // Open a given day and trigger special animations when appropriate
  function openDay(day, month, year) {
    setSelectedDay({ day, month, year });
    setDayEventsPopup(true);

    // Birthdays
    const isLucyBirthday = day === 21 && month === 3; // April 21st (0-indexed)
    const isSebasBirthday = day === 4 && month === 10; // November 4th (0-indexed)

    // Anniversary (24th), with fireworks only if November (real anniversary)
    if (day === 24) {
      const isRealAnniversary = month === 10; // November (0-indexed)
      setHeartAnimationType(isRealAnniversary ? 'fireworks' : 'rain');
      setShowHeartRain(true);
    } else if (isLucyBirthday || isSebasBirthday) {
      setHeartAnimationType('birthday');
      setShowHeartRain(true);
    } else {
      // Ensure animation is not left running for non-special days
      setShowHeartRain(false);
    }
  }

  const onDayClick = (day, month, year) => {
    openDay(day, month, year);
  };

  const closeDayEventsPopup = () => {
    setDayEventsPopup(false);
    setShowHeartRain(false); // Stop animation when popup closes
  };

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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-rose-600">Calendario</h2>
      {saveError && (
        <div className="card flex items-center justify-between gap-3 text-sm text-rose-600">
          <span>{saveError}</span>
          <button type="button" onClick={() => setSaveError('')} className="btn-link" aria-label="Cerrar aviso">×</button>
        </div>
      )}
      <ViewSwitcher
        views={['Lista', 'Calendario']}
        activeView={view}
        onChange={setView}
      />

      {view === 'Lista' && (
        <div className="relative min-h-[60vh] pb-20">
          <div className="divide-y divide-gray-200">
            <div className="card rounded-b-none">
              <CollapsibleSection title="Próximos eventos" defaultOpen>
                {loading ? <div className="text-gray-500 px-4 py-2">Cargando…</div> : <EventList events={upcomingEvents} onDelete={onDelete} onEdit={openEditEvent} onItemClick={handleListItemClick} />}
              </CollapsibleSection>
            </div>
            <div className="card rounded-t-none">
              <CollapsibleSection title="Eventos pasados">
                <EventList events={pastEvents} onDelete={onDelete} onEdit={openEditEvent} onItemClick={handleListItemClick} />
              </CollapsibleSection>
            </div>
          </div>
        </div>
      )}

      {view === 'Calendario' && (
        <div className="pb-20">
          <MonthlyCalendarView events={items} onDayClick={onDayClick} targetDate={targetDate} />
        </div>
      )}
      

      {/* New event button - portal to body so it floats above scroll */}
      {createPortal(
        <button
          onClick={openNewEvent}
          className="fab btn-primary shadow-lg rounded-full px-5 py-3 font-semibold"
          aria-label="Nuevo evento"
          title="Nuevo evento"
        >
          Nuevo evento
        </button>,
        document.body
      )}

      <Modal isOpen={isModalOpen} onClose={closeModal}>
        <form key={editingEvent?.id || 'new'} onSubmit={onSave} className="p-6 space-y-4">
          <h3 className="font-semibold text-lg">{editingEvent ? 'Editar evento' : 'Añadir evento'}</h3>
          <div className="space-y-3">
            <input name="title" placeholder="Título" className={inputClass} defaultValue={editValues?.title} required />
            <input name="location" placeholder="Ubicación (opcional)" className={inputClass} defaultValue={editValues?.location} />
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Fecha de inicio</label>
                <input
                  name="date"
                  type="date"
                  className={inputClass}
                  value={startDate}
                  onChange={(e) => { const v = e.target.value; setStartDate(v); if (!touchedEndDate) setEndDate(v); }}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Hora</label>
                <input
                  name="time"
                  type="time"
                  className={inputClass}
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                />
              </div>
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Fecha de fin (opcional)</label>
              <input
                name="endDate"
                type="date"
                className={inputClass}
                value={endDate}
                onChange={(e) => { setTouchedEndDate(true); setEndDate(e.target.value); }}
              />
            </div>
            <div className="space-y-2">
              <label className="block text-sm text-gray-600">Tipo de evento</label>
              <EventTypeSwitcher 
                activeType={selectedEventType} 
                onChange={setSelectedEventType} 
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
              <input type="checkbox" name="seeEachOther" defaultChecked={!!editValues?.seeEachOther} className="accent-rose-500 w-4 h-4" />
              ¿Nos vemos?
            </label>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={closeModal} className="btn-ghost">Cancelar</button>
            <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Guardando…' : (editingEvent ? 'Guardar' : 'Añadir')}</button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={dayEventsPopup} onClose={closeDayEventsPopup}>
        <div className="p-6">
          <h3 className="font-semibold text-lg mb-4">
            {selectedDay && `Eventos del ${selectedDay.day} de ${new Date(selectedDay.year, selectedDay.month).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })}`}
          </h3>
          {selectedDay && (() => {
            // Check for birthdays
            const isLucyBirthday = selectedDay.day === 21 && selectedDay.month === 3; // April 21st
            const isSebasBirthday = selectedDay.day === 4 && selectedDay.month === 10; // November 4th
            const isAnniversaryDay = selectedDay.day === 24;
            
            let specialMessage = null;
            
            // Birthday messages
            if (isLucyBirthday || isSebasBirthday) {
              const selectedDate = new Date(selectedDay.year, selectedDay.month, selectedDay.day);
              let birthDate, name, colorScheme;
              
              if (isLucyBirthday) {
                birthDate = new Date(2003, 3, 21); // April 21, 2003
                name = 'Lucy';
                colorScheme = {
                  bg: 'bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200',
                  textColor: 'text-purple-600',
                  subTextColor: 'text-purple-500',
                  emoji: '🎂💜🎉'
                };
              } else {
                birthDate = new Date(1998, 10, 4); // November 4, 1998
                name = 'Sebas';
                colorScheme = {
                  bg: 'bg-gradient-to-r from-blue-50 to-cyan-50 border border-blue-200',
                  textColor: 'text-blue-600',
                  subTextColor: 'text-blue-500',
                  emoji: '🎂💙🎉'
                };
              }
              
              // Calculate age
              const age = selectedDate.getFullYear() - birthDate.getFullYear();
              const hasHadBirthdayThisYear = selectedDate >= new Date(selectedDate.getFullYear(), birthDate.getMonth(), birthDate.getDate());
              const currentAge = hasHadBirthdayThisYear ? age : age - 1;
              
              specialMessage = (
                <div className={`${colorScheme.bg} rounded-lg p-4 mb-4 text-center`}>
                  <div className="text-2xl mb-2">{colorScheme.emoji}</div>
                  <div className={`text-lg font-semibold ${colorScheme.textColor} mb-1`}>
                    ¡¡{name} cumple {currentAge} años!!
                  </div>
                  <div className={`text-sm ${colorScheme.subTextColor}`}>
                    ¡Feliz cumpleaños!
                  </div>
                </div>
              );
            } else if (isAnniversaryDay) {
              const anniversaryDate = new Date(2024, 10, 24); // November 24, 2024 (month is 0-indexed)
              const selectedDate = new Date(selectedDay.year, selectedDay.month, selectedDay.day);
              const isRealAnniversary = selectedDay.month === 10; // November
              
              // Calculate months difference
              const yearsDiff = selectedDate.getFullYear() - anniversaryDate.getFullYear();
              const monthsDiff = selectedDate.getMonth() - anniversaryDate.getMonth();
              const totalMonths = yearsDiff * 12 + monthsDiff;
              
              if (totalMonths > 0) {
                let message = '';
                if (totalMonths >= 12) {
                  const years = Math.floor(totalMonths / 12);
                  const remainingMonths = totalMonths % 12;
                  if (remainingMonths === 0) {
                    message = `¡¡${years} ${years === 1 ? 'año' : 'años'}!!`;
                  } else {
                    message = `¡¡${years} ${years === 1 ? 'año' : 'años'} y ${remainingMonths} ${remainingMonths === 1 ? 'mes' : 'meses'}!!`;
                  }
                } else {
                  message = `¡¡${totalMonths} ${totalMonths === 1 ? 'mes' : 'meses'}!!`;
                }
                
                const celebrationText = isRealAnniversary ? '¡Feliz aniversario!' : '¡Feliz mesiversario!';
                const bgGradient = isRealAnniversary 
                  ? 'bg-gradient-to-r from-purple-50 to-pink-50 border border-purple-200' 
                  : 'bg-gradient-to-r from-pink-50 to-rose-50 border border-pink-200';
                const textColor = isRealAnniversary ? 'text-purple-600' : 'text-pink-600';
                const subTextColor = isRealAnniversary ? 'text-purple-500' : 'text-pink-500';
                const emoji = isRealAnniversary ? '🎉💖🎉' : '💖';
                
                specialMessage = (
                  <div className={`${bgGradient} rounded-lg p-4 mb-4 text-center`}>
                    <div className="text-2xl mb-2">{emoji}</div>
                    <div className={`text-lg font-semibold ${textColor} mb-1`}>
                      {message}
                    </div>
                    <div className={`text-sm ${subTextColor}`}>
                      {celebrationText}
                    </div>
                  </div>
                );
              }
            }
            
            // Filter events for the selected day
            const dayEvents = items.filter(event => {
              const eventDate = event.start?.toDate();
              if (!eventDate) return false;

              const eventDay = eventDate.getDate();
              const eventMonth = eventDate.getMonth();
              const eventYear = eventDate.getFullYear();

              // Check if event occurs on selected day or spans through it
              let isOnSelectedDay = false;
              if (event.end) {
                const endDate = event.end.toDate();
                const selectedDate = new Date(selectedDay.year, selectedDay.month, selectedDay.day);
                // Compare by day boundaries so the first day is included even if start has a time > 00:00
                const startDay = new Date(eventDate.getFullYear(), eventDate.getMonth(), eventDate.getDate());
                const endDay = new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59, 999);
                isOnSelectedDay = selectedDate >= startDay && selectedDate <= endDay;
              } else {
                isOnSelectedDay = eventDay === selectedDay.day && eventMonth === selectedDay.month && eventYear === selectedDay.year;
              }

              // If this day has a special message (anniversary, birthday), filter out the corresponding special event
              if (isOnSelectedDay && event.isSpecialEvent) {
                if ((isAnniversaryDay && (event.specialType === 'anniversary' || event.specialType === 'monthiversary')) ||
                    (isLucyBirthday && event.specialType === 'birthday' && event.eventType === 'lucy-birthday') ||
                    (isSebasBirthday && event.specialType === 'birthday' && event.eventType === 'sebas-birthday')) {
                  return false; // Filter out the special event when there's a special message
                }
              }

              return isOnSelectedDay;
            });

            return (
              <>
                {specialMessage}
                {dayEvents.length > 0 ? (
                  <EventList events={dayEvents} onDelete={onDelete} onEdit={openEditEvent} />
                ) : (
                  !specialMessage && <div className="text-gray-500 text-sm py-4">No hay eventos en este día.</div>
                )}
              </>
            );
          })()}
          <div className="flex justify-end mt-4">
            <button onClick={closeDayEventsPopup} className="btn-primary">Cerrar</button>
          </div>
        </div>
      </Modal>
      
      <HeartRainAnimation 
        isActive={showHeartRain} 
        type={heartAnimationType} 
      />

      {/* Delete confirmation modal */}
      <Modal isOpen={deleteConfirmation.isOpen} onClose={cancelDelete}>
        <div className="p-6 text-center">
          <div className="text-4xl mb-4">🗑️</div>
          <h3 className="text-lg font-semibold mb-2">Borrar evento</h3>
          <p className="text-gray-600 mb-6">
            ¿Estás seguro de que quieres borrar <strong>"{deleteConfirmation.eventTitle}"</strong>?
          </p>
          <p className="text-sm text-gray-500 mb-6">
            Esta acción no se puede deshacer.
          </p>
          <div className="flex gap-3 justify-center">
            <button 
              onClick={cancelDelete}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={confirmDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Borrar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
