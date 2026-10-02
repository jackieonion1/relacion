import React from 'react';
import HaceUnAnoTarjeta from './HaceUnAnoTarjeta';
import NuestroAnoTarjeta from './NuestroAnoTarjeta';

// The memories on Inicio (one line in Dashboard, under the photo of the day). It only lays out its two cards, each
// owned by its own lot: they bring their own margins, and are free to render nothing
export default function RecuerdosInicio() {
  return (
    <>
      <HaceUnAnoTarjeta />
      <NuestroAnoTarjeta />
    </>
  );
}
