import { addComentario, deleteComentario, marcarLeidos, limpiarComentario, ordenComentarios, escucharNoLeidos } from './fotoComentarios';
import { collection, doc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, increment, arrayRemove, serverTimestamp } from 'firebase/firestore';

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
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  increment: vi.fn(),
  arrayRemove: vi.fn(),
  serverTimestamp: vi.fn(),
}));

const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

beforeEach(() => {
  collection.mockImplementation((d, ...p) => ({ path: p.join('/') }));
  doc.mockImplementation((c, id = 'C1') => ({ path: `${c.path}/${id}`, id }));
  increment.mockImplementation((n) => `+${n}`);
  arrayRemove.mockImplementation((x) => `-${x}`);
  serverTimestamp.mockReturnValue('<ahora>');
  updateDoc.mockResolvedValue();
});

describe('addComentario', () => {
  test('el comentario y el contador van por separado, sin esperar al servidor', async () => {
    setDoc.mockReturnValue(new Promise(() => {})); // offline
    const r = await addComentario('SEB1998', 'F1', '  Qué día  ', 'ella');
    expect(r.id).toBe('C1');
    expect(setDoc).toHaveBeenCalledWith({ path: 'pairs/SEB1998/photoComments/C1', id: 'C1' }, {
      photoId: 'F1', text: 'Qué día', identity: 'ella', createdBy: 'u1', createdAt: '<ahora>', unreadFor: ['yo'],
    });
    expect(updateDoc).toHaveBeenCalledWith({ path: 'pairs/SEB1998/photos/F1', id: 'F1' }, {
      commentCount: '+1', lastCommentAt: '<ahora>', lastCommentBy: 'ella',
    });
  });

  test('si la foto ya no existe, el comentario no se pierde con ella (F2)', async () => {
    setDoc.mockResolvedValue();
    updateDoc.mockRejectedValue(Object.assign(new Error('gone'), { code: 'not-found' }));
    await expect(addComentario('SEB1998', 'F1', 'hola', 'yo')).resolves.toMatchObject({ id: 'C1' });
    expect(setDoc).toHaveBeenCalledTimes(1);
  });

  test('vacío no se escribe', async () => {
    await expect(addComentario('SEB1998', 'F1', '   ', 'yo')).rejects.toThrow('empty');
    expect(setDoc).not.toHaveBeenCalled();
  });
});

test('limpiarComentario recorta y deja como mucho 500 caracteres', () => {
  expect(limpiarComentario('  a  ')).toBe('a');
  expect(limpiarComentario('x'.repeat(600))).toHaveLength(500);
});

test('ordenComentarios: del más antiguo al último; el nuestro sin hora del servidor, al final', () => {
  const ts = (ms) => ({ toMillis: () => ms });
  const list = [{ id: 'b', createdAt: null }, { id: 'c', createdAt: ts(20) }, { id: 'a', createdAt: ts(10) }];
  expect(ordenComentarios(list).map((c) => c.id)).toEqual(['a', 'c', 'b']);
});

test('deleteComentario borra el doc y baja el contador de su foto', async () => {
  deleteDoc.mockResolvedValue();
  await deleteComentario('SEB1998', { id: 'C9', photoId: 'F1' });
  expect(deleteDoc).toHaveBeenCalledWith({ path: 'pairs/SEB1998/photoComments/C9', id: 'C9' });
  expect(updateDoc).toHaveBeenCalledWith({ path: 'pairs/SEB1998/photos/F1', id: 'F1' }, { commentCount: '+-1' });
});

test('marcarLeidos solo toca los que esta persona no ha leído, uno a uno', async () => {
  updateDoc.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'not-found' }));
  await marcarLeidos('SEB1998', [
    { id: 'C1', unreadFor: ['yo'] }, { id: 'C2', unreadFor: [] }, { id: 'C3', unreadFor: ['yo'] },
  ], 'yo');
  expect(updateDoc).toHaveBeenCalledTimes(2);
  expect(updateDoc).toHaveBeenLastCalledWith({ path: 'pairs/SEB1998/photoComments/C3', id: 'C3' }, { unreadFor: '-yo' });
});

test('escucharNoLeidos: una sola cláusula array-contains y { id, photoId } de cada uno', async () => {
  let push;
  onSnapshot.mockImplementation((q, opts, next) => { push = next; return () => {}; });
  const seen = [];
  escucharNoLeidos('SEB1998', 'ella', (l, deCache) => seen.push([l, deCache]));
  await flush();
  expect(where).toHaveBeenCalledWith('unreadFor', 'array-contains', 'ella');
  expect(where).toHaveBeenCalledTimes(1);
  expect(onSnapshot.mock.calls[0][1]).toEqual({ includeMetadataChanges: true });
  const docs = [{ id: 'C1', data: () => ({ photoId: 'F1' }) }];
  push({ docs, metadata: { fromCache: true } });
  push({ docs, metadata: { fromCache: false } });
  expect(seen).toEqual([[[{ id: 'C1', photoId: 'F1' }], true], [[{ id: 'C1', photoId: 'F1' }], false]]);
});
