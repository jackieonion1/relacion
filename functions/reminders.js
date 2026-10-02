// Pure logic of the morning reminders, kept apart from index.js so tests can load it without Firebase.
// START and BIRTHDAYS mirror client/src/lib/together.js and specialDays.js (a client test keeps them in sync).
import { TZ } from './pushLogic.js';

// Start of the relationship: the 24th is the monthiversary, November's is the anniversary
export const START = { year: 2024, month: 11, day: 24 };

// Birth dates; `who` is the stored identity: 'yo' = él 🫒, 'ella' = ella 🍪
export const BIRTHDAYS = [
  { who: 'ella', year: 2003, month: 4, day: 21 },
  { who: 'yo', year: 1998, month: 11, day: 4 },
];

const EMOJI = { yo: '🫒', ella: '🍪' };
const otherOf = (who) => (who === 'yo' ? 'ella' : 'yo');

// Year, month (1-12) and day of `now` in Madrid
export function madridDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// Pair ids to leave out of the reminders, from a comma-separated list (REMINDER_SKIP_PAIRS)
export function skipPairs(raw = '') {
  return new Set(String(raw).split(',').map((id) => id.trim()).filter(Boolean));
}

// Runs fn over items with at most `limit` at a time, in order of start. One that throws is logged and the rest go on:
// a pair that fails never leaves the others without their morning
export async function eachLimit(items, limit, fn) {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++];
      try {
        await fn(item);
      } catch (e) {
        console.warn('eachLimit error', e);
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

// "N meses", "N años" or "N años y M meses"
function spanText(totalMonths) {
  if (totalMonths < 12) return `${totalMonths} ${totalMonths === 1 ? 'mes' : 'meses'}`;
  const years = Math.floor(totalMonths / 12);
  const months = totalMonths % 12;
  const y = `${years} ${years === 1 ? 'año' : 'años'}`;
  return months === 0 ? y : `${y} y ${months} ${months === 1 ? 'mes' : 'meses'}`;
}

// The morning reminders due on `now` (Madrid day). Each one has the text for both identities:
// { kind: 'anniversary' | 'monthiversary' | 'birthday', texts: { yo: { title, body }, ella: { title, body } } }
export function remindersFor(now = new Date()) {
  const { year, month, day } = madridDate(now);
  const out = [];

  const months = (year - START.year) * 12 + month - START.month;
  if (day === START.day && months > 0) {
    const real = month === START.month;
    const title = real ? '🎉 ¡Feliz aniversario!' : '💖 ¡Feliz mesiversario!';
    const text = (who) => ({
      title,
      body: `Hoy hacéis ${spanText(months)}. Dile algo bonito a tu ${EMOJI[otherOf(who)]}.`,
    });
    out.push({ kind: real ? 'anniversary' : 'monthiversary', texts: { yo: text('yo'), ella: text('ella') } });
  }

  for (const b of BIRTHDAYS) {
    if (b.month !== month || b.day !== day) continue;
    const age = year - b.year;
    const other = otherOf(b.who);
    // The other one reads "lo"/"la" for the one with the birthday
    const lo = b.who === 'ella' ? 'la' : 'lo';
    out.push({
      kind: 'birthday',
      texts: {
        [b.who]: { title: `🎂 ¡Feliz cumpleaños, ${EMOJI[b.who]}!`, body: `Hoy cumples ${age} años. Hoy manda quien cumple 💖` },
        [other]: { title: `🎂 Hoy es el cumple de tu ${EMOJI[b.who]}`, body: `Cumple ${age} años. ¡Que se note lo que ${lo} quieres!` },
      },
    });
  }
  return out;
}
