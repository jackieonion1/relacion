import { useSyncExternalStore } from 'react';

// «Parar la fiesta» floats over the bottom of the screen while it rains. HeartRain holds the bar here while it is
// up and every Sheet reads it, so no sheet needs to know about the rain (adversario fix1 O1, O5)
const listeners = new Set();
let held = 0;

// Room a sheet leaves under its content so the button never covers the last control: the bar's offset plus the button
export const STOP_BAR_ROOM = 88;

// Bottom padding of whatever sits at the screen's bottom edge (a sheet, the roulette result) while the bar is up. The bar
// floats on --shell-bottom (tab bar, safe area and any notice), so the room starts there: a fixed offset left the last
// buttons under the bar as soon as a notice showed
export const STOP_BAR_PADDING = `calc(var(--shell-bottom) + ${STOP_BAR_ROOM}px)`;

export function holdStopBar() {
  held += 1;
  listeners.forEach((l) => l());
  let released = false;
  return () => {
    if (released) return;
    released = true;
    held -= 1;
    listeners.forEach((l) => l());
  };
}

function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useStopBar() {
  return useSyncExternalStore(subscribe, () => held > 0, () => false);
}
