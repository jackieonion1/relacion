import { listenNotes } from './notes';
import { onSnapshot } from 'firebase/firestore';

jest.mock('./firebase', () => {
  const { listenAfterAuth } = jest.requireActual('./authGate');
  const whenAuthed = () => Promise.resolve({ uid: 'u1' });
  return {
    auth: { currentUser: { uid: 'u1' } },
    db: {},
    whenAuthed,
    listenWhenAuthed: (start, onError) => listenAfterAuth(whenAuthed, start, onError),
  };
});
jest.mock('firebase/firestore', () => ({
  collection: jest.fn(),
  doc: jest.fn(),
  setDoc: jest.fn(),
  query: jest.fn(),
  orderBy: jest.fn(),
  limit: jest.fn(),
  onSnapshot: jest.fn(),
  serverTimestamp: jest.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('listenNotes', () => {
  test('devuelve la baja al momento (no una promesa) y cancela antes de suscribirse', async () => {
    const stop = listenNotes('SEB1998', {}, jest.fn(), jest.fn());
    expect(typeof stop).toBe('function');
    stop();
    await flush();
    expect(onSnapshot).not.toHaveBeenCalled();
  });

  test('pasa las notas a onChange y el error del listener a onError', async () => {
    const unsub = jest.fn();
    onSnapshot.mockReturnValue(unsub);
    const onChange = jest.fn();
    const onError = jest.fn();
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
