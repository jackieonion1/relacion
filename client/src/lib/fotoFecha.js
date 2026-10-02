// The date of a photo and Madrid day ranges. Pure: no Firebase, no clock.
// A photo has two dates: `createdAt` (when it was uploaded) and the optional `takenAt` (the day it was really taken,
// set by hand). Everything that talks about "when" (a year ago, stamps, albums, Nuestro año) uses the effective date.
// Months are 0-based, like Date; every `ms` is epoch milliseconds, as in the items of lib/photos

const TZ = 'Europe/Madrid';

// Effective date of a photo item, in ms: takenAt when set, else createdAt (a null takenAt counts as missing)
export function fechaEfectiva(foto) {
  return foto?.takenAt ?? foto?.createdAt;
}

// How far Madrid is ahead of UTC at that instant, in ms (1 h in winter, 2 h in summer)
function offsetMadrid(ms) {
  const secs = Math.floor(ms / 1000) * 1000;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: TZ, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(secs)).map((p) => [p.type, p.value])
  );
  return Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute, +parts.second) - secs;
}

// The instant at which Madrid's clock reads y-m-d h:00 (d and m may overflow: day 32 is the 1st of next month)
export function madridMs(y, m, d, h = 0) {
  const wall = Date.UTC(y, m, d, h);
  // Second pass: the offset is read at the first guess, which can sit on the other side of a clock change
  return wall - offsetMadrid(wall - offsetMadrid(wall));
}

// 12:00 in Madrid of a 'YYYY-MM-DD' day: what the date picker stores as takenAt (noon keeps the day whatever the zone)
export function madridMediodia(dia) {
  const [y, m, d] = String(dia).split('-').map(Number);
  return madridMs(y, m - 1, d, 12);
}

// [desde, hasta) in ms: the Madrid day y-m-d (m 0-based)
export function rangoDiaMadrid(y, m, d) {
  return { desde: madridMs(y, m, d), hasta: madridMs(y, m, d + 1) };
}

// [desde, hasta) in ms: the Madrid month (m 0-based)
export function rangoMesMadrid(y, m) {
  return { desde: madridMs(y, m, 1), hasta: madridMs(y, m + 1, 1) };
}

// Joins the results of the two queries that cover a range by effective date (the one on createdAt and the one on
// takenAt; Firestore cannot order by `takenAt ?? createdAt`): drops what falls outside [desde, hasta) by effective
// date (a photo uploaded in range but taken elsewhere), de-duplicates by id and sorts newest first
export function unirPorFechaEfectiva(porCreatedAt, porTakenAt, desde, hasta) {
  const seen = new Set();
  const out = [];
  for (const foto of [...porCreatedAt, ...porTakenAt]) {
    const f = fechaEfectiva(foto);
    if (seen.has(foto.id) || !(f >= desde && f < hasta)) continue;
    seen.add(foto.id);
    out.push(foto);
  }
  return out.sort((a, b) => fechaEfectiva(b) - fechaEfectiva(a) || (a.id < b.id ? -1 : 1));
}
