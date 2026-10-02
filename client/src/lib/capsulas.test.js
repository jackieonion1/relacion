import {
  abreEl, diaMinimo, cuentaAtras, estadoCapsula, repartirCapsulas, paraQuien, validarCapsula, fechaLarga,
  crearCapsula, leerCapsula, marcarAbierta, borrarCapsula,
} from './capsulas';
import { collection, doc, writeBatch, getDoc, getDocFromServer, updateDoc, arrayUnion } from 'firebase/firestore';
import { ref, getBlob, deleteObject } from 'firebase/storage';

vi.mock('./firebase', async () => {
  const { listenAfterAuth } = await vi.importActual('./authGate');
  const whenAuthed = () => Promise.resolve({ uid: 'u1' });
  return {
    auth: { currentUser: { uid: 'u1' } },
    db: {},
    storage: {},
    whenAuthed,
    listenWhenAuthed: (start, onError) => listenAfterAuth(whenAuthed, start, onError),
  };
});
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  writeBatch: vi.fn(),
  getDoc: vi.fn(),
  getDocFromServer: vi.fn(),
  updateDoc: vi.fn(),
  arrayUnion: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: () => '<ahora>',
  Timestamp: { fromMillis: (ms) => ({ ms }) },
}));
vi.mock('firebase/storage', () => ({ ref: vi.fn(), uploadBytes: vi.fn(), getBlob: vi.fn(), deleteObject: vi.fn() }));

const T = (iso) => Date.parse(iso);
// 2 oct 2026, 12:00 en Madrid (UTC+2)
const HOY = T('2026-10-02T10:00:00Z');

describe('días y palabras (Madrid)', () => {
  test('una cápsula se abre a las 00:00 de Madrid de su día, en invierno y en verano', () => {
    expect(abreEl('2026-11-24')).toBe(T('2026-11-23T23:00:00Z'));
    expect(abreEl('2027-07-01')).toBe(T('2027-06-30T22:00:00Z'));
  });

  test('el primer día que se puede elegir es mañana en Madrid, aunque en UTC aún sea hoy', () => {
    expect(diaMinimo(T('2026-10-02T21:30:00Z'))).toBe('2026-10-03');
    expect(diaMinimo(T('2026-10-02T22:30:00Z'))).toBe('2026-10-04'); // ya es 3 en Madrid
    expect(diaMinimo(T('2026-12-31T12:00:00Z'))).toBe('2027-01-01');
  });

  test('la cuenta atrás cuenta días de calendario', () => {
    expect(cuentaAtras(abreEl('2026-10-02'), HOY)).toBe('Se abre hoy');
    expect(cuentaAtras(abreEl('2026-10-03'), HOY)).toBe('Se abre mañana');
    expect(cuentaAtras(abreEl('2026-10-14'), HOY)).toBe('Se abre en 12 días');
    expect(cuentaAtras(abreEl('2026-11-24'), HOY)).toBe('Se abre en 2 meses');
    expect(cuentaAtras(abreEl('2027-10-02'), HOY)).toBe('Se abre en un año');
    expect(cuentaAtras(abreEl('2029-10-02'), HOY)).toBe('Se abre en 3 años');
    // A través del cambio de hora del 25 de octubre
    expect(cuentaAtras(abreEl('2026-10-26'), T('2026-10-24T22:30:00Z'))).toBe('Se abre mañana');
  });

  test('la fecha larga es la de Madrid', () => {
    expect(fechaLarga(abreEl('2026-11-24'))).toBe('24 de noviembre de 2026');
  });
});

describe('estado y reparto', () => {
  const c = (id, dia, openedFor = []) => ({ id, openAt: abreEl(dia), openedFor });
  test('sellada antes de su día, lista ese día y abierta cuando esta persona ya la abrió', () => {
    expect(estadoCapsula(c('a', '2026-10-03'), 'yo', HOY)).toBe('sellada');
    expect(estadoCapsula(c('a', '2026-10-02'), 'yo', HOY)).toBe('lista');
    expect(estadoCapsula(c('a', '2026-10-02', ['ella']), 'yo', HOY)).toBe('lista');
    expect(estadoCapsula(c('a', '2026-10-02', ['yo']), 'yo', HOY)).toBe('abierta');
    expect(estadoCapsula({ id: 'x' }, 'yo', HOY)).toBe('sellada');
  });

  test('listas por antigüedad, selladas por la más próxima y abiertas por la más reciente', () => {
    const r = repartirCapsulas([
      c('s2', '2027-01-01'), c('l2', '2026-10-01'), c('a1', '2026-01-01', ['yo']),
      c('s1', '2026-11-24'), c('l1', '2026-09-01'), c('a2', '2026-05-01', ['yo']),
    ], 'yo', HOY);
    expect(r.listas.map((x) => x.id)).toEqual(['l1', 'l2']);
    expect(r.selladas.map((x) => x.id)).toEqual(['s1', 's2']);
    expect(r.abiertas.map((x) => x.id)).toEqual(['a2', 'a1']);
  });

  test('para quién, según quién mira', () => {
    expect(paraQuien({ forIdentity: 'ambos' }, 'yo')).toBe('Para los dos');
    expect(paraQuien({ forIdentity: 'ella' }, 'ella')).toBe('Para ti');
    expect(paraQuien({ forIdentity: 'ella' }, 'yo')).toBe('Para tu 🍪');
  });
});

describe('validarCapsula', () => {
  test('pide texto, un día desde mañana y recorta el título', () => {
    expect(validarCapsula({ texto: '  ', dia: '2026-10-03' }, HOY)).toEqual({ error: 'texto' });
    expect(validarCapsula({ texto: 'x'.repeat(2001), dia: '2026-10-03' }, HOY)).toEqual({ error: 'largo' });
    expect(validarCapsula({ texto: 'hola', dia: '2026-10-02' }, HOY)).toEqual({ error: 'dia' });
    expect(validarCapsula({ texto: 'hola', dia: '' }, HOY)).toEqual({ error: 'dia' });
    expect(validarCapsula({ texto: ' hola ', titulo: ` ${'t'.repeat(70)}`, dia: '2026-10-03', para: 'nadie' }, HOY))
      .toEqual({ texto: 'hola', titulo: 't'.repeat(60), dia: '2026-10-03', para: 'ambos' });
  });
});

describe('con Firebase (simulado)', () => {
  let batch;
  beforeEach(() => {
    vi.clearAllMocks();
    collection.mockImplementation((d, ...p) => ({ path: p.join('/') }));
    doc.mockImplementation((c, id = 'K1') => ({ path: `${c.path}/${id}`, id }));
    batch = { set: vi.fn(), delete: vi.fn(), commit: vi.fn(() => Promise.resolve()) };
    writeBatch.mockReturnValue(batch);
    arrayUnion.mockImplementation((x) => `+${x}`);
    updateDoc.mockResolvedValue();
    ref.mockImplementation((s, p) => ({ p }));
  });

  test('crearCapsula: sobre sin contenido y contenido aparte, en un batch y con el mismo openAt', async () => {
    const dia = diaMinimo();
    const r = await crearCapsula('SEB1998', { texto: ' Te quiero ', titulo: 'Para ti', dia, para: 'ella' }, 'yo');
    expect(r).toEqual({ id: 'K1', queued: false });
    expect(batch.set).toHaveBeenCalledTimes(2);
    const [[sobreRef, sobre], [secretoRef, secreto]] = batch.set.mock.calls;
    expect(sobreRef.path).toBe('pairs/SEB1998/capsules/K1');
    expect(secretoRef.path).toBe('pairs/SEB1998/capsuleSecrets/K1');
    expect(sobre).toEqual({
      openAt: { ms: abreEl(dia) }, fromIdentity: 'yo', forIdentity: 'ella', kind: 'texto', title: 'Para ti',
      createdBy: 'u1', createdAt: '<ahora>', openedFor: [],
    });
    expect(JSON.stringify(sobre)).not.toContain('Te quiero');
    expect(secreto).toEqual({ openAt: { ms: abreEl(dia) }, text: 'Te quiero' });
  });

  test('crearCapsula: si el servidor la rechaza, se dice', async () => {
    batch.commit.mockReturnValue(Promise.reject(Object.assign(new Error('no'), { code: 'permission-denied' })));
    await expect(crearCapsula('SEB1998', { texto: 'x', dia: diaMinimo() }, 'yo')).rejects.toThrow('no');
  });

  test('crearCapsula: con foto y sin conexión no se escribe nada', async () => {
    const online = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    await expect(crearCapsula('SEB1998', { texto: 'x', dia: diaMinimo(), foto: new Blob(['x']) }, 'yo')).rejects.toThrow('offline-foto');
    expect(batch.set).not.toHaveBeenCalled();
    online.mockRestore();
  });

  test('leerCapsula: siempre del servidor; si aún no es el día, «sellada» y nunca la caché', async () => {
    getDocFromServer.mockRejectedValue(Object.assign(new Error('x'), { code: 'permission-denied' }));
    await expect(leerCapsula('SEB1998', { id: 'K1', openAt: HOY, openedFor: [] }, 'yo')).rejects.toThrow('sellada');
    expect(getDoc).not.toHaveBeenCalled();
  });

  test('leerCapsula: sin conexión, una que aún no ha abierto no sale de la caché (donde está el texto de quien la escribió)', async () => {
    getDocFromServer.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
    await expect(leerCapsula('SEB1998', { id: 'K1', openAt: HOY, openedFor: ['ella'] }, 'yo')).rejects.toThrow('offline');
    expect(getDoc).not.toHaveBeenCalled();
  });

  test('leerCapsula: una ya abierta por esta persona sí se relee de la caché sin conexión', async () => {
    getDocFromServer.mockRejectedValue(Object.assign(new Error('offline'), { code: 'unavailable' }));
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({ text: 'hola' }) });
    await expect(leerCapsula('SEB1998', { id: 'K1', openAt: HOY, openedFor: ['yo'] }, 'yo')).resolves.toEqual({ text: 'hola', fotoUrl: '', conFoto: false });
  });

  test('leerCapsula: la foto se baja con getBlob por su ruta (sin URL guardada)', async () => {
    getDocFromServer.mockResolvedValue({ exists: () => true, data: () => ({ text: 'mira', mediaPath: 'pairs/SEB1998/capsules/K1/img.jpg' }) });
    getBlob.mockResolvedValue(new Blob(['jpg']));
    const created = vi.fn(() => 'blob:capsula');
    const orig = URL.createObjectURL;
    URL.createObjectURL = created;
    const r = await leerCapsula('SEB1998', { id: 'K1', openAt: HOY, openedFor: [] }, 'yo');
    URL.createObjectURL = orig;
    expect(ref).toHaveBeenCalledWith({}, 'pairs/SEB1998/capsules/K1/img.jpg');
    expect(r).toEqual({ text: 'mira', fotoUrl: 'blob:capsula', conFoto: true });
  });

  test('marcarAbierta solo toca openedFor', async () => {
    await marcarAbierta('SEB1998', 'K1', 'ella');
    expect(updateDoc).toHaveBeenCalledWith({ path: 'pairs/SEB1998/capsules/K1', id: 'K1' }, { openedFor: '+ella' });
  });

  test('borrarCapsula borra sobre, contenido y foto', async () => {
    deleteObject.mockResolvedValue();
    await borrarCapsula('SEB1998', { id: 'K1', kind: 'foto' });
    expect(batch.delete.mock.calls.map(([r]) => r.path)).toEqual(['pairs/SEB1998/capsules/K1', 'pairs/SEB1998/capsuleSecrets/K1']);
    expect(deleteObject).toHaveBeenCalledWith({ p: 'pairs/SEB1998/capsules/K1/img.jpg' });
  });
});
