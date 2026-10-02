import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router';
import Icon from '../components/Icon';
import Sheet from '../components/Sheet';
import Button from '../components/Button';
import Field from '../components/Field';
import { usePrefersReducedMotion } from '../lib/motion';
import {
  EMOJI, MAX_TEXTO, MAX_TITULO, borrarCapsula, crearCapsula, cuentaAtras, diaMinimo, escucharCapsulas, fechaLarga,
  leerCapsula, marcarAbierta, paraQuien, repartirCapsulas, validarCapsula,
} from '../lib/capsulas';

// Cápsulas (3.1): sealed letters that open on their day. Each one is an envelope with a wax seal; on its day the seal
// breaks, the flap lifts and the letter comes out (without motion when the system asks for less). What opens it is
// the server: before openAt the rules refuse the content, whatever this phone's clock says. Styles in Capsulas.css,
// imported from App.jsx (see there why)

const ERRORES = {
  texto: 'Escribe algo para guardar.',
  largo: `Como mucho ${MAX_TEXTO} caracteres.`,
  dia: 'Elige un día a partir de mañana.',
  'offline-foto': 'Para guardar la foto hace falta conexión.',
};
// The opening takes this long before the letter is read in its sheet (Capsulas.css times its steps to it)
const APERTURA_MS = 1700;

const de = (c) => (EMOJI[c.fromIdentity] ? `De ${EMOJI[c.fromIdentity]}` : '');

// The envelope: flap, side folds, the letter inside and the seal. `fase`: cerrado | espera | abriendo
function Sobre({ fase = 'cerrado', grande = false, conPulso = false }) {
  return (
    <div className={`sobre ${grande ? 'sobre-grande' : ''} sobre-${fase}`} aria-hidden="true">
      <span className="sobre-carta" />
      <span className="sobre-cuerpo" />
      <span className="sobre-solapa" />
      <span className={`sobre-lacre ${conPulso ? 'sobre-lacre-pulso' : ''}`}>
        <Icon name="latido" size={grande ? 24 : 18} filled />
      </span>
    </div>
  );
}

// «Escribir una cápsula»: the letter, an optional title and photo, for whom and the day it opens
function NuevaCapsula({ isOpen, onClose, onSellada, pairId, identity }) {
  const otro = identity === 'yo' ? 'ella' : 'yo';
  const minimo = diaMinimo();
  const [texto, setTexto] = useState('');
  const [titulo, setTitulo] = useState('');
  const [dia, setDia] = useState('');
  const [para, setPara] = useState('ambos');
  const [foto, setFoto] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);
  const fotoInput = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
    setTexto(''); setTitulo(''); setDia(''); setPara('ambos'); setFoto(null); setError('');
  }, [isOpen]);

  async function sellar(e) {
    e.preventDefault();
    const v = validarCapsula({ texto, titulo, dia, para });
    if (v.error) { setError(v.error); return; }
    setGuardando(true);
    setError('');
    try {
      const r = await crearCapsula(pairId, { texto, titulo, dia, para, foto }, identity);
      onSellada(r.queued);
    } catch (err) {
      setError(ERRORES[err?.message] ? err.message : 'otro');
    } finally {
      setGuardando(false);
    }
  }

  const opciones = [{ id: 'ambos', label: 'Los dos' }, { id: otro, label: `Tu ${EMOJI[otro]}` }];
  return (
    <Sheet isOpen={isOpen} onClose={guardando ? () => {} : onClose}>
      <form className="flex flex-col gap-4 px-5 pt-3.5 pb-[34px]" onSubmit={sellar} noValidate>
        <div className="flex flex-col gap-0.5">
          <h2 className="serif text-2xl leading-[1.15] font-normal">Una cápsula del tiempo</h2>
          <p className="text-sm text-ink-2">Nadie podrá leerla hasta ese día, tampoco tú.</p>
        </div>
        <Field
          label="Tu carta" multiline rows={7} value={texto} maxLength={MAX_TEXTO} disabled={guardando}
          onChange={(e) => setTexto(e.target.value)} className="serif text-[17px] leading-[1.45]"
          error={error === 'texto' || error === 'largo' ? ERRORES[error] : ''}
        />
        <Field
          label="Título (opcional)" value={titulo} maxLength={MAX_TITULO} disabled={guardando}
          placeholder="Para el aniversario" onChange={(e) => setTitulo(e.target.value)}
        />
        <div className="flex flex-col gap-1.5">
          <span className="etiqueta" id="capsula-para">Para</span>
          <div role="group" aria-labelledby="capsula-para" className="grid grid-cols-2 h-11 p-1 rounded-full bg-sunk">
            {opciones.map((o) => (
              <button
                key={o.id} type="button" aria-pressed={para === o.id} disabled={guardando} onClick={() => setPara(o.id)}
                className={`rounded-full text-[15px] font-semibold transition-colors ${para === o.id ? 'bg-raised text-ink shadow-carta' : 'text-ink-2'}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>
        <Field
          label="Se abre el" type="date" value={dia} min={minimo} disabled={guardando}
          onChange={(e) => setDia(e.target.value)}
          error={error === 'dia' ? ERRORES.dia : ''}
          hint={dia >= minimo ? `A las 00:00 del ${fechaLarga(Date.parse(`${dia}T12:00:00Z`))}.` : 'A partir de mañana.'}
        />
        <div className="flex items-center gap-3">
          <input
            ref={fotoInput} type="file" accept="image/*" className="sr-only" tabIndex={-1} aria-hidden="true"
            onChange={(e) => setFoto(e.target.files?.[0] || null)}
          />
          <Button variant="sec" icon={foto ? 'cerrar' : 'nuevo'} disabled={guardando}
            onClick={() => { if (foto) { setFoto(null); fotoInput.current.value = ''; } else fotoInput.current?.click(); }}
          >
            {foto ? 'Quitar la foto' : 'Añadir una foto'}
          </Button>
          {foto && <span className="text-sm text-ink-2 truncate min-w-0">{foto.name || 'Foto'}</span>}
        </div>
        {(error === 'offline-foto' || error === 'otro') && (
          <p role="alert" className="text-[14px] text-danger">{ERRORES[error] || 'No se ha podido sellar. Prueba otra vez con conexión.'}</p>
        )}
        <div className="flex flex-col gap-1.5">
          <Button type="submit" size="l" busy={guardando} busyText="Sellando…">Sellar la cápsula</Button>
          <Button variant="txt" size="l" disabled={guardando} onClick={onClose}>Cancelar</Button>
        </div>
      </form>
    </Sheet>
  );
}

// The letter, read: its text, its photo and who wrote it
function Carta({ capsula, contenido, identity, onClose, onBorrar }) {
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  useEffect(() => { setConfirmar(false); }, [capsula]);
  return (
    <Sheet isOpen={!!capsula} onClose={onClose}>
      {capsula && (
        <article className="carta-leida flex flex-col gap-4 px-5 pt-4 pb-[34px]">
          <header className="flex flex-col gap-0.5">
            <span className="etiqueta">{paraQuien(capsula, identity)} · {fechaLarga(capsula.openAt)}</span>
            <h2 className="serif text-[26px] leading-[1.15] font-normal">{capsula.title || 'Una cápsula'}</h2>
          </header>
          {contenido?.conFoto && (contenido.fotoUrl
            ? <img src={contenido.fotoUrl} alt="La foto de la cápsula" className="block w-full h-auto rounded-tarjeta border border-line" />
            : <p className="text-sm text-ink-2">No se ha podido cargar la foto. Prueba otra vez con conexión.</p>)}
          <p className="serif text-[18px] leading-[1.55] whitespace-pre-wrap break-words">{contenido?.text}</p>
          {de(capsula) && <p className="serif italic text-[18px] text-ink-2 text-right">{de(capsula)}</p>}
          {confirmar ? (
            <div className="flex flex-col gap-1.5 pt-2">
              <p className="text-[15px]">¿Borrar la cápsula? Se borra para los dos.</p>
              <Button variant="dan" size="l" busy={borrando} busyText="Borrando…"
                onClick={async () => { setBorrando(true); try { await onBorrar(capsula); } finally { setBorrando(false); } }}
              >
                Borrar
              </Button>
              <Button variant="txt" size="l" disabled={borrando} onClick={() => setConfirmar(false)}>Cancelar</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5 pt-2">
              <Button variant="sec" size="l" onClick={onClose}>Cerrar</Button>
              <Button variant="txt" size="l" onClick={() => setConfirmar(true)}>Borrar la cápsula</Button>
            </div>
          )}
        </article>
      )}
    </Sheet>
  );
}

// A sealed one, tapped: when it opens, and the way to throw it away
function Sellada({ capsula, identity, onClose, onBorrar }) {
  const [confirmar, setConfirmar] = useState(false);
  const [borrando, setBorrando] = useState(false);
  useEffect(() => { setConfirmar(false); }, [capsula]);
  return (
    <Sheet isOpen={!!capsula} onClose={onClose}>
      {capsula && (
        <div className="flex flex-col gap-4 px-5 pt-3.5 pb-[34px]">
          <div className="flex flex-col gap-0.5">
            <h2 className="serif text-2xl leading-[1.15] font-normal">{capsula.title || 'Una cápsula'}</h2>
            <p className="text-sm text-ink-2">{[de(capsula), paraQuien(capsula, identity)].filter(Boolean).join(' · ')}</p>
          </div>
          <p className="serif text-[18px] leading-[1.4]">Está sellada hasta el {fechaLarga(capsula.openAt)}. Ese día podréis abrirla.</p>
          {confirmar ? (
            <div className="flex flex-col gap-1.5">
              <p className="text-[15px]">¿Borrar la cápsula sin abrirla? Se borra para los dos y no se puede leer después.</p>
              <Button variant="dan" size="l" busy={borrando} busyText="Borrando…"
                onClick={async () => { setBorrando(true); try { await onBorrar(capsula); } finally { setBorrando(false); } }}
              >
                Borrar
              </Button>
              <Button variant="txt" size="l" disabled={borrando} onClick={() => setConfirmar(false)}>Cancelar</Button>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              <Button variant="sec" size="l" onClick={onClose}>Vale</Button>
              <Button variant="txt" size="l" onClick={() => setConfirmar(true)}>Borrar sin abrir</Button>
            </div>
          )}
        </div>
      )}
    </Sheet>
  );
}

export default function Capsulas() {
  const navigate = useNavigate();
  const location = useLocation();
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const identity = useMemo(() => localStorage.getItem('identity') || 'yo', []);
  const reduce = usePrefersReducedMotion();
  const [lista, setLista] = useState(null); // null while the first snapshot is on its way
  const [nueva, setNueva] = useState(false);
  const [aviso, setAviso] = useState('');
  const [apertura, setApertura] = useState(null); // { capsula, fase: 'espera' | 'abriendo' }
  const [leida, setLeida] = useState(null); // { capsula, contenido }
  const [sellada, setSellada] = useState(null);
  const [ahora, setAhora] = useState(() => Date.now());
  const timer = useRef(null);

  useEffect(() => escucharCapsulas(pairId, setLista, () => setLista((l) => l || [])), [pairId]);
  // Midnight comes while the page is open: a sealed one becomes ready without reloading
  useEffect(() => {
    const id = setInterval(() => setAhora(Date.now()), 60000);
    return () => { clearInterval(id); clearTimeout(timer.current); };
  }, []);
  // Closing the letter frees its photo
  useEffect(() => () => { if (leida?.contenido?.fotoUrl) URL.revokeObjectURL(leida.contenido.fotoUrl); }, [leida]);

  const { listas, selladas, abiertas } = useMemo(() => repartirCapsulas(lista || [], identity, ahora), [lista, identity, ahora]);

  async function abrir(capsula, { animar }) {
    setAviso('');
    if (animar) setApertura({ capsula, fase: 'espera' });
    try {
      const contenido = await leerCapsula(pairId, capsula, identity);
      marcarAbierta(pairId, capsula.id, identity);
      if (!animar) { setLeida({ capsula, contenido }); return; }
      setApertura({ capsula, fase: 'abriendo' });
      timer.current = setTimeout(() => { setApertura(null); setLeida({ capsula, contenido }); }, APERTURA_MS);
    } catch (e) {
      setApertura(null);
      setAviso(e?.message === 'sellada'
        ? 'Todavía no: el servidor dice que aún no es el día. Prueba un poco más tarde.'
        : 'Hace falta conexión para abrirla.');
    }
  }

  async function borrar(capsula) {
    try {
      await borrarCapsula(pairId, capsula);
      setLeida(null); setSellada(null);
    } catch {
      setAviso('No se ha podido borrar. Prueba otra vez con conexión.');
    }
  }

  const vacia = lista && lista.length === 0;
  return (
    <div className="max-w-(--breakpoint-md) mx-auto px-4 pb-6">
      <button type="button" aria-label="Volver" onClick={() => navigate(location.state?.volver || '/recuerdos')} className="btn btn-icono -ml-2 mt-1">
        <Icon name="atras" />
      </button>
      <div className="px-1 pt-1.5 pb-[18px] flex flex-col gap-1.5">
        <h1 className="serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em]">Cápsulas</h1>
        <p className="serif text-[18px] leading-[1.35] text-ink-2">Cartas para abrir <em>el día que elijáis.</em></p>
      </div>
      <Button size="l" icon="nuevo" className="w-full" onClick={() => setNueva(true)}>Escribir una cápsula</Button>
      {aviso && <p role="status" className="mt-3 px-1 text-[15px] text-ink-2">{aviso}</p>}

      {lista === null && (
        <div role="status" className="mt-6 rounded-hero bg-card border border-line p-5 flex flex-col gap-3">
          <span className="sr-only">Cargando las cápsulas…</span>
          <span aria-hidden="true" className="hueco block w-28 h-3 rounded-md" />
          <span aria-hidden="true" className="hueco block w-56 h-6 rounded-md" />
        </div>
      )}

      {vacia && (
        <section aria-label="Sin cápsulas" className="mt-6 p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-1.5">
          <h2 className="etiqueta">Todavía ninguna</h2>
          <p className="serif text-[18px] leading-[1.35] text-ink-2">Escribid una carta para el aniversario, para un cumpleaños o para dentro de un año.</p>
        </section>
      )}

      {listas.length > 0 && (
        <section aria-labelledby="capsulas-listas" className="mt-6 flex flex-col gap-3">
          <h2 id="capsulas-listas" className="etiqueta px-1">Hoy se abre</h2>
          {listas.map((c) => (
            <article key={c.id} className="capsula-lista rounded-hero bg-card border border-line shadow-carta p-5 flex flex-col items-center gap-4">
              <Sobre grande conPulso={!reduce} />
              <div className="flex flex-col items-center gap-0.5 text-center">
                <h3 className="serif text-[24px] leading-[1.15] font-normal">{c.title || 'Una cápsula'}</h3>
                <p className="text-[14px] text-ink-2">{[de(c), paraQuien(c, identity)].filter(Boolean).join(' · ')}</p>
              </div>
              <Button size="l" className="w-full" onClick={() => abrir(c, { animar: !reduce })}>Abrirla</Button>
            </article>
          ))}
        </section>
      )}

      {selladas.length > 0 && (
        <section aria-labelledby="capsulas-selladas" className="mt-6 flex flex-col gap-2.5">
          <h2 id="capsulas-selladas" className="etiqueta px-1">Selladas</h2>
          {selladas.map((c) => (
            <button
              key={c.id} type="button" onClick={() => setSellada(c)}
              className="capsula-fila rounded-tarjeta bg-card border border-line p-3.5 flex items-center gap-4 text-left"
            >
              <Sobre />
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="serif text-[19px] leading-[1.2] truncate">{c.title || 'Una cápsula'}</span>
                <span className="text-[13px] text-ink-2">{[de(c), paraQuien(c, identity)].filter(Boolean).join(' · ')}</span>
                <span className="text-[14px] font-semibold text-accent-ink">{cuentaAtras(c.openAt, ahora)}</span>
                <span className="num text-[13px] text-ink-2">{fechaLarga(c.openAt)}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {abiertas.length > 0 && (
        <section aria-labelledby="capsulas-abiertas" className="mt-6 flex flex-col gap-2.5">
          <h2 id="capsulas-abiertas" className="etiqueta px-1">Abiertas</h2>
          {abiertas.map((c) => (
            <button
              key={c.id} type="button" onClick={() => abrir(c, { animar: false })}
              className="capsula-fila capsula-abierta rounded-tarjeta bg-card border border-line p-3.5 flex items-center gap-4 text-left"
            >
              <span className="carta-mini" aria-hidden="true" />
              <span className="flex flex-col gap-0.5 min-w-0">
                <span className="serif text-[19px] leading-[1.2] truncate">{c.title || 'Una cápsula'}</span>
                <span className="text-[13px] text-ink-2">{[de(c), paraQuien(c, identity)].filter(Boolean).join(' · ')}</span>
                <span className="num text-[13px] text-ink-2">Abierta el {fechaLarga(c.openAt)}</span>
              </span>
            </button>
          ))}
        </section>
      )}

      {apertura && (
        <div className="apertura fixed inset-0 z-9999 flex flex-col items-center justify-center gap-6 px-6" role="dialog" aria-modal="true" aria-label="Abriendo la cápsula">
          <div className="velo absolute inset-0 bg-scrim" aria-hidden="true" />
          <Sobre grande fase={apertura.fase} />
          <p role="status" className="relative apertura-texto serif italic text-[18px] bg-card text-ink border border-line rounded-full px-4 py-1.5 shadow-carta">
            {apertura.fase === 'espera' ? 'Rompiendo el lacre…' : (apertura.capsula.title || 'Una cápsula')}
          </p>
        </div>
      )}

      <NuevaCapsula
        isOpen={nueva} onClose={() => setNueva(false)} pairId={pairId} identity={identity}
        onSellada={(queued) => { setNueva(false); setAviso(queued ? 'Sellada. Se guardará cuando vuelva la conexión.' : 'Sellada. Hasta ese día no la abre nadie.'); }}
      />
      <Carta capsula={leida?.capsula} contenido={leida?.contenido} identity={identity} onClose={() => setLeida(null)} onBorrar={borrar} />
      <Sellada capsula={sellada} identity={identity} onClose={() => setSellada(null)} onBorrar={borrar} />
    </div>
  );
}
