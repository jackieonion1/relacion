import { deletePhoto, retryPendingPhotos, uploadPhoto } from './photos';
import { deleteThumb, deleteOrig, getThumb, getOrig } from './photoCache';
import { collection, doc, deleteDoc, setDoc, getDoc } from 'firebase/firestore';
import { ref, getDownloadURL, deleteObject, uploadBytes } from 'firebase/storage';

jest.mock('./firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
  db: {},
  storage: {},
  authReady: Promise.resolve(),
}));
jest.mock('./photoCache', () => ({
  getThumb: jest.fn(),
  putThumb: jest.fn(),
  getOrig: jest.fn(),
  putOrig: jest.fn(),
  pruneOrig: jest.fn(),
  deleteThumb: jest.fn(),
  deleteOrig: jest.fn(),
}));
jest.mock('firebase/storage', () => ({
  ref: jest.fn((s, path) => ({ path })),
  uploadBytes: jest.fn(),
  getDownloadURL: jest.fn(async () => 'https://x/y?alt=media'),
  deleteObject: jest.fn(),
}));
jest.mock('firebase/firestore', () => ({
  collection: jest.fn((d, ...p) => ({ path: p.join('/') })),
  doc: jest.fn((c, id) => ({ path: `${c.path}/${id}` })),
  setDoc: jest.fn(),
  updateDoc: jest.fn(),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  startAfter: jest.fn(),
  serverTimestamp: jest.fn(),
  deleteDoc: jest.fn(),
  waitForPendingWrites: jest.fn(),
}));

const PAIR = 'SEB1998';
const PENDING_KEY = `photos:pending:${PAIR}`;
const flush = () => new Promise((r) => setTimeout(r, 0));
const pendingIds = () => JSON.parse(localStorage.getItem(PENDING_KEY) || '[]').map((p) => p.id);

// El borrado deja una lápida en memoria durante toda la vida del módulo: cada test usa su propio id
let P1;
let seq = 0;

beforeEach(() => {
  P1 = `P${++seq}`;
  jest.clearAllMocks();
  localStorage.clear();
  localStorage.setItem(PENDING_KEY, JSON.stringify([{ id: P1, identity: 'yo', createdAt: 1 }]));
  localStorage.setItem(`photos:${PAIR}`, JSON.stringify([{ id: P1, createdAt: 1, identity: 'yo' }]));
  // CRA usa resetMocks: las implementaciones de las factorías se pierden entre tests
  ref.mockImplementation((s, path) => ({ path }));
  getDownloadURL.mockResolvedValue('https://x/y?alt=media');
  collection.mockImplementation((d, ...p) => ({ path: p.join('/') }));
  doc.mockImplementation((c, id) => ({ path: `${c.path}/${id}` }));
  deleteThumb.mockResolvedValue();
  deleteOrig.mockResolvedValue();
  deleteObject.mockResolvedValue();
  deleteDoc.mockResolvedValue();
});

describe('deletePhoto: orden de pasos', () => {
  test('marca de pendiente, meta y caché se limpian antes de llamar a la red', async () => {
    let atDeleteDoc;
    deleteDoc.mockImplementation(() => {
      atDeleteDoc = {
        pending: pendingIds(),
        meta: JSON.parse(localStorage.getItem(`photos:${PAIR}`)),
        thumbCalls: deleteThumb.mock.calls.length,
        origCalls: deleteOrig.mock.calls.length,
      };
      return Promise.resolve();
    });

    await deletePhoto(PAIR, P1);

    expect(atDeleteDoc).toEqual({ pending: [], meta: [], thumbCalls: 1, origCalls: 1 });
  });

  test('offline (deleteDoc no resuelve) la marca y la caché ya están limpias', async () => {
    deleteDoc.mockImplementation(() => new Promise(() => {}));

    deletePhoto(PAIR, P1); // se queda esperando al servidor
    await flush();

    expect(deleteDoc).toHaveBeenCalledTimes(1);
    expect(pendingIds()).toEqual([]);
    expect(deleteThumb).toHaveBeenCalledWith(P1);
    expect(deleteOrig).toHaveBeenCalledWith(P1);
  });

  test('primero el doc y solo después los objetos de Storage', async () => {
    const order = [];
    deleteDoc.mockImplementation(async () => { order.push('doc'); });
    deleteObject.mockImplementation(async (r) => { order.push(r.path); });

    await deletePhoto(PAIR, P1);

    expect(order).toEqual(['doc', `pairs/${PAIR}/photos/${P1}/thumb.jpg`, `pairs/${PAIR}/photos/${P1}/orig.jpg`]);
  });

  test('si el borrado del doc falla, el error se propaga y no se toca Storage', async () => {
    deleteDoc.mockRejectedValue(new Error('denied'));

    await expect(deletePhoto(PAIR, P1)).rejects.toThrow('denied');
    expect(deleteObject).not.toHaveBeenCalled();
  });
});

describe('deletePhoto con una subida en curso', () => {
  test('la subida se para antes de crear el doc y limpia lo que subió', async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    getThumb.mockResolvedValue(new Blob(['t']));
    getOrig.mockResolvedValue(new Blob(['o']));
    let releaseUpload;
    uploadBytes.mockImplementation(() => new Promise((r) => { releaseUpload = r; }));

    const retry = retryPendingPhotos(PAIR);
    await flush();
    expect(uploadBytes).toHaveBeenCalledTimes(1); // subida en vuelo

    await deletePhoto(PAIR, P1);
    expect(deleteObject).toHaveBeenCalledTimes(2); // borrado normal de Storage

    uploadBytes.mockResolvedValue();
    releaseUpload();
    const result = await retry;

    expect(setDoc).not.toHaveBeenCalled(); // no resucita: ni doc ni marca
    expect(pendingIds()).toEqual([]);
    expect(result.sent).toBe(0);
    expect(deleteObject.mock.calls.length).toBeGreaterThan(2); // limpieza de lo subido tarde
  });

  test('si el borrado ya quitó la miniatura (getDownloadURL falla) igual limpia el original', async () => {
    getDoc.mockResolvedValue({ exists: () => false });
    getThumb.mockResolvedValue(new Blob(['t']));
    getOrig.mockResolvedValue(new Blob(['o']));
    let releaseOrig;
    uploadBytes
      .mockImplementationOnce(() => Promise.resolve()) // thumb.jpg ya subido
      .mockImplementationOnce(() => new Promise((r) => { releaseOrig = r; })); // orig.jpg en vuelo

    const retry = retryPendingPhotos(PAIR);
    await flush();
    expect(uploadBytes).toHaveBeenCalledTimes(2);

    await deletePhoto(PAIR, P1); // borra thumb.jpg de Storage mientras sube orig.jpg
    deleteObject.mockClear();
    getDownloadURL.mockImplementation(async (r) => {
      if (r.path.endsWith('thumb.jpg')) throw new Error('storage/object-not-found');
      return 'https://x/y?alt=media';
    });
    releaseOrig();
    await retry;

    expect(setDoc).not.toHaveBeenCalled();
    expect(deleteObject.mock.calls.map(([r]) => r.path)).toContain(`pairs/${PAIR}/photos/${P1}/orig.jpg`);
  });

  test('un reintento posterior al borrado no vuelve a subir la foto', async () => {
    deleteDoc.mockImplementation(() => new Promise(() => {})); // offline
    deletePhoto(PAIR, P1);
    await flush();

    const result = await retryPendingPhotos(PAIR);

    expect(result).toMatchObject({ sent: 0, failed: 0, lost: 0 });
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
  });

  test('un id borrado se ignora en el reintento aunque su marca siga en localStorage', async () => {
    deleteDoc.mockImplementation(() => new Promise(() => {})); // offline
    deletePhoto(PAIR, P1);
    await flush();
    localStorage.setItem(PENDING_KEY, JSON.stringify([{ id: P1, identity: 'yo', createdAt: 1 }]));
    getDoc.mockResolvedValue({ exists: () => false });

    const result = await retryPendingPhotos(PAIR);

    expect(result).toMatchObject({ sent: 0, failed: 0, lost: 0 });
    expect(uploadBytes).not.toHaveBeenCalled();
    expect(setDoc).not.toHaveBeenCalled();
    expect(pendingIds()).toEqual([]);
  });
});

describe('uploadPhoto', () => {
  const protoDescriptors = {};
  const stub = (proto, name, desc) => {
    protoDescriptors[`${proto.constructor.name}.${name}`] = [proto, name, Object.getOwnPropertyDescriptor(proto, name)];
    Object.defineProperty(proto, name, { configurable: true, ...desc });
  };
  const metaIds = () => JSON.parse(localStorage.getItem(`photos:${PAIR}`) || '[]').map((m) => m.id);
  const idOfDoc = () => doc.mock.calls[doc.mock.calls.length - 1][1];
  const until = async (cond) => { for (let i = 0; i < 50 && !cond(); i += 1) await flush(); };

  beforeEach(() => {
    // jsdom no decodifica imágenes ni tiene canvas: lo justo para que resizeToBlob devuelva un blob
    stub(HTMLImageElement.prototype, 'src', { set() { setTimeout(() => this.onload && this.onload(), 0); } });
    stub(HTMLCanvasElement.prototype, 'getContext', { value: () => ({ drawImage() {} }) });
    stub(HTMLCanvasElement.prototype, 'toBlob', { value: (cb) => cb(new Blob(['x'])) });
    stub(URL, 'createObjectURL', { value: () => 'blob:x' });
    stub(URL, 'revokeObjectURL', { value: () => {} });
  });
  afterEach(() => {
    jest.restoreAllMocks();
    Object.values(protoDescriptors).forEach(([proto, name, desc]) => {
      if (desc) Object.defineProperty(proto, name, desc); else delete proto[name];
    });
  });

  test('si no se puede escribir la marca de pendiente la subida sigue y el doc se crea', async () => {
    jest.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('quota'); });

    const result = await uploadPhoto(PAIR, new Blob(['f']));

    expect(result.cancelled).toBeUndefined();
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(result.pending).toBe(false);
  });

  test('borrada mientras el setDoc espera al servidor no se reescribe la meta y devuelve cancelled', async () => {
    let releaseSetDoc;
    setDoc.mockImplementation(() => new Promise((r) => { releaseSetDoc = r; }));

    const upload = uploadPhoto(PAIR, new Blob(['f']));
    await until(() => setDoc.mock.calls.length > 0);
    const id = idOfDoc();
    await deletePhoto(PAIR, id);
    releaseSetDoc();
    const result = await upload;

    expect(result).toEqual({ id, cancelled: true });
    expect(metaIds()).not.toContain(id);
    expect(pendingIds()).not.toContain(id);
  });

  test('borrada y luego falla la red: cancelled, sin tarjeta fantasma ni error', async () => {
    let failUpload;
    uploadBytes.mockImplementation(() => new Promise((r, rej) => { failUpload = rej; }));

    const upload = uploadPhoto(PAIR, new Blob(['f']));
    await until(() => uploadBytes.mock.calls.length > 0);
    const id = pendingIds().find((x) => x !== P1); // la marca se escribe antes de subir
    await deletePhoto(PAIR, id);
    failUpload(new Error('network'));
    const result = await upload;

    expect(result).toEqual({ id, cancelled: true });
    expect(metaIds()).not.toContain(id);
  });
});
