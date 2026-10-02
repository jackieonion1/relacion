import { escucharFoto, setReaccion } from './fotoSocial';
import { collection, doc, updateDoc, onSnapshot, deleteField } from 'firebase/firestore';

vi.mock('./firebase', async () => {
  const { listenAfterAuth } = await vi.importActual('./authGate');
  const whenAuthed = () => Promise.resolve({ uid: 'u1' });
  return {
    db: {},
    whenAuthed,
    listenWhenAuthed: (start, onError) => listenAfterAuth(whenAuthed, start, onError),
  };
});
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  updateDoc: vi.fn(),
  onSnapshot: vi.fn(),
  deleteField: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  collection.mockImplementation((d, ...p) => ({ path: p.join('/') }));
  doc.mockImplementation((c, id) => ({ path: `${c.path}/${id}`, id }));
  deleteField.mockReturnValue('<borrar>');
});

describe('setReaccion', () => {
  test('escribe solo el campo de quien reacciona, sin esperar al servidor', async () => {
    updateDoc.mockReturnValue(new Promise(() => {})); // offline: el ack nunca llega
    const r = await setReaccion('SEB1998', 'F1', 'ella', '🔥');
    expect(r.committed).toBeInstanceOf(Promise);
    expect(updateDoc).toHaveBeenCalledWith({ path: 'pairs/SEB1998/photos/F1', id: 'F1' }, { 'reactions.ella': '🔥' });
  });

  test('null la quita con deleteField', async () => {
    updateDoc.mockResolvedValue();
    await setReaccion('SEB1998', 'F1', 'yo', null);
    expect(updateDoc).toHaveBeenCalledWith(expect.anything(), { 'reactions.yo': '<borrar>' });
  });

  test('ni una identidad ni una reacción que no existan llegan a la ruta del campo', async () => {
    await expect(setReaccion('SEB1998', 'F1', 'otro', '💖')).rejects.toThrow('bad-reaction');
    await expect(setReaccion('SEB1998', 'F1', 'yo', '👎')).rejects.toThrow('bad-reaction');
    expect(updateDoc).not.toHaveBeenCalled();
  });
});

test('escucharFoto da el ítem del doc, y null cuando la foto ya no existe', async () => {
  let push;
  onSnapshot.mockImplementation((ref, next) => { push = next; return () => {}; });
  const seen = [];
  const unsub = escucharFoto('SEB1998', 'F1', (it) => seen.push(it));
  await flush();
  push({ id: 'F1', exists: () => true, data: () => ({ identity: 'ella', reactions: { yo: '💖' } }) });
  push({ id: 'F1', exists: () => false, data: () => undefined });
  expect(seen[0]).toMatchObject({ id: 'F1', identity: 'ella', reactions: { yo: '💖' }, favBy: [], takenAt: null });
  expect(seen[1]).toBeNull();
  unsub();
});
