import { leerFechaExif } from './exifFecha';

// Ficheros mínimos construidos byte a byte: sin fotos reales ni datos personales

const ASCII = (s) => [...s].map((c) => c.charCodeAt(0));
const AHORA = Date.UTC(2026, 9, 2, 12);

function u16(n, le) { return le ? [n & 255, n >> 8] : [n >> 8, n & 255]; }
function u32(n, le) { return le ? [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255] : [(n >>> 24) & 255, (n >> 16) & 255, (n >> 8) & 255, n & 255]; }

// Bloque TIFF: IFD0 con el puntero al IFD Exif, y este con las entradas de texto `tags` ({ tag, text })
function tiff({ le = false, tags }) {
  const exifIfd = 8 + 2 + 12 + 4;
  let datos = exifIfd + 2 + tags.length * 12 + 4; // los textos de más de 4 bytes van después
  const ifd0 = [...u16(1, le), ...u16(0x8769, le), ...u16(4, le), ...u32(1, le), ...u32(exifIfd, le), ...u32(0, le)];
  const entradas = [];
  const cola = [];
  for (const { tag, text } of tags) {
    const bytes = [...ASCII(text), 0];
    entradas.push(...u16(tag, le), ...u16(2, le), ...u32(bytes.length, le));
    if (bytes.length <= 4) entradas.push(...bytes, ...Array(4 - bytes.length).fill(0));
    else { entradas.push(...u32(datos, le)); cola.push(...bytes); datos += bytes.length; }
  }
  return [...(le ? ASCII('II') : ASCII('MM')), ...u16(42, le), ...u32(8, le), ...ifd0, ...u16(tags.length, le), ...entradas, ...u32(0, le), ...cola];
}

const segmento = (marker, cuerpo) => [0xff, marker, ...u16(cuerpo.length + 2, false), ...cuerpo];
const exifApp1 = (opts) => segmento(0xe1, [...ASCII('Exif'), 0, 0, ...tiff(opts)]);
const jpeg = (...segmentos) => new Uint8Array([0xff, 0xd8, ...segmentos.flat(), 0xff, 0xda, 0, 2, 0xff, 0xd9]);
const JFIF = segmento(0xe0, [...ASCII('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
const original = (text, extra = []) => [{ tag: 0x9003, text }, ...extra];

const file = (bytes, name = 'f.jpg') => new File([bytes], name);
const iso = (ms) => (ms == null ? ms : new Date(ms).toISOString());

describe('leerFechaExif: JPEG', () => {
  test('big endian, sin offset: la hora es la de Madrid (verano, UTC+2)', async () => {
    const f = file(jpeg(JFIF, exifApp1({ tags: original('2024:07:14 18:30:15') })));
    expect(iso(await leerFechaExif(f, AHORA))).toBe('2024-07-14T16:30:15.000Z');
  });

  test('little endian, sin offset: en invierno UTC+1', async () => {
    const f = file(jpeg(exifApp1({ le: true, tags: original('2024:01:10 08:00:00') })));
    expect(iso(await leerFechaExif(f, AHORA))).toBe('2024-01-10T07:00:00.000Z');
  });

  test.each([true, false])('con OffsetTimeOriginal manda el offset, no Madrid (le=%s)', async (le) => {
    const tags = original('2024:07:14 18:30:15', [{ tag: 0x9011, text: '-05:00' }]);
    expect(iso(await leerFechaExif(file(jpeg(exifApp1({ le, tags }))), AHORA))).toBe('2024-07-14T23:30:15.000Z');
    const este = original('2024:07:14 18:30:15', [{ tag: 0x9011, text: '+09:30' }]);
    expect(iso(await leerFechaExif(file(jpeg(exifApp1({ le, tags: este }))), AHORA))).toBe('2024-07-14T09:00:15.000Z');
  });

  test('sin DateTimeOriginal cae en CreateDate (DateTimeDigitized) con su offset', async () => {
    const tags = [{ tag: 0x9004, text: '2023:12:24 21:15:00' }, { tag: 0x9012, text: '+01:00' }];
    expect(iso(await leerFechaExif(file(jpeg(exifApp1({ tags }))), AHORA))).toBe('2023-12-24T20:15:00.000Z');
  });

  test('un DateTimeOriginal vacío o inválido deja paso a CreateDate', async () => {
    const tags = [{ tag: 0x9003, text: '    :  :     :  :  ' }, { tag: 0x9004, text: '2023:12:24 21:15:00' }];
    expect(iso(await leerFechaExif(file(jpeg(exifApp1({ tags }))), AHORA))).toBe('2023-12-24T20:15:00.000Z');
  });

  test('no usa DateTime (0x0132, la de modificación)', async () => {
    const tags = [{ tag: 0x0132, text: '2024:07:14 18:30:15' }];
    expect(await leerFechaExif(file(jpeg(exifApp1({ tags }))), AHORA)).toBeNull();
  });

  test('sin EXIF: JPEG sin APP1, APP1 que no es Exif, o un fichero que no es imagen', async () => {
    expect(await leerFechaExif(file(jpeg(JFIF)), AHORA)).toBeNull();
    expect(await leerFechaExif(file(jpeg(segmento(0xe1, [...ASCII('http://ns.adobe.com/xap/1.0/'), 0, 1, 2]))), AHORA)).toBeNull();
    expect(await leerFechaExif(file(new TextEncoder().encode('hola, esto no es una foto, ni de lejos')), AHORA)).toBeNull();
    expect(await leerFechaExif(file(new Uint8Array(0)), AHORA)).toBeNull();
  });

  test('EXIF corrupto: nunca lanza y devuelve null', async () => {
    const bueno = [...jpeg(exifApp1({ tags: original('2024:07:14 18:30:15') }))];
    // Cortado a media IFD, con el puntero al IFD Exif apuntando fuera, y con una cuenta de entradas absurda
    expect(await leerFechaExif(file(new Uint8Array(bueno.slice(0, 40))), AHORA)).toBeNull();
    const fuera = [...bueno];
    fuera[2 + 4 + 6 + 8 + 2 + 8 + 3] = 0xff; // el valor del puntero (último byte del 8769)
    expect(await leerFechaExif(file(new Uint8Array(fuera)), AHORA)).toBeNull();
    const cuenta = [...bueno];
    cuenta[2 + 4 + 6 + 8] = 0xff; cuenta[2 + 4 + 6 + 9] = 0xff; // 65535 entradas en IFD0
    expect(await leerFechaExif(file(new Uint8Array(cuenta)), AHORA)).toBeNull();
    const orden = [...bueno];
    orden[2 + 4 + 6] = 0x00; orden[2 + 4 + 7] = 0x00; // ni II ni MM
    expect(await leerFechaExif(file(new Uint8Array(orden)), AHORA)).toBeNull();
    const segLargo = new Uint8Array([0xff, 0xd8, 0xff, 0xe1, 0xff, 0xff, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(await leerFechaExif(file(segLargo), AHORA)).toBeNull();
  });

  test('fechas que no existen se ignoran', async () => {
    for (const text of ['2024:13:45 25:61:61', '2024:02:30 10:00:00', '0000:00:00 00:00:00', 'ayer por la tarde']) {
      expect(await leerFechaExif(file(jpeg(exifApp1({ tags: original(text) }))), AHORA)).toBeNull();
    }
  });

  test('fecha implausible: antes de 2000 o más allá de mañana', async () => {
    expect(await leerFechaExif(file(jpeg(exifApp1({ tags: original('1999:12:31 23:00:00') }))), AHORA)).toBeNull();
    expect(await leerFechaExif(file(jpeg(exifApp1({ tags: original('2031:01:01 10:00:00') }))), AHORA)).toBeNull();
    // Hoy y mañana pasan (el reloj del móvil puede ir un poco adelantado), pasado mañana no
    expect(await leerFechaExif(file(jpeg(exifApp1({ tags: original('2026:10:03 10:00:00') }))), AHORA)).not.toBeNull();
    expect(await leerFechaExif(file(jpeg(exifApp1({ tags: original('2026:10:04 10:00:00') }))), AHORA)).toBeNull();
  });

  test('un File enorme: solo se lee el principio y es rápido', async () => {
    const grande = new Uint8Array(24 * 1024 * 1024);
    grande.set(jpeg(JFIF, exifApp1({ tags: original('2024:07:14 18:30:15') })));
    const f = file(grande);
    const slice = vi.spyOn(f, 'slice');
    const t0 = performance.now();
    const ms = await leerFechaExif(f, AHORA);
    const dt = performance.now() - t0;
    expect(iso(ms)).toBe('2024-07-14T16:30:15.000Z');
    expect(slice).toHaveBeenCalledWith(0, 128 * 1024);
    expect(dt).toBeLessThan(200);
  });

  test('si el File no se puede leer devuelve null', async () => {
    expect(await leerFechaExif({ slice() { throw new Error('boom'); } }, AHORA)).toBeNull();
    expect(await leerFechaExif({ slice: () => ({ arrayBuffer: () => Promise.reject(new Error('boom')) }) }, AHORA)).toBeNull();
    expect(await leerFechaExif(null, AHORA)).toBeNull();
  });
});

// HEIC: ftyp + meta(iinf, iloc) + mdat con el item Exif (4 bytes de offset al TIFF, 'Exif\0\0', TIFF)
function caja(tipo, ...cuerpo) {
  const c = cuerpo.flat();
  return [...u32(8 + c.length, false), ...ASCII(tipo), ...c];
}
const completa = (tipo, version, ...cuerpo) => caja(tipo, version, 0, 0, 0, ...cuerpo);

function heic({ le = false, tags, version = 'v1', itemV3 = false }) {
  const payload = [...u32(6, false), ...ASCII('Exif'), 0, 0, ...tiff({ le, tags })];
  const infe = (id, tipo) => (itemV3 ? completa('infe', 3, ...u32(id, false), 0, 0, ...ASCII(tipo), 0) : completa('infe', 2, ...u16(id, false), 0, 0, ...ASCII(tipo), 0));
  const iinf = completa('iinf', 0, ...u16(2, false), ...infe(1, 'hvc1'), ...infe(2, 'Exif'));
  const ftyp = caja('ftyp', ...ASCII('heic'), 0, 0, 0, 0, ...ASCII('mif1'));
  const iloc = (offset) => {
    const v2 = version === 'v2';
    const item = (id, off, len) => [...(v2 ? u32(id, false) : u16(id, false)), ...(version === 'v0' ? [] : [0, 0]), 0, 0, ...u16(1, false), ...u32(off, false), ...u32(len, false)];
    // offset 4, length 4, base offset 0, index 0; item 1 (la imagen) no importa, item 2 es el Exif
    return completa('iloc', v2 ? 2 : version === 'v1' ? 1 : 0, 0x44, 0, ...(v2 ? u32(2, false) : u16(2, false)), ...item(1, 0, 10), ...item(2, offset, payload.length));
  };
  const longitudMeta = caja('meta', 0, 0, 0, 0, ...iinf, ...iloc(0)).length;
  const offset = ftyp.length + longitudMeta + 8; // justo tras la cabecera de mdat
  return new Uint8Array([...ftyp, ...caja('meta', 0, 0, 0, 0, ...iinf, ...iloc(offset)), ...caja('mdat', ...payload)]);
}

describe('leerFechaExif: HEIC', () => {
  test.each(['v0', 'v1', 'v2'])('item Exif localizado con iloc %s (big endian, hora de Madrid)', async (version) => {
    const f = file(heic({ version, tags: original('2024:07:14 18:30:15') }), 'f.heic');
    expect(iso(await leerFechaExif(f, AHORA))).toBe('2024-07-14T16:30:15.000Z');
  });

  test('little endian con offset, e infe v3', async () => {
    const tags = original('2024:07:14 18:30:15', [{ tag: 0x9011, text: '+00:00' }]);
    const f = file(heic({ le: true, itemV3: true, tags }), 'f.heif');
    expect(iso(await leerFechaExif(f, AHORA))).toBe('2024-07-14T18:30:15.000Z');
  });

  test('sin meta o con el item Exif cortado: null', async () => {
    const sin = heic({ tags: original('2024:07:14 18:30:15') });
    const ftypMeta = sin.slice(0, sin.length - 20);
    expect(await leerFechaExif(file(ftypMeta, 'f.heic'), AHORA)).toBeNull();
    const ftyp = new Uint8Array(caja('ftyp', ...ASCII('heic'), 0, 0, 0, 0));
    expect(await leerFechaExif(file(ftyp, 'f.heic'), AHORA)).toBeNull();
  });
});
