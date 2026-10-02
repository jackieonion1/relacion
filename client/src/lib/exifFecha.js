// The date a photo was really taken, from its EXIF. Minimal reader, no dependencies: it only looks at the first
// 128 KB of the file and only for the date tags. Never throws: anything it cannot read is "no date" (null).
// JPEG (APP1 / TIFF, either byte order) and HEIC/HEIF (the `Exif` item found through meta/iinf/iloc).
// Phones store the local wall-clock time: without an OffsetTime tag it is read as Madrid time

import { madridMs } from './fotoFecha';

const LEER = 128 * 1024;
const DESDE = Date.UTC(2000, 0, 1);
const DIA = 24 * 3600 * 1000;

const TAG_EXIF_IFD = 0x8769;
const TAG_ORIGINAL = 0x9003; // DateTimeOriginal, with OffsetTimeOriginal (0x9011)
const TAG_DIGITIZED = 0x9004; // DateTimeDigitized (CreateDate), with OffsetTimeDigitized (0x9012)

// Sizes of the TIFF types we may meet in an entry (1 byte, 2 ASCII, 3 short, 4 long, ...)
const TIPO_BYTES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

function ascii(v, from, len) {
  let s = '';
  for (let i = from; i < from + len && i < v.byteLength; i += 1) {
    const c = v.getUint8(i);
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.trim();
}

// Entries of the IFD at `off` (relative to the TIFF header at `base`): Map tag -> string value for ASCII entries,
// tag -> number for the Exif IFD pointer. Reads outside the buffer throw (RangeError), caught by the caller
function leerIfd(v, base, off, le) {
  const out = new Map();
  const n = v.getUint16(base + off, le);
  for (let i = 0; i < n; i += 1) {
    const e = base + off + 2 + i * 12;
    const tag = v.getUint16(e, le);
    const tipo = v.getUint16(e + 2, le);
    const count = v.getUint32(e + 4, le);
    if (tag === TAG_EXIF_IFD) out.set(tag, v.getUint32(e + 8, le));
    else if (tipo === 2 && count > 0 && count < 64) {
      // up to 4 bytes live in the entry itself, more at the offset it holds
      const total = count * (TIPO_BYTES[tipo] || 1);
      out.set(tag, ascii(v, total <= 4 ? e + 8 : base + v.getUint32(e + 8, le), count));
    }
  }
  return out;
}

// 'YYYY:MM:DD HH:MM:SS' (+ optional '+02:00') to epoch ms, or null if it is not a real date
function aMs(texto, offset) {
  const m = /^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(texto || '');
  if (!m) return null;
  const [y, mo, d, h, mi, s] = m.slice(1).map(Number);
  const wall = new Date(Date.UTC(y, mo - 1, d, h, mi, s));
  // Date.UTC rolls over (month 13, day 32, hour 25): a date that does not survive the round trip was not valid
  if (wall.getUTCFullYear() !== y || wall.getUTCMonth() !== mo - 1 || wall.getUTCDate() !== d || wall.getUTCHours() !== h) return null;
  const o = /^([+-])(\d{2}):(\d{2})$/.exec(offset || '');
  if (o) return wall.getTime() - (o[1] === '-' ? -1 : 1) * (Number(o[2]) * 60 + Number(o[3])) * 60000;
  // No offset: Madrid's clock. madridMs takes whole hours, the rest is added on top
  return madridMs(y, mo - 1, d, h) + (mi * 60 + s) * 1000;
}

// The date out of a TIFF block starting at `base`, or null
function fechaDeTiff(v, base) {
  const le = v.getUint16(base) === 0x4949;
  if (!le && v.getUint16(base) !== 0x4d4d) return null;
  if (v.getUint16(base + 2, le) !== 42) return null;
  const ifd0 = leerIfd(v, base, v.getUint32(base + 4, le), le);
  const ptr = ifd0.get(TAG_EXIF_IFD);
  if (ptr == null) return null;
  const exif = leerIfd(v, base, ptr, le);
  return aMs(exif.get(TAG_ORIGINAL), exif.get(0x9011)) ?? aMs(exif.get(TAG_DIGITIZED), exif.get(0x9012));
}

// JPEG: walk the marker segments up to the APP1 that starts with 'Exif\0\0'
function fechaDeJpeg(v) {
  let p = 2;
  while (p + 4 <= v.byteLength && v.getUint8(p) === 0xff) {
    const marker = v.getUint8(p + 1);
    if (marker === 0xff) { p += 1; continue; } // fill byte
    if (marker === 0xda || marker === 0xd9) return null; // image data / end: no Exif before it
    const len = v.getUint16(p + 2);
    if (marker === 0xe1 && ascii(v, p + 4, 4) === 'Exif' && v.getUint16(p + 8) === 0) return fechaDeTiff(v, p + 10);
    p += 2 + len;
  }
  return null;
}

const cc = (v, o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));

// Reads an unsigned integer of 0 to 8 bytes (0 = 0). Offsets past 2^53 are not a thing in a 128 KB read
function uint(v, o, n) {
  let x = 0;
  for (let i = 0; i < n; i += 1) x = x * 256 + v.getUint8(o + i);
  return x;
}

// Child boxes of [ini, fin) as { tipo, ini (start of the content), fin }
function cajas(v, ini, fin) {
  const out = [];
  let p = ini;
  while (p + 8 <= fin) {
    let tam = v.getUint32(p);
    let cab = 8;
    if (tam === 1) { tam = uint(v, p + 8, 8); cab = 16; } else if (tam === 0) tam = fin - p;
    if (tam < cab || p + tam > fin) break;
    out.push({ tipo: cc(v, p + 4), ini: p + cab, fin: p + tam });
    p += tam;
  }
  return out;
}

// HEIC/HEIF: the Exif item (iinf says which item it is, iloc where it lives) holds a 4-byte offset to its TIFF header
function fechaDeHeic(v) {
  const meta = cajas(v, 0, v.byteLength).find((c) => c.tipo === 'meta');
  if (!meta) return null;
  const hijas = cajas(v, meta.ini + 4, meta.fin); // meta is a full box: 4 bytes of version and flags first
  const iinf = hijas.find((c) => c.tipo === 'iinf');
  const iloc = hijas.find((c) => c.tipo === 'iloc');
  if (!iinf || !iloc) return null;

  // The item whose type is 'Exif'
  const vInf = v.getUint8(iinf.ini);
  const infes = cajas(v, iinf.ini + 4 + (vInf === 0 ? 2 : 4), iinf.fin);
  // infe v2 has a 2-byte item id, v3 a 4-byte one; then 2 bytes of protection and the 4-char item type
  const tipoInfe = (c) => cc(v, c.ini + 4 + (v.getUint8(c.ini) >= 3 ? 4 : 2) + 2);
  const infe = infes.find((c) => c.tipo === 'infe' && v.getUint8(c.ini) >= 2 && tipoInfe(c) === 'Exif');
  if (!infe) return null;
  const id = v.getUint8(infe.ini) >= 3 ? v.getUint32(infe.ini + 4) : v.getUint16(infe.ini + 4);

  // Where that item lives
  const ver = v.getUint8(iloc.ini);
  let p = iloc.ini + 4;
  const tOff = v.getUint8(p) >> 4;
  const tLen = v.getUint8(p) & 15;
  const tBase = v.getUint8(p + 1) >> 4;
  const tIdx = ver > 0 ? v.getUint8(p + 1) & 15 : 0;
  p += 2;
  const items = ver < 2 ? v.getUint16(p) : v.getUint32(p);
  p += ver < 2 ? 2 : 4;
  for (let i = 0; i < items; i += 1) {
    const itemId = ver < 2 ? v.getUint16(p) : v.getUint32(p);
    p += ver < 2 ? 2 : 4;
    const metodo = ver > 0 ? v.getUint16(p) & 15 : 0;
    if (ver > 0) p += 2;
    p += 2; // data reference index
    const base = uint(v, p, tBase);
    p += tBase;
    const extents = v.getUint16(p);
    p += 2;
    for (let j = 0; j < extents; j += 1) {
      if (ver > 0) p += tIdx;
      const off = uint(v, p, tOff);
      const len = uint(v, p + tOff, tLen);
      p += tOff + tLen;
      if (itemId === id && j === 0) {
        if (metodo !== 0 || len < 8) return null; // only plain file offsets
        const ini = base + off;
        return fechaDeTiff(v, ini + 4 + v.getUint32(ini));
      }
    }
  }
  return null;
}

// Epoch ms the photo was taken, from its DateTimeOriginal (else CreateDate), or null when there is none, the
// format is not read, the EXIF is damaged or the date is not plausible (before 2000 or after tomorrow)
export async function leerFechaExif(file, ahora = Date.now()) {
  try {
    const v = new DataView(await file.slice(0, LEER).arrayBuffer());
    if (v.byteLength < 12) return null;
    let ms = null;
    if (v.getUint16(0) === 0xffd8) ms = fechaDeJpeg(v);
    else if (cc(v, 4) === 'ftyp') ms = fechaDeHeic(v);
    return ms != null && ms >= DESDE && ms <= ahora + DIA ? ms : null;
  } catch {
    return null;
  }
}
