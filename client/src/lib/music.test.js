import { getOriginal, getOriginalUrl } from './music';
import { getOrig } from './audioCache';
import { setDoc, getDoc } from 'firebase/firestore';
import { getDownloadURL } from 'firebase/storage';

vi.mock('./firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
  db: {},
  storage: {},
  whenAuthed: () => Promise.resolve({ uid: 'u1' }),
}));
vi.mock('./audioCache', () => ({
  getOrig: vi.fn(),
  putOrig: vi.fn(),
  pruneOrig: vi.fn(),
  deleteOrig: vi.fn(),
}));
vi.mock('firebase/storage', () => ({
  ref: vi.fn((s, path) => ({ path })),
  uploadBytes: vi.fn(),
  getDownloadURL: vi.fn(),
  deleteObject: vi.fn(),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn((d, ...p) => ({ path: p.join('/') })),
  doc: vi.fn((c, id) => ({ path: `${c.path}/${id}` })),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  getDocs: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  serverTimestamp: vi.fn(),
  deleteDoc: vi.fn(),
}));

const PAIR = 'SEB1998';
const OK = 'https://x/y?alt=media';
const never = () => new Promise(() => {});
const realFetch = global.fetch;

beforeEach(() => {
  global.fetch = vi.fn(() => Promise.reject(new TypeError('blocked'))); // CORS
  getOrig.mockResolvedValue(null);
  getDoc.mockResolvedValue({ exists: () => true, data: () => ({ origUrl: OK }) });
  setDoc.mockReset();
  getDownloadURL.mockReset();
});
afterEach(() => { global.fetch = realFetch; });

// Sin red una escritura de Firestore no resuelve hasta que el servidor confirma: ninguna lectura puede esperarla
describe('escrituras de reparación de URL', () => {
  test('getOriginal con la misma URL no escribe, aunque el fetch falle en cada carga', async () => {
    getDownloadURL.mockResolvedValue(OK);
    expect(await getOriginal(PAIR, 'M1')).toBeNull();
    expect(setDoc).not.toHaveBeenCalled();
  });

  test('getOriginal con otra URL escribe una vez y no espera a la confirmación', async () => {
    getDownloadURL.mockResolvedValue('https://x/new?alt=media');
    setDoc.mockImplementation(never);
    expect(await getOriginal(PAIR, 'M1')).toBeNull();
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0].slice(1)).toEqual([{ origUrl: 'https://x/new?alt=media' }, { merge: true }]);
  });

  test('si la escritura falla, getOriginal no revienta', async () => {
    getDownloadURL.mockResolvedValue('https://x/new?alt=media');
    setDoc.mockRejectedValue(new Error('offline'));
    expect(await getOriginal(PAIR, 'M1')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
  });

  test('getOriginalUrl devuelve la URL sin esperar a la escritura', async () => {
    getDoc.mockResolvedValue({ exists: () => true, data: () => ({}) });
    getDownloadURL.mockResolvedValue('https://x/new?alt=media');
    setDoc.mockImplementation(never);
    expect(await getOriginalUrl(PAIR, 'M1')).toBe('https://x/new?alt=media');
    expect(setDoc).toHaveBeenCalledTimes(1);
  });
});
