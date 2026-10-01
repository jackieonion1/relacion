import { setMapState, getMapState } from './mapState';
import { doc, setDoc } from 'firebase/firestore';
import { auth } from './firebase';

vi.mock('./firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
  db: {},
  whenAuthed: () => Promise.resolve(null),
  listenWhenAuthed: () => () => {},
}));
vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  setDoc: vi.fn(),
  getDoc: vi.fn(),
  serverTimestamp: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  localStorage.setItem('pairId', 'SEB1998');
  auth.currentUser = { uid: 'u1' };
  doc.mockImplementation((d, ...p) => ({ path: p.join('/') }));
  vi.spyOn(console, 'error').mockImplementation(() => {}); // setMapState registra el rechazo
});

describe('setMapState', () => {
  test('sin conexión vuelve sin esperar el ack y guarda la copia local', async () => {
    setDoc.mockReturnValue(new Promise(() => {}));
    const { committed } = await setMapState('together');
    expect(committed).toBeInstanceOf(Promise);
    expect(localStorage.getItem('mapState')).toBe('together');
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  test('sin sesión no escribe, pero committed rechaza para que la UI avise', async () => {
    auth.currentUser = null;
    const { committed } = await setMapState('home');
    await expect(committed).rejects.toThrow('no-auth');
    expect(setDoc).not.toHaveBeenCalled();
    expect(localStorage.getItem('mapState')).toBe('home');
  });
});

describe('getMapState', () => {
  test('sin sesión devuelve la copia local, no se queda esperando', async () => {
    auth.currentUser = null;
    localStorage.setItem('mapState', 'traveling');
    await expect(getMapState()).resolves.toBe('traveling');
  });
});
