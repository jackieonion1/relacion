// How Notas words a note: when it was written, who wrote it and its preview. Pure, no Firestore
import { sanitizeHtml, htmlToPlain } from './sanitize';
import { timeText } from './eventText';

const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// createdAt is a Firestore Timestamp, or null while our own write waits for the server
export function noteMillis(note) {
  const t = note?.createdAt;
  if (!t) return 0;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (t.seconds) return t.seconds * 1000;
  return 0;
}

// "hoy, 08:02" · "ayer, 23:20" · "12 sep" (with the year when it is not this one). No time yet: "ahora"
export function noteWhen(note, now = new Date()) {
  const ms = noteMillis(note);
  if (!ms) return 'ahora';
  const dt = new Date(ms);
  if (dt.toDateString() === now.toDateString()) return `hoy, ${timeText(dt)}`;
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  if (dt.toDateString() === yesterday.toDateString()) return `ayer, ${timeText(dt)}`;
  const year = dt.getFullYear() !== now.getFullYear() ? ` ${dt.getFullYear()}` : '';
  return `${dt.getDate()} ${MONTHS_SHORT[dt.getMonth()]}${year}`;
}

// 🫒 = him ('yo'), 🍪 = her ('ella'); nothing for notes without a known author
export function authorEmoji(identity) {
  if (identity === 'yo') return '🫒';
  if (identity === 'ella') return '🍪';
  return '';
}

// Plain preview of a rich note (the old markdown ones keep MarkdownRenderer)
export function notePlain(note) {
  if (note?.plain) return note.plain;
  return note?.html ? htmlToPlain(sanitizeHtml(note.html)) : '';
}
