// How the calendar words an event: dates, times and what the automatic ones are. Pure, no Firestore

const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const WEEKDAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
export const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

const pad2 = (n) => String(n).padStart(2, '0');
const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const sameDay = (a, b) => a.toDateString() === b.toDateString();

// The automatic events (anniversary, monthiversary, birthdays): their label, stamp and why they cannot be touched
const SPECIAL = {
  anniversary: { label: 'Aniversario', sello: '🎉', note: 'Lo pone la app cada año. No se puede editar ni borrar.' },
  monthiversary: { label: 'Mesiversario', sello: '💖', note: 'Lo pone la app cada día 24. No se puede editar ni borrar.' },
  birthday: { label: 'Cumpleaños', sello: '🎂', note: 'Lo pone la app cada año. No se puede editar ni borrar.' },
};

export function specialInfo(ev) {
  return (ev?.isSpecialEvent && SPECIAL[ev.specialType]) || null;
}

export function eventStart(ev) {
  return ev?.start?.toDate?.() || null;
}

// The end only when it falls on another day: a one-day event has none
export function eventEnd(ev) {
  const start = eventStart(ev);
  const end = ev?.end?.toDate?.() || null;
  return start && end && !sameDay(start, end) ? end : null;
}

export const timeText = (dt) => `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;

// "martes 24 de noviembre" (with the year when it is not this one)
function dayText(dt, now, withMonth = true) {
  const base = `${WEEKDAYS[dt.getDay()]} ${dt.getDate()}`;
  if (!withMonth) return base;
  const year = dt.getFullYear() !== now.getFullYear() ? ` de ${dt.getFullYear()}` : '';
  return `${base} de ${MONTHS[dt.getMonth()]}${year}`;
}

// Title of the day sheet: "Martes 24 de noviembre". No year: the month view under it already says it
export function dayTitle(day, month, year) {
  const dt = new Date(year, month, day);
  return cap(`${WEEKDAYS[dt.getDay()]} ${day} de ${MONTHS[month]}`);
}

// "Sábado, 10 de octubre · 21:00" or "Del viernes 9 al domingo 11 de octubre · 18:40"; automatic ones are all day
export function whenText(ev, now = new Date()) {
  const start = eventStart(ev);
  if (!start) return '';
  const end = eventEnd(ev);
  const time = specialInfo(ev) ? 'todo el día' : timeText(start);
  if (!end) {
    const [wd, ...rest] = dayText(start, now).split(' ');
    return `${cap(wd)}, ${rest.join(' ')} · ${time}`;
  }
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  return `Del ${dayText(start, now, !sameMonth)} al ${dayText(end, now)} · ${time}`;
}

// Second line of a list row: the time and the place, or "Todo el día" for the automatic ones
export function rowSub(ev) {
  const start = eventStart(ev);
  if (!start) return ev?.location || '';
  if (specialInfo(ev)) return 'Todo el día';
  return [timeText(start), ev.location].filter(Boolean).join(' · ');
}

// Day column of a list row: "24" over "mar", or "9–11" over "vie–dom" (only the start day if the end is another month)
export function rowDay(ev) {
  const start = eventStart(ev);
  if (!start) return { d: '', wd: '' };
  const end = eventEnd(ev);
  if (end && end.getMonth() === start.getMonth()) {
    return { d: `${start.getDate()}–${end.getDate()}`, wd: `${WEEKDAYS_SHORT[start.getDay()]}–${WEEKDAYS_SHORT[end.getDay()]}`, multi: true };
  }
  return { d: String(start.getDate()), wd: WEEKDAYS_SHORT[start.getDay()], multi: false };
}

export const monthShort = (dt) => MONTHS_SHORT[dt.getMonth()];

// Upcoming events grouped by month, in order: [{ key, name: "Octubre" | "Enero de 2027", items }]
export function byMonth(events, now = new Date()) {
  const groups = [];
  for (const ev of events) {
    const start = eventStart(ev);
    if (!start) continue;
    const key = `${start.getFullYear()}-${start.getMonth()}`;
    let group = groups[groups.length - 1];
    if (!group || group.key !== key) {
      const year = start.getFullYear() !== now.getFullYear() ? ` de ${start.getFullYear()}` : '';
      group = { key, name: cap(MONTHS[start.getMonth()]) + year, items: [] };
      groups.push(group);
    }
    group.items.push(ev);
  }
  return groups;
}

// Inside the day sheet a multi-day event says where in it that day is
export function daySub(ev, day, month, year) {
  const start = eventStart(ev);
  const end = eventEnd(ev);
  if (!start) return '';
  if (!end) return rowSub(ev);
  const toDay = (dt) => new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
  const on = new Date(year, month, day);
  const total = Math.round((toDay(end) - toDay(start)) / 86400000) + 1;
  const nth = Math.round((on - toDay(start)) / 86400000) + 1;
  if (nth <= 1) return `Empieza hoy · ${timeText(start)}`;
  if (nth >= total) return 'Último día';
  return `Día ${nth} de ${total}`;
}
