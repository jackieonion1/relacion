import React from 'react';
import Icon from './Icon';
import { eventTypeOf } from '../lib/eventTypes';
import { byMonth, daySub, eventStart, monthShort, rowDay, rowSub, specialInfo } from '../lib/eventText';

// "nos vemos" on one line: it never wraps, and drops below the time if the row is too narrow (A3)
function MeetChip() {
  return <span className="chip h-auto py-0.5 px-2 text-xs whitespace-nowrap">nos vemos</span>;
}

// Upcoming events, by month; every row opens the event sheet
export function UpcomingList({ events, onOpen }) {
  return (
    <div className="flex flex-col gap-3.5">
      {byMonth(events).map((group) => (
        <div key={group.key} className="flex flex-col gap-1.5">
          <h3 className="text-[13px] font-semibold text-ink-2 px-1">{group.name}</h3>
          <ul className="flex flex-col rounded-tarjeta bg-card border border-line overflow-hidden">
            {group.items.map((ev, i) => {
              const { d, wd, multi } = rowDay(ev);
              const type = eventTypeOf(ev.eventType);
              const special = specialInfo(ev);
              return (
                <li key={ev.id} className={i ? 'border-t border-line' : ''}>
                  <button
                    type="button"
                    onClick={() => onOpen(ev)}
                    className="w-full grid grid-cols-[52px_minmax(0,1fr)_auto] items-center gap-3 min-h-16 py-2.5 pl-2.5 pr-4 text-left active:bg-sunk"
                  >
                    <span className="flex flex-col items-center">
                      <span className={`serif num leading-none whitespace-nowrap ${multi ? 'text-[19px]' : 'text-[26px]'}`}>{d}</span>
                      <span className="text-xs text-ink-2">{wd}</span>
                    </span>
                    <span className="flex flex-col gap-0.5 min-w-0">
                      <span className="text-base font-semibold text-ink flex items-center gap-1.5 min-w-0">
                        <span className="min-w-0 line-clamp-2 break-words">{ev.title}</span>
                        {special && <span role="img" aria-label="Día especial" className="text-sm leading-none shrink-0">{special.sello}</span>}
                      </span>
                      <span className="text-sm text-ink-2 flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0">
                        <span className="truncate min-w-0">{rowSub(ev)}</span>
                        {ev.seeEachOther && <MeetChip />}
                      </span>
                    </span>
                    <span className="flex items-center gap-1.5 text-[13px] text-ink-2 whitespace-nowrap">
                      <span aria-hidden="true" className="leading-none">{type.emoji}</span>{type.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

// Past events, newest first, quieter
export function PastList({ events, onOpen }) {
  if (events.length === 0) {
    return <p className="px-1 py-2 text-[15px] text-ink-2">Todavía no hay eventos pasados.</p>;
  }
  return (
    <ul className="flex flex-col rounded-tarjeta bg-paper border border-line overflow-hidden">
      {events.map((ev, i) => {
        const start = eventStart(ev);
        return (
          <li key={ev.id} className={i ? 'border-t border-line' : ''}>
            <button
              type="button"
              onClick={() => onOpen(ev)}
              className="w-full grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-3 min-h-14 py-2 pl-3 pr-4 text-left text-ink-2 active:bg-sunk"
            >
              <span className="serif num text-[22px] text-center">{start ? start.getDate() : ''}</span>
              <span className="text-[15px] truncate">{ev.title}</span>
              <span className="text-[13px]">{start ? `${monthShort(start)} ${start.getFullYear() !== new Date().getFullYear() ? start.getFullYear() : ''}`.trim() : ''}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// Events of the open day, each with its colour bar; tapping one opens its sheet
export function DayList({ events, day, onOpen }) {
  return (
    <ul className="flex flex-col gap-2">
      {events.map((ev) => {
        const type = eventTypeOf(ev.eventType);
        return (
          <li key={ev.id}>
            <button
              type="button"
              onClick={() => onOpen(ev)}
              className="w-full flex items-center gap-3 min-h-[60px] py-2.5 px-3.5 rounded-[18px] bg-paper border border-line text-left active:bg-sunk"
            >
              <span aria-hidden="true" className={`w-1 self-stretch rounded-sm ${type.color}`} />
              <span className="flex-1 flex flex-col gap-0.5 min-w-0">
                <span className="text-base font-semibold text-ink truncate">{ev.title}</span>
                <span className="text-sm text-ink-2 flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span>{daySub(ev, day.day, day.month, day.year)} · {type.emoji} {type.text}</span>
                  {ev.seeEachOther && <MeetChip />}
                </span>
              </span>
              <Icon name="siguiente" size={20} className="text-ink-2" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
