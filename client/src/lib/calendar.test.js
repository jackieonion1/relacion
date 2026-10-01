import { addEvent, updateEvent, buildEventFields, eventToFormValues } from './calendar';
import { collection, doc, addDoc, updateDoc, serverTimestamp, deleteField } from 'firebase/firestore';

vi.mock('./firebase', () => ({
  auth: { currentUser: { uid: 'u1' } },
  db: {},
  authReady: Promise.resolve(),
  whenAuthed: () => Promise.resolve({ uid: 'u1' }),
}));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: vi.fn(),
  addDoc: vi.fn(),
  updateDoc: vi.fn(),
  serverTimestamp: vi.fn(),
  deleteField: vi.fn(),
  Timestamp: {
    fromDate: (date) => new (class { constructor() { this.ms = date.getTime(); } toDate() { return new Date(this.ms); } })(),
  },
}));

const ts = (d) => ({ toDate: () => d });
const toTs = (d) => ts(d);

// Guardar sin tocar el formulario: evento -> valores de inputs -> campos -> evento
const roundTrip = (ev) => buildEventFields(eventToFormValues(ev), toTs);

beforeEach(() => {
  vi.clearAllMocks();
  // CRA usa resetMocks: las implementaciones de las factorías se pierden entre tests
  collection.mockImplementation((d, ...p) => ({ path: p.join('/') }));
  doc.mockImplementation((c, id) => ({ path: `${c.path}/${id}` }));
  addDoc.mockResolvedValue({ id: 'new' });
  updateDoc.mockResolvedValue(undefined);
  serverTimestamp.mockReturnValue('SERVER_TS');
  deleteField.mockReturnValue('DELETE_FIELD');
});

describe('eventToFormValues', () => {
  test('usa la hora local, no UTC (23:30 no salta de día)', () => {
    const v = eventToFormValues({ start: ts(new Date(2025, 5, 14, 23, 30)) });
    expect(v.date).toBe('2025-06-14');
    expect(v.time).toBe('23:30');
  });

  test('00:05 del día 1 se queda en ese día y rellena con ceros', () => {
    const v = eventToFormValues({ start: ts(new Date(2025, 0, 1, 0, 5)) });
    expect(v.date).toBe('2025-01-01');
    expect(v.time).toBe('00:05');
  });

  test('evento sin fin deja endDate vacío; con fin, el día local del fin', () => {
    expect(eventToFormValues({ start: ts(new Date(2025, 5, 14, 10, 0)) }).endDate).toBe('');
    const v = eventToFormValues({
      start: ts(new Date(2025, 5, 14, 10, 0)),
      end: ts(new Date(2025, 5, 17, 23, 59, 59, 999)),
    });
    expect(v.endDate).toBe('2025-06-17');
  });

  test('defaults para campos ausentes', () => {
    const v = eventToFormValues({ start: ts(new Date(2025, 5, 14, 10, 0)), title: 'x' });
    expect(v).toMatchObject({ title: 'x', location: '', eventType: 'conjunto', seeEachOther: false });
  });
});

describe('ida y vuelta formulario -> evento -> formulario', () => {
  const cases = {
    'sin fin': { start: new Date(2025, 5, 14, 12, 0) },
    'fin el mismo día': { start: new Date(2025, 5, 14, 18, 45), end: new Date(2025, 5, 14, 23, 59, 59, 999) },
    'varios días': { start: new Date(2025, 11, 30, 9, 15), end: new Date(2026, 0, 2, 23, 59, 59, 999) },
    'cerca de medianoche': { start: new Date(2025, 5, 14, 23, 59), end: new Date(2025, 5, 15, 23, 59, 59, 999) },
  };

  test.each(Object.entries(cases))('%s: guardar sin tocar no cambia nada', (_, { start, end }) => {
    const ev = {
      title: 'Cena', location: 'Casa', eventType: 'novia', seeEachOther: true,
      start: ts(start), ...(end ? { end: ts(end) } : {}),
    };
    const fields = roundTrip(ev);
    expect(fields.start.toDate().getTime()).toBe(start.getTime());
    if (end) expect(fields.end.toDate().getTime()).toBe(end.getTime());
    else expect(fields).not.toHaveProperty('end');
    expect(fields).toMatchObject({ title: 'Cena', location: 'Casa', eventType: 'novia', seeEachOther: true });
  });
});

describe('addEvent y updateEvent', () => {
  const data = {
    title: '  Cena  ', date: '2025-06-14', time: '21:30', endDate: '2025-06-16',
    location: ' Casa ', eventType: 'novio', seeEachOther: true,
  };

  test('construyen el mismo payload para los mismos datos', async () => {
    await addEvent('p1', data, 'yo');
    await updateEvent('p1', 'e1', data);
    const added = addDoc.mock.calls[0][1];
    const updated = updateDoc.mock.calls[0][1];
    // Lo que solo existe al crear no se toca al editar
    const { createdAt, createdBy, identity, ...sharedFields } = added;
    expect(createdAt).toBe('SERVER_TS');
    expect(createdBy).toBe('u1');
    expect(identity).toBe('yo');
    expect(updated).toEqual(sharedFields);
    expect(updated).not.toHaveProperty('createdAt');
    expect(updated).not.toHaveProperty('createdBy');
    expect(updated).not.toHaveProperty('identity');
  });

  test('updateEvent apunta al documento y usa updateDoc', async () => {
    await updateEvent('p1', 'e1', data);
    expect(updateDoc.mock.calls[0][0]).toEqual({ path: 'pairs/p1/events/e1' });
  });

  test('sin fin, updateEvent borra el campo end (updateDoc conserva lo que falta)', async () => {
    await addEvent('p1', { ...data, endDate: '' }, 'yo');
    await updateEvent('p1', 'e1', { ...data, endDate: '' });
    expect(addDoc.mock.calls[0][1]).not.toHaveProperty('end');
    expect(updateDoc.mock.calls[0][1].end).toBe('DELETE_FIELD');
  });

  test('devuelve { committed } sin esperar al servidor', async () => {
    updateDoc.mockReturnValueOnce(new Promise(() => {})); // nunca llega el ack (offline)
    const { committed } = await updateEvent('p1', 'e1', data);
    expect(committed).toBeInstanceOf(Promise);
  });

  test('updateEvent rechaza sin contexto', async () => {
    await expect(updateEvent('', 'e1', data)).rejects.toThrow('missing-context');
    await expect(updateEvent('p1', '', data)).rejects.toThrow('missing-context');
  });
});
