// What Ajustes shows for each member, decided by joinPair from the request's user agent: a fixed word, never text
// the caller chooses. An iPad says Macintosh, so the client only tells whether it has touch. '' = unknown, and
// joinPair numbers it instead («Dispositivo 3»)
export function deviceLabel(ua = '', touch = false) {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touch)) return 'iPad';
  if (/Android/.test(ua)) return /Mobile/.test(ua) ? 'Android' : 'Tablet Android';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Linux|CrOS/.test(ua)) return 'Ordenador';
  return '';
}
