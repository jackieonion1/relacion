import { ANNIVERSARY } from './together';

// Every 24th is a monthiversary; the one in November (ANNIVERSARY's month) is the anniversary
export const MONTHIVERSARY_DAY = ANNIVERSARY.getDate();

// Birth dates, local midnight. eventType is the id of their automatic calendar event
export const BIRTHDAYS = [
  { name: 'Lucy', date: new Date(2003, 3, 21), eventType: 'lucy-birthday', emoji: '🎂💜🎉' },
  { name: 'Sebas', date: new Date(1998, 10, 4), eventType: 'sebas-birthday', emoji: '🎂💙🎉' },
];

export function isMonthiversaryDay(day) {
  return day === MONTHIVERSARY_DAY;
}

export function isAnniversary(day, month) {
  return isMonthiversaryDay(day) && month === ANNIVERSARY.getMonth();
}

// The birthday that falls on day/month (month 0-indexed), if any
export function birthdayOn(day, month) {
  return BIRTHDAYS.find((b) => b.date.getDate() === day && b.date.getMonth() === month) || null;
}

// Whole months from ANNIVERSARY to the given month, ignoring the day
function monthsTogether(date) {
  return (date.getFullYear() - ANNIVERSARY.getFullYear()) * 12 + date.getMonth() - ANNIVERSARY.getMonth();
}

// "N meses", "N años" or "N años y M meses"
function spanText(totalMonths) {
  if (totalMonths < 12) return `${totalMonths} ${totalMonths === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(totalMonths / 12);
  const remainingMonths = totalMonths % 12;
  const y = `${years} ${years === 1 ? 'año' : 'años'}`;
  return remainingMonths === 0 ? y : `${y} y ${remainingMonths} ${remainingMonths === 1 ? 'mes' : 'meses'}`;
}

// Which animation opening a day starts: 'fireworks' on the anniversary, 'rain' on any other 24th,
// 'birthday' on a birthday, null otherwise
export function partyAnimation(day, month) {
  if (isMonthiversaryDay(day)) return isAnniversary(day, month) ? 'fireworks' : 'rain';
  if (birthdayOn(day, month)) return 'birthday';
  return null;
}

// The message shown on top of a day's events, or null:
// { kind: 'birthday', name, title, subtitle, emoji } or { kind: 'anniversary' | 'monthiversary', title, subtitle, emoji }
export function celebration(day, month, year) {
  const date = new Date(year, month, day);
  const birthday = birthdayOn(day, month);
  if (birthday) {
    const birth = birthday.date;
    const age = date.getFullYear() - birth.getFullYear();
    const hasHadBirthdayThisYear = date >= new Date(date.getFullYear(), birth.getMonth(), birth.getDate());
    const currentAge = hasHadBirthdayThisYear ? age : age - 1;
    return {
      kind: 'birthday',
      name: birthday.name,
      title: `¡¡${birthday.name} cumple ${currentAge} años!!`,
      subtitle: '¡Feliz cumpleaños!',
      emoji: birthday.emoji,
    };
  }
  if (isMonthiversaryDay(day)) {
    const totalMonths = monthsTogether(date);
    if (totalMonths <= 0) return null;
    const real = isAnniversary(day, month);
    return {
      kind: real ? 'anniversary' : 'monthiversary',
      title: `¡¡${spanText(totalMonths)}!!`,
      subtitle: real ? '¡Feliz aniversario!' : '¡Feliz mesiversario!',
      emoji: real ? '🎉💖🎉' : '💖',
    };
  }
  return null;
}

// Automatic calendar events: only the next monthiversary/anniversary and the next birthday of each
export function nextSpecialEvents(now = new Date()) {
  const specialEvents = [];

  for (let i = 0; i < 24; i++) { // Look ahead 24 months
    const testDate = new Date(now.getFullYear(), now.getMonth() + i, MONTHIVERSARY_DAY);
    if (testDate > now && testDate >= ANNIVERSARY) {
      const totalMonths = monthsTogether(testDate);
      if (totalMonths > 0) {
        const real = testDate.getMonth() === ANNIVERSARY.getMonth();
        specialEvents.push({
          id: `anniversary-${testDate.getFullYear()}-${testDate.getMonth()}`,
          title: `${real ? '¡Aniversario!' : '¡Mesiversario!'} ${spanText(totalMonths)} juntos`,
          start: { toDate: () => testDate },
          location: '',
          eventType: 'conjunto',
          isSpecialEvent: true,
          specialType: real ? 'anniversary' : 'monthiversary'
        });
        break;
      }
    }
  }

  for (const { name, date, eventType } of BIRTHDAYS) {
    for (let year = now.getFullYear(); year <= now.getFullYear() + 1; year++) {
      const birthday = new Date(year, date.getMonth(), date.getDate());
      if (birthday > now) {
        const age = year - date.getFullYear();
        if (age > 0) {
          specialEvents.push({
            id: `${eventType}-${year}`,
            title: `¡Cumpleaños de ${name}! ${age} años`,
            start: { toDate: () => birthday },
            location: '',
            eventType,
            isSpecialEvent: true,
            specialType: 'birthday'
          });
          break;
        }
      }
    }
  }

  return specialEvents;
}
