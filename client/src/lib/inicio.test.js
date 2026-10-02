import { BOTH_LABEL, cityTimeText, eventMark, identityEmoji, longDateText, togetherWords, uploadedText, whenText } from './inicio';

describe('togetherWords', () => {
  test('años, meses y días, con el acento en el último', () => {
    expect(togetherWords({ years: 1, months: 10, days: 6 })).toEqual(['1 año,', '10 meses', 'y 6 días']);
  });

  test('las mismas partes que el contador de antes: sin años si son 0, meses con años aunque sean 0', () => {
    expect(togetherWords({ years: 0, months: 3, days: 1 })).toEqual(['3 meses', 'y 1 día']);
    expect(togetherWords({ years: 2, months: 0, days: 0 })).toEqual(['2 años,', '0 meses', 'y 0 días']);
    expect(togetherWords({ years: 0, months: 0, days: 5 })).toEqual(['5 días']);
  });
});

describe('whenText', () => {
  const now = new Date(2026, 9, 2, 23, 30);
  test('por días de calendario', () => {
    expect(whenText(new Date(2026, 9, 2, 23, 50), now)).toBe('hoy');
    expect(whenText(new Date(2026, 9, 3, 0, 10), now)).toBe('mañana');
    expect(whenText(new Date(2026, 9, 24), now)).toBe('en 22 días');
  });
});

test('la fecha larga lleva la hora salvo a medianoche', () => {
  expect(longDateText(new Date(2026, 9, 13, 18, 40))).toBe('Martes 13 de octubre · 18:40');
  expect(longDateText(new Date(2026, 9, 24))).toBe('Sábado 24 de octubre');
});

test('«Próximo evento conjunto» pasa a la etiqueta de lib/eventTypes', () => {
  expect(BOTH_LABEL).toBe('Los dos');
});

test('emoji de cada fila: 🩷💛💜 por tipo, 💖 el 24, 🎂 los cumpleaños', () => {
  expect(eventMark({ eventType: 'conjunto' }).emoji).toBe('🩷');
  expect(eventMark({ eventType: 'novio' })).toEqual({ emoji: '💛', label: 'Novio' });
  expect(eventMark({ eventType: 'novia' })).toEqual({ emoji: '💜', label: 'Novia' });
  expect(eventMark({ eventType: 'conjunto', isSpecialEvent: true, specialType: 'monthiversary' }).emoji).toBe('💖');
  expect(eventMark({ eventType: 'lucy-birthday', isSpecialEvent: true, specialType: 'birthday' }).emoji).toBe('🎂');
});

test('cityTimeText: la hora de cada zona, y null sin zona o con una desconocida', () => {
  const now = new Date('2026-10-02T12:30:00Z');
  expect(cityTimeText('Asia/Tokyo', now)).toBe('21:30');
  expect(cityTimeText('America/Mexico_City', now)).toBe('06:30');
  expect(cityTimeText(null, now)).toBeNull();
  expect(cityTimeText('No/Existe', now)).toBeNull();
});

test('🍪 es ella y 🫒 es él; sin identity no hay pie', () => {
  expect(identityEmoji('ella')).toBe('🍪');
  expect(identityEmoji('yo')).toBe('🫒');
  expect(uploadedText({ identity: 'yo', createdAt: new Date(2025, 2, 12).getTime() }).text).toBe('La subió 🫒 · 12 mar 2025');
  expect(uploadedText({ identity: '' })).toBeNull();
  expect(uploadedText()).toBeNull();
});
