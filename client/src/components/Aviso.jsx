import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Icon from './Icon';

// One slot for the shell notices (plan A2): whoever wants it, by this priority, and only one on screen.
// Each notice keeps its own logic and stays mounted; the slot only says whose turn it is
const ORDER = ['update', 'install', 'push'];

const SlotContext = createContext(null);

export function AvisoSlot({ children }) {
  const [wanting, setWanting] = useState({});
  const want = useCallback((id, on) => {
    setWanting((w) => (!!w[id] === on ? w : { ...w, [id]: on }));
  }, []);
  const turn = ORDER.find((id) => wanting[id]) || null;
  const value = useMemo(() => ({ turn, want }), [turn, want]);
  return <SlotContext.Provider value={value}>{children}</SlotContext.Provider>;
}

// True when `id` may paint now. Without a slot (a notice rendered alone, as in its tests) it always may
export function useAvisoTurn(id, wants) {
  const slot = useContext(SlotContext);
  const want = slot?.want;
  useEffect(() => {
    if (!want) return undefined;
    want(id, wants);
    return () => want(id, false);
  }, [want, id, wants]);
  return slot ? wants && slot.turn === id : wants;
}

// The slot's box above the tab bar. It publishes the room the visible notice takes (--aviso-room, 0 with none),
// which --shell-bottom in index.css adds to the tab bar, so what floats above the bar (.fab) rises over it
export function Avisos({ children }) {
  const box = useRef(null);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const root = document.documentElement;
    const publish = () => root.style.setProperty('--aviso-room', el.offsetHeight ? `${el.offsetHeight + 12}px` : '0px');
    publish();
    const watch = new ResizeObserver(publish);
    watch.observe(el);
    return () => { watch.disconnect(); root.style.removeProperty('--aviso-room'); };
  }, []);
  return <div ref={box} className="avisos">{children}</div>;
}

// The toast of Aviso-version.dc.html: ink card above the tab bar, title and an optional line, actions on the right
export default function Aviso({ icon, title, text, children, role = 'status' }) {
  return (
    <div role={role} className="aviso">
      {icon && <Icon name={icon} />}
      <span className="flex-1 min-w-0 flex flex-col gap-px">
        <span className="text-[15px] font-semibold leading-snug">{title}</span>
        {text && <span className="text-[13px] leading-snug opacity-80">{text}</span>}
      </span>
      {children}
    </div>
  );
}
