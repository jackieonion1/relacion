import { listenNotes, addNote } from './notes';
import { collection, doc, setDoc, onSnapshot } from 'firebase/firestore';

vi.mock('./firebase', async () => {
  const { listenAfterAuth } = await vi.importActual('./authGate');
  const whenAuthed = () => Promise.resolve({ uid: 'u1' });
  return {
    auth: { currentUser: { uid: 'u1' } },
    db: {},
    whenAuthed,
    listenWhenAuthed: (start, onError) => listenAfterAuth(whenAuthed, start, onError),
  };
});
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  setDoc: vi.fn(),
  query: vi.fn(),
  orderBy: vi.fn(),
  limit: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: vi.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  vi.clearAllMocks();
  // CRA usa resetMocks: las implementaciones de las factorías se pierden entre tests
  collection.mockImplementation((d, ...p) => ({ path: p.join('/') }));
  doc.mockImplementation((c) => ({ path: `${c.path}/N1`, id: 'N1' }));
});

describe('addNote', () => {
  test('sin conexión (setDoc no resuelve) vuelve igual, con el ack aparte', async () => {
    setDoc.mockReturnValue(new Promise(() => {})); // offline: el ack nunca llega
    const r = await addNote('SEB1998', { html: '<p>hola</p>', plain: 'hola' }, 'yo');
    expect(r.id).toBe('N1');
    expect(r.committed).toBeInstanceOf(Promise);
    expect(setDoc).toHaveBeenCalledTimes(1);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ threadId: 'N1', unreadFor: ['ella'], identity: 'yo', createdBy: 'u1' });
  });

  test('un rechazo posterior del servidor llega por committed y no queda sin capturar', async () => {
    const err = new Error('permission-denied');
    setDoc.mockReturnValue(Promise.reject(err));
    const { committed } = await addNote('SEB1998', { html: '<p>x</p>' }, 'ella', { threadId: 'T1' });
    await expect(committed).rejects.toBe(err);
    expect(setDoc.mock.calls[0][1]).toMatchObject({ threadId: 'T1', unreadFor: ['yo'] });
  });
});

describe('listenNotes', () => {
  test('devuelve la baja al momento (no una promesa) y cancela antes de suscribirse', async () => {
    const stop = listenNotes('SEB1998', {}, vi.fn(), vi.fn());
    expect(typeof stop).toBe('function');
    stop();
    await flush();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  test('pasa las notas a onChange y el error del listener a onError', async () => {
    const unsub = vi.fn();
    onSnapshot.mockReturnValue(unsub);
    const onChange = vi.fn();
    const onError = vi.fn();
    const stop = listenNotes('SEB1998', {}, onChange, onError);
    await flush();
    const [, next, error] = onSnapshot.mock.calls[0];
    next({ docs: [{ id: 'n1', data: () => ({ html: 'hola' }) }] });
    expect(onChange).toHaveBeenCalledWith([{ id: 'n1', html: 'hola' }]);
    error(new Error('permission-denied'));
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'permission-denied' }));
    stop();
    expect(unsub).toHaveBeenCalledTimes(1);
  });
});
