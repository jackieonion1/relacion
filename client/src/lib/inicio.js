// Texts of the Inicio screen (R5). Only presentation: the data come from together, specialDays, calendar and photos

import { EVENT_TYPES } from './eventTypes';
import { db } from './firebase';

const TYPE_TEXT = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, t.text]));
const TYPE_EMOJI = Object.fromEntries(EVENT_TYPES.map((t) => [t.value, t.emoji]));

// What the shared events call "Los dos" (Q7): the old "Próximo evento conjunto" takes it from here
export const BOTH_LABEL = TYPE_TEXT.conjunto;

// 🍪 = ella / 🫒 = él, by the stored identity ('ella' | 'yo')
export function identityEmoji(identity) {
  if (identity === 'ella') return '🍪';
  if (identity === 'yo') return '🫒';
  return '';
}

// "Llevamos juntos" as a sentence: the same parts as the old counter (years only if > 0, months if > 0 or with
// years, days always), split so the last one carries the accent: ['1 año,', '10 meses', 'y 6 días']
export function togetherWords({ years, months, days }) {
  const parts = [];
  if (years > 0) parts.push(`${years} ${years === 1 ? 'año' : 'años'}`);
  if (months > 0 || years > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
  parts.push(`${days} ${days === 1 ? 'día' : 'días'}`);
  if (parts.length === 1) return parts;
  const last = parts.length - 1;
  return parts.map((p, i) => (i === last ? `y ${p}` : i < last - 1 ? `${p},` : p));
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

// "hoy", "mañana" or "en N días", by calendar days
export function whenText(date, now = new Date()) {
  const n = Math.round((startOfDay(date) - startOfDay(now)) / 86400000);
  if (n <= 0) return 'hoy';
  if (n === 1) return 'mañana';
  return `en ${n} días`;
}

function hasTime(d) {
  return d.getHours() !== 0 || d.getMinutes() !== 0;
}

function capitalize(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

// "Viernes, 2 de octubre"
export function todayText(now = new Date()) {
  return capitalize(now.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }));
}

// "Martes 13 de octubre · 18:40" (no time at midnight: all-day events and special days)
export function longDateText(d) {
  const date = capitalize(d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }).replace(',', ''));
  return hasTime(d) ? `${date} · ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}` : date;
}

// "sáb 24 oct"
export function shortDateText(d) {
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '').replace(/\./g, '');
}

// "24 oct", and the month for the calendar tile ("OCT")
export function dayMonthText(d) {
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace(/\./g, '');
}
export function monthTile(d) {
  return d.toLocaleDateString('es-ES', { month: 'short' }).replace(/\./g, '').toUpperCase();
}

// Emoji and screen-reader name of a row: 🩷💛💜 by type, 💖 for the 24th, 🎂 for the birthdays
export function eventMark(ev) {
  if (ev.specialType === 'birthday') return { emoji: '🎂', label: 'Cumpleaños' };
  if (ev.isSpecialEvent && ev.eventType === 'conjunto') return { emoji: '💖', label: BOTH_LABEL };
  return { emoji: TYPE_EMOJI[ev.eventType] || TYPE_EMOJI.conjunto, label: TYPE_TEXT[ev.eventType] || BOTH_LABEL };
}

// The words of the weather condition the sky colours are keyed by (weatherType)
const SKY_WORDS = {
  soleado: 'despejado', parcial: 'algo nublado', nublado: 'nublado', lluvia: 'lluvia',
  tormenta: 'tormenta', nieve: 'nieve', niebla: 'niebla',
};
export function skyWords(type) {
  return SKY_WORDS[type] || '';
}

// "La subió 🍪 · 12 mar 2025" (C11). Read-only: who uploaded the photo of the day and when. Null when the photo
// has no identity (old uploads), so the caption is not painted
export function uploadedText({ identity, createdAt } = {}) {
  const who = identityEmoji(identity);
  if (!who) return null;
  const d = createdAt ? new Date(createdAt) : null;
  const when = d && !Number.isNaN(d.getTime())
    ? d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\./g, '')
    : '';
  return { who, text: when ? `La subió ${who} · ${when}` : `La subió ${who}` };
}

// The photo document's identity and upload time; nothing on any failure (the caption just stays hidden)
export async function photoUploader(pairId, id) {
  if (!pairId || !id) return null;
  try {
    if (!db) return null;
    const f = await import('firebase/firestore');
    const snap = await f.getDoc(f.doc(db, 'pairs', pairId, 'photos', id));
    if (!snap.exists()) return null;
    const data = snap.data() || {};
    return { identity: data.identity || '', createdAt: data.createdAt?.toMillis?.() || null };
  } catch {
    return null;
  }
}
