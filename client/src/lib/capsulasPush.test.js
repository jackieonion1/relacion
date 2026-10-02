import { capsuleDay, capsulePushes } from '../../../functions/capsulas';

const at = (iso) => new Date(iso);

describe('el día de Madrid de las cápsulas (morningReminders, 9:00)', () => {
  test('va de las 00:00 a las 00:00 de Madrid, también el día del cambio de hora', () => {
    expect(capsuleDay(at('2026-11-24T08:00:00Z'))).toEqual({ start: at('2026-11-23T23:00:00Z'), end: at('2026-11-24T23:00:00Z') });
    expect(capsuleDay(at('2026-07-01T07:00:00Z'))).toEqual({ start: at('2026-06-30T22:00:00Z'), end: at('2026-07-01T22:00:00Z') });
    // 25 oct 2026: el día dura 25 horas
    expect(capsuleDay(at('2026-10-25T08:00:00Z'))).toEqual({ start: at('2026-10-24T22:00:00Z'), end: at('2026-10-25T23:00:00Z') });
  });
});

describe('la push del día en que se abre una cápsula', () => {
  test('una para el otro: solo le llega a quien va dirigida, sin título ni contenido', () => {
    const p = capsulePushes([{ fromIdentity: 'yo', forIdentity: 'ella', title: 'Secreto' }]);
    expect(Object.keys(p)).toEqual(['ella']);
    expect(p.ella).toEqual({ title: '🎁 Hoy se abre una cápsula', body: 'Te la dejó tu 🫒. Ya puedes abrirla.' });
    expect(JSON.stringify(p)).not.toContain('Secreto');
  });

  test('una para los dos: les llega a los dos, también a quien la escribió', () => {
    const p = capsulePushes([{ fromIdentity: 'ella', forIdentity: 'ambos' }]);
    expect(p.yo.body).toBe('Es para los dos, de 🍪. Ya podéis abrirla.');
    expect(p.ella.body).toBe('Es para los dos, de 🍪. Ya podéis abrirla.');
  });

  test('varias el mismo día: una sola push por persona', () => {
    const p = capsulePushes([{ fromIdentity: 'yo', forIdentity: 'ella' }, { fromIdentity: 'yo', forIdentity: 'ambos' }]);
    expect(p.ella.title).toBe('🎁 Hoy se abren 2 cápsulas');
    expect(p.yo.title).toBe('🎁 Hoy se abre una cápsula');
  });

  test('sin cápsulas, nada', () => {
    expect(capsulePushes([])).toEqual({});
  });
});
