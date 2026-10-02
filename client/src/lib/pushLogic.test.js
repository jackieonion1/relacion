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

  test('sin fecha ni lugar, texto vacío (nunca revienta)', () => {
    expect(eventBody({})).toBe('');
    expect(eventBody(undefined)).toBe('');
  });
});
