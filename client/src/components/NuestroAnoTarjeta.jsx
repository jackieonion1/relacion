import React from 'react';
import { Link, useSearchParams } from 'react-router';
import Icon from './Icon';
import { enVentana, ordinal, ventanaAniversario } from '../lib/nuestroAno';

// The «Nuestro año» card on Inicio. It is up only around the anniversary (see enVentana in lib/nuestroAno), and it
// reads nothing: the numbers are worked out when the stories are opened. ?ensayo=1 shows it out of dates, and the
// stories it opens do not write anything on the phone
export default function NuestroAnoTarjeta() {
  const [params] = useSearchParams();
  const ensayo = params.get('ensayo') === '1';
  const ahora = new Date();
  if (!ensayo && !enVentana(ahora)) return null;
  const { n } = ventanaAniversario(ahora);

  return (
    <section aria-label="Nuestro año" className="card relative mx-4 mt-3 rounded-hero bg-lacre-soft py-4 pr-4 pl-[18px] flex items-center gap-4">
      {/* The whole card opens the stories; «volver» brings the back arrow here, not to the hub */}
      <Link
        to={`/recuerdos/nuestro-ano${ensayo ? '?ensayo=1' : ''}`} state={{ volver: '/' }}
        aria-label={`Abrir nuestro ${ordinal(n)} año`}
        className="ano-tarjeta-abrir absolute inset-0 rounded-hero"
      />
      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
        <p className="etiqueta">{ensayo ? 'Nuestro año · ensayo' : 'Nuestro año'}</p>
        <p className="serif text-[26px] leading-[1.15] text-ink">Nuestro {ordinal(n)} año, en postales</p>
        <p className="text-[15px] text-ink-2">Toca para verlo 🍪🫒</p>
      </div>
      <span aria-hidden="true" className="ano-tarjeta-sello"><Icon name="latido" size={22} filled /></span>
    </section>
  );
}
