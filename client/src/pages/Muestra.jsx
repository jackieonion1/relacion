import React, { useEffect, useState } from 'react';
import Button from '../components/Button';
import Card from '../components/Card';
import Chip from '../components/Chip';
import Field from '../components/Field';
import Icon, { ICONS } from '../components/Icon';
import Sheet from '../components/Sheet';

// Development only (/dev/componentes, see index.jsx): every Carta base component in its states, the tokens and
// the contrast of the pairs that matter, measured in the browser with the real computed colours.
// The theme is the one chosen in Ajustes › Apariencia (localStorage.tema); ?hoja=1 opens the sheet
const TOKENS = ['paper', 'card', 'sunk', 'line', 'ink', 'ink-2', 'lacre', 'lacre-soft', 'accent-ink', 'on-lacre', 'danger', 'el', 'ella', 'sello-el', 'sello-ella'];
const PAIRS = [
  ['on-lacre', 'lacre', 'Botón principal'],
  ['lacre', 'paper', 'Lacre sobre papel'],
  ['accent-ink', 'lacre-soft', 'Acento en chip'],
  ['accent-ink', 'card', 'Enlace en tarjeta'],
  ['ink', 'paper', 'Texto'],
  ['ink-2', 'card', 'Texto secundario'],
  ['on-lacre', 'danger', 'Botón peligro'],
];

function rgbOf(cssColor) {
  const c = document.createElement('canvas');
  c.width = c.height = 1;
  const ctx = c.getContext('2d');
  ctx.fillStyle = cssColor;
  ctx.fillRect(0, 0, 1, 1);
  return Array.from(ctx.getImageData(0, 0, 1, 1).data.slice(0, 3));
}
function luminance([r, g, b]) {
  const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
function contrast(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

function useMeasured() {
  const [rows, setRows] = useState([]);
  useEffect(() => {
    const css = getComputedStyle(document.documentElement);
    const rgb = Object.fromEntries(TOKENS.map((t) => [t, rgbOf(css.getPropertyValue(`--${t}`).trim())]));
    setRows(PAIRS.map(([fg, bg, what]) => ({ fg, bg, what, ratio: contrast(rgb[fg], rgb[bg]) })));
  }, []);
  return rows;
}

function Section({ title, children }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="serif text-[26px] leading-tight">{title}</h2>
      {children}
    </section>
  );
}

export default function Muestra() {
  const [sheet, setSheet] = useState(() => new URLSearchParams(window.location.search).has('hoja'));
  const [title, setTitle] = useState('');
  const measured = useMeasured();
  const dark = document.documentElement.dataset.tema === 'oscuro';

  return (
    <div className="min-h-dvh bg-paper text-ink px-4 py-8 flex flex-col gap-8 max-w-lg mx-auto">
      <header className="flex flex-col gap-2">
        <p className="etiqueta">Carta · componentes · {dark ? 'oscuro' : 'claro'}</p>
        <h1 className="serif text-[36px] leading-[1.05]">Cada pieza, con sus estados 🍪🫒</h1>
      </header>

      <Section title="Botones">
        <div className="flex flex-wrap gap-3 items-center">
          <Button>Guardar</Button>
          <Button variant="sec">Reintentar</Button>
          <Button variant="txt" accent>Ver calendario</Button>
          <Button variant="dan">Borrar foto</Button>
        </div>
        <div className="flex flex-wrap gap-3 items-center p-3 rounded-control bg-ink">
          <Button variant="inv">Actualizar</Button>
          <span className="text-paper text-sm">inv sobre tinta</span>
        </div>
        <div className="flex flex-wrap gap-3 items-center">
          <Button disabled>Deshabilitado</Button>
          <Button busy busyText="Guardando…">Guardar</Button>
          <Button icon="ajustes" label="Ajustes" />
          <Button variant="sec" icon="subir">Subir</Button>
        </div>
        <div className="flex flex-col gap-2 items-start">
          <Button size="m">48 · btn-m</Button>
          <Button size="l">52 · btn-l</Button>
          <Button size="xl" icon="latido">56 · btn-xl</Button>
        </div>
      </Section>

      <Section title="Campos">
        <Field label="Título" placeholder="Cena, visita…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Field label="Código de pareja" defaultValue="AB1" error="Entre 4 y 12 letras o números." />
        <Field label="Deshabilitado" defaultValue="Cena en casa" disabled />
      </Section>

      <Section title="Chips">
        <div className="flex flex-wrap gap-2">
          <Chip>nos vemos</Chip>
          <Chip tone="neutro">🩷 Los dos</Chip>
          <Chip tone="neutro">💛 Novio</Chip>
          <Chip tone="neutro">💜 Novia</Chip>
          <Chip tone="tinta">Sin subir</Chip>
        </div>
      </Section>

      <Section title="Tarjetas">
        <Card className="flex flex-col gap-2">
          <span className="flex items-center gap-2">
            <span className="serif text-[21px] flex-1">Lista para el viaje</span>
            <span className="w-2 h-2 rounded-full bg-lacre" aria-label="Sin leer" />
          </span>
          <span className="text-[15px] text-ink-2">Cargadores, el libro que dejaste a medias y la chaqueta gris…</span>
          <span className="text-[13px] text-ink-2">🍪 ayer, 23:14 · 3 respuestas</span>
        </Card>
        <div className="p-5 rounded-tarjeta bg-sunk flex flex-col items-center gap-2 text-center" role="alert">
          <span className="font-semibold">No se pudo cargar</span>
          <span className="text-[13px] text-ink-2">Qué ha pasado, sin culpas.</span>
          <Button variant="sec">Reintentar</Button>
        </div>
      </Section>

      <Section title="Hoja">
        <Button variant="sec" onClick={() => setSheet(true)}>Abrir hoja</Button>
      </Section>

      <Section title="Iconos">
        <div className="grid grid-cols-4 gap-2">
          {Object.keys(ICONS).map((n) => (
            <div key={n} className="h-20 rounded-control bg-card border border-line flex flex-col items-center justify-center gap-1.5">
              <Icon name={n} />
              <span className="text-[11px] text-ink-2">{n}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Tokens">
        <div className="grid grid-cols-3 gap-2">
          {TOKENS.map((t) => (
            <div key={t} className="flex flex-col gap-1">
              <span className="h-10 rounded-mini border border-line" style={{ background: `var(--${t})` }} />
              <span className="text-[11px] text-ink-2">{t}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Contraste medido">
        <table className="text-sm" data-testid="contraste">
          <tbody>
            {measured.map((r) => (
              <tr key={r.what} className="border-b border-line">
                <td className="py-1.5 pr-2">{r.what}</td>
                <td className="py-1.5 pr-2 text-ink-2 text-[12px]">{r.fg} / {r.bg}</td>
                <td className="py-1.5 num font-semibold" data-ratio={r.ratio.toFixed(2)}>{r.ratio.toFixed(2)}:1</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Section>

      <Sheet isOpen={sheet} onClose={() => setSheet(false)}>
        <div className="px-[18px] pt-2 pb-6 flex flex-col gap-2.5">
          <span className="etiqueta">Los dos</span>
          <h3 className="serif text-[24px]">Cena en casa</h3>
          <span className="text-sm text-ink-2">Sábado, 10 de octubre · 21:00</span>
          <Button size="m" onClick={() => setSheet(false)}>Editar</Button>
          <Button variant="txt" onClick={() => setSheet(false)}>Cancelar</Button>
        </div>
      </Sheet>
    </div>
  );
}
