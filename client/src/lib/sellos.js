import { ANNIVERSARY } from './together';
import { MONTHIVERSARY_DAY } from './specialDays';
import { madridDayKey } from './photos';
import { rangoDiaMadrid } from './fotoFecha';

// The stamp album of the monthiversaries (3.1): one stamp for each 24th since 24 Nov 2024. Pure and clock-free
// (`ahora` comes in), so the stamps paint with no network. Stamp n is month n together; the photos of its month are
// the ones taken after the previous 24th up to this 24th (both included, by Madrid day), so each photo belongs to
// exactly one stamp and the first one also takes the day the two of them began

const ANIO = ANNIVERSARY.getFullYear();
const MES = ANNIVERSARY.getMonth(); // 0-based, like Date
const DIA = MONTHIVERSARY_DAY;

// Madrid midnight (ms) of the 24th of month n (n = 0 is the day it all began)
const diaDelSello = (n) => rangoDiaMadrid(ANIO, MES + n, DIA).desde;

// The stamp of month n: `fecha` is its 24th, [desde, hasta) the photos of that month, and every 12th is an
// anniversary (`anios` years)
export function sello(n) {
  return {
    n,
    fecha: diaDelSello(n),
    desde: n === 1 ? diaDelSello(0) : rangoDiaMadrid(ANIO, MES + n - 1, DIA + 1).desde,
    hasta: rangoDiaMadrid(ANIO, MES + n, DIA + 1).desde,
    aniversario: n % 12 === 0,
    anios: Math.floor(n / 12),
    // The year together it belongs to: 1 for months 1-12, 2 for 13-24…
    anio: Math.ceil(n / 12),
  };
}

// Whole days from the Madrid day of `desde` to the one of `hasta`
function diasEntre(desde, hasta) {
  const utc = (ms) => { const [y, m, d] = madridDayKey(new Date(ms)).split('-').map(Number); return Date.UTC(y, m - 1, d); };
  return Math.round((utc(hasta) - utc(desde)) / 86400000);
}

// The album at `ahora`: the stamps already earned, newest first, and the next one still to come with the days it
// lacks (0 means it is today and it is already in `sellos`)
export function mesiversarios(ahora = new Date()) {
  const t = ahora instanceof Date ? ahora.getTime() : ahora;
  let n = 0;
  while (diaDelSello(n + 1) <= t) n += 1;
  const sellos = [];
  for (let k = n; k >= 1; k -= 1) sellos.push(sello(k));
  const proximo = sello(n + 1);
  return { sellos, proximo: { ...proximo, faltan: diasEntre(t, proximo.fecha) } };
}

// The stamps grouped by year together, newest year first: [{ anio, sellos }] (each one newest first)
export function porAnio(sellos) {
  const grupos = [];
  for (const s of sellos) {
    const g = grupos[grupos.length - 1];
    if (g && g.anio === s.anio) g.sellos.push(s);
    else grupos.push({ anio: s.anio, sellos: [s] });
  }
  return grupos;
}

// «Mes 5», or «1 año» on an anniversary
export function nombreSello(s) {
  if (s.aniversario) return s.anios === 1 ? '1 año' : `${s.anios} años`;
  return `Mes ${s.n}`;
}
