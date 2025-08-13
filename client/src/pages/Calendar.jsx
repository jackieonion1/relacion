import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { addEvent, listEvents, deleteEvent } from '../lib/calendar';
import Modal from '../components/Modal';
import EventTypeSwitcher from '../components/EventTypeSwitcher';
import ViewSwitcher from '../components/ViewSwitcher';
import MonthlyCalendarView from '../components/MonthlyCalendarView';
import CollapsibleSection from '../components/CollapsibleSection';
import HeartRainAnimation from '../components/HeartRainAnimation';

const EventList = ({ events, onDelete, onItemClick }) => {
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
            // Multi-day event: show date range
            const endStr = endDate.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
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
              <div className="text-sm text-gray-500 truncate">{when}{ev.location ? ` · ${ev.location}` : ''}</div>
            </div>
            {!ev.isSpecialEvent && (
              <button
                onClick={(e) => { e.stopPropagation(); onDelete(ev.id); }}
                className="btn-link text-sm"
              >
                Borrar
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
};

export default function CalendarPage() {
  const location = useLocation();
  const [view, setView] = useState('Lista'); // 'Lista' | 'Calendario'
  const [isModalOpen, setIsModalOpen] = useState(false);
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const identity = useMemo(() => localStorage.getItem('identity') || 'yo', []);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
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
        const list = await listEvents(pairId, { futureOnly: false, max: 100 });
        
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

  async function onAdd(e) {
    e.preventDefault();
    const { title, location, date, time, endDate } = Object.fromEntries(new FormData(e.currentTarget));
    if (!title || !date) return;
    setSaving(true);
    setError('');
    
    // Call addEvent and close popup regardless of result
    addEvent(pairId, { title, date, time, endDate, location, eventType: selectedEventType }, identity);
    
    e.currentTarget.reset();
    setSelectedEventType('conjunto'); // Reset to default
    setIsModalOpen(false);
    setSaving(false);
    setRefreshKey(k => k + 1); // Force a reliable refetch
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
                {loading ? <div className="text-gray-500 px-4 py-2">Cargando…</div> : <EventList events={upcomingEvents} onDelete={onDelete} onItemClick={handleListItemClick} />}
              </CollapsibleSection>
            </div>
            <div className="card rounded-t-none">
              <CollapsibleSection title="Eventos pasados">
                <EventList events={pastEvents} onDelete={onDelete} onItemClick={handleListItemClick} />
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

      {/* New event button - visible in both views */}
      <button onClick={() => setIsModalOpen(true)} className="fixed bottom-24 right-4 bg-rose-500 text-white rounded-full px-5 py-3 font-semibold shadow-lg hover:bg-rose-600 transition-transform active:scale-95">
        Nuevo evento
      </button>

      <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)}>
        <form onSubmit={onAdd} className="p-6 space-y-4">
          <h3 className="font-semibold text-lg">Añadir evento</h3>
          <div className="space-y-3">
            <input name="title" placeholder="Título" className="input w-full" required />
            <input name="location" placeholder="Ubicación (opcional)" className="input w-full" />
            <div className="grid grid-cols-2 gap-3">
              <input name="date" type="date" className="input w-full" required />
              <input name="time" type="time" className="input w-full" />
            </div>
            <input name="endDate" type="date" className="input w-full" />
            <div className="space-y-2">
              <label className="block text-sm text-gray-600">Tipo de evento</label>
              <EventTypeSwitcher 
                activeType={selectedEventType} 
                onChange={setSelectedEventType} 
              />
            </div>
          </div>
          {error && <p className="text-xs text-rose-600">{error}</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsModalOpen(false)} className="btn-ghost">Cancelar</button>
            <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Guardando…' : 'Añadir'}</button>
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
                  <EventList events={dayEvents} onDelete={onDelete} />
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
