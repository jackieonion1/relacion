import { eventBody } from '../../../functions/pushLogic';

// El evento no guarda texto libre: la push dice cuándo y dónde, en hora de Madrid
const ts = (iso) => ({ toDate: () => new Date(iso) });

describe('eventBody', () => {
  test('fecha, hora de Madrid y lugar', () => {
    // 16:30 UTC = 18:30 en Madrid en verano (UTC+2)
    const body = eventBody({ title: 'Cena', start: ts('2026-10-24T16:30:00Z'), location: ' Casa de Lucy ' });
    expect(body).toMatch(/24/);
    expect(body).toContain('18:30');
    expect(body.endsWith(' · Casa de Lucy')).toBe(true);
  });

  test('en invierno la hora de Madrid es UTC+1', () => {
    expect(eventBody({ start: ts('2026-12-24T16:30:00Z') })).toContain('17:30');
  });

  test('sin lugar no deja separadores colgando', () => {
    expect(eventBody({ start: ts('2026-10-24T16:30:00Z'), location: '' }).endsWith('18:30')).toBe(true);
  });

  test('allDay: sin hora, aunque start esté a las 12:00', () => {
    // 10:00 UTC = 12:00 en Madrid en verano
    expect(eventBody({ allDay: true, start: ts('2026-10-24T10:00:00Z'), location: 'Casa' })).toBe('sáb, 24 oct · Casa');
    expect(eventBody({ allDay: true, start: ts('2026-10-24T10:00:00Z') })).toBe('sáb, 24 oct');
  });

  test('allDay: false conserva la hora, también a las 12:00 en punto', () => {
    expect(eventBody({ allDay: false, start: ts('2026-10-24T10:00:00Z') })).toBe('sáb, 24 oct · 12:00');
  });

  test('evento antiguo (sin allDay): las 12:00 exactas se leen como sin hora, las 12:01 no', () => {
    expect(eventBody({ start: ts('2026-10-24T10:00:00Z') })).toBe('sáb, 24 oct');
    expect(eventBody({ start: ts('2026-12-24T11:00:00Z') })).toBe('jue, 24 dic');
    expect(eventBody({ start: ts('2026-10-24T10:01:00Z') })).toBe('sáb, 24 oct · 12:01');
  });

  test('varios días: el rango, sin hora', () => {
    const body = eventBody({
      allDay: true, start: ts('2026-10-24T10:00:00Z'), end: ts('2026-10-28T21:59:59Z'), location: 'Lisboa',
    });
    expect(body).toBe('sáb, 24 – mié, 28 oct · Lisboa');
    // Con hora de salida tampoco se muestra: el rango manda
    expect(eventBody({ allDay: false, start: ts('2026-10-24T16:30:00Z'), end: ts('2026-10-28T21:59:59Z') })).toBe('sáb, 24 – mié, 28 oct');
  });

  test('varios días entre dos meses nombra los dos', () => {
    expect(eventBody({ start: ts('2026-10-31T10:00:00Z'), end: ts('2026-11-02T22:00:00Z') })).toBe('sáb, 31 oct – lun, 2 nov');
  });

  test('el fin se mira en Madrid: 23:59 del mismo día no es un rango', () => {
    // 21:59:59 UTC = 23:59:59 en Madrid
    expect(eventBody({ start: ts('2026-10-24T16:30:00Z'), end: ts('2026-10-24T21:59:59Z') })).toContain('18:30');
    expect(eventBody({ start: ts('2026-10-24T16:30:00Z'), end: ts('2026-10-24T21:59:59Z') })).not.toContain('–');
  });

  test('sin fecha ni lugar, texto vacío (nunca revienta)', () => {
    expect(eventBody({})).toBe('');
    expect(eventBody(undefined)).toBe('');
  });
});
