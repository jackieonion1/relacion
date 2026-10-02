// Pure logic of the time capsules' morning push, kept apart from index.js so tests can load it without Firebase.
// A capsule is pairs/{p}/capsules/{id} (who, for whom, openAt at 00:00 Madrid); its content lives in capsuleSecrets
// and never reaches this push: it only says that one opens today
import { TZ } from './pushLogic.js';
import { madridDate } from './reminders.js';

const EMOJI = { yo: '🫒', ella: '🍪' };

// How far Madrid is ahead of UTC at that instant, in ms (1 h in winter, 2 h in summer)
function offsetMadrid(ms) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms)).map((p) => [p.type, p.value])
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - ms;
}

// 00:00 in Madrid of y-m-d (m 1-12; d may overflow into the next month)
function madridMidnight(year, month, day) {
  const wall = Date.UTC(year, month - 1, day);
  // Second pass: the offset is read at the first guess, which can sit on the other side of a clock change
  return wall - offsetMadrid(wall - offsetMadrid(wall));
}

// [start, end) of the Madrid day of `now`, as Dates: the capsules whose openAt falls here open today
export function capsuleDay(now = new Date()) {
  const { year, month, day } = madridDate(now);
  return { start: new Date(madridMidnight(year, month, day)), end: new Date(madridMidnight(year, month, day + 1)) };
}

// Who a capsule is for: 'ambos' (or anything unknown) is both of them
function recipients(c) {
  return EMOJI[c?.forIdentity] ? [c.forIdentity] : ['yo', 'ella'];
}

// The morning push for the capsules opening today, per identity: { yo?: { title, body }, ella?: … }. Only who and
// for whom, never the title nor the content (it shows on the lock screen). One push per person, however many open
export function capsulePushes(capsules = []) {
  const byWho = { yo: [], ella: [] };
  for (const c of capsules) for (const who of recipients(c)) byWho[who].push(c);
  const out = {};
  for (const [who, list] of Object.entries(byWho)) {
    if (!list.length) continue;
    if (list.length > 1) {
      out[who] = { title: `🎁 Hoy se abren ${list.length} cápsulas`, body: 'Están esperando en Recuerdos.' };
      continue;
    }
    const [c] = list;
    const from = EMOJI[c.fromIdentity];
    let body;
    if (c.forIdentity === who) body = from && c.fromIdentity !== who ? `Te la dejó tu ${from}. Ya puedes abrirla.` : 'Ya puedes abrirla.';
    else body = from ? `Es para los dos, de ${from}. Ya podéis abrirla.` : 'Es para los dos. Ya podéis abrirla.';
    out[who] = { title: '🎁 Hoy se abre una cápsula', body };
  }
  return out;
}
