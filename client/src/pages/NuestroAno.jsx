import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import Icon from '../components/Icon';
import { WHO } from '../lib/fotoCampos';
import { getPhotoThumbUrl } from '../lib/photos';
import { MESES, cargarNuestroAno, construirHistorias, ordinal, ventanaAniversario, yaAbierto } from '../lib/nuestroAno';

// «Nuestro año» (3.1): the year between two anniversaries as full-screen stories, tapped or swiped through like a
// Wrapped. Styles in NuestroAno.css, imported from App.jsx (see there why). The heart rain stays out: it would be a
// sixth moment. Reduced motion is the global rule in index.css (every animation ends at once); nothing here moves
// by timer, a story waits for a tap

const fecha = (ms) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }).format(ms);
const pl = (n, uno, varios) => (n === 1 ? uno : varios);
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);

// The paper each story is written on
const TONO = {
  portada: 'lacre', dias: 'papel', encuentros: 'rosa', largo: 'el', sitio: 'ella', planes: 'papel', fotos: 'rosa',
  meses: 'papel', foto: 'sunk', notas: 'ella', canciones: 'el', cierre: 'papel',
};

// 🫒 and 🍪 with their counts, when any of the two wrote or uploaded something
function Personas({ yo, ella }) {
  if (!(yo + ella)) return null;
  return (
    <p className="ano-personas num" aria-label={`Él ${yo}, ella ${ella}`}>
      <span aria-hidden="true">{WHO.yo} {yo}</span>
      <span aria-hidden="true">{WHO.ella} {ella}</span>
    </p>
  );
}

function Portada({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Nuestro año</p>
      <h1 className="ano-gran">Nuestro {ordinal(h.n)} año</h1>
      <p className="ano-texto num">{fecha(h.desde)} – {fecha(h.hasta)}</p>
      <p className="ano-emoji" aria-hidden="true">🍪🫒</p>
      <span className="ano-matasellos" aria-hidden="true">
        <span className="num text-[15px] font-semibold leading-none">{h.n}.º</span>
        <span className="text-[8.5px] font-semibold tracking-[0.12em] leading-none">24·NOV·{String(new Date(h.hasta).getFullYear()).slice(2)}</span>
      </span>
      <p className="ano-pista">Toca para seguir</p>
    </>
  );
}

function Dias({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Juntos</p>
      <p className="ano-num">{h.dias}</p>
      <p className="ano-gran">días de nosotros</p>
      <p className="ano-texto">{h.mesiversarios} mesiversarios, y contando 🩷</p>
    </>
  );
}

function Encuentros({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Nos vemos</p>
      <p className="ano-num">{h.n}</p>
      <p className="ano-gran">{pl(h.n, 'encuentro', 'encuentros')}</p>
      {h.dias > 0 && <p className="ano-texto">{h.dias} {pl(h.dias, 'día', 'días')} juntos de verdad 🩷</p>}
    </>
  );
}

function Largo({ h }) {
  return (
    <>
      <p className="ano-etiqueta">El más largo</p>
      <p className="ano-num">{h.dias}</p>
      <p className="ano-gran">días seguidos</p>
      {h.titulo && <p className="ano-texto">«{h.titulo}»</p>}
    </>
  );
}

function Sitio({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Nuestro sitio</p>
      <p className="ano-gran ano-lugar">{h.lugar}</p>
      <p className="ano-texto">{h.veces} encuentros allí</p>
    </>
  );
}

function Planes({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Planes</p>
      <p className="ano-num">{h.total}</p>
      <p className="ano-gran">{pl(h.total, 'plan en el calendario', 'planes en el calendario')}</p>
      <p className="ano-fichas num">
        {[['🩷', h.conjunto, 'de los dos'], ['💛', h.novio, 'de él'], ['💜', h.novia, 'de ella']].filter(([, n]) => n > 0).map(([emoji, n, quien]) => (
          <span key={emoji} className="ano-ficha" aria-label={`${n} ${quien}`}><span aria-hidden="true">{emoji} {n}</span></span>
        ))}
      </p>
    </>
  );
}

function Fotos({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Fotos</p>
      <p className="ano-num">{h.total}</p>
      <p className="ano-gran">{pl(h.total, 'foto nueva', 'fotos nuevas')}</p>
      <Personas yo={h.yo} ella={h.ella} />
    </>
  );
}

function Meses({ h }) {
  const max = h.mejor.n;
  return (
    <>
      <p className="ano-etiqueta">Mes a mes</p>
      <p className="ano-gran">{mayus(MESES[h.mejor.mes])} fue el mes con más fotos</p>
      <div className="ano-meses" role="img" aria-label={`Fotos por mes: ${h.meses.map((m) => `${MESES[m.mes]} ${m.n}`).join(', ')}`}>
        {h.meses.map((m, k) => (
          <span key={`${m.anio}-${m.mes}`} className={`ano-mes ${m.anio === h.mejor.anio && m.mes === h.mejor.mes ? 'mejor' : ''}`} style={{ '--p': m.n / max, '--k': k }}>
            <span className="num ano-mes-n" aria-hidden="true">{m.n || ''}</span>
            <span className="ano-mes-barra" aria-hidden="true" />
            <span className="ano-mes-letra" aria-hidden="true">{MESES[m.mes].charAt(0).toUpperCase()}</span>
          </span>
        ))}
      </div>
      <p className="ano-texto">{max} {pl(max, 'foto', 'fotos')} en {MESES[h.mejor.mes]}</p>
    </>
  );
}

function Foto({ h, fotoUrl }) {
  const reacciones = ['yo', 'ella'].filter((q) => h.reacciones[q]);
  const favorita = ['yo', 'ella'].filter((q) => h.favBy.includes(q));
  return (
    <>
      <p className="ano-etiqueta">La favorita</p>
      <figure className="ano-polaroid">
        {fotoUrl
          ? <img src={fotoUrl} alt="La foto con más corazones del año" draggable={false} />
          : <span className="ano-polaroid-hueco" aria-hidden="true" />}
        <figcaption className="ano-reacciones num">
          {reacciones.map((q) => <span key={q}>{WHO[q]} {h.reacciones[q]}</span>)}
        </figcaption>
      </figure>
      {favorita.length > 0 && <p className="ano-texto">Favorita de {favorita.map((q) => WHO[q]).join(' ')}</p>}
    </>
  );
}

function Notas({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Notas</p>
      <p className="ano-num">{h.total}</p>
      <p className="ano-gran">{pl(h.total, 'notita escrita', 'notitas escritas')}</p>
      <Personas yo={h.yo} ella={h.ella} />
    </>
  );
}

function Canciones({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Música</p>
      <p className="ano-num">{h.total}</p>
      <p className="ano-gran">{pl(h.total, 'canción nueva', 'canciones nuevas')} 🎵</p>
      <Personas yo={h.yo} ella={h.ella} />
    </>
  );
}

function Cierre({ onCerrar }) {
  return (
    <>
      <h2 className="ano-gran">Y los que vengan.</h2>
      <div className="ano-carta">
        <p>Otro año de planes, de fotos y de notitas. Gracias por cada día de este, y por todos los que faltan.</p>
      </div>
      <div className="ano-firma">
        <span className="serif italic text-[20px]">Con cariño, <span className="not-italic">🍪🫒</span></span>
        <span className="ano-sello" aria-hidden="true"><Icon name="latido" size={22} filled /></span>
      </div>
      <button type="button" onClick={onCerrar} className="btn btn-sec btn-m ano-volver">Volver</button>
    </>
  );
}

const PANTALLA = {
  portada: Portada, dias: Dias, encuentros: Encuentros, largo: Largo, sitio: Sitio, planes: Planes, fotos: Fotos,
  meses: Meses, foto: Foto, notas: Notas, canciones: Canciones, cierre: Cierre,
};

// Swipe: far enough, and more across than down. Anything shorter is a tap
const SWIPE = 48;

// The stories over everything: a tap on the left third goes back, anywhere else goes on; so does a swipe, and
// the arrows. Escape and ✕ close. `historias` come from construirHistorias; `fotoUrl` is the thumb of the «foto» one
export function Historias({ historias, fotoUrl = '', onCerrar, inicial = 0 }) {
  const [i, setI] = useState(Math.min(inicial, historias.length - 1));
  const raiz = useRef(null);
  const inicio = useRef(null);
  const deslizado = useRef(false); // a swipe also ends in a click on a zone: that one is not a tap
  const h = historias[i];
  const Pantalla = PANTALLA[h.id];
  const ir = (d) => setI((k) => Math.max(0, Math.min(historias.length - 1, k + d)));

  useEffect(() => {
    const antes = document.activeElement;
    raiz.current?.focus();
    return () => { try { antes?.focus?.(); } catch {} };
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') ir(1);
      else if (e.key === 'ArrowLeft') ir(-1);
      else if (e.key === 'Escape') onCerrar();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const onDown = (e) => {
    deslizado.current = false;
    inicio.current = { x: e.clientX, y: e.clientY };
  };
  const onUp = (e) => {
    const p = inicio.current;
    inicio.current = null;
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    if (Math.abs(dx) >= SWIPE && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      deslizado.current = true;
      ir(dx < 0 ? 1 : -1);
    }
  };
  const toque = (d) => () => {
    if (deslizado.current) { deslizado.current = false; return; }
    ir(d);
  };

  return createPortal(
    <div
      ref={raiz} role="dialog" aria-modal="true" aria-label="Nuestro año" tabIndex={-1}
      className={`ano ano-${TONO[h.id]}`}
      onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { inicio.current = null; }}
    >
      <header className="ano-tope">
        <ol className="ano-barras" aria-hidden="true">
          {historias.map((x, k) => <li key={x.id} className={k <= i ? 'hecha' : ''} />)}
        </ol>
        <button type="button" onClick={onCerrar} aria-label="Cerrar" className="btn btn-icono ano-cerrar">
          <Icon name="cerrar" />
        </button>
      </header>
      <div key={h.id} className={`ano-escena ano-en-${h.id}`} aria-live="polite">
        <Pantalla h={h} fotoUrl={fotoUrl} onCerrar={onCerrar} />
      </div>
      {/* aria-disabled, not disabled: a disabled button may swallow the pointer events, and a swipe has to start anywhere */}
      <button type="button" aria-label="Anterior" aria-disabled={i === 0} onClick={toque(-1)} className="ano-zona ano-zona-atras" />
      <button type="button" aria-label="Siguiente" aria-disabled={i === historias.length - 1} onClick={toque(1)} className="ano-zona ano-zona-sigue" />
    </div>,
    document.body
  );
}

// The page around the stories: the back arrow, a title and a quiet card while there is nothing else to show
function Hoja({ volver, children }) {
  return (
    <div className="max-w-(--breakpoint-md) mx-auto px-4 pb-6">
      <button type="button" aria-label="Volver" onClick={volver} className="btn btn-icono -ml-2 mt-1">
        <Icon name="atras" />
      </button>
      <h1 className="serif text-[36px] leading-[1.05] font-normal tracking-[-0.01em] px-1 pt-1.5 pb-[18px]">Nuestro año</h1>
      {children}
    </div>
  );
}

export default function NuestroAno() {
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  // ?ensayo=1 opens it outside the dates and writes nothing on the phone
  const ensayo = params.get('ensayo') === '1';
  const pairId = localStorage.getItem('pairId') || '';
  const abierto = ensayo || yaAbierto();
  const [estado, setEstado] = useState({ fase: 'carga' }); // carga | lista | error
  const [intento, setIntento] = useState(0);
  const volver = () => navigate(location.state?.volver || '/recuerdos');

  useEffect(() => {
    if (!abierto) return undefined;
    let cancelado = false;
    setEstado({ fase: 'carga' });
    (async () => {
      try {
        const stats = await cargarNuestroAno(pairId, { ensayo });
        // The thumb of the favourite one is the only thing fetched besides the numbers: no thumb, no story
        const favorita = stats.fotos.favorita;
        const fotoUrl = favorita ? await getPhotoThumbUrl(pairId, favorita.fotoId) : '';
        if (!cancelado) setEstado({ fase: 'lista', stats, fotoUrl });
      } catch {
        if (!cancelado) setEstado({ fase: 'error' });
      }
    })();
    return () => { cancelado = true; };
  }, [pairId, ensayo, abierto, intento]);

  const historias = useMemo(() => (
    estado.fase === 'lista'
      ? construirHistorias(estado.stats).filter((x) => x.id !== 'foto' || estado.fotoUrl)
      : []
  ), [estado]);

  if (!abierto) {
    const abre = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' }).format(ventanaAniversario().abre);
    return (
      <Hoja volver={volver}>
        <section aria-label="Todavía no" className="mt-2.5 p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-1.5">
          <h2 className="etiqueta">Todavía no</h2>
          <p className="serif text-[18px] leading-[1.35] text-ink-2">Se abre el {abre}.</p>
        </section>
      </Hoja>
    );
  }
  if (estado.fase === 'lista') return <Historias historias={historias} fotoUrl={estado.fotoUrl} onCerrar={volver} />;
  return (
    <Hoja volver={volver}>
      {estado.fase === 'error' ? (
        <section aria-label="Sin conexión" className="mt-2.5 p-5 rounded-hero border-[1.5px] border-dashed border-line flex flex-col items-start gap-3">
          <p className="serif text-[18px] leading-[1.35] text-ink-2">No hemos podido contar vuestro año. Hace falta conexión.</p>
          <button type="button" className="btn btn-sec" onClick={() => setIntento((k) => k + 1)}>Reintentar</button>
        </section>
      ) : (
        <div role="status" className="mt-2.5 rounded-hero bg-card border border-line p-5 flex flex-col gap-3">
          <span className="sr-only">Contando vuestro año…</span>
          <span aria-hidden="true" className="hueco block w-28 h-3 rounded-md" />
          <span aria-hidden="true" className="hueco block w-56 h-6 rounded-md" />
        </div>
      )}
    </Hoja>
  );
}
