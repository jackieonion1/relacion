import { BIRTHDAYS, START, madridDate, remindersFor } from '../../../functions/reminders';
import { ANNIVERSARY } from './together';
import { BIRTHDAYS as APP_BIRTHDAYS } from './specialDays';

// Las 9:00 de Madrid de cada fecha: UTC+2 en verano, UTC+1 en invierno
const at = (iso) => new Date(iso);
const kinds = (d) => remindersFor(d).map((r) => r.kind);

describe('qué push toca hoy', () => {
  test('el 24 de cada mes es mesiversario, contando los meses desde el inicio', () => {
    const [r] = remindersFor(at('2026-10-24T07:00:00Z'));
    expect(r.kind).toBe('monthiversary');
    expect(r.texts.yo.title).toBe('💖 ¡Feliz mesiversario!');
    expect(r.texts.yo.body).toBe('Hoy hacéis 1 año y 11 meses. Dile algo bonito a tu 🍪.');
    expect(r.texts.ella.body).toBe('Hoy hacéis 1 año y 11 meses. Dile algo bonito a tu 🫒.');
    expect(remindersFor(at('2024-12-24T08:00:00Z'))[0].texts.yo.body).toMatch('Hoy hacéis 1 mes.');
  });

  test('el 24 de noviembre es el aniversario', () => {
    const [r] = remindersFor(at('2026-11-24T08:00:00Z'));
    expect(r.kind).toBe('anniversary');
    expect(r.texts.ella.title).toBe('🎉 ¡Feliz aniversario!');
    expect(r.texts.ella.body).toMatch('Hoy hacéis 2 años.');
  });

  test('el día de inicio no es mesiversario y un día cualquiera no toca nada', () => {
    expect(kinds(at('2024-11-24T08:00:00Z'))).toEqual([]);
    expect(kinds(at('2026-10-23T07:00:00Z'))).toEqual([]);
    expect(kinds(at('2026-10-25T07:00:00Z'))).toEqual([]);
  });

  test('cada cumpleaños avisa distinto al que cumple y al otro', () => {
    const [ella] = remindersFor(at('2026-04-21T07:00:00Z'));
    expect(ella.kind).toBe('birthday');
    expect(ella.texts.ella).toEqual({ title: '🎂 ¡Feliz cumpleaños, 🍪!', body: 'Hoy cumples 23 años. Hoy manda quien cumple 💖' });
    expect(ella.texts.yo).toEqual({ title: '🎂 Hoy es el cumple de tu 🍪', body: 'Cumple 23 años. ¡Que se note lo que lo quieres!' });
    const [el] = remindersFor(at('2026-11-04T08:00:00Z'));
    expect(el.texts.yo.title).toBe('🎂 ¡Feliz cumpleaños, 🫒!');
    expect(el.texts.yo.body).toMatch('28 años');
    expect(el.texts.ella.title).toBe('🎂 Hoy es el cumple de tu 🫒');
  });
});

describe('el día es el de Madrid, no el de UTC', () => {
  test('en verano (UTC+2) las 00:30 del 24 ya son 24, y las 00:30 del 25 ya no', () => {
    expect(madridDate(at('2026-10-23T22:30:00Z'))).toEqual({ year: 2026, month: 10, day: 24 });
    expect(kinds(at('2026-10-23T22:30:00Z'))).toEqual(['monthiversary']);
    expect(kinds(at('2026-10-24T22:30:00Z'))).toEqual([]);
  });

  test('en invierno (UTC+1) la frontera se mueve una hora', () => {
    expect(kinds(at('2026-12-23T22:30:00Z'))).toEqual([]);
    expect(kinds(at('2026-12-23T23:30:00Z'))).toEqual(['monthiversary']);
  });
});

// functions/ no puede importar del cliente: sus copias de las fechas se vigilan aquí
describe('las fechas de functions son las de la app', () => {
  test('inicio y aniversario', () => {
    expect([START.year, START.month, START.day]).toEqual([ANNIVERSARY.getFullYear(), ANNIVERSARY.getMonth() + 1, ANNIVERSARY.getDate()]);
  });

  test('cumpleaños', () => {
    const who = { 'lucy-birthday': 'ella', 'sebas-birthday': 'yo' };
    expect(BIRTHDAYS).toEqual(APP_BIRTHDAYS.map((b) => ({
      who: who[b.eventType], year: b.date.getFullYear(), month: b.date.getMonth() + 1, day: b.date.getDate(),
    })));
  });
});
