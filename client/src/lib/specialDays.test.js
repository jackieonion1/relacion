import { BIRTHDAYS, birthdayOn, celebration, isMonthiversaryDay, nextSpecialEvents, partyAnimation } from './specialDays';

const summary = (events) => events.map((e) => {
  const d = e.start.toDate();
  return [e.id, e.title, d.getFullYear(), d.getMonth(), d.getDate(), e.eventType, e.specialType];
});

describe('fechas', () => {
  test('el 24 de cada mes es mesiversario; el 21-abr y el 4-nov son cumpleaños', () => {
    expect([1, 23, 24, 25].map(isMonthiversaryDay)).toEqual([false, false, true, false]);
    expect(birthdayOn(21, 3).name).toBe('Lucy');
    expect(birthdayOn(4, 10).name).toBe('Sebas');
    expect(birthdayOn(21, 4)).toBeNull();
    expect(BIRTHDAYS.map((b) => [b.date.getFullYear(), b.date.getMonth(), b.date.getDate(), b.date.getHours()]))
      .toEqual([[2003, 3, 21, 0], [1998, 10, 4, 0]]);
  });
});

describe('partyAnimation', () => {
  test('fuegos el 24-nov, lluvia los demás 24, cumpleaños el 21-abr y el 4-nov, nada el resto', () => {
    expect(partyAnimation(24, 10)).toBe('fireworks');
    expect(partyAnimation(24, 0)).toBe('rain');
    expect(partyAnimation(24, 3)).toBe('rain');
    expect(partyAnimation(21, 3)).toBe('birthday');
    expect(partyAnimation(4, 10)).toBe('birthday');
    expect(partyAnimation(4, 3)).toBeNull();
    expect(partyAnimation(15, 6)).toBeNull();
  });
});

describe('celebration', () => {
  test('un 24 cualquiera es mesiversario con los meses que llevamos', () => {
    expect(celebration(24, 11, 2024)).toEqual({ kind: 'monthiversary', title: '¡¡1 mes!!', subtitle: '¡Feliz mesiversario!', emoji: '💖' });
    expect(celebration(24, 8, 2025)).toMatchObject({ title: '¡¡10 meses!!' });
    expect(celebration(24, 11, 2025)).toMatchObject({ title: '¡¡1 año y 1 mes!!' });
    expect(celebration(24, 4, 2027)).toMatchObject({ title: '¡¡2 años y 6 meses!!' });
  });

  test('el 24-nov es el aniversario, con fuegos de emoji', () => {
    expect(celebration(24, 10, 2025)).toEqual({ kind: 'anniversary', title: '¡¡1 año!!', subtitle: '¡Feliz aniversario!', emoji: '🎉💖🎉' });
    expect(celebration(24, 10, 2026)).toMatchObject({ title: '¡¡2 años!!' });
  });

  test('antes de empezar, o el mismo 24-nov de 2024, no hay mensaje', () => {
    expect(celebration(24, 10, 2024)).toBeNull();
    expect(celebration(24, 5, 2024)).toBeNull();
  });

  test('los cumpleaños dicen el nombre y los años que cumple', () => {
    expect(celebration(21, 3, 2026)).toEqual({ kind: 'birthday', name: 'Lucy', title: '¡¡Lucy cumple 23 años!!', subtitle: '¡Feliz cumpleaños!', emoji: '🎂💜🎉' });
    expect(celebration(4, 10, 2026)).toEqual({ kind: 'birthday', name: 'Sebas', title: '¡¡Sebas cumple 28 años!!', subtitle: '¡Feliz cumpleaños!', emoji: '🎂💙🎉' });
  });

  test('un día normal no tiene mensaje', () => {
    expect(celebration(15, 6, 2026)).toBeNull();
  });
});

describe('nextSpecialEvents', () => {
  test('da el próximo mesiversario y el próximo cumpleaños de cada uno', () => {
    expect(summary(nextSpecialEvents(new Date(2026, 9, 2, 12)))).toEqual([
      ['anniversary-2026-9', '¡Mesiversario! 1 año y 11 meses juntos', 2026, 9, 24, 'conjunto', 'monthiversary'],
      ['lucy-birthday-2027', '¡Cumpleaños de Lucy! 24 años', 2027, 3, 21, 'lucy-birthday', 'birthday'],
      ['sebas-birthday-2026', '¡Cumpleaños de Sebas! 28 años', 2026, 10, 4, 'sebas-birthday', 'birthday'],
    ]);
  });

  test('pasado el 24, el siguiente es el del mes que viene; en noviembre es el aniversario', () => {
    const [next] = summary(nextSpecialEvents(new Date(2026, 9, 24, 0, 0, 1)));
    expect(next).toEqual(['anniversary-2026-10', '¡Aniversario! 2 años juntos', 2026, 10, 24, 'conjunto', 'anniversary']);
  });

  test('el mismo día del cumpleaños ya apunta al del año siguiente', () => {
    const events = summary(nextSpecialEvents(new Date(2027, 3, 21, 9)));
    expect(events[1]).toEqual(['lucy-birthday-2028', '¡Cumpleaños de Lucy! 25 años', 2028, 3, 21, 'lucy-birthday', 'birthday']);
  });

  test('antes del primer mesiversario el primero es el de diciembre de 2024', () => {
    const [next] = summary(nextSpecialEvents(new Date(2024, 10, 1)));
    expect(next).toEqual(['anniversary-2024-11', '¡Mesiversario! 1 mes juntos', 2024, 11, 24, 'conjunto', 'monthiversary']);
  });
});
