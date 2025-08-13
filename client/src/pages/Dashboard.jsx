import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { listEvents } from '../lib/calendar';
import Countdown from '../components/Countdown';
import RandomPhoto from '../components/RandomPhoto';

export default function Dashboard() {
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);

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
    let isCancelled = false;
    async function fetchEvents() {
      console.log('🔄 Dashboard: Starting to load events');
      setLoading(true);
      try {
        const pairId = localStorage.getItem('pairId');
        if (pairId && !isCancelled) {
          const firestoreEvents = await listEvents(pairId, { futureOnly: true, max: 100 });
          
          // Generate special events
          const specialEvents = generateSpecialEvents();
          
          // Merge and sort all events chronologically
          const allEvents = [...firestoreEvents, ...specialEvents];
          allEvents.sort((a, b) => {
            const dateA = a.start?.toDate ? a.start.toDate() : new Date(0);
            const dateB = b.start?.toDate ? b.start.toDate() : new Date(0);
            return dateA - dateB;
          });
          
          console.log('✅ Dashboard: Events loaded', allEvents.length, 'events');
          setEvents(allEvents);
        }
      } catch (error) {
        console.error("Error fetching events:", error);
        // Even if Firestore fails, show special events
        const specialEvents = generateSpecialEvents();
        specialEvents.sort((a, b) => {
          const dateA = a.start?.toDate ? a.start.toDate() : new Date(0);
          const dateB = b.start?.toDate ? b.start.toDate() : new Date(0);
          return dateA - dateB;
        });
        setEvents(specialEvents);
      } finally {
        if (!isCancelled) {
          console.log('🏁 Dashboard: Loading finished');
          setLoading(false);
        }
      }
    }
    fetchEvents();
    return () => { isCancelled = true; };
  }, []);

  const nextEvent = useMemo(() => {
    // Only show next "conjunto" event for countdown
    const conjuntoEvents = events.filter(event => event.eventType === 'conjunto');
    const result = conjuntoEvents.length > 0 ? conjuntoEvents[0] : null;
    console.log('🎯 Dashboard: nextEvent changed', result ? result.title : 'null');
    return result;
  }, [events]);

  return (
    <div className="space-y-4">
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

      <div className="card">
        <div className="text-sm text-gray-600 mb-2">Próximo evento</div>
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
                
                return (
                  <li key={ev.id} className="text-sm flex items-center gap-2">
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
