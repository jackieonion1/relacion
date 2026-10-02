import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import HaceUnAnoTarjeta from './HaceUnAnoTarjeta';
import { fotosDelDia, olvidarVacioHoy } from '../lib/recuerdos';
import { thumbDeItem } from '../lib/photos';

vi.mock('../lib/recuerdos', async (orig) => ({ ...(await orig()), fotosDelDia: vi.fn() }));
vi.mock('../lib/photos', async (orig) => ({ ...(await orig()), thumbDeItem: vi.fn() }));

const foto = (id, thumbUrl = '') => ({ id, thumbUrl, thumbDoc: `https://t/${id}`, createdAt: 1, takenAt: null });
const pinta = () => render(<MemoryRouter><HaceUnAnoTarjeta /></MemoryRouter>);

beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('pairId', 'SEB1998');
  URL.revokeObjectURL = vi.fn();
});

test('sin fotos de otros años no pinta nada', async () => {
  fotosDelDia.mockResolvedValue([]);
  const { container } = pinta();
  await waitFor(() => expect(fotosDelDia).toHaveBeenCalled());
  expect(container.firstChild).toBeNull();
});

test('con fotos es un enlace al hub: el año más cercano, cuántas fotos y los otros años', async () => {
  fotosDelDia.mockResolvedValue([
    { anos: 1, items: [foto('a', 'blob:a'), foto('b')] },
    { anos: 3, items: [foto('c')] },
  ]);
  const { container } = pinta();
  const enlace = await screen.findByRole('link', { name: 'Ver las fotos de hace un año' });
  expect(enlace.getAttribute('href')).toBe('/recuerdos');
  expect(screen.getByText('Hace un año')).not.toBeNull();
  expect(screen.getByText(/2 fotos/).textContent).toContain('y de hace 3 años');
  expect(container.querySelector('img').getAttribute('src')).toBe('blob:a');
});

test('con foto pinta su copia, y si ninguna tiene miniatura no pinta una copia vacía que parezca foto', async () => {
  fotosDelDia.mockResolvedValue([{ anos: 1, items: [foto('a', 'blob:a')] }]);
  const con = pinta();
  await screen.findByRole('link');
  expect(con.container.querySelector('.hace-print img').getAttribute('src')).toBe('blob:a');
  con.unmount();

  sessionStorage.clear();
  fotosDelDia.mockResolvedValue([{ anos: 1, items: [foto('b')] }]);
  const sin = pinta();
  await screen.findByRole('link');
  expect(screen.getByText(/1 foto/)).not.toBeNull();
  expect(sin.container.querySelector('.hace-print')).toBeNull();
});

test('pide una sola miniatura por año: el resto de fotos no se baja', async () => {
  fotosDelDia.mockResolvedValue([]);
  pinta();
  await waitFor(() => expect(fotosDelDia).toHaveBeenCalledWith('SEB1998', expect.any(Date), 3, { max: 1 }));
});

test('al salir suelta las miniaturas (blob) de todos los años', async () => {
  fotosDelDia.mockResolvedValue([
    { anos: 1, items: [foto('a', 'blob:a')] },
    { anos: 2, items: [foto('b', 'blob:b'), foto('c', 'https://remota')] },
  ]);
  const { unmount } = pinta();
  await screen.findByRole('link');
  unmount();
  expect(URL.revokeObjectURL.mock.calls.map((c) => c[0])).toEqual(['blob:a', 'blob:b']);
});

describe('el resultado del día', () => {
  const grupos = () => [{ anos: 1, items: [foto('a', 'blob:a'), foto('b')] }, { anos: 3, items: [foto('c')] }];

  test('al volver a Inicio el mismo día no relee: pinta lo guardado y pide solo la miniatura', async () => {
    fotosDelDia.mockResolvedValue(grupos());
    thumbDeItem.mockResolvedValue('blob:otra');
    pinta().unmount();
    await waitFor(() => expect(fotosDelDia).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(sessionStorage.length).toBe(1));

    const { container } = pinta();
    expect(await screen.findByText(/2 fotos/)).not.toBeNull();
    expect(screen.getByText(/2 fotos/).textContent).toContain('y de hace 3 años');
    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:otra'));
    expect(fotosDelDia).toHaveBeenCalledTimes(1);
    expect(thumbDeItem).toHaveBeenCalledWith('SEB1998', { id: 'a', thumbDoc: 'https://t/a' });
  });

  test('fechar fotos en bloque lo olvida: la próxima visita vuelve a mirar', async () => {
    fotosDelDia.mockResolvedValue(grupos());
    pinta().unmount();
    await waitFor(() => expect(sessionStorage.length).toBe(1));
    olvidarVacioHoy('SEB1998');
    pinta();
    await waitFor(() => expect(fotosDelDia).toHaveBeenCalledTimes(2));
  });

  test('sin conexión no se guarda: lo visto puede ser solo lo que había en la caché', async () => {
    const enLinea = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    fotosDelDia.mockResolvedValue(grupos());
    pinta();
    await screen.findByRole('link');
    enLinea.mockRestore();
    expect(sessionStorage.length).toBe(0);
  });
});

test('sin pareja no consulta nada, y si la consulta falla no pinta nada', async () => {
  localStorage.clear();
  const { container } = pinta();
  expect(fotosDelDia).not.toHaveBeenCalled();
  expect(container.firstChild).toBeNull();

  localStorage.setItem('pairId', 'SEB1998');
  fotosDelDia.mockRejectedValue(new Error('sin red'));
  const otra = pinta();
  await waitFor(() => expect(fotosDelDia).toHaveBeenCalled());
  expect(otra.container.firstChild).toBeNull();
});
