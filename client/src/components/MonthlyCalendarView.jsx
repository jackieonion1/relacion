import React, { useState, useMemo, useEffect } from 'react';

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const dayNames = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];

export default function MonthlyCalendarView({ events = [], onDayClick, targetDate }) {
  const [currentDate, setCurrentDate] = useState(new Date());

  // If parent provides a targetDate, sync the shown month to it
  useEffect(() => {
    if (targetDate instanceof Date && !isNaN(targetDate)) {
      setCurrentDate(new Date(targetDate.getFullYear(), targetDate.getMonth(), 1));
    }
  }, [targetDate]);

  const eventsByDay = useMemo(() => {
    const eventMap = new Map();
    const eventLanes = new Map(); // Track which lane each event uses
    let nextLane = 0;
    
    // Sort events by duration (longer events first) then by start date
    const sortedEvents = [...events].sort((a, b) => {
      if (!a.start?.toDate || !b.start?.toDate) return 0;
      
      const aStart = a.start.toDate();
      const aEnd = a.end?.toDate() || aStart;
      const aDuration = Math.ceil((aEnd - aStart) / (1000 * 60 * 60 * 24)) + 1;
      
      const bStart = b.start.toDate();
      const bEnd = b.end?.toDate() || bStart;
      const bDuration = Math.ceil((bEnd - bStart) / (1000 * 60 * 60 * 24)) + 1;
      
      // Longer events first (higher priority for lower lanes)
      if (aDuration !== bDuration) {
        return bDuration - aDuration;
      }
      
      // If same duration, sort by start date
      return aStart - bStart;
    });
    
    for (const event of sortedEvents) {
      if (!event.start?.toDate) continue;
      const start = event.start.toDate();
      const end = event.end?.toDate() || start;
      
      // Find an available lane for this event
      let assignedLane = null;
      for (let lane = 0; lane < 3; lane++) {
        let laneAvailable = true;
        let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        
        // Check if this lane is free for all days of this event
        while (current <= end && laneAvailable) {
          const dateString = `${current.getFullYear()}-${current.getMonth()}-${current.getDate()}`;
          if (eventMap.has(dateString)) {
            const dayEvents = eventMap.get(dateString);
            if (dayEvents.some(e => e.lane === lane)) {
              laneAvailable = false;
            }
          }
          current.setDate(current.getDate() + 1);
        }
        
        if (laneAvailable) {
          assignedLane = lane;
          break;
        }
      }
      
      // If no lane available, skip this event (max 3 events per day)
      if (assignedLane === null) continue;
      
      // Now assign this event to its lane for all its days
      let current = new Date(start.getFullYear(), start.getMonth(), start.getDate());
      
      while (current <= end) {
        const dateString = `${current.getFullYear()}-${current.getMonth()}-${current.getDate()}`;
        const isStart = current.toDateString() === start.toDateString();
        const isEnd = current.toDateString() === end.toDateString();
        
        let type = 'middle';
        if (isStart && isEnd) type = 'single';
        else if (isStart) type = 'start';
        else if (isEnd) type = 'end';
        
        // Store event with its assigned lane
        if (!eventMap.has(dateString)) {
          eventMap.set(dateString, []);
        }
        eventMap.get(dateString).push({ 
          type, 
          eventType: event.eventType || 'conjunto',
          lane: assignedLane
        });
        current.setDate(current.getDate() + 1);
      }
    }
    
    return eventMap;
  }, [events]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const firstDayOfMonth = (new Date(year, month, 1).getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const calendarDays = [];
  // Padding for previous month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(<div key={`pad-start-${i}`} className="p-2"></div>);
  }
  // Days of current month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = date.toDateString() === new Date().toDateString();
    const isSpecialDay = day === 24; // Day 24 is special ❤️
    const isAprilParty = day === 21 && month === 3; // April 21 🎉
    const isNovemberParty = day === 4 && month === 10; // November 4 🎉
    const dateString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const eventInfos = eventsByDay.get(dateString) || [];

    // Render event lines using their assigned lanes
    const eventBars = eventInfos.map((eventInfo, index) => {
      // Color based on event type
      let colorClass = 'bg-rose-500'; // Default: conjunto (pink)
      if (eventInfo.eventType === 'novio') {
        colorClass = 'bg-yellow-500'; // Novio: yellow
      } else if (eventInfo.eventType === 'novia') {
        colorClass = 'bg-purple-500'; // Novia: purple
      } else if (eventInfo.eventType === 'sebas-birthday') {
        colorClass = 'bg-yellow-500'; // Sebas birthday: yellow
      } else if (eventInfo.eventType === 'lucy-birthday') {
        colorClass = 'bg-purple-400'; // Lucy birthday: lilac
      } else if (eventInfo.eventType === 'conjunto' && eventInfo.isSpecialEvent) {
        colorClass = 'bg-rose-500'; // Anniversary/monthiversary: pink
      }
      
      // Position based on assigned lane with uniform 6px spacing (using safe positions)
      const bottomPosition = eventInfo.lane === 0 ? 'bottom-1' : eventInfo.lane === 1 ? 'bottom-2.5' : 'bottom-4';
      const baseClasses = `absolute ${bottomPosition} h-1 ${colorClass}`;
      
      if (eventInfo.type === 'single') {
        return <div key={`${eventInfo.lane}-${index}`} className={`${baseClasses} left-1/2 -translate-x-1/2 w-4 rounded-full`}></div>;
      } else if (eventInfo.type === 'start') {
        // Start from where single event would start, extend to edge + margin
        return <div key={`${eventInfo.lane}-${index}`} className={`${baseClasses} right-1 rounded-full`} style={{left: 'calc(50% - 8px)'}}></div>;
      } else if (eventInfo.type === 'end') {
        // Start from edge + margin, end where single event would end  
        return <div key={`${eventInfo.lane}-${index}`} className={`${baseClasses} left-1 rounded-full`} style={{right: 'calc(50% - 8px)'}}></div>;
      } else if (eventInfo.type === 'middle') {
        // Full width with small margins to preserve border radius
        return <div key={`${eventInfo.lane}-${index}`} className={`${baseClasses} left-1 right-1 rounded-full`}></div>;
      }
      return null;
    });

    calendarDays.push(
      <div 
        key={`day-${day}`} 
        className={`p-1 text-center border border-gray-200/80 rounded-lg h-16 flex items-center justify-center relative cursor-pointer hover:bg-gray-50 transition-colors ${isSpecialDay ? 'bg-rose-50 hover:bg-rose-100' : ''} ${isAprilParty ? 'bg-purple-50 hover:bg-purple-100' : ''} ${isNovemberParty ? 'bg-yellow-50 hover:bg-yellow-100' : ''}`}
        onClick={() => onDayClick && onDayClick(day, currentDate.getMonth(), currentDate.getFullYear())}
      >
        <span className={`w-8 h-8 flex items-center justify-center rounded-full ${isToday ? 'bg-rose-500 text-white' : ''}`}>
          {day}
        </span>
        {isSpecialDay && (
          <div className="absolute top-0.5 right-0.5 text-xs">
            💖
          </div>
        )}
        {(isAprilParty || isNovemberParty) && (
          <div className="absolute top-0.5 right-0.5 text-xs">
            🎉
          </div>
        )}
        {eventBars}
      </div>
    );
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <button onClick={handlePrevMonth} className="btn-ghost p-2 rounded-full w-10 h-10 flex items-center justify-center text-xl">‹</button>
        <h3 className="font-semibold text-lg text-center">{monthNames[month]} {year}</h3>
        <button onClick={handleNextMonth} className="btn-ghost p-2 rounded-full w-10 h-10 flex items-center justify-center text-xl">›</button>
      </div>
      <div className="grid grid-cols-7 gap-2 text-center text-sm font-medium text-gray-500 mb-2">
        {dayNames.slice(1).map(day => <div key={day}>{day}</div>)}
        <div>{dayNames[0]}</div>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {calendarDays}
      </div>
    </div>
  );
}
