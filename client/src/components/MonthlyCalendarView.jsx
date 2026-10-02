import React, { useState, useMemo, useEffect } from 'react';
import Icon from './Icon';
import { birthdayOn, isAnniversary, isMonthiversaryDay } from '../lib/specialDays';
import { EVENT_TYPES, eventTypeOf } from '../lib/eventTypes';

const monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const dayNames = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
// Cell tint of the days with a party: every 24th rose, each birthday in the colour of its owner
const PARTY_TINT = { 'lucy-birthday': 'bg-sello-ella', 'sebas-birthday': 'bg-sello-el' };
// Bars stacked from the bottom of the cell by lane, 6 px apart
const LANE_BOTTOM = [3, 9, 15];

// selected = { day, month, year } of the open day, marked in ink
export default function MonthlyCalendarView({ events = [], onDayClick, targetDate, selected }) {
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

  const monthGen = monthNames[month].toLowerCase();
  const calendarDays = [];
  // Padding for previous month
  for (let i = 0; i < firstDayOfMonth; i++) {
    calendarDays.push(<span key={`pad-start-${i}`} aria-hidden="true" className="h-[58px]"></span>);
  }
  // Days of current month
  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(year, month, day);
    const isToday = date.toDateString() === new Date().toDateString();
    const isSelected = !!selected && selected.day === day && selected.month === month && selected.year === year;
    const isSpecialDay = isMonthiversaryDay(day); // Day 24 is special ❤️
    const birthday = birthdayOn(day, month)?.eventType; // April 21 and November 4 🎉
    const col = (firstDayOfMonth + day - 1) % 7;
    const dateString = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
    const eventInfos = eventsByDay.get(dateString) || [];

    // Event lines on their assigned lanes; a bar that goes on into the next week stays open at the row's edge
    const eventBars = eventInfos.map((eventInfo, index) => {
      const startsHere = eventInfo.type === 'single' || eventInfo.type === 'start';
      const endsHere = eventInfo.type === 'single' || eventInfo.type === 'end';
      const openLeft = !startsHere && col !== 0;
      const openRight = !endsHere && col !== 6;
      const left = startsHere ? 'calc(50% - 8px)' : (openLeft ? '0' : '4px');
      const right = endsHere ? 'calc(50% - 8px)' : (openRight ? '0' : '4px');
      const l = openLeft ? '0' : '2px';
      const r = openRight ? '0' : '2px';
      return (
        <span
          key={`${eventInfo.lane}-${index}`}
          className={`absolute h-1 ${eventTypeOf(eventInfo.eventType).color}`}
          style={{ bottom: LANE_BOTTOM[eventInfo.lane], left, right, borderRadius: `${l} ${r} ${r} ${l}` }}
        />
      );
    });

    const party = isSpecialDay ? (isAnniversary(day, month) ? ', aniversario' : ', mesiversario') : (birthday ? ', cumpleaños' : '');
    const count = eventInfos.length ? `, ${eventInfos.length} ${eventInfos.length > 1 ? 'eventos' : 'evento'}` : '';
    const tint = isSpecialDay ? 'bg-lacre-soft' : (PARTY_TINT[birthday] || '');
    let disc = 'font-medium';
    if (isSelected) disc = 'bg-ink text-paper font-bold';
    else if (isToday) disc = 'bg-lacre text-on-lacre font-bold';

    calendarDays.push(
      <button
        type="button"
        key={`day-${day}`}
        aria-label={`${day} de ${monthGen}${isToday ? ', hoy' : ''}${party}${count}`}
        aria-pressed={isSelected}
        className={`relative h-[58px] flex flex-col items-center pt-1 rounded-xl transition-colors active:bg-sunk ${tint}`}
        onClick={() => onDayClick && onDayClick(day, currentDate.getMonth(), currentDate.getFullYear())}
      >
        <span className={`num w-[34px] h-[34px] flex items-center justify-center rounded-full text-[15px] ${disc}`}>
          {day}
        </span>
        {(isSpecialDay || birthday) && (
          <span aria-hidden="true" className="absolute top-0.5 right-0.5 text-[11px] leading-none">
            {isSpecialDay ? '💖' : '🎉'}
          </span>
        )}
        <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[22px]">{eventBars}</span>
      </button>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between pb-2">
        <button type="button" onClick={handlePrevMonth} aria-label="Mes anterior" className="btn btn-icono"><Icon name="atras" size={20} /></button>
        <h2 className="serif text-2xl font-normal text-center">{monthNames[month]} {year}</h2>
        <button type="button" onClick={handleNextMonth} aria-label="Mes siguiente" className="btn btn-icono"><Icon name="siguiente" size={20} /></button>
      </div>
      <div aria-hidden="true" className="grid grid-cols-7 pb-1">
        {dayNames.map((day) => <span key={day} className="etiqueta text-center">{day}</span>)}
      </div>
      <div className="grid grid-cols-7 gap-y-0.5">
        {calendarDays}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 justify-center pt-4 text-[13px] text-ink-2">
        {EVENT_TYPES.map((t) => (
          <span key={t.value} className="flex items-center gap-1.5">
            <span aria-hidden="true" className={`w-4 h-1 rounded-sm ${t.color}`}></span>{t.emoji} {t.text}
          </span>
        ))}
      </div>
    </div>
  );
}
