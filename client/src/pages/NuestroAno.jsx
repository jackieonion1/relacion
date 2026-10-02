import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, useSearchParams } from 'react-router';
import Icon from '../components/Icon';
import { useMiniaturas } from '../components/FotosMosaico';
import { WHO } from '../lib/fotoCampos';
import { thumbDeItem } from '../lib/photos';
import { MESES, cargarNuestroAno, construirHistorias, ordinal, ventanaAniversario, yaAbierto } from '../lib/nuestroAno';

// «Nuestro año» (3.1): the year between two anniversaries as full-screen stories, tapped or swiped through like a
// Wrapped, with chapters of photos between them. Styles in NuestroAno.css, imported from App.jsx (see there why).
// The heart rain stays out: it would be a sixth moment. Reduced motion is the global rule in index.css (every
// animation ends at once) plus the Ken Burns, which then does not move at all; nothing here moves by timer, a story
// waits for a tap

const fecha = (ms) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Madrid' }).format(ms);
const diaMes = (ms) => new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', timeZone: 'Europe/Madrid' }).format(ms);
const pl = (n, uno, varios) => (n === 1 ? uno : varios);
const mayus = (s) => s.charAt(0).toUpperCase() + s.slice(1);
const abrev = (mes) => MESES[mes].slice(0, 3);

// The paper each story is written on
const TONO = {
  portada: 'lacre', dias: 'papel', 'capitulo-1': 'sunk', encuentros: 'rosa', largo: 'el', espera: 'papel',
  'capitulo-2': 'sunk', sitio: 'ella', planes: 'papel', 'capitulo-3': 'sunk', fotos: 'rosa', 'capitulo-4': 'sunk',
  foto: 'papel', extremos: 'sunk', escrito: 'ella', collage: 'rosa', cierre: 'papel',
};

// The photos a story shows (what lib/nuestroAno keeps of each: { id, thumbDoc, fecha })
function fotosDe(h) {
  if (!h) return [];
  return [h.foto, h.primera, h.ultima, ...(h.meses || []).map((m) => m.foto), ...(h.id === 'collage' ? h.fotos : [])].filter(Boolean);
}

// A perforated postage stamp: what a month with no photo shows (its 24th, the stamp of that month together), and
// what a photo that cannot be had turns into. It is one more piece of the letter, not a hole
function SelloPostal({ arriba, num, abajo, className = '' }) {
  return (
    <span className={`ano-sello-postal ${className}`} aria-hidden="true">
      <span className="ano-sello-postal-in">
        {arriba && <span className="ano-sello-arriba">{arriba}</span>}
        <span className="num ano-sello-num">{num}</span>
        <span className="ano-sello-abajo">{abajo}</span>
      </span>
    </span>
  );
}

// A thumb of the stories (`thumbs`: id → URL, '' once it could not be had). A soft hole while it comes, then the
// image fading in; with no URL, or a broken one, `sin` instead
function Miniatura({ foto, thumbs, alt = '', sin = null }) {
  const [rota, setRota] = useState(false);
  const url = foto ? thumbs[foto.id] : '';
  if (!foto || url === '' || rota) return sin;
  if (!url) return <span className="ano-hueco" aria-hidden="true" />;
  return <img src={url} alt={alt} draggable={false} decoding="async" onError={() => setRota(true)} />;
}

// [day, month (0-based)] of a date, Madrid time
function diaYMes(ms) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', timeZone: 'Europe/Madrid' }).formatToParts(ms).map((x) => [x.type, x.value]));
  return [Number(p.day), Number(p.month) - 1];
}

// The stamp of a photo that is not there: its day
function selloDeFoto(foto) {
  const [dia, mes] = diaYMes(foto.fecha);
  return <SelloPostal num={dia} abajo={abrev(mes)} />;
}

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
      {h.sellos && (
        <ol className="ano-sellitos" aria-hidden="true">
          {h.sellos.map((s, k) => (
            <li key={s.n} className={s.ganado ? 'ganado' : ''} style={{ '--k': k }}>
              <SelloPostal num={s.n} abajo={abrev(s.mes)} />
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

const ROMANOS = ['I', 'II', 'III', 'IV'];

// A chapter: its months as prints scattered on the table, each with its name and count written under it. A month
// with no photo to show is the stamp of its 24th
function Capitulo({ h, thumbs }) {
  return (
    <>
      <p className="ano-etiqueta">Capítulo {ROMANOS[h.k - 1]}</p>
      <h2 className="ano-gran">De {MESES[h.meses[0].mes]} a {MESES[h.meses.at(-1).mes]}</h2>
      <ul className={`ano-postales ano-postales-${h.meses.length}`}>
        {h.meses.map((m, k) => {
          const sello = <SelloPostal arriba={`Mes ${m.sello}`} num="24" abajo={abrev(m.mes)} className="ano-sello-mes" />;
          return (
            <li key={`${m.anio}-${m.mes}`} className="ano-postal" style={{ '--k': k }}>
              <figure className={m.foto ? 'ano-mini' : 'ano-mini sin-foto'}>
                {m.foto
                  ? <Miniatura foto={m.foto} thumbs={thumbs} alt={`Una foto de ${MESES[m.mes]}`} sin={<span className="ano-polaroid-sello">{sello}</span>} />
                  : sello}
                {m.mejor && <span className="ano-mini-lacre" aria-hidden="true"><Icon name="latido" size={14} filled /></span>}
                <figcaption className="ano-pie">
                  <span className="ano-pie-mes">{mayus(MESES[m.mes])}:</span>
                  <span className="ano-pie-n num">{m.n > 0 ? `${m.n} ${pl(m.n, 'foto', 'fotos')}` : 'sin fotos, pero con sello'}</span>
                  {m.mejor && <span className="ano-pie-mejor">el mes con más fotos</span>}
                </figcaption>
              </figure>
            </li>
          );
        })}
      </ul>
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

// The longest one, over a photo of those days that drifts slowly (Ken Burns) under a veil of the story's paper
function Largo({ h, thumbs }) {
  return (
    <>
      {h.foto && (
        <div className="ano-fondo">
          <Miniatura foto={h.foto} thumbs={thumbs} alt={`Una foto de «${h.titulo || 'el más largo'}»`} />
        </div>
      )}
      <p className="ano-etiqueta">El más largo</p>
      <p className="ano-num">{h.dias}</p>
      <p className="ano-gran">días seguidos</p>
      {h.titulo && <p className="ano-texto">«{h.titulo}»</p>}
    </>
  );
}

// The longest countdown: from the day it went on the calendar to the day it came, as two postmarks
function Espera({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Lo que más esperamos</p>
      <p className="ano-num">{h.dias}</p>
      <p className="ano-gran">días de cuenta atrás</p>
      {h.titulo && <p className="ano-texto">para «{h.titulo}»</p>}
      <p className="ano-ruta" aria-label={`Apuntado el ${diaMes(h.desde)}, y llegó el ${diaMes(h.hasta)}`}>
        <span className="ano-ruta-marca" aria-hidden="true"><span>apuntado</span><span className="num">{diaMes(h.desde)}</span></span>
        <span className="ano-ruta-linea" aria-hidden="true" />
        <span className="ano-ruta-marca llega" aria-hidden="true"><span>llegó</span><span className="num">{diaMes(h.hasta)}</span></span>
      </p>
    </>
  );
}

function Sitio({ h }) {
  const otros = h.otros || [];
  return (
    <>
      <p className="ano-etiqueta">Nuestro sitio</p>
      <p className="ano-gran ano-lugar">{h.lugar}</p>
      <p className="ano-texto">
        {h.veces} encuentros allí{otros.length > 0 && `, y ${otros.length} ${pl(otros.length, 'sitio', 'sitios')} más`}
      </p>
      {otros.length > 0 && (
        <ul className="ano-otros" aria-label="Los otros sitios">
          {otros.slice(0, 5).map((lugar, k) => (
            <li key={lugar} className={`ano-otro${lugar.length > 8 ? ' largo' : ''}`} style={{ '--k': k }}><span>{lugar}</span></li>
          ))}
        </ul>
      )}
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

// A clock of 24 marks, one per hour from midnight at the top: each as long as the sessions of photos at that hour,
// the busiest one in lacre
function Reloj({ horas, hora }) {
  const max = Math.max(...horas) || 1;
  return (
    <svg className="ano-reloj" viewBox="-50 -50 100 100" aria-hidden="true">
      <circle r="24" className="ano-reloj-esfera" />
      {horas.map((n, k) => {
        const a = (k / 24) * 2 * Math.PI - Math.PI / 2;
        const largo = 3 + (16 * n) / max;
        const [c, s] = [Math.cos(a), Math.sin(a)];
        return <line key={k} x1={28 * c} y1={28 * s} x2={(28 + largo) * c} y2={(28 + largo) * s} className={k === hora ? 'punta' : ''} />;
      })}
      {[0, 6, 12, 18].map((k) => {
        const a = (k / 24) * 2 * Math.PI - Math.PI / 2;
        return <text key={k} x={15 * Math.cos(a)} y={15 * Math.sin(a)} className="num">{k}</text>;
      })}
    </svg>
  );
}

const momento = (h) => (h >= 21 || h < 6 ? '🌙' : '☀️');

function Fotos({ h }) {
  return (
    <>
      <p className="ano-etiqueta">Fotos</p>
      <p className="ano-num">{h.total}</p>
      <p className="ano-gran">{pl(h.total, 'foto nueva', 'fotos nuevas')}</p>
      <Personas yo={h.yo} ella={h.ella} />
      {h.hora && (
        <div className="ano-hora">
          <Reloj horas={h.hora.horas} hora={h.hora.hora} />
          <p className="ano-texto">A las {h.hora.hora} h es cuando más os mandáis fotos {momento(h.hora.hora)}</p>
        </div>
      )}
    </>
  );
}

// The favourite one (the most hearts) or, while nobody has reacted, the most commented
function Foto({ h, thumbs }) {
  const comentada = h.comentarios != null;
  const reacciones = comentada ? [] : ['yo', 'ella'].filter((q) => h.reacciones[q]);
  const favorita = comentada ? [] : ['yo', 'ella'].filter((q) => h.favBy.includes(q));
  return (
    <>
      <p className="ano-etiqueta">{comentada ? 'La más comentada' : 'La favorita'}</p>
      <figure className="ano-polaroid">
        <Miniatura
          foto={h.foto} thumbs={thumbs} alt={comentada ? 'La foto más comentada del año' : 'La foto con más corazones del año'}
          sin={<span className="ano-polaroid-sello">{selloDeFoto(h.foto)}</span>}
        />
        <figcaption className="ano-reacciones num">
          {comentada
            ? <span className="ano-comentarios">{h.comentarios} comentarios en esta</span>
            : reacciones.map((q) => <span key={q}>{WHO[q]} {h.reacciones[q]}</span>)}
        </figcaption>
      </figure>
      {favorita.length > 0 && <p className="ano-texto">Favorita de {favorita.map((q) => WHO[q]).join(' ')}</p>}
    </>
  );
}

// The first and the last photo of the year, as two prints across the page, each with its day as a postmark
function Extremos({ h, thumbs }) {
  const copia = (foto, alt, clase) => {
    const [dia, mes] = diaYMes(foto.fecha);
    return (
      <figure className={`ano-polaroid ano-extremo ${clase}`}>
        <Miniatura foto={foto} thumbs={thumbs} alt={alt} sin={<span className="ano-polaroid-sello">{selloDeFoto(foto)}</span>} />
        <span className="ano-extremo-fecha" aria-hidden="true">
          <span className="ano-extremo-dia num">{dia}</span>
          <span className="ano-extremo-mes">{abrev(mes)}</span>
        </span>
      </figure>
    );
  };
  return (
    <>
      <p className="ano-gran ano-extremo-txt">Empezó así…</p>
      {copia(h.primera, `La primera foto del año, del ${diaMes(h.primera.fecha)}`, 'primera')}
      {copia(h.ultima, `La última foto del año, del ${diaMes(h.ultima.fecha)}`, 'ultima')}
      <p className="ano-gran ano-extremo-txt fin">…y acabó así</p>
    </>
  );
}

// '2 h 14 min', '48 min'
function duracion(segundos) {
  const min = Math.round(segundos / 60);
  const h = Math.floor(min / 60);
  return h ? `${h} h${min % 60 ? ` ${min % 60} min` : ''}` : `${min} min`;
}

// Notes and songs side by side, with a rule of ink between them, and the minutes of new music under
function Escrito({ h }) {
  const { notas, canciones, musica } = h;
  return (
    <>
      <p className="ano-etiqueta">Notas y música</p>
      <div className="ano-columnas">
        {notas.total > 0 && (
          <div className="ano-columna">
            <p className="ano-num ano-num-medio">{notas.total}</p>
            <p className="ano-columna-que">{pl(notas.total, 'notita', 'notitas')}</p>
            <Personas yo={notas.yo} ella={notas.ella} />
          </div>
        )}
        {canciones.total > 0 && (
          <div className="ano-columna">
            <p className="ano-num ano-num-medio">{canciones.total}</p>
            <p className="ano-columna-que">{pl(canciones.total, 'canción', 'canciones')} 🎵</p>
            <Personas yo={canciones.yo} ella={canciones.ella} />
          </div>
        )}
      </div>
      {musica?.segundos >= 60 && <p className="ano-texto">{duracion(musica.segundos)} de música nueva</p>}
      {musica?.primera && <p className="ano-texto ano-primera">La primera: «{musica.primera}»</p>}
    </>
  );
}

// Everything at the end: a sheet of contact prints that fills in one by one
function Collage({ h, thumbs }) {
  return (
    <>
      <h2 className="ano-gran">Y todo esto.</h2>
      <ul className="ano-collage" aria-label={`${h.fotos.length} fotos del año`}>
        {h.fotos.map((foto, k) => (
          <li key={`${foto.id}-${k}`} style={{ '--k': k }}>
            <Miniatura
              foto={foto} thumbs={thumbs}
              sin={<span className="ano-collage-papel" aria-hidden="true"><Icon name="latido" size={18} filled /></span>}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

function Cierre({ h, onCerrar }) {
  const capsulas = h.capsulas;
  return (
    <>
      <h2 className="ano-gran">Y los que vengan.</h2>
      <div className="ano-carta">
        <p>Otro año de planes, de fotos y de notitas. Gracias por cada día de este, y por todos los que faltan.</p>
        {capsulas?.n > 0 && (
          <p className="ano-capsulas">
            Y {capsulas.n} {pl(capsulas.n, 'cápsula sellada', 'cápsulas selladas')} este año
            {capsulas.proxima ? `: la próxima se abre el ${fecha(capsulas.proxima)}.` : '.'}
          </p>
        )}
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
  portada: Portada, dias: Dias, 'capitulo-1': Capitulo, encuentros: Encuentros, largo: Largo, espera: Espera,
  'capitulo-2': Capitulo, sitio: Sitio, planes: Planes, 'capitulo-3': Capitulo, fotos: Fotos, 'capitulo-4': Capitulo,
  foto: Foto, extremos: Extremos, escrito: Escrito, collage: Collage, cierre: Cierre,
};

// Swipe: far enough, and more across than down. Anything shorter is a tap
const SWIPE = 48;

// The stories over everything: a tap on the left third goes back, anywhere else goes on; so does a swipe, and
// the arrows. Escape and ✕ close. `historias` come from construirHistorias; `thumbs` (id → URL, '' when it could
// not be had) are the photos they show, which keep arriving while the stories are open
export function Historias({ historias, thumbs = {}, onCerrar, inicial = 0 }) {
  const [i, setI] = useState(Math.min(inicial, historias.length - 1));
  const raiz = useRef(null);
  const inicio = useRef(null);
  const deslizado = useRef(false); // a swipe also ends in a click on a zone: that one is not a tap
  const h = historias[i];
  const Pantalla = PANTALLA[h.id];
  const ir = (d) => setI((k) => Math.max(0, Math.min(historias.length - 1, k + d)));

  // The photos of the next story are decoded ahead, so they are there when it opens
  const siguiente = historias[i + 1];
  useEffect(() => {
    for (const foto of fotosDe(siguiente)) {
      if (!thumbs[foto.id]) continue;
      const img = new Image();
      img.src = thumbs[foto.id];
      img.decode?.().catch(() => {});
    }
  }, [siguiente, thumbs]);

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
        <Pantalla h={h} thumbs={thumbs} onCerrar={onCerrar} />
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

  const [urls, poner] = useMiniaturas();
  const [fallidas, setFallidas] = useState({});

  useEffect(() => {
    if (!abierto) return undefined;
    let cancelado = false;
    setEstado({ fase: 'carga' });
    (async () => {
      try {
        const stats = await cargarNuestroAno(pairId, { ensayo });
        if (!cancelado) setEstado({ fase: 'lista', stats });
      } catch {
        if (!cancelado) setEstado({ fase: 'error' });
      }
    })();
    return () => { cancelado = true; };
  }, [pairId, ensayo, abierto, intento]);

  const historias = useMemo(() => (estado.fase === 'lista' ? construirHistorias(estado.stats) : []), [estado]);

  // The stories open as soon as the numbers are in; their photos come behind, in the order they are shown and 6 at a
  // time, each by the URL its doc already had (thumbDeItem: the cached blob first, no read of the doc). That is a
  // few dozen thumbs at most, and the collage mostly repeats the ones before it
  useEffect(() => {
    if (!historias.length) return undefined;
    let cancelado = false;
    const vistas = new Set();
    const cola = historias.flatMap(fotosDe).filter((f) => !vistas.has(f.id) && vistas.add(f.id));
    let k = 0;
    const trabajar = async () => {
      while (!cancelado && k < cola.length) {
        const foto = cola[k];
        k += 1;
        const url = await thumbDeItem(pairId, foto).catch(() => '');
        if (url) poner(foto.id, url);
        else if (!cancelado) setFallidas((x) => ({ ...x, [foto.id]: true }));
      }
    };
    for (let n = 0; n < 6; n += 1) trabajar();
    return () => { cancelado = true; };
  }, [historias, pairId, poner]);

  const thumbs = useMemo(() => ({ ...Object.fromEntries(Object.keys(fallidas).map((id) => [id, ''])), ...urls }), [urls, fallidas]);

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
  if (estado.fase === 'lista') return <Historias historias={historias} thumbs={thumbs} onCerrar={volver} />;
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
