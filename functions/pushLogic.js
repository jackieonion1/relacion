// Pure push text logic, kept apart from index.js so tests can load it without Firebase.

export const TZ = 'Europe/Madrid';

// Body of the "new event" push: the event stores no free text, so say when and where (Madrid time)
export function eventBody(data) {
  const start = data?.start?.toDate?.();
  const parts = [];
  if (start) {
    const date = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short' }).format(start);
    const time = new Intl.DateTimeFormat('es-ES', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(start);
    parts.push(`${date} · ${time}`);
  }
  const place = String(data?.location || '').trim();
  if (place) parts.push(place);
  return parts.join(' · ');
}
