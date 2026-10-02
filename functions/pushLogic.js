// Pure push text logic, kept apart from index.js so tests can load it without Firebase.

export const TZ = 'Europe/Madrid';

const dayFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' });
const timeFormat = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false });
const dayKeyFormat = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

// "sáb, 24" and "oct" of a date, to join two days into a range
function dayParts(date) {
  const parts = dayFormat.formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return { day: `${get('weekday')}, ${get('day')}`, month: get('month') };
}

// Body of the "new event" push: the event stores no free text, so say when and where (Madrid time).
// The form saves allDay when no time was given (it stores 12:00 then); older events lack the field,
// so exactly 12:00 counts as no time. A multi-day event shows its range instead of a time
export function eventBody(data) {
  const start = data?.start?.toDate?.();
  const end = data?.end?.toDate?.();
  const parts = [];
  if (start) {
    const time = timeFormat.format(start);
    const noTime = data.allDay === true || (data.allDay === undefined && time === '12:00');
    if (end && dayKeyFormat.format(end) !== dayKeyFormat.format(start)) {
      const a = dayParts(start);
      const b = dayParts(end);
      parts.push(a.month === b.month ? `${a.day} – ${b.day} ${b.month}` : `${a.day} ${a.month} – ${b.day} ${b.month}`);
    } else {
      parts.push(noTime ? dayFormat.format(start) : `${dayFormat.format(start)} · ${time}`);
    }
  }
  const place = String(data?.location || '').trim();
  if (place) parts.push(place);
  return parts.join(' · ');
}
